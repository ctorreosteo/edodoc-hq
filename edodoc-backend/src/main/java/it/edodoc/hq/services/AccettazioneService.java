package it.edodoc.hq.services;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import it.edodoc.hq.dto.AccettazioneDto;
import it.edodoc.hq.exception.ConflittoException;
import it.edodoc.hq.exception.RisorsaNonTrovataException;
import it.edodoc.hq.models.AccettazioneDocumento;
import it.edodoc.hq.models.AccettazioneFirma;
import it.edodoc.hq.models.AccettazioneFirmaEvento;
import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.models.PazienteConsenso;
import it.edodoc.hq.repositories.AccettazioneFirmaEventoRepository;
import it.edodoc.hq.repositories.AccettazioneFirmaRepository;
import it.edodoc.hq.repositories.PazienteConsensoRepository;
import it.edodoc.hq.repositories.PazienteRepository;
import it.edodoc.hq.services.AccettazioneRegistro.Origine;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Accettazione firmata online, lato gestionale: crea la richiesta per un paziente, manda il link per email (o lo
 * restituisce da copiare), reinvia, annulla, consegna PDF e registro, tiene lo storico dei consensi facoltativi.
 * Le chiamate a Google stanno fuori dalle transazioni; ogni passaggio finisce nel registro a catena di hash.
 */
@Service
public class AccettazioneService {

    private static final Logger logger = LoggerFactory.getLogger(AccettazioneService.class);
    private static final DateTimeFormatter DATA = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final String ALFABETO_TOKEN = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    private static final String ALFABETO_CODICE = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
    private static final SecureRandom RANDOM = new SecureRandom();
    static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");

    static final Map<String, String> TITOLI_CONSENSI = Map.of(
            "CONTATTO_MEDICO", "Contatto con il medico");

    private final AccettazioneFirmaRepository repo;
    private final AccettazioneFirmaEventoRepository eventiRepo;
    private final PazienteConsensoRepository consensiRepo;
    private final PazienteRepository pazienti;
    private final AccettazioneTesti testi;
    private final AccettazioneRegistro registro;
    private final GmailService gmail;
    private final ConfigService config;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate tx;

    /** In locale punta al Vite di sviluppo; vuoto = ACCETTAZIONE_URL_FIRMA di config. */
    @Value("${app.accettazione.url-firma:}")
    private String urlFirmaProprieta;

    public AccettazioneService(AccettazioneFirmaRepository repo, AccettazioneFirmaEventoRepository eventiRepo,
                               PazienteConsensoRepository consensiRepo, PazienteRepository pazienti,
                               AccettazioneTesti testi, AccettazioneRegistro registro, GmailService gmail,
                               ConfigService config, ObjectMapper objectMapper, PlatformTransactionManager tm) {
        this.repo = repo;
        this.eventiRepo = eventiRepo;
        this.consensiRepo = consensiRepo;
        this.pazienti = pazienti;
        this.testi = testi;
        this.registro = registro;
        this.gmail = gmail;
        this.config = config;
        this.objectMapper = objectMapper;
        this.tx = new TransactionTemplate(tm);
    }

    /** Un file da scaricare. */
    public record File(String nome, byte[] contenuto) {
    }

    // ------------------------------------------------------------------ lettura

    public AccettazioneDto.Panoramica panoramica(Long pazienteId) {
        Paziente p = pazienti.findById(pazienteId).orElseThrow(() -> new RisorsaNonTrovataException("Paziente non trovato"));
        List<AccettazioneDto.Riga> richieste = repo.findByPazienteIdOrderByCreataIlDesc(pazienteId).stream().map(this::riga).toList();
        return new AccettazioneDto.Panoramica(richieste, consensiAttuali(pazienteId), testi.datiTitolareMancanti(),
                gmail.isAttivo(), minorenne(p));
    }

