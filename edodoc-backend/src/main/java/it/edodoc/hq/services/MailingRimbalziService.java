package it.edodoc.hq.services;

import com.google.api.services.gmail.model.ListMessagesResponse;
import com.google.api.services.gmail.model.Message;
import it.edodoc.hq.dto.MailingDto;
import it.edodoc.hq.models.MailingContatto;
import it.edodoc.hq.models.MailingEvento;
import it.edodoc.hq.models.MailingInvio;
import it.edodoc.hq.models.MailingMittente;
import it.edodoc.hq.repositories.MailingContattoRepository;
import it.edodoc.hq.repositories.MailingEventoRepository;
import it.edodoc.hq.repositories.MailingInvioRepository;
import it.edodoc.hq.repositories.MailingMittenteRepository;
import jakarta.mail.BodyPart;
import jakarta.mail.MessagingException;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Properties;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Legge le caselle dei mittenti Google (Gmail API, scope gmail.modify) cercando rimbalzi (DSN di mailer-daemon /
 * postmaster) e risposte alle email marketing. Non modifica nulla nella casella: niente "letto", niente spostamenti.
 * Idempotente (un invio già rimbalzato o già risposto non si conta due volte), quindi le finestre di lettura possono
 * sovrapporsi. Contiene anche il ricalcolo notturno di punteggio e ora di apertura preferita.
 */
@Service
public class MailingRimbalziService {

    private static final Logger logger = LoggerFactory.getLogger(MailingRimbalziService.class);
    static final int RIMBALZI_TEMPORANEI_MAX = 3;
    private static final int MASSIMO_MESSAGGI = 300;

    public enum TipoRimbalzo { PERMANENTE, TEMPORANEO, RITARDO, NESSUNO }

    /** Esito dell'analisi di un DSN. */
    public record EsitoDsn(TipoRimbalzo tipo, String codice, String destinatario, String token, String messageIdOriginale,
                           String diagnostica) {
    }

    public record Riepilogo(int rimbalzi, int risposte, int disiscrizioni, int errori) {
    }

    private static final Pattern ACTION = Pattern.compile("(?im)^Action:\\s*([a-z]+)");
    private static final Pattern STATUS = Pattern.compile("(?im)^Status:\\s*([245])\\.(\\d{1,3})\\.(\\d{1,3})");
    private static final Pattern CODICE_TESTO = Pattern.compile("\\b[245]\\d\\d[ -]([45])\\.(\\d{1,3})\\.(\\d{1,3})\\b");
    private static final Pattern FINAL_RECIPIENT = Pattern.compile("(?im)^(?:Final|Original)-Recipient:\\s*rfc822;\\s*<?([^\\s<>;]+@[^\\s<>;]+)>?");
    private static final Pattern FAILED_RECIPIENTS = Pattern.compile("(?im)^X-Failed-Recipients:\\s*<?([^\\s<>,;]+@[^\\s<>,;]+)>?");
    private static final Pattern TOKEN = Pattern.compile("(?im)^X-Mailing-Token:\\s*([A-Za-z0-9]{16,40})\\s*$");
    private static final Pattern MESSAGE_ID_ORIGINALE = Pattern.compile("(?im)^(?:X-Original-Message-ID|Message-ID):\\s*(<[^>\\s]+>)");
    private static final Pattern DIAGNOSTIC = Pattern.compile("(?im)^Diagnostic-Code:\\s*(?:smtp;)?\\s*(.+)$");
    private static final Pattern ID_MESSAGGIO = Pattern.compile("<[^<>\\s]+@[^<>\\s]+>");

    private final MailingMittenteRepository mittenteRepository;
    private final MailingInvioRepository invioRepository;
    private final MailingContattoRepository contattoRepository;
    private final MailingEventoRepository eventoRepository;
    private final MailingGoogleClients google;
    private final MailingContattiService contattiService;
    private final NamedParameterJdbcTemplate jdbc;

    public MailingRimbalziService(MailingMittenteRepository mittenteRepository, MailingInvioRepository invioRepository,
                                  MailingContattoRepository contattoRepository, MailingEventoRepository eventoRepository,
                                  MailingGoogleClients google, MailingContattiService contattiService,  NamedParameterJdbcTemplate jdbc) {
        this.mittenteRepository = mittenteRepository;
        this.invioRepository = invioRepository;
        this.contattoRepository = contattoRepository;
        this.eventoRepository = eventoRepository;
        this.google = google;
        this.contattiService = contattiService;
        this.jdbc = jdbc;
    }

    // ───────────────────────── Caselle ─────────────────────────

