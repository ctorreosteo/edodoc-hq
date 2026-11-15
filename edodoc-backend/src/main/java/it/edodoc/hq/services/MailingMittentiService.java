package it.edodoc.hq.services;

import com.google.api.services.gmail.model.SendAs;
import it.edodoc.hq.dto.MailingDto;
import it.edodoc.hq.models.MailingMittente;
import it.edodoc.hq.repositories.MailingMittenteRepository;
import jakarta.mail.internet.AddressException;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import javax.naming.NamingEnumeration;
import javax.naming.NamingException;
import javax.naming.directory.Attribute;
import javax.naming.directory.Attributes;
import javax.naming.directory.DirContext;
import javax.naming.directory.InitialDirContext;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Hashtable;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Pattern;

/**
 * Mittenti dell'Email Marketing: anagrafica, predefinito unico, quote e verifica (email di prova + controllo DNS
 * di SPF, DKIM e DMARC del dominio mittente, con spiegazioni in italiano semplice).
 */
@Service
public class MailingMittentiService {

    private static final Logger logger = LoggerFactory.getLogger(MailingMittentiService.class);
    private static final Pattern NOME_ENV = Pattern.compile("[A-Z_][A-Z0-9_]{0,119}");

    private final MailingMittenteRepository repository;
    private final NamedParameterJdbcTemplate jdbc;
    private final MailingCanali canali;
    private final MailingConfigService config;
    private final MailingGoogleClients google;

    public MailingMittentiService(MailingMittenteRepository repository, NamedParameterJdbcTemplate jdbc,
                                  MailingCanali canali, MailingConfigService config, MailingGoogleClients google) {
        this.repository = repository;
        this.jdbc = jdbc;
        this.canali = canali;
        this.config = config;
        this.google = google;
    }

    // ───────────────────────── Contratto ─────────────────────────

    @Transactional(readOnly = true)
    public Optional<MailingMittente> predefinito() {
        Optional<MailingMittente> p = repository.findFirstByPredefinitoTrueAndAttivoTrue();
        if (p.isPresent()) {
            return p;
        }
        List<MailingMittente> attivi = repository.findByAttivoTrueOrderByEmailAsc();
        return attivi.isEmpty() ? Optional.empty() : Optional.of(attivi.get(0));
    }