    /** L'ultima scelta per ogni tipo di consenso. */
    List<AccettazioneDto.Consenso> consensiAttuali(Long pazienteId) {
        Map<PazienteConsenso.Tipo, PazienteConsenso> ultimi = new LinkedHashMap<>();
        for (PazienteConsenso c : consensiRepo.findByPazienteIdOrderByIlDesc(pazienteId)) {
            ultimi.putIfAbsent(c.getTipo(), c);
        }
        return ultimi.values().stream().map(c -> new AccettazioneDto.Consenso(c.getTipo().name(),
                TITOLI_CONSENSI.getOrDefault(c.getTipo().name(), c.getTipo().name()), c.getConcesso(), c.getIl(),
                c.getFonte().name(), c.getNote())).toList();
    }

    AccettazioneDto.Riga riga(AccettazioneFirma a) {
        AccettazioneDto.Snapshot snap = snapshot(a);
        AccettazioneDto.Persona chi = snap.firmatario() != null ? snap.firmatario() : snap.paziente();
        AccettazioneDto.Scelte scelte = scelte(a);
        return new AccettazioneDto.Riga(a.getId(), statoVisibile(a), a.getCodiceVerifica(), a.getCreataIl(), a.getScadeIl(),
                a.getApertaIl(), a.getFirmataIl(), a.getEmail(), chi.nome() + " " + chi.cognome(), a.getFirmatarioRuolo().name(),
                testi.documento(a.getModuloDocumentoId()).getVersione(), a.getEmailInviataIl(), a.getCopiaInviataIl(),
                a.getTsaOra() != null, a.getMotivoAnnullamento(), scelte == null ? Map.of() : scelte.consensi());
    }

    static String statoVisibile(AccettazioneFirma a) {
        return !a.isChiusa() && !a.getScadeIl().isAfter(LocalDateTime.now()) ? "SCADUTA" : a.getStato().name();
    }

    // ------------------------------------------------------------------ creazione e invio

    public AccettazioneDto.Inviata crea(Long pazienteId, AccettazioneDto.CreaRequest req, Long utenteId, Origine origine) {
        AccettazioneDto.CreaRequest r = req == null ? new AccettazioneDto.CreaRequest(null, null, null) : req;
        List<String> mancanti = testi.datiTitolareMancanti();
        if (!mancanti.isEmpty()) {
            throw new IllegalArgumentException("Prima di inviare l'accettazione compila in Impostazioni i tuoi dati per "
                    + "l'informativa: " + String.join(", ", mancanti));
        }
        Paziente paziente = pazienti.findById(pazienteId).orElseThrow(() -> new RisorsaNonTrovataException("Paziente non trovato"));
        if (!Boolean.TRUE.equals(paziente.getAttivo()) || paziente.getAnonimizzatoIl() != null) {
            throw new ConflittoException("Il paziente è archiviato: riattivalo prima di inviare l'accettazione");
        }
        AccettazioneDto.GenitoreRequest g = r.genitore();
        boolean conGenitore = g != null && StringUtils.hasText(g.nome()) && StringUtils.hasText(g.cognome());
        if (minorenne(paziente) && !conGenitore) {
            throw new IllegalArgumentException("Il paziente è minorenne: firma il genitore o il tutore, indica nome e cognome");
        }
        String email = email(StringUtils.hasText(r.email()) ? r.email() : paziente.getEmail());
        AccettazioneFirma.Ruolo ruolo = !conGenitore ? AccettazioneFirma.Ruolo.PAZIENTE
                : "TUTORE".equalsIgnoreCase(g.ruolo()) ? AccettazioneFirma.Ruolo.TUTORE : AccettazioneFirma.Ruolo.GENITORE;
        AccettazioneDto.Persona datiPaziente = persona(paziente);
        AccettazioneDto.Persona datiFirmatario = !conGenitore ? null : new AccettazioneDto.Persona(g.nome().strip(),
                g.cognome().strip(), maiuscolo(g.codiceFiscale()), null, null, null, null, null, null, email, null);
        if (datiFirmatario == null) {
            datiPaziente = conEmail(datiPaziente, email);
        }
        AccettazioneDto.Snapshot snap = new AccettazioneDto.Snapshot(datiPaziente, datiFirmatario);

        AccettazioneDocumento modulo = testi.attivo(AccettazioneDocumento.Tipo.MODULO);
        AccettazioneDocumento informativa = testi.attivo(AccettazioneDocumento.Tipo.INFORMATIVA);
        AccettazioneDocumento fornitori = testi.attivo(AccettazioneDocumento.Tipo.FORNITORI);
        String token = token();
        Origine o = new Origine(origine.ip(), origine.userAgent(), utenteId);
        boolean minorenne = conGenitore;

        Long id = tx.execute(s -> {
            for (AccettazioneFirma aperta : repo.findByPazienteIdOrderByCreataIlDesc(pazienteId)) {
                if (!aperta.isChiusa()) {
                    chiudi(aperta, utenteId, "Sostituita da una nuova richiesta", o);
                }
            }
            AccettazioneFirma a = new AccettazioneFirma();
            a.setPazienteId(pazienteId);
            a.setStato(AccettazioneFirma.Stato.INVIATA);
            a.setCodiceVerifica(nuovoCodiceVerifica());
            a.setTokenHash(AccettazioneRegistro.sha256Hex(token.getBytes(StandardCharsets.UTF_8)));
            a.setMinorenne(minorenne);
            a.setFirmatarioRuolo(ruolo);
            a.setDatiSnapshot(json(snap));
            a.setEmail(email);
            a.setModuloDocumentoId(modulo.getId());
            a.setInformativaDocumentoId(informativa.getId());
            a.setFornitoriDocumentoId(fornitori.getId());
            a.setCreataDaUtenteId(utenteId);
            a.setCreataIl(LocalDateTime.now());
            a.setScadeIl(LocalDateTime.now().plusDays(validitaGiorni()));
            a = repo.save(a);
            AccettazioneDto.Persona chi = datiFirmatario != null ? datiFirmatario : snap.paziente();
            registro.registra(a.getId(), AccettazioneFirmaEvento.Tipo.CREATA, o, "firmatario " + chi.nome() + " "
                    + chi.cognome() + " (" + AccettazionePdfService.ruolo(ruolo) + "); email " + email + "; modulo v. "
                    + modulo.getVersione() + ", informativa v. " + informativa.getVersione() + ", fornitori v. "
                    + fornitori.getVersione());
            return a.getId();
        });
        return dopoInvio(id, token, !Boolean.FALSE.equals(r.inviaEmail()), o);
    }