    /** Controlla tutte le caselle dei mittenti Google attivi. */
    public Riepilogo controllaTutti() {
        int rimbalzi = 0;
        int risposte = 0;
        int disiscrizioni = 0;
        int errori = 0;
        for (MailingMittente m : mittenteRepository.findByAttivoTrueOrderByEmailAsc()) {
            if (m.getCanale() == MailingMittente.Canale.SMTP) {
                continue;
            }
            try {
                Riepilogo r = controlla(m);
                rimbalzi += r.rimbalzi();
                risposte += r.risposte();
                disiscrizioni += r.disiscrizioni();
            } catch (MailingCanaleException e) {
                errori++;
                logger.warn("[MAILING] Casella di {} non letta: {}", m.getEmail(), e.getMessage());
            } catch (RuntimeException e) {
                errori++;
                logger.warn("[MAILING] Rimbalzi di {} non controllati: {}", m.getEmail(), e.getMessage());
            }
        }
        return new Riepilogo(rimbalzi, risposte, disiscrizioni, errori);
    }

    Riepilogo controlla(MailingMittente m) throws MailingCanaleException {
        LocalDateTime ora = MailingTempo.adesso();
        LocalDateTime da = m.getRimbalziControllatiFinoAl() != null
                ? m.getRimbalziControllatiFinoAl().minusMinutes(15) : ora.minusDays(2);
        long dopo = da.atZone(MailingTempo.ROMA).toEpochSecond();
        int rimbalzi = 0;
        int risposte = 0;
        int disiscrizioni = 0;

        for (String id : cerca(m, "(from:mailer-daemon OR from:postmaster) after:" + dopo)) {
            try {
                Message raw = google.gmail(m, g -> g.users().messages().get("me", id).setFormat("raw").execute());
                byte[] bytes = Base64.getUrlDecoder().decode(raw.getRaw());
                EsitoDsn esito = analizzaDsn(bytes);
                if (applicaRimbalzo(m, esito)) {
                    rimbalzi++;
                }
            } catch (MailingCanaleException.NonConfigurato e) {
                throw e;
            } catch (Exception e) {
                logger.debug("[MAILING] DSN {} non analizzato: {}", id, e.getMessage());
            }
        }

        for (String id : cerca(m, "in:inbox -from:me -from:mailer-daemon -from:postmaster after:" + dopo)) {
            try {
                Message meta = google.gmail(m, g -> g.users().messages().get("me", id).setFormat("metadata")
                        .setMetadataHeaders(List.of("In-Reply-To", "References", "From", "Subject")).execute());
                String subject = CasellaMime.header(meta, "Subject");
                String from = CasellaMime.header(meta, "From");
                LocalDateTime quando = meta.getInternalDate() != null
                        ? LocalDateTime.ofInstant(Instant.ofEpochMilli(meta.getInternalDate()), MailingTempo.ROMA) : ora;
                if (richiestaDisiscrizione(subject)) {
                    if (disiscriviDaEmail(from)) {
                        disiscrizioni++;
                    }
                    continue;
                }
                List<String> citati = idCitati(CasellaMime.header(meta, "In-Reply-To"), CasellaMime.header(meta, "References"));
                if (!citati.isEmpty() && applicaRisposta(citati, quando)) {
                    risposte++;
                }
            } catch (MailingCanaleException.NonConfigurato e) {
                throw e;
            } catch (Exception e) {
                logger.debug("[MAILING] Messaggio {} non analizzato: {}", id, e.getMessage());
            }
        }
        jdbc.update("UPDATE mailing_mittenti SET rimbalzi_controllati_fino_al = :t WHERE id = :id",
                new MapSqlParameterSource("t", ora).addValue("id", m.getId()));
        return new Riepilogo(rimbalzi, risposte, disiscrizioni, 0);
    }

    private List<String> cerca(MailingMittente m, String query) throws MailingCanaleException {
        List<String> ids = new ArrayList<>();
        String pagina = null;
        do {
            String p = pagina;
            ListMessagesResponse r = google.gmail(m, g -> g.users().messages().list("me").setQ(query)
                    .setMaxResults(100L).setPageToken(p).execute());
            if (r.getMessages() != null) {
                r.getMessages().forEach(x -> ids.add(x.getId()));
            }
            pagina = r.getNextPageToken();
        } while (pagina != null && ids.size() < MASSIMO_MESSAGGI);
        return ids;
    }

    // ───────────────────────── DSN ─────────────────────────