    /** Il mittente indicato (se attivo) o il predefinito; errore chiaro se non ce n'è nessuno. */
    @Transactional(readOnly = true)
    public MailingMittente risolvi(Long mittenteId) {
        if (mittenteId != null) {
            MailingMittente m = repository.findById(mittenteId).orElse(null);
            if (m != null && Boolean.TRUE.equals(m.getAttivo())) {
                return m;
            }
        }
        return predefinito().orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT,
                "Nessun mittente attivo: aggiungine uno in Email Marketing → Impostazioni → Mittenti."));
    }

    // ───────────────────────── CRUD ─────────────────────────

    @Transactional(readOnly = true)
    public List<MailingDto.Mittente> lista() {
        Map<Long, int[]> conteggi = conteggi();
        return repository.findAll().stream()
                .sorted(Comparator.comparing((MailingMittente m) -> !Boolean.TRUE.equals(m.getPredefinito()))
                        .thenComparing(MailingMittente::getEmail))
                .map(m -> dto(m, conteggi.getOrDefault(m.getId(), new int[2])))
                .toList();
    }

    @Transactional(readOnly = true)
    public MailingDto.Mittente dettaglio(long id) {
        return dto(trova(id), conteggi().getOrDefault(id, new int[2]));
    }

    @Transactional
    public MailingDto.Mittente crea(MailingDto.MittenteInput in, Long utenteId) {
        MailingMittente m = new MailingMittente();
        m.setCreatoDaUtenteId(utenteId);
        applica(m, in, true);
        if (repository.count() == 0) {
            m.setPredefinito(true);
        }
        m = repository.save(m);
        if (Boolean.TRUE.equals(m.getPredefinito())) {
            unicoPredefinito(m.getId());
        }
        return dettaglio(m.getId());
    }

    @Transactional
    public MailingDto.Mittente aggiorna(long id, MailingDto.MittenteInput in) {
        MailingMittente m = trova(id);
        String canalePrima = String.valueOf(m.getCanale()) + m.getEmail() + m.getCasellaDelegata() + m.getSmtpHost()
                + m.getSmtpUtente() + m.getSmtpPasswordEnv();
        applica(m, in, false);
        String canaleDopo = String.valueOf(m.getCanale()) + m.getEmail() + m.getCasellaDelegata() + m.getSmtpHost()
                + m.getSmtpUtente() + m.getSmtpPasswordEnv();
        if (!canalePrima.equals(canaleDopo)) {
            // Configurazione di invio cambiata: va riverificata, e l'errore precedente non vale più.
            m.setVerificatoIl(null);
            m.setUltimoErrore(null);
        }
        m.setAggiornatoIl(MailingTempo.adesso());
        repository.save(m);
        if (Boolean.TRUE.equals(m.getPredefinito())) {
            unicoPredefinito(m.getId());
        }
        return dettaglio(id);
    }

    @Transactional
    public MailingDto.Mittente elimina(long id) {
        MailingMittente m = trova(id);
        Integer inCoda = jdbc.queryForObject("SELECT COUNT(*) FROM mailing_invii WHERE mittente_id = :id AND stato IN ('IN_CODA','IN_INVIO')",
                Map.of("id", id), Integer.class);
        if (inCoda != null && inCoda > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Ci sono ancora " + inCoda + " email in coda da questo mittente: disattivalo invece di eliminarlo.");
        }
        MailingDto.Mittente dto = dto(m, new int[2]);
        repository.delete(m);
        return dto;
    }

    @Transactional
    public void registraErrore(long id, String errore) {
        repository.findById(id).ifPresent(m -> {
            m.setUltimoErrore(errore);
            m.setAggiornatoIl(MailingTempo.adesso());
            repository.save(m);
        });
    }

    private MailingMittente trova(long id) {
        return repository.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Mittente non trovato"));
    }

    private void unicoPredefinito(long id) {
        jdbc.update("UPDATE mailing_mittenti SET predefinito = FALSE WHERE id <> :id AND predefinito", Map.of("id", id));
    }

    private void applica(MailingMittente m, MailingDto.MittenteInput in, boolean nuovo) {
        if (in == null) {
            throw new IllegalArgumentException("Dati del mittente mancanti");
        }
        if (nuovo || in.email() != null) {
            String email = emailValida(in.email(), "Indirizzo del mittente non valido");
            repository.findByEmailIgnoreCase(email).filter(a -> !a.getId().equals(m.getId())).ifPresent(a -> {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Esiste già un mittente con questo indirizzo");
            });
            m.setEmail(email);
        }
        if (nuovo || in.nomeVisualizzato() != null) {
            String nome = in.nomeVisualizzato() != null ? in.nomeVisualizzato().trim() : "";
            if (nome.isEmpty() || nome.length() > 120) {
                throw new IllegalArgumentException("Il nome visualizzato è obbligatorio (massimo 120 caratteri)");
            }
            m.setNomeVisualizzato(nome);
        }
        if (in.rispondiA() != null) {
            m.setRispondiA(in.rispondiA().isBlank() ? null : emailValida(in.rispondiA(), "Indirizzo \"Rispondi a\" non valido"));
        }
        if (in.casellaDelegata() != null) {
            m.setCasellaDelegata(in.casellaDelegata().isBlank() ? null : emailValida(in.casellaDelegata(), "Casella delegata non valida"));
        }
        if (in.canale() != null) {
            try {
                m.setCanale(MailingMittente.Canale.valueOf(in.canale().trim().toUpperCase(Locale.ROOT)));
            } catch (IllegalArgumentException e) {
                throw new IllegalArgumentException("Canale non valido: usa GMAIL_API, SMTP_RELAY_GOOGLE o SMTP");
            }
        } else if (m.getCanale() == null) {
            m.setCanale(MailingMittente.Canale.GMAIL_API);
        }
        if (in.smtpHost() != null) {
            m.setSmtpHost(in.smtpHost().isBlank() ? null : in.smtpHost().trim());
        }
        if (in.smtpPorta() != null) {
            if (in.smtpPorta() < 1 || in.smtpPorta() > 65535) {
                throw new IllegalArgumentException("Porta SMTP non valida");
            }
            m.setSmtpPorta(in.smtpPorta());
        }
        if (in.smtpUtente() != null) {
            m.setSmtpUtente(in.smtpUtente().isBlank() ? null : in.smtpUtente().trim());
        }
        if (in.smtpPasswordEnv() != null) {
            String env = in.smtpPasswordEnv().trim();
            if (!env.isEmpty() && !NOME_ENV.matcher(env).matches()) {
                throw new IllegalArgumentException("Indica il NOME della variabile d'ambiente (es. MAILING_SMTP_PASSWORD), "
                        + "non la password: la password non si salva nel gestionale");
            }
            m.setSmtpPasswordEnv(env.isEmpty() ? null : env);
        }
        if (in.limiteGiornaliero() != null) {
            if (in.limiteGiornaliero() < 1 || in.limiteGiornaliero() > 10_000) {
                throw new IllegalArgumentException("Limite giornaliero tra 1 e 10.000");
            }
            m.setLimiteGiornaliero(in.limiteGiornaliero());
        }
        if (in.limiteAlMinuto() != null) {
            if (in.limiteAlMinuto() < 1 || in.limiteAlMinuto() > 120) {
                throw new IllegalArgumentException("Limite al minuto tra 1 e 120");
            }
            m.setLimiteAlMinuto(in.limiteAlMinuto());
        }
        if (in.predefinito() != null) {
            m.setPredefinito(in.predefinito());
        }
        if (in.attivo() != null) {
            m.setAttivo(in.attivo());
        }
        if (m.getCanale() == MailingMittente.Canale.SMTP && !StringUtils.hasText(m.getSmtpHost())) {
            throw new IllegalArgumentException("Per il canale SMTP indica il server (host)");
        }
    }

    static String emailValida(String email, String errore) {
        if (email == null || email.isBlank()) {
            throw new IllegalArgumentException(errore);
        }
        try {
            InternetAddress a = new InternetAddress(email.trim(), true);
            a.validate();
            return a.getAddress().toLowerCase(Locale.ROOT);
        } catch (AddressException e) {
            throw new IllegalArgumentException(errore);
        }
    }

    /** id mittente → [inviati ultime 24h, in coda]. */
    Map<Long, int[]> conteggi() {
        Map<Long, int[]> out = new HashMap<>();
        jdbc.query("SELECT mittente_id, "
                        + "COUNT(*) FILTER (WHERE inviato_il > :da) AS inviati, "
                        + "COUNT(*) FILTER (WHERE stato IN ('IN_CODA','IN_INVIO')) AS coda "
                        + "FROM mailing_invii WHERE mittente_id IS NOT NULL AND (inviato_il > :da OR stato IN ('IN_CODA','IN_INVIO')) "
                        + "GROUP BY mittente_id",
                new MapSqlParameterSource("da", MailingTempo.adesso().minusHours(24)),
                rs -> {
                    out.put(rs.getLong("mittente_id"), new int[]{rs.getInt("inviati"), rs.getInt("coda")});
                });
        return out;
    }

    MailingDto.Mittente dto(MailingMittente m, int[] c) {
        boolean password = StringUtils.hasText(m.getSmtpPasswordEnv())
                && StringUtils.hasText(System.getenv(m.getSmtpPasswordEnv()));
        return new MailingDto.Mittente(m.getId(), m.getEmail(), m.getNomeVisualizzato(), m.getRispondiA(),
                m.getCasellaDelegata(), m.getCanale() != null ? m.getCanale().name() : null, m.getSmtpHost(),
                m.getSmtpPorta(), m.getSmtpUtente(), m.getSmtpPasswordEnv(), password,
                m.getLimiteGiornaliero() != null ? m.getLimiteGiornaliero() : 0,
                m.getLimiteAlMinuto() != null ? m.getLimiteAlMinuto() : 0,
                Boolean.TRUE.equals(m.getPredefinito()), Boolean.TRUE.equals(m.getAttivo()),
                MailingTempo.iso(m.getVerificatoIl()), m.getUltimoErrore(), c[0], c[1]);
    }

    /**
     * Quanti messaggi il mittente può spedire adesso: il minimo tra quota residua delle 24 ore e quota residua
     * del minuto. Mai negativo.
     */
    public static int capacita(int limiteGiornaliero, int inviatiUltime24h, int limiteAlMinuto, int inviatiUltimoMinuto) {
        int giorno = limiteGiornaliero - inviatiUltime24h;
        int minuto = limiteAlMinuto - inviatiUltimoMinuto;
        return Math.max(0, Math.min(giorno, minuto));
    }

    // ───────────────────────── Verifica ─────────────────────────

    /** Manda una email di prova all'indirizzo indicato e controlla il DNS del dominio mittente. */
    public MailingDto.EsitoVerifica verifica(long id, String indirizzoTest) {
        MailingMittente m = trova(id);
        String destinatario = emailValida(indirizzoTest, "Indica un indirizzo valido a cui mandare la prova");
        List<MailingDto.Controllo> controlli = new ArrayList<>();
        boolean inviata = false;
        String errore = null;
        try {
            String html = "<div style=\"font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#1d2421\">"
                    + "<p>Ciao,</p><p>questa è un'email di prova del mittente <strong>" + MailingComposizioneService.escape(m.getEmail())
                    + "</strong> dell'Email Marketing del gestionale.</p>"
                    + "<p>Se la stai leggendo, l'invio funziona. Controlla che sia arrivata nella Posta in arrivo "
                    + "e non nello Spam o in Promozioni.</p></div>";
            String messageId = MailingComposizioneService.nuovoMessageId(MailingToken.nuovo(12), m.getEmail());
            MimeMessage msg = MailingComposizioneService.costruisciMime(m, destinatario, null,
                    "Prova di invio da " + m.getNomeVisualizzato(), html, messageId, Map.of("X-Mailing-Test", "1"));
            canali.invia(m, msg);
            inviata = true;
            m.setVerificatoIl(MailingTempo.adesso());
            m.setUltimoErrore(null);
            controlli.add(new MailingDto.Controllo("invio", "OK", "Email di prova inviata",
                    "Controlla la casella " + destinatario + ": deve arrivare in Posta in arrivo, non in Spam."));
        } catch (MailingCanaleException e) {
            errore = e.getMessage();
            m.setUltimoErrore(e instanceof MailingCanaleException.NonConfigurato ? e.getMessage() : m.getUltimoErrore());
            controlli.add(new MailingDto.Controllo("invio", "ERRORE", "L'email di prova non è partita", spiegaErrore(e, m)));
        } catch (RuntimeException e) {
            errore = e.getMessage();
            controlli.add(new MailingDto.Controllo("invio", "ERRORE", "L'email di prova non è partita", e.getMessage()));
        }
        m.setAggiornatoIl(MailingTempo.adesso());
        repository.save(m);

        String dominio = m.getEmail().substring(m.getEmail().indexOf('@') + 1);
        controlli.addAll(controlliDns(dominio, m.getCanale(), MailingMittentiService::txt));
        if (m.getCanale() == MailingMittente.Canale.GMAIL_API && StringUtils.hasText(m.getCasellaDelegata())
                && !m.getCasellaDelegata().equalsIgnoreCase(m.getEmail())) {
            List<SendAs> alias;
            try {
                alias = google.gmail(m, g -> g.users().settings().sendAs().list("me").execute()).getSendAs();
            } catch (MailingCanaleException | RuntimeException e) {
                logger.warn("[MAILING] Alias di {} non letti: {}", m.getCasellaDelegata(), e.getMessage());
                alias = null;
            }
            controlli.add(controlloAlias(m.getEmail(), m.getCasellaDelegata(), alias));
        }
        String url = config.urlPubblico();
        if (url != null && url.contains(".run.app")) {
            controlli.add(new MailingDto.Controllo("link", "AVVISO", "Link tracciati su run.app",
                    "I link delle email passano da " + url + ". Un sottodominio vostro (es. link.edodoc.it) "
                            + "migliora la consegna: i filtri antispam si fidano meno dei domini condivisi."));
        }
        return new MailingDto.EsitoVerifica(inviata, errore, controlli);
    }

    private static String spiegaErrore(MailingCanaleException e, MailingMittente m) {
        if (e instanceof MailingCanaleException.NonConfigurato) {
            return switch (m.getCanale()) {
                case GMAIL_API -> "Il gestionale non può usare la casella. In Google Admin → Sicurezza → Controlli API → "
                        + "Delega a livello di dominio, autorizza lo scope " + MailingGoogleClients.SCOPE_GMAIL
                        + " per il Service Account. Dettaglio: " + e.getMessage();
                case SMTP_RELAY_GOOGLE -> "smtp-relay non accetta il gestionale. Servono: scope " + MailingGoogleClients.SCOPE_SMTP
                        + " autorizzato per il Service Account e il servizio SMTP relay attivo in Admin → Gmail → Routing "
                        + "(autenticazione SMTP richiesta, solo indirizzi del dominio). Dettaglio: " + e.getMessage();
                case SMTP -> "Il server SMTP non accetta il gestionale: controlla host, porta, utente e la variabile "
                        + "d'ambiente con la password. Dettaglio: " + e.getMessage();
            };
        }
        if (e instanceof MailingCanaleException.Temporanea) {
            return "Il servizio di posta non ha risposto o ha chiesto di rallentare: riprova tra qualche minuto. Dettaglio: "
                    + e.getMessage();
        }
        return e.getMessage();
    }

    /**
     * L'indirizzo mittente fra gli "Invia come" della casella delegata. {@code alias} null = non letti (scope o Gmail
     * non disponibili): resta l'avviso generico.
     */
    static MailingDto.Controllo controlloAlias(String email, String casella, List<SendAs> alias) {
        String titolo = "Indirizzo \"Invia come\"";
        String dove = " (Gmail di " + casella + " → Impostazioni → Account → Invia messaggio come).";
        if (alias == null) {
            return new MailingDto.Controllo("alias", "AVVISO", titolo, email + " deve essere configurato in Gmail come "
                    + "indirizzo \"Invia come\" della casella " + casella + dove + " Altrimenti Gmail spedisce col nome della casella.");
        }
        SendAs trovato = alias.stream().filter(a -> email.equalsIgnoreCase(a.getSendAsEmail())).findFirst().orElse(null);
        if (trovato == null) {
            return new MailingDto.Controllo("alias", "ERRORE", "\"Invia come\" mancante", email + " non è fra gli indirizzi "
                    + "\"Invia come\" di " + casella + ": Gmail riscrive il mittente col nome della casella. Aggiungilo" + dove);
        }
        if (trovato.getVerificationStatus() != null && !"accepted".equalsIgnoreCase(trovato.getVerificationStatus())) {
            return new MailingDto.Controllo("alias", "ERRORE", "\"Invia come\" da confermare", email + " è fra gli indirizzi "
                    + "\"Invia come\" di " + casella + " ma non è ancora confermato: apri il link nell'email di conferma di Gmail.");
        }
        return new MailingDto.Controllo("alias", "OK", "\"Invia come\" configurato",
                "Gmail spedisce da " + casella + " col mittente " + email + ".");
    }

    /** Risoluzioni DNS che un record SPF può chiedere (RFC 7208): oltre, i server di posta lo danno per non valido. */
    static final int SPF_MAX_RISOLUZIONI = 10;

    /**
     * Il record SPF autorizza Google anche passando da altri record ({@code include:}, {@code redirect=}), come i
     * record gestiti dei provider DNS ({@code include:dc-xxx._spfm.dominio}) che a loro volta includono Google.
     */
    static boolean spfIncludeGoogle(String record, Function<String, List<String>> txt, Set<String> visti) {
        for (String termine : record.toLowerCase(Locale.ROOT).trim().split("\\s+")) {
            String bersaglio;
            if (termine.startsWith("include:") || termine.startsWith("+include:")) {
                bersaglio = termine.substring(termine.indexOf(':') + 1);
            } else if (termine.startsWith("redirect=")) {
                bersaglio = termine.substring("redirect=".length());
            } else {
                continue;
            }
            if ("_spf.google.com".equals(bersaglio)) {
                return true;
            }
            if (bersaglio.isEmpty() || visti.size() >= SPF_MAX_RISOLUZIONI || !visti.add(bersaglio)) {
                continue;
            }
            for (String annidato : txt.apply(bersaglio)) {
                if (annidato.toLowerCase(Locale.ROOT).startsWith("v=spf1") && spfIncludeGoogle(annidato, txt, visti)) {
                    return true;
                }
            }
        }
        return false;
    }

    /** Controlli DNS del dominio mittente. {@code txt}: nome DNS → record TXT (lista vuota se assenti). */
    static List<MailingDto.Controllo> controlliDns(String dominio, MailingMittente.Canale canale,
                                                  Function<String, List<String>> txt) {
        List<MailingDto.Controllo> out = new ArrayList<>();
        boolean google = canale != MailingMittente.Canale.SMTP;

        List<String> spf = txt.apply(dominio).stream().filter(r -> r.toLowerCase(Locale.ROOT).startsWith("v=spf1")).toList();
        if (spf.isEmpty()) {
            out.add(new MailingDto.Controllo("spf", "ERRORE", "SPF mancante",
                    "Il dominio " + dominio + " non dice chi può spedire a suo nome. Aggiungi nel DNS un record TXT "
                            + (google ? "\"v=spf1 include:_spf.google.com ~all\"" : "SPF con il server del tuo provider")
                            + ": senza, molte email finiranno nello spam."));
        } else if (spf.size() > 1) {
            out.add(new MailingDto.Controllo("spf", "ERRORE", "SPF doppio",
                    "Il dominio ha " + spf.size() + " record SPF: deve essercene uno solo. Uniscili in un unico record."));
        } else {
            String r = spf.get(0).toLowerCase(Locale.ROOT);
            if (google && !spfIncludeGoogle(r, txt, new HashSet<>())) {
                out.add(new MailingDto.Controllo("spf", "ERRORE", "SPF senza Google",
                        "Il record SPF (" + spf.get(0) + ") non autorizza Google Workspace: aggiungi include:_spf.google.com."));
            } else if (r.contains("+all")) {
                out.add(new MailingDto.Controllo("spf", "AVVISO", "SPF troppo permissivo",
                        "Il record SPF finisce con +all: chiunque può spedire a nome del dominio. Usa ~all o -all."));
            } else {
                out.add(new MailingDto.Controllo("spf", "OK", "SPF corretto",
                        google ? "Google è autorizzato a spedire per " + dominio + "." : "Il dominio ha un record SPF: "
                                + "verifica che includa il server del tuo provider SMTP."));
            }
        }

        List<String> dkim = txt.apply("google._domainkey." + dominio);
        boolean dkimOk = dkim.stream().anyMatch(r -> r.contains("v=DKIM1") || r.contains("p="));
        if (dkimOk) {
            out.add(new MailingDto.Controllo("dkim", "OK", "DKIM attivo", "Le email sono firmate da Google per " + dominio + "."));
        } else if (google) {
            out.add(new MailingDto.Controllo("dkim", "ERRORE", "DKIM non attivo",
                    "Manca la firma DKIM (selettore google). In Google Admin → App → Google Workspace → Gmail → "
                            + "Autentica email genera la chiave, pubblica il record TXT google._domainkey nel DNS e premi \"Avvia autenticazione\"."));
        } else {
            out.add(new MailingDto.Controllo("dkim", "AVVISO", "DKIM da controllare",
                    "Non trovo il selettore google._domainkey: il tuo provider SMTP usa un suo selettore. Verifica nel suo pannello che DKIM sia attivo."));
        }

        List<String> dmarc = txt.apply("_dmarc." + dominio).stream()
                .filter(r -> r.toUpperCase(Locale.ROOT).startsWith("V=DMARC1")).toList();
        if (dmarc.isEmpty()) {
            out.add(new MailingDto.Controllo("dmarc", "ERRORE", "DMARC mancante",
                    "Gmail e Yahoo chiedono DMARC a chi manda email in quantità. Aggiungi un record TXT _dmarc." + dominio
                            + " con \"v=DMARC1; p=none; rua=mailto:dmarc@" + dominio + "\" (poi, quando tutto va bene, p=quarantine)."));
        } else {
            String p = dmarc.get(0).toLowerCase(Locale.ROOT).replace(" ", "");
            if (p.contains("p=none")) {
                out.add(new MailingDto.Controllo("dmarc", "AVVISO", "DMARC in sola osservazione",
                        "DMARC c'è ma con p=none: va bene per iniziare. Dopo qualche settimana senza problemi passa a p=quarantine."));
            } else if (p.contains("p=quarantine") || p.contains("p=reject")) {
                out.add(new MailingDto.Controllo("dmarc", "OK", "DMARC attivo", "Il dominio è protetto da DMARC (" + dmarc.get(0) + ")."));
            } else {
                out.add(new MailingDto.Controllo("dmarc", "AVVISO", "DMARC senza policy",
                        "Il record DMARC non indica una policy (p=none, quarantine o reject): correggilo."));
            }
        }
        return out;
    }

    /** Record TXT via DNS (JNDI). Lista vuota se il nome non esiste o il DNS non risponde. */
    static List<String> txt(String nome) {
        Hashtable<String, String> env = new Hashtable<>();
        env.put("java.naming.factory.initial", "com.sun.jndi.dns.DnsContextFactory");
        env.put("java.naming.provider.url", "dns:");
        env.put("com.sun.jndi.dns.timeout.initial", "3000");
        env.put("com.sun.jndi.dns.timeout.retries", "2");
        List<String> out = new ArrayList<>();
        DirContext ctx = null;
        try {
            ctx = new InitialDirContext(env);
            Attributes attrs = ctx.getAttributes(nome, new String[]{"TXT"});
            Attribute a = attrs.get("TXT");
            if (a != null) {
                NamingEnumeration<?> valori = a.getAll();
                while (valori.hasMore()) {
                    out.add(unisciTxt(String.valueOf(valori.next())));
                }
            }
        } catch (NamingException e) {
            logger.debug("[MAILING] TXT {} non trovato: {}", nome, e.getMessage());
        } finally {
            if (ctx != null) {
                try {
                    ctx.close();
                } catch (NamingException ignorata) {
                    // niente
                }
            }
        }
        return out;
    }

    /** I TXT lunghi arrivano a pezzi tra virgolette ("v=DKIM1; k=rsa; " "p=MIIB..."): si uniscono. */
    static String unisciTxt(String grezzo) {
        String s = grezzo.trim();
        if (!s.startsWith("\"")) {
            return s;
        }
        StringBuilder sb = new StringBuilder();
        java.util.regex.Matcher m = Pattern.compile("\"((?:[^\"\\\\]|\\\\.)*)\"").matcher(s);
        while (m.find()) {
            sb.append(m.group(1));
        }
        return sb.toString();
    }

    LocalDateTime adesso() {
        return MailingTempo.adesso();
    }
}