    /** Nuovo link (il vecchio smette di funzionare), nuova scadenza, eventualmente nuova email; stessi testi e dati. */
    public AccettazioneDto.Inviata reinvia(Long id, AccettazioneDto.ReinviaRequest req, Long utenteId, Origine origine) {
        String token = token();
        Origine o = new Origine(origine.ip(), origine.userAgent(), utenteId);
        tx.executeWithoutResult(s -> {
            AccettazioneFirma a = repo.findByIdPerAggiornamento(id).orElseThrow(() -> new RisorsaNonTrovataException("Richiesta non trovata"));
            if (a.isChiusa()) {
                throw new ConflittoException(a.getStato() == AccettazioneFirma.Stato.FIRMATA
                        ? "Il modulo è già firmato" : "La richiesta è annullata: creane una nuova");
            }
            String email = req != null && StringUtils.hasText(req.email()) ? email(req.email()) : a.getEmail();
            if (!email.equals(a.getEmail())) {
                // Il codice monouso va alla nuova email: la verifica fatta sulla vecchia non vale più.
                a.setOtpVerificatoIl(null);
                a.setOtpHash(null);
                a.setDatiSnapshot(json(conEmailSnapshot(snapshot(a), email)));
            }
            a.setEmail(email);
            a.setTokenHash(AccettazioneRegistro.sha256Hex(token.getBytes(StandardCharsets.UTF_8)));
            a.setScadeIl(LocalDateTime.now().plusDays(validitaGiorni()));
            registro.registra(id, AccettazioneFirmaEvento.Tipo.LINK_RIGENERATO, o, "scade il " + DATA.format(a.getScadeIl())
                    + "; email " + email);
        });
        return dopoInvio(id, token, req == null || !Boolean.FALSE.equals(req.inviaEmail()), o);
    }