    /** Classifica un DSN (RFC 3464 o testo di Gmail): 5.x.x permanente, 4.x.x temporaneo, Action delayed = ritardo. */
    public static EsitoDsn analizzaDsn(byte[] raw) {
        String intestazioni = "";
        StringBuilder corpo = new StringBuilder();
        try {
            MimeMessage msg = new MimeMessage(Session.getInstance(new Properties()), new ByteArrayInputStream(raw));
            String[] failed = msg.getHeader("X-Failed-Recipients");
            intestazioni = failed != null ? "X-Failed-Recipients: " + failed[0] : "";
            raccogli(msg, corpo, 0);
        } catch (MessagingException | IOException e) {
            corpo.append(new String(raw, StandardCharsets.UTF_8));
        }
        String testo = corpo.toString();

        String token = primo(TOKEN, testo);
        String messageId = primo(MESSAGE_ID_ORIGINALE, testo);
        String destinatario = primo(FINAL_RECIPIENT, testo);
        if (destinatario == null) {
            destinatario = primo(FAILED_RECIPIENTS, intestazioni);
        }
        String azione = primo(ACTION, testo);
        String diagnostica = primo(DIAGNOSTIC, testo);
        String codice = null;
        Matcher s = STATUS.matcher(testo);
        if (s.find()) {
            codice = s.group(1) + "." + s.group(2) + "." + s.group(3);
        } else {
            Matcher t = CODICE_TESTO.matcher(testo);
            if (t.find()) {
                codice = t.group(1) + "." + t.group(2) + "." + t.group(3);
            }
        }
        TipoRimbalzo tipo;
        if (azione != null && azione.equalsIgnoreCase("delayed")) {
            tipo = TipoRimbalzo.RITARDO;
        } else if (azione != null && (azione.equalsIgnoreCase("delivered") || azione.equalsIgnoreCase("relayed")
                || azione.equalsIgnoreCase("expanded"))) {
            tipo = TipoRimbalzo.NESSUNO;
        } else if (codice != null && codice.startsWith("5")) {
            tipo = TipoRimbalzo.PERMANENTE;
        } else if (codice != null && codice.startsWith("4")) {
            tipo = TipoRimbalzo.TEMPORANEO;
        } else if (azione != null && azione.equalsIgnoreCase("failed")) {
            tipo = TipoRimbalzo.PERMANENTE;
        } else {
            tipo = TipoRimbalzo.NESSUNO;
        }
        return new EsitoDsn(tipo, codice, destinatario != null ? destinatario.toLowerCase(Locale.ROOT) : null, token,
                messageId, diagnostica != null ? diagnostica.trim() : null);
    }

    /** Testo di tutte le parti (anche message/delivery-status e il messaggio originale allegato). */
    private static void raccogli(Part p, StringBuilder sb, int profondita) throws MessagingException, IOException {
        if (profondita > 6) {
            return;
        }
        if (p.isMimeType("multipart/*")) {
            Object c = p.getContent();
            if (c instanceof Multipart mp) {
                for (int i = 0; i < mp.getCount(); i++) {
                    BodyPart bp = mp.getBodyPart(i);
                    raccogli(bp, sb, profondita + 1);
                }
            }
            return;
        }
        if (profondita == 0 && !p.isMimeType("text/*")) {
            return;
        }
        try (InputStream in = p.getInputStream()) {
            byte[] dati = in.readNBytes(512 * 1024);
            sb.append(new String(dati, StandardCharsets.UTF_8)).append("\n");
        }
    }

    private static String primo(Pattern p, String testo) {
        Matcher m = p.matcher(testo);
        return m.find() ? m.group(1).trim() : null;
    }

    /** Applica un DSN all'invio trovato. Vero se ha contato un rimbalzo nuovo. */
    boolean applicaRimbalzo(MailingMittente m, EsitoDsn esito) {
        if (esito.tipo() != TipoRimbalzo.PERMANENTE && esito.tipo() != TipoRimbalzo.TEMPORANEO) {
            return false;
        }
        Optional<MailingInvio> trovato = Optional.empty();
        if (esito.token() != null) {
            trovato = invioRepository.findByToken(esito.token());
        }
        if (trovato.isEmpty() && esito.messageIdOriginale() != null) {
            trovato = invioRepository.findFirstByMessageId(esito.messageIdOriginale());
        }
        if (trovato.isEmpty() && esito.destinatario() != null) {
            List<Long> ids = jdbc.queryForList("SELECT id FROM mailing_invii WHERE LOWER(email) = :e AND mittente_id = :m "
                            + "AND inviato_il > :da ORDER BY inviato_il DESC LIMIT 1",
                    new MapSqlParameterSource("e", esito.destinatario()).addValue("m", m.getId())
                            .addValue("da", MailingTempo.adesso().minusDays(7)), Long.class);
            if (!ids.isEmpty()) {
                trovato = invioRepository.findById(ids.get(0));
            }
        }
        if (trovato.isEmpty()) {
            return false;
        }
        MailingInvio invio = trovato.get();
        if (invio.getRimbalzoTipo() != null) {
            return false;
        }
        boolean permanente = esito.tipo() == TipoRimbalzo.PERMANENTE;
        String errore = "Rimbalzo " + (permanente ? "permanente" : "temporaneo")
                + (esito.codice() != null ? " " + esito.codice() : "")
                + (esito.diagnostica() != null ? ": " + abbrevia(esito.diagnostica(), 400) : "");
        jdbc.update("UPDATE mailing_invii SET stato = 'RIMBALZATO', rimbalzo_tipo = :t, errore = :e WHERE id = :id",
                new MapSqlParameterSource("t", permanente ? "HARD" : "SOFT").addValue("e", errore).addValue("id", invio.getId()));
        MailingEvento e = eventoRepository.save(MailingEvento.builder()
                .tipo(MailingEvento.Tipo.RIMBALZO)
                .invioId(invio.getId())
                .contattoId(invio.getContattoId())
                .campagnaId(invio.getCampagnaId())
                .automazioneId(automazioneId(invio))
                .url(esito.codice())
                .avvenutoIl(MailingTempo.adesso())
                .build());
        MailingContatto c = contattoRepository.findById(invio.getContattoId()).orElse(null);
        if (c != null) {
            if (permanente) {
                contattiService.cambiaStato(c.getId(), MailingContatto.Stato.RIMBALZATO, errore);
            } else {
                int n = (c.getRimbalziTemporanei() != null ? c.getRimbalziTemporanei() : 0) + 1;
                jdbc.update("UPDATE mailing_contatti SET rimbalzi_temporanei = :n WHERE id = :id",
                        new MapSqlParameterSource("n", n).addValue("id", c.getId()));
                if (n >= RIMBALZI_TEMPORANEI_MAX) {
                    contattiService.cambiaStato(c.getId(), MailingContatto.Stato.RIMBALZATO,
                            n + " rimbalzi temporanei (ultimo " + (esito.codice() != null ? esito.codice() : "") + ")");
                }
            }
            String nome = MailingTracciamentoService.nomeBreve(c.getNome(), c.getCognome(), c.getEmail());
        }
        return true;
    }

    // ───────────────────────── Risposte ─────────────────────────

    static List<String> idCitati(String inReplyTo, String references) {
        List<String> out = new ArrayList<>();
        for (String h : new String[]{inReplyTo, references}) {
            if (h == null) {
                continue;
            }
            Matcher m = ID_MESSAGGIO.matcher(h);
            while (m.find()) {
                if (!out.contains(m.group())) {
                    out.add(m.group());
                }
            }
        }
        return out;
    }

    /** Oggetto "unsubscribe" (il mailto di List-Unsubscribe) o "disiscrivimi". */
    static boolean richiestaDisiscrizione(String subject) {
        if (subject == null) {
            return false;
        }
        String s = subject.trim().toLowerCase(Locale.ROOT).replaceFirst("^(re|r|fwd|i):\\s*", "");
        return s.equals("unsubscribe") || s.startsWith("unsubscribe ") || s.equals("disiscrivimi")
                || s.equals("cancellami");
    }

    private boolean disiscriviDaEmail(String from) {
        String email = CasellaMime.primo(from) != null ? CasellaMime.primo(from).email() : null;
        if (email == null) {
            return false;
        }
        Optional<MailingContatto> c = contattiService.perEmail(email);
        if (c.isEmpty() || c.get().getStato() != MailingContatto.Stato.ISCRITTO) {
            return false;
        }
        contattiService.disiscrivi(c.get().getId(), "Richiesta via email (unsubscribe)", null);
        return true;
    }