    private AccettazioneDto.Inviata dopoInvio(Long id, String token, boolean inviaEmail, Origine o) {
        String link = urlFirma() + "/" + token;
        String avviso = null;
        if (inviaEmail) {
            avviso = inviaLink(id, link, o);
        }
        return new AccettazioneDto.Inviata(riga(repo.findById(id).orElseThrow()), link, avviso);
    }

    /** Manda l'email con il link. Restituisce un avviso per il dottore se non parte, senza fallire la richiesta. */
    private String inviaLink(Long id, String link, Origine o) {
        AccettazioneFirma a = repo.findById(id).orElseThrow();
        if (!gmail.isAttivo()) {
            registro.registra(id, AccettazioneFirmaEvento.Tipo.EMAIL_NON_INVIATA, o, "invio email non attivo");
            return "L'invio email non è attivo: copia il link e mandalo tu (email, WhatsApp o chat dell'app).";
        }
        AccettazioneDto.Snapshot snap = snapshot(a);
        String nome = (snap.firmatario() != null ? snap.firmatario() : snap.paziente()).nome();
        String testo = config.get("ACCETTAZIONE_EMAIL_TESTO")
                .replace("{nome}", nome)
                .replace("{link}", link)
                .replace("{scadenza}", DATA.format(a.getScadeIl()));
        try {
            gmail.invia(a.getEmail(), config.get("ACCETTAZIONE_EMAIL_OGGETTO"), CorpoEmail.da(testo), null, null);
        } catch (RuntimeException e) {
            logger.warn("[ACCETTAZIONE] Email con il link non partita per la richiesta {}: {}", id, e.getMessage());
            registro.registra(id, AccettazioneFirmaEvento.Tipo.EMAIL_NON_INVIATA, o, e.getMessage());
            return "L'email non è partita (" + e.getMessage() + "): copia il link e mandalo tu.";
        }
        tx.executeWithoutResult(s -> {
            AccettazioneFirma b = repo.findByIdPerAggiornamento(id).orElseThrow();
            b.setEmailInviataIl(LocalDateTime.now());
            registro.registra(id, AccettazioneFirmaEvento.Tipo.EMAIL_INVIATA, o, "a " + b.getEmail());
        });
        return null;
    }

    // ------------------------------------------------------------------ annullamento ed eliminazione

    public AccettazioneDto.Riga annulla(Long id, String motivo, Long utenteId, Origine origine) {
        Origine o = new Origine(origine.ip(), origine.userAgent(), utenteId);
        tx.executeWithoutResult(s -> {
            AccettazioneFirma a = repo.findByIdPerAggiornamento(id).orElseThrow(() -> new RisorsaNonTrovataException("Richiesta non trovata"));
            if (a.isChiusa()) {
                throw new ConflittoException(a.getStato() == AccettazioneFirma.Stato.FIRMATA
                        ? "Un modulo firmato non si annulla: per revocare un consenso usa i consensi qui sotto"
                        : "La richiesta è già annullata");
            }
            chiudi(a, utenteId, StringUtils.hasText(motivo) ? motivo.strip() : "Annullata dal dottore", o);
        });
        return riga(repo.findById(id).orElseThrow());
    }

    private void chiudi(AccettazioneFirma a, Long utenteId, String motivo, Origine o) {
        a.setStato(AccettazioneFirma.Stato.ANNULLATA);
        a.setAnnullataIl(LocalDateTime.now());
        a.setAnnullataDaUtenteId(utenteId);
        a.setMotivoAnnullamento(motivo.length() > 500 ? motivo.substring(0, 500) : motivo);
        repo.save(a);
        registro.registra(a.getId(), AccettazioneFirmaEvento.Tipo.ANNULLATA, o, motivo);
    }

    /** Cancella una richiesta mai firmata, con il suo registro. I moduli firmati non si cancellano (lo vieta il DB). */
    public void elimina(Long id) {
        tx.executeWithoutResult(s -> {
            AccettazioneFirma a = repo.findByIdPerAggiornamento(id).orElseThrow(() -> new RisorsaNonTrovataException("Richiesta non trovata"));
            if (a.getStato() == AccettazioneFirma.Stato.FIRMATA) {
                throw new ConflittoException("Un modulo firmato non si può eliminare");
            }
            eventiRepo.deleteAll(eventiRepo.findByAccettazioneIdOrderBySeqAsc(id));
            eventiRepo.flush();
            repo.delete(a);
        });
    }

    // ------------------------------------------------------------------ documenti

    public File pdf(Long id) {
        AccettazioneFirma a = repo.findById(id).orElseThrow(() -> new RisorsaNonTrovataException("Richiesta non trovata"));
        if (a.getStato() != AccettazioneFirma.Stato.FIRMATA) {
            throw new ConflittoException("Il modulo non è ancora firmato");
        }
        return new File(nomeFile(a), a.getPdf());
    }

    static String nomeFile(AccettazioneFirma a) {
        return "Modulo_accettazione_" + a.getCodiceVerifica() + ".pdf";
    }

    public AccettazioneDto.Registro registro(Long id) {
        repo.findById(id).orElseThrow(() -> new RisorsaNonTrovataException("Richiesta non trovata"));
        List<AccettazioneFirmaEvento> eventi = eventiRepo.findByAccettazioneIdOrderBySeqAsc(id);
        return new AccettazioneDto.Registro(eventi.stream().map(e -> new AccettazioneDto.Evento(e.getSeq(),
                e.getTipo().name(), e.getIl(), e.getIp(), e.getUserAgent(), e.getDettagli())).toList(), registro.verifica(eventi));
    }

    // ------------------------------------------------------------------ consensi

    /** Revoca o nuovo consenso dato a voce o per email: si aggiunge una riga, le precedenti restano come prova. */
    public List<AccettazioneDto.Consenso> registraConsenso(Long pazienteId, AccettazioneDto.ConsensoRequest req, Long utenteId) {
        pazienti.findById(pazienteId).orElseThrow(() -> new RisorsaNonTrovataException("Paziente non trovato"));
        if (req == null || req.concesso() == null || !StringUtils.hasText(req.tipo())) {
            throw new IllegalArgumentException("Indica il consenso e la scelta");
        }
        PazienteConsenso.Tipo tipo;
        try {
            tipo = PazienteConsenso.Tipo.valueOf(req.tipo().strip().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Consenso sconosciuto: " + req.tipo());
        }
        PazienteConsenso c = new PazienteConsenso();
        c.setPazienteId(pazienteId);
        c.setTipo(tipo);
        c.setConcesso(req.concesso());
        c.setIl(LocalDateTime.now());
        c.setFonte(PazienteConsenso.Fonte.MANUALE);
        c.setRegistratoDaUtenteId(utenteId);
        c.setNote(StringUtils.hasText(req.note()) ? req.note().strip() : null);
        consensiRepo.save(c);
        return consensiAttuali(pazienteId);
    }

    // ------------------------------------------------------------------ utilità condivise con la pagina pubblica

    String urlFirma() {
        String u = StringUtils.hasText(urlFirmaProprieta) ? urlFirmaProprieta : config.get("ACCETTAZIONE_URL_FIRMA");
        return u.strip().replaceAll("/+$", "");
    }

    /** Pagina pubblica di verifica, accanto a quella di firma: …/verifica-firma/CODICE. */
    String urlVerifica(String codice) {
        String base = urlFirma();
        int i = base.lastIndexOf('/');
        return (i > "https://".length() ? base.substring(0, i) : base) + "/verifica-firma/" + codice;
    }

    int validitaGiorni() {
        try {
            int g = Integer.parseInt(config.get("ACCETTAZIONE_LINK_VALIDITA_GIORNI").strip());
            return Math.max(1, Math.min(60, g));
        } catch (NumberFormatException e) {
            return 14;
        }
    }

    AccettazioneDto.Snapshot snapshot(AccettazioneFirma a) {
        try {
            return objectMapper.readValue(a.getDatiSnapshot(), AccettazioneDto.Snapshot.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Dati della richiesta " + a.getId() + " non leggibili", e);
        }
    }

    AccettazioneDto.Scelte scelte(AccettazioneFirma a) {
        if (a.getScelte() == null) return null;
        try {
            return objectMapper.readValue(a.getScelte(), AccettazioneDto.Scelte.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Scelte della richiesta " + a.getId() + " non leggibili", e);
        }
    }

    String json(Object o) {
        try {
            return objectMapper.writeValueAsString(o);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    static boolean minorenne(Paziente p) {
        return p.getDataNascita() != null && p.getDataNascita().plusYears(18).isAfter(LocalDate.now());
    }

    static AccettazioneDto.Persona persona(Paziente p) {
        return new AccettazioneDto.Persona(p.getNome(), p.getCognome(), p.getCodiceFiscale(),
                p.getDataNascita() == null ? null : p.getDataNascita().toString(), null, p.getIndirizzo(), p.getCap(),
                p.getCitta(), p.getProvincia(), p.getEmail(), p.getCellulare());
    }

    private static AccettazioneDto.Persona conEmail(AccettazioneDto.Persona p, String email) {
        return new AccettazioneDto.Persona(p.nome(), p.cognome(), p.codiceFiscale(), p.dataNascita(), p.luogoNascita(),
                p.indirizzo(), p.cap(), p.citta(), p.provincia(), email, p.cellulare());
    }

    private static AccettazioneDto.Snapshot conEmailSnapshot(AccettazioneDto.Snapshot s, String email) {
        return s.firmatario() != null ? new AccettazioneDto.Snapshot(s.paziente(), conEmail(s.firmatario(), email))
                : new AccettazioneDto.Snapshot(conEmail(s.paziente(), email), null);
    }

    static String email(String grezza) {
        String e = grezza == null ? "" : grezza.strip().toLowerCase(Locale.ROOT);
        if (!EMAIL.matcher(e).matches()) {
            throw new IllegalArgumentException(e.isEmpty() ? "Serve l'email di chi firma: lì arrivano link e codice"
                    : "Email non valida: " + e);
        }
        return e;
    }

    static String maiuscolo(String s) {
        return StringUtils.hasText(s) ? s.strip().toUpperCase(Locale.ROOT) : null;
    }

    private String nuovoCodiceVerifica() {
        for (int i = 0; i < 20; i++) {
            StringBuilder c = new StringBuilder("ED-");
            for (int j = 0; j < 8; j++) {
                if (j == 4) c.append('-');
                c.append(ALFABETO_CODICE.charAt(RANDOM.nextInt(ALFABETO_CODICE.length())));
            }
            if (!repo.existsByCodiceVerifica(c.toString())) return c.toString();
        }
        throw new IllegalStateException("Codice di verifica non generato");
    }

    static String token() {
        StringBuilder t = new StringBuilder(40);
        for (int i = 0; i < 40; i++) t.append(ALFABETO_TOKEN.charAt(RANDOM.nextInt(ALFABETO_TOKEN.length())));
        return t.toString();
    }

    static List<String> cambiati(AccettazioneDto.Persona prima, AccettazioneDto.Persona dopo) {
        List<String> c = new ArrayList<>();
        if (prima == null || dopo == null) return c;
        confronta(c, "nome", prima.nome(), dopo.nome());
        confronta(c, "cognome", prima.cognome(), dopo.cognome());
        confronta(c, "codice fiscale", prima.codiceFiscale(), dopo.codiceFiscale());
        confronta(c, "data di nascita", prima.dataNascita(), dopo.dataNascita());
        confronta(c, "luogo di nascita", prima.luogoNascita(), dopo.luogoNascita());
        confronta(c, "indirizzo", prima.indirizzo(), dopo.indirizzo());
        confronta(c, "CAP", prima.cap(), dopo.cap());
        confronta(c, "città", prima.citta(), dopo.citta());
        confronta(c, "provincia", prima.provincia(), dopo.provincia());
        confronta(c, "cellulare", prima.cellulare(), dopo.cellulare());
        return c;
    }

    private static void confronta(List<String> c, String nome, String a, String b) {
        String x = a == null ? "" : a.strip();
        String y = b == null ? "" : b.strip();
        if (!x.equalsIgnoreCase(y)) c.add(nome);
    }
}