    boolean applicaRisposta(List<String> idCitati, LocalDateTime quando) {
        List<Long> ids = jdbc.queryForList("SELECT id FROM mailing_invii WHERE message_id IN (:ids) ORDER BY inviato_il DESC LIMIT 1",
                new MapSqlParameterSource("ids", idCitati), Long.class);
        if (ids.isEmpty()) {
            return false;
        }
        MailingInvio invio = invioRepository.findById(ids.get(0)).orElse(null);
        if (invio == null || invio.getRispostoIl() != null) {
            return false;
        }
        jdbc.update("UPDATE mailing_invii SET risposto_il = :t WHERE id = :id",
                new MapSqlParameterSource("t", quando).addValue("id", invio.getId()));
        jdbc.update("UPDATE mailing_contatti SET punteggio = LEAST(100, punteggio + 10) WHERE id = :id",
                Map.of("id", invio.getContattoId()));
        MailingEvento e = eventoRepository.save(MailingEvento.builder()
                .tipo(MailingEvento.Tipo.RISPOSTA)
                .invioId(invio.getId())
                .contattoId(invio.getContattoId())
                .campagnaId(invio.getCampagnaId())
                .automazioneId(automazioneId(invio))
                .avvenutoIl(quando)
                .build());
        contattoRepository.findById(invio.getContattoId()).ifPresent(c -> {
            String nome = MailingTracciamentoService.nomeBreve(c.getNome(), c.getCognome(), c.getEmail());
        });
        return true;
    }

    private Long automazioneId(MailingInvio i) {
        if (i.getAutomazioneEmailId() == null) {
            return null;
        }
        List<Long> r = jdbc.queryForList("SELECT automazione_id FROM mailing_automazioni_email WHERE id = :id",
                Map.of("id", i.getAutomazioneEmailId()), Long.class);
        return r.isEmpty() ? null : r.get(0);
    }

    private static String abbrevia(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max);
    }

    // ───────────────────────── Ricalcolo notturno ─────────────────────────

    /**
     * Punteggio 0–100 sugli ultimi 180 giorni: 40 di base, +6 per email aperta, +10 per email cliccata, +15 per
     * risposta, −4 per email ignorata da più di 7 giorni. I contatti senza invii restano come sono.
     */
    public static int punteggio(int aperte, int cliccate, int risposte, int ignorate) {
        return Math.max(0, Math.min(100, 40 + 6 * aperte + 10 * cliccate + 15 * risposte - 4 * ignorate));
    }

    /** Ricalcola punteggio e ora di apertura preferita (ora più frequente delle aperture umane). */
    public int[] ricalcolaPunteggi() {
        LocalDateTime ora = MailingTempo.adesso();
        MapSqlParameterSource p = new MapSqlParameterSource("da", ora.minusDays(180)).addValue("settimana", ora.minusDays(7));
        int punteggi = jdbc.update("WITH s AS (SELECT contatto_id, "
                + "COUNT(*) FILTER (WHERE stato IN ('INVIATO','RIMBALZATO')) AS inviati, "
                + "COUNT(*) FILTER (WHERE prima_apertura_il IS NOT NULL) AS aperte, "
                + "COUNT(*) FILTER (WHERE primo_click_il IS NOT NULL) AS cliccate, "
                + "COUNT(*) FILTER (WHERE risposto_il IS NOT NULL) AS risposte, "
                + "COUNT(*) FILTER (WHERE stato = 'INVIATO' AND prima_apertura_il IS NULL AND primo_click_il IS NULL "
                + "AND risposto_il IS NULL AND inviato_il < :settimana) AS ignorate "
                + "FROM mailing_invii WHERE inviato_il >= :da GROUP BY contatto_id) "
                + "UPDATE mailing_contatti c SET punteggio = GREATEST(0, LEAST(100, 40 + 6 * s.aperte + 10 * s.cliccate "
                + "+ 15 * s.risposte - 4 * s.ignorate)) FROM s WHERE c.id = s.contatto_id AND s.inviati > 0 "
                + "AND c.punteggio IS DISTINCT FROM GREATEST(0, LEAST(100, 40 + 6 * s.aperte + 10 * s.cliccate + 15 * s.risposte - 4 * s.ignorate))", p);
        int orari = jdbc.update("WITH o AS (SELECT DISTINCT ON (contatto_id) contatto_id, "
                + "EXTRACT(HOUR FROM avvenuto_il)::smallint AS ora FROM mailing_eventi "
                + "WHERE tipo = 'APERTURA' AND NOT automatico AND contatto_id IS NOT NULL AND avvenuto_il >= :da "
                + "GROUP BY contatto_id, EXTRACT(HOUR FROM avvenuto_il) "
                + "ORDER BY contatto_id, COUNT(*) DESC, EXTRACT(HOUR FROM avvenuto_il)) "
                + "UPDATE mailing_contatti c SET ora_apertura_preferita = o.ora FROM o "
                + "WHERE c.id = o.contatto_id AND c.ora_apertura_preferita IS DISTINCT FROM o.ora", p);
        return new int[]{punteggi, orari};
    }
}
