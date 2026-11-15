package it.edodoc.hq.services;

import it.edodoc.hq.dto.AccettazioneDto;
import it.edodoc.hq.exception.ConflittoException;
import it.edodoc.hq.exception.IntegrazioneDisattivataException;
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
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Calendar;
import java.util.GregorianCalendar;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;
import java.util.regex.Pattern;

/**
 * Pagina pubblica di firma, dal link personale: dati da controllare, testi da leggere, codice monouso per email,
 * firma tracciata. Alla firma il PDF viene generato, sigillato con marca temporale e salvato; la copia parte per email.
 */
@Service
public class AccettazionePubblicaService {

    private static final Logger logger = LoggerFactory.getLogger(AccettazionePubblicaService.class);
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Pattern CODICE_FISCALE = Pattern.compile("^[A-Z0-9]{16}$");
    private static final Pattern CAP = Pattern.compile("^[0-9A-Za-z -]{3,10}$");
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G'};
    static final int OTP_MINUTI = 10;
    static final int OTP_MAX_INVII = 5;
    static final int OTP_MAX_TENTATIVI = 5;
    static final int OTP_ATTESA_SECONDI = 60;
    private static final int FIRMA_MAX_BYTE = 400_000;

    private final AccettazioneService base;
    private final AccettazioneFirmaRepository repo;
    private final AccettazioneFirmaEventoRepository eventiRepo;
    private final PazienteConsensoRepository consensiRepo;
    private final PazienteRepository pazienti;
    private final AccettazioneTesti testi;
    private final AccettazioneRegistro registro;
    private final AccettazionePdfService pdfService;
    private final AccettazioneSigilloService sigillo;
    private final GmailService gmail;
    private final ConfigService config;
    private final PasswordEncoder encoder;
    private final Environment environment;
    private final TransactionTemplate tx;

    public AccettazionePubblicaService(AccettazioneService base, AccettazioneFirmaRepository repo,
                                       AccettazioneFirmaEventoRepository eventiRepo, PazienteConsensoRepository consensiRepo,
                                       PazienteRepository pazienti, AccettazioneTesti testi, AccettazioneRegistro registro,
                                       AccettazionePdfService pdfService, AccettazioneSigilloService sigillo,
                                       GmailService gmail, ConfigService config, PasswordEncoder encoder,
                                       Environment environment, PlatformTransactionManager tm) {
        this.base = base;
        this.repo = repo;
        this.eventiRepo = eventiRepo;
        this.consensiRepo = consensiRepo;
        this.pazienti = pazienti;
        this.testi = testi;
        this.registro = registro;
        this.pdfService = pdfService;
        this.sigillo = sigillo;
        this.gmail = gmail;
        this.config = config;
        this.encoder = encoder;
        this.environment = environment;
        this.tx = new TransactionTemplate(tm);
    }

    // ------------------------------------------------------------------ lettura

    public AccettazioneDto.Vista vista(String token, Origine origine) {
        AccettazioneFirma trovata = trova(token);
        if (trovata.getStato() == AccettazioneFirma.Stato.INVIATA && trovata.isFirmabile()) {
            tx.executeWithoutResult(s -> {
                AccettazioneFirma a = repo.findByIdPerAggiornamento(trovata.getId()).orElseThrow();
                if (a.getStato() == AccettazioneFirma.Stato.INVIATA) {
                    a.setStato(AccettazioneFirma.Stato.APERTA);
                    a.setApertaIl(LocalDateTime.now());
                    registro.registra(a.getId(), AccettazioneFirmaEvento.Tipo.APERTA, origine, null);
                }
            });
        }
        return vista(repo.findById(trovata.getId()).orElseThrow());
    }

    private AccettazioneDto.Vista vista(AccettazioneFirma a) {
        String stato = AccettazioneService.statoVisibile(a);
        String contatto = testi.emailPrivacy();
        if (a.getStato() == AccettazioneFirma.Stato.FIRMATA) {
            return new AccettazioneDto.Vista(stato, a.getScadeIl(), testi.titolare(), a.getFirmatarioRuolo().name(),
                    a.getMinorenne(), null, null, AccettazionePdfService.mascheraEmail(a.getEmail()), true, true, null,
                    null, null, null, null, new AccettazioneDto.Firmata(a.getCodiceVerifica(), a.getFirmataIl(),
                    a.getCopiaInviataIl() != null), contatto);
        }
        if (!a.isFirmabile()) {
            return new AccettazioneDto.Vista(stato, a.getScadeIl(), testi.titolare(), a.getFirmatarioRuolo().name(),
                    a.getMinorenne(), null, null, null, false, false, null, null, null, null, null, null, contatto);
        }
        AccettazioneDto.Snapshot snap = base.snapshot(a);
        AccettazioneDocumento informativa = testi.documento(a.getInformativaDocumentoId());
        AccettazioneDocumento fornitori = testi.documento(a.getFornitoriDocumentoId());
        return new AccettazioneDto.Vista(stato, a.getScadeIl(), testi.titolare(), a.getFirmatarioRuolo().name(),
                a.getMinorenne(), snap.paziente(), snap.firmatario(), AccettazionePdfService.mascheraEmail(a.getEmail()),
                a.getDatiConfermatiIl() != null, otpValido(a),
                testi.modulo(testi.documento(a.getModuloDocumentoId()), a.getMinorenne()),
                testi.html(informativa), testi.html(fornitori), informativa.getTitolo(), fornitori.getTitolo(), null, contatto);
    }

    private static boolean otpValido(AccettazioneFirma a) {
        return a.getOtpVerificatoIl() != null;
    }

    // ------------------------------------------------------------------ dati

    public AccettazioneDto.Vista dati(String token, AccettazioneDto.DatiRequest req, Origine origine) {
        AccettazioneFirma trovata = firmabile(trova(token));
        if (req == null || req.paziente() == null) {
            throw new IllegalArgumentException("Mancano i dati da confermare");
        }
        tx.executeWithoutResult(s -> {
            AccettazioneFirma a = firmabile(repo.findByIdPerAggiornamento(trovata.getId()).orElseThrow());
            AccettazioneDto.Snapshot prima = base.snapshot(a);
            boolean adulto = prima.firmatario() == null;
            AccettazioneDto.Persona paziente = pulisci(req.paziente(), prima.paziente(), true, adulto);
            AccettazioneDto.Persona firmatario = prima.firmatario() == null ? null
                    : pulisci(req.firmatario() == null ? prima.firmatario() : req.firmatario(), prima.firmatario(), false, true);
            if (adulto && LocalDate.parse(paziente.dataNascita()).plusYears(18).isAfter(LocalDate.now())) {
                throw new IllegalArgumentException("Risulti minorenne: il modulo lo firma un genitore o il tutore. "
                        + "Scrivi a " + testi.emailPrivacy() + " per ricevere il link giusto.");
            }
            List<String> cambiati = new ArrayList<>(AccettazioneService.cambiati(prima.paziente(), paziente));
            if (firmatario != null) {
                AccettazioneService.cambiati(prima.firmatario(), firmatario).forEach(c -> cambiati.add(c + " di chi firma"));
            }
            a.setDatiSnapshot(base.json(new AccettazioneDto.Snapshot(paziente, firmatario)));
            a.setDatiConfermatiIl(LocalDateTime.now());
            registro.registra(a.getId(), AccettazioneFirmaEvento.Tipo.DATI_CONFERMATI, origine,
                    cambiati.isEmpty() ? "nessuna modifica" : "modificati: " + String.join(", ", cambiati));
        });
        return vista(repo.findById(trovata.getId()).orElseThrow());
    }

    /**
     * Dati come li scrive chi firma. L'email resta quella della richiesta (lì arriva il codice). Per la persona seguita
     * servono data di nascita e residenza; il codice fiscale, se c'è, deve avere 16 caratteri.
     */
    private static AccettazioneDto.Persona pulisci(AccettazioneDto.Persona p, AccettazioneDto.Persona prima,
                                                  boolean seguita, boolean conEmail) {
        String nome = obbligatorio(p.nome(), "il nome");
        String cognome = obbligatorio(p.cognome(), "il cognome");
        String cf = AccettazioneService.maiuscolo(p.codiceFiscale());
        if (cf != null) {
            cf = cf.replaceAll("\\s", "");
            if (!CODICE_FISCALE.matcher(cf).matches()) {
                throw new IllegalArgumentException("Il codice fiscale ha 16 caratteri, lettere e numeri");
            }
        }
        String nascita = null;
        String indirizzo = testo(p.indirizzo(), 200);
        String cap = testo(p.cap(), 10);
        String citta = testo(p.citta(), 100);
        String provincia = testo(p.provincia(), 30);
        if (seguita) {
            if (!StringUtils.hasText(p.dataNascita())) {
                throw new IllegalArgumentException("Manca la data di nascita");
            }
            try {
                LocalDate d = LocalDate.parse(p.dataNascita().strip());
                if (d.isAfter(LocalDate.now()) || d.isBefore(LocalDate.of(1900, 1, 1))) {
                    throw new IllegalArgumentException("Controlla la data di nascita");
                }
                nascita = d.toString();
            } catch (DateTimeParseException e) {
                throw new IllegalArgumentException("Controlla la data di nascita");
            }
            obbligatorio(indirizzo, "l'indirizzo di residenza");
            obbligatorio(citta, "la città di residenza");
            if (cap != null && !CAP.matcher(cap).matches()) {
                throw new IllegalArgumentException("Controlla il CAP");
            }
        }
        return new AccettazioneDto.Persona(nome, cognome, cf, nascita, testo(p.luogoNascita(), 100), indirizzo, cap,
                citta, provincia == null ? null : provincia.toUpperCase(Locale.ROOT), conEmail ? prima.email() : null,
                testo(p.cellulare(), 30));
    }

    private static String obbligatorio(String s, String cosa) {
        if (!StringUtils.hasText(s)) {
            throw new IllegalArgumentException("Manca " + cosa);
        }
        return testo(s, 100);
    }

    private static String testo(String s, int max) {
        if (!StringUtils.hasText(s)) return null;
        String t = s.strip().replaceAll("\\s+", " ");
        return t.length() > max ? t.substring(0, max) : t;
    }

    /** La persona ha aperto informativa o elenco fornitori: resta nel registro come prova della lettura. */
    public void documentoAperto(String token, String tipo, Origine origine) {
        AccettazioneFirma a = trova(token);
        if (!a.isFirmabile()) return;
        String quale = "FORNITORI".equalsIgnoreCase(tipo) ? "elenco fornitori" : "informativa privacy";
        registro.registra(a.getId(), AccettazioneFirmaEvento.Tipo.DOCUMENTO_APERTO, origine, quale);
    }

    // ------------------------------------------------------------------ codice monouso

    public AccettazioneDto.CodiceInviato inviaCodice(String token, Origine origine) {
        AccettazioneFirma trovata = firmabile(trova(token));
        if (trovata.getDatiConfermatiIl() == null) {
            throw new ConflittoException("Prima conferma i tuoi dati");
        }
        String codice = String.format("%06d", RANDOM.nextInt(1_000_000));
        String email = tx.execute(s -> {
            AccettazioneFirma a = firmabile(repo.findByIdPerAggiornamento(trovata.getId()).orElseThrow());
            LocalDateTime adesso = LocalDateTime.now();
            if (a.getOtpUltimoInvioIl() != null && a.getOtpUltimoInvioIl().plusSeconds(OTP_ATTESA_SECONDI).isAfter(adesso)) {
                long attesa = Duration.between(adesso, a.getOtpUltimoInvioIl().plusSeconds(OTP_ATTESA_SECONDI)).toSeconds() + 1;
                throw new ConflittoException("Ti ho appena mandato un codice: aspetta " + attesa + " secondi per chiederne un altro");
            }
            if (a.getOtpInvii() >= OTP_MAX_INVII) {
                throw new ConflittoException("Hai chiesto troppi codici. Scrivi a " + testi.emailPrivacy() + " per un nuovo link.");
            }
            a.setOtpHash(encoder.encode(codice));
            a.setOtpScadeIl(adesso.plusMinutes(OTP_MINUTI));
            a.setOtpTentativi(0);
            a.setOtpInvii(a.getOtpInvii() + 1);
            a.setOtpUltimoInvioIl(adesso);
            return a.getEmail();
        });
        String testo = "Il tuo codice per firmare il modulo di accettazione è:\n\n" + codice + "\n\nVale " + OTP_MINUTI
                + " minuti. Se non stai firmando tu, ignora questa email e avvisa " + testi.titolare() + " a "
                + testi.emailPrivacy() + ".";
        if (gmail.isAttivo()) {
            try {
                gmail.invia(email, "Codice " + codice + " per firmare il modulo", CorpoEmail.da(testo), null, null);
            } catch (RuntimeException e) {
                throw new IllegalStateException("L'email con il codice non è partita: riprova tra poco");
            }
        } else if (environment.acceptsProfiles(Profiles.of("local", "dev"))) {
            logger.warn("[ACCETTAZIONE] Invio email spento: codice per la richiesta {} = {}", trovata.getId(), codice);
        } else {
            throw new IntegrazioneDisattivataException("L'invio dei codici non è ancora attivo. Scrivi a "
                    + testi.emailPrivacy() + ".");
        }
        registro.registra(trovata.getId(), AccettazioneFirmaEvento.Tipo.CODICE_INVIATO, origine,
                "a " + email + (gmail.isAttivo() ? "" : " (invio spento, solo nel log locale)"));
        return new AccettazioneDto.CodiceInviato(AccettazionePdfService.mascheraEmail(email), OTP_MINUTI, OTP_ATTESA_SECONDI);
    }

    public AccettazioneDto.Vista verificaCodice(String token, String codice, Origine origine) {
        AccettazioneFirma trovata = firmabile(trova(token));
        String pulito = codice == null ? "" : codice.replaceAll("\\D", "");
        Boolean ok = tx.execute(s -> {
            AccettazioneFirma a = firmabile(repo.findByIdPerAggiornamento(trovata.getId()).orElseThrow());
            if (a.getOtpHash() == null || a.getOtpScadeIl() == null || a.getOtpScadeIl().isBefore(LocalDateTime.now())) {
                throw new ConflittoException("Il codice è scaduto: chiedine uno nuovo");
            }
            if (a.getOtpTentativi() >= OTP_MAX_TENTATIVI) {
                throw new ConflittoException("Troppi tentativi: chiedi un nuovo codice");
            }
            if (pulito.length() != 6 || !encoder.matches(pulito, a.getOtpHash())) {
                a.setOtpTentativi(a.getOtpTentativi() + 1);
                registro.registra(a.getId(), AccettazioneFirmaEvento.Tipo.CODICE_ERRATO, origine,
                        "tentativo " + a.getOtpTentativi());
                return false;
            }
            a.setOtpHash(null);
            a.setOtpVerificatoIl(LocalDateTime.now());
            registro.registra(a.getId(), AccettazioneFirmaEvento.Tipo.CODICE_VERIFICATO, origine, "email " + a.getEmail());
            return true;
        });
        if (!Boolean.TRUE.equals(ok)) {
            throw new IllegalArgumentException("Codice non corretto");
        }
        return vista(repo.findById(trovata.getId()).orElseThrow());
    }

    // ------------------------------------------------------------------ firma

    public AccettazioneDto.Firmata firma(String token, AccettazioneDto.FirmaRequest req, Origine origine) {
        AccettazioneFirma trovata = firmabile(trova(token));
        if (req == null) {
            throw new IllegalArgumentException("Mancano le scelte e la firma");
        }
        byte[] png = png(req.firmaPng());
        Long id = trovata.getId();

        tx.executeWithoutResult(s -> {
            AccettazioneFirma a = firmabile(repo.findByIdPerAggiornamento(id).orElseThrow());
            if (a.getDatiConfermatiIl() == null) throw new ConflittoException("Prima conferma i tuoi dati");
            if (a.getOtpVerificatoIl() == null) throw new ConflittoException("Prima conferma l'email con il codice");

            AccettazioneDto.Snapshot snap = base.snapshot(a);
            AccettazioneDocumento moduloDoc = testi.documento(a.getModuloDocumentoId());
            AccettazioneDto.Modulo modulo = testi.modulo(moduloDoc, a.getMinorenne());
            Set<String> spuntate = new HashSet<>(req.dichiarazioni() == null ? List.of() : req.dichiarazioni());
            for (AccettazioneDto.Sezione sez : modulo.sezioni()) {
                if (!spuntate.contains(sez.id())) {
                    throw new IllegalArgumentException("Manca la conferma di «" + sez.titolo() + "»");
                }
            }
            boolean rappresentante = Boolean.TRUE.equals(req.rappresentante());
            if (snap.firmatario() != null && !rappresentante) {
                throw new IllegalArgumentException("Manca la dichiarazione di chi firma per la persona seguita");
            }
            Map<String, Boolean> consensi = new LinkedHashMap<>();
            for (AccettazioneDto.ConsensoFacoltativo c : modulo.consensi()) {
                Boolean scelta = req.consensi() == null ? null : req.consensi().get(c.id());
                if (scelta == null) {
                    throw new IllegalArgumentException("Scegli Sì o No per «" + c.titolo() + "»");
                }
                consensi.put(c.id(), scelta);
            }
            AccettazioneDto.Scelte scelte = new AccettazioneDto.Scelte(
                    modulo.sezioni().stream().map(AccettazioneDto.Sezione::id).toList(), consensi, snap.firmatario() != null);

            LocalDateTime adesso = LocalDateTime.now().withNano(0);
            a.setScelte(base.json(scelte));
            a.setFirmaPng(png);
            a.setFirmaIp(origine.ip());
            a.setFirmaUserAgent(origine.userAgent() == null ? null
                    : origine.userAgent().substring(0, Math.min(500, origine.userAgent().length())));
            a.setFirmataIl(adesso);
            a.setConservareFinoAl(adesso.toLocalDate().plusYears(anniConservazione()));
            registro.registra(id, AccettazioneFirmaEvento.Tipo.FIRMATA, origine, "consensi: " + consensi
                    + "; dichiarazioni: " + String.join(", ", scelte.dichiarazioni()));

            AccettazioneDocumento informativa = testi.documento(a.getInformativaDocumentoId());
            AccettazioneDocumento fornitori = testi.documento(a.getFornitoriDocumentoId());
            byte[] pdf = pdfService.genera(new AccettazionePdfService.Dati(a, snap, scelte, modulo, informativa,
                    testi.html(informativa), fornitori, testi.html(fornitori), moduloDoc,
                    eventiRepo.findByAccettazioneIdOrderBySeqAsc(id), testi.titolare(), config.get("EMITTENTE_TITOLI"),
                    base.urlVerifica(a.getCodiceVerifica())));
            Calendar quando = GregorianCalendar.from(adesso.atZone(ZoneId.of("Europe/Rome")));
            quando.setTimeZone(TimeZone.getTimeZone("Europe/Rome"));
            AccettazioneSigilloService.Sigillato sigillato = sigillo.sigilla(pdf, a.getCodiceVerifica(), quando);

            a.setPdf(sigillato.pdf());
            a.setPdfSha256(AccettazioneRegistro.sha256Hex(sigillato.pdf()));
            a.setSigilloCertificato(sigillato.certificatoPem());
            if (sigillato.marca() != null) {
                a.setTsaUrl(sigillato.marca().url());
                a.setTsaOra(sigillato.marca().ora());
            }
            a.setStato(AccettazioneFirma.Stato.FIRMATA);
            repo.saveAndFlush(a);
            registro.registra(id, AccettazioneFirmaEvento.Tipo.PDF_SIGILLATO, Origine.SISTEMA, "SHA-256 " + a.getPdfSha256()
                    + (sigillato.marca() != null ? "; marca temporale " + sigillato.marca().url() + " " + sigillato.marca().ora() : ""));
            if (sigillato.marca() == null) {
                registro.registra(id, AccettazioneFirmaEvento.Tipo.MARCA_NON_DISPONIBILE, Origine.SISTEMA, sigillato.erroreMarca());
            }

            if (a.getPazienteId() != null) {
                for (Map.Entry<String, Boolean> c : consensi.entrySet()) {
                    PazienteConsenso pc = new PazienteConsenso();
                    pc.setPazienteId(a.getPazienteId());
                    pc.setTipo(PazienteConsenso.Tipo.valueOf(c.getKey()));
                    pc.setConcesso(c.getValue());
                    pc.setIl(adesso);
                    pc.setFonte(PazienteConsenso.Fonte.ACCETTAZIONE);
                    pc.setAccettazioneId(id);
                    consensiRepo.save(pc);
                }
                pazienti.findById(a.getPazienteId()).ifPresent(p -> aggiornaAnagrafica(p, snap.paziente()));
            }
        });

        inviaCopia(id);
        AccettazioneFirma firmata = repo.findById(id).orElseThrow();
        logger.info("[ACCETTAZIONE] Modulo {} firmato (paziente {})", firmata.getCodiceVerifica(), firmata.getPazienteId());
        return new AccettazioneDto.Firmata(firmata.getCodiceVerifica(), firmata.getFirmataIl(), firmata.getCopiaInviataIl() != null);
    }

    /** I dati confermati firmando finiscono nella scheda: servono anche per le fatture. L'email non cambia. */
    private static void aggiornaAnagrafica(Paziente p, AccettazioneDto.Persona d) {
        if (p.getAnonimizzatoIl() != null) return;
        p.setNome(d.nome());
        p.setCognome(d.cognome());
        if (d.codiceFiscale() != null) p.setCodiceFiscale(d.codiceFiscale());
        if (d.dataNascita() != null) p.setDataNascita(LocalDate.parse(d.dataNascita()));
        if (d.indirizzo() != null) p.setIndirizzo(d.indirizzo());
        if (d.cap() != null) p.setCap(d.cap());
        if (d.citta() != null) p.setCitta(d.citta());
        if (d.provincia() != null) p.setProvincia(d.provincia());
        if (d.cellulare() != null) p.setCellulare(d.cellulare());
    }

    private void inviaCopia(Long id) {
        AccettazioneFirma a = repo.findById(id).orElseThrow();
        if (!gmail.isAttivo()) {
            registro.registra(id, AccettazioneFirmaEvento.Tipo.COPIA_NON_INVIATA, Origine.SISTEMA, "invio email non attivo");
            return;
        }
        AccettazioneDto.Snapshot snap = base.snapshot(a);
        String nome = (snap.firmatario() != null ? snap.firmatario() : snap.paziente()).nome();
        String testo = "Ciao " + nome + ",\n\nin allegato trovi la copia del modulo di accettazione che hai firmato, con "
                + "l'informativa privacy e l'elenco dei fornitori. Conservala: il codice " + a.getCodiceVerifica()
                + " ti permette di verificarne l'autenticità in ogni momento su " + base.urlVerifica(a.getCodiceVerifica())
                + ".\n\nUn caro saluto,\n" + testi.titolare();
        try {
            gmail.invia(a.getEmail(), "Copia del modulo di accettazione firmato", CorpoEmail.da(testo),
                    AccettazioneService.nomeFile(a), a.getPdf());
            tx.executeWithoutResult(s -> {
                AccettazioneFirma b = repo.findByIdPerAggiornamento(id).orElseThrow();
                b.setCopiaInviataIl(LocalDateTime.now());
                registro.registra(id, AccettazioneFirmaEvento.Tipo.COPIA_INVIATA, Origine.SISTEMA, "a " + b.getEmail());
            });
        } catch (RuntimeException e) {
            logger.warn("[ACCETTAZIONE] Copia firmata non inviata per la richiesta {}: {}", id, e.getMessage());
            registro.registra(id, AccettazioneFirmaEvento.Tipo.COPIA_NON_INVIATA, Origine.SISTEMA, e.getMessage());
        }
    }

    public AccettazioneService.File copia(String token, Origine origine) {
        AccettazioneFirma a = trova(token);
        if (a.getStato() != AccettazioneFirma.Stato.FIRMATA) {
            throw new ConflittoException("Il modulo non è ancora firmato");
        }
        registro.registra(a.getId(), AccettazioneFirmaEvento.Tipo.COPIA_SCARICATA, origine, null);
        return new AccettazioneService.File(AccettazioneService.nomeFile(a), a.getPdf());
    }

    // ------------------------------------------------------------------ verifica pubblica

    /** Chi riceve il PDF controlla che sia autentico: solo iniziali, data e impronta, nessun dato sulla salute. */
    public AccettazioneDto.Verifica verifica(String codice) {
        String c = codice == null ? "" : codice.strip().toUpperCase(Locale.ROOT);
        return repo.findByCodiceVerifica(c)
                .filter(a -> a.getStato() == AccettazioneFirma.Stato.FIRMATA)
                .map(a -> {
                    AccettazioneDto.Snapshot snap = base.snapshot(a);
                    AccettazioneDto.Persona chi = snap.firmatario() != null ? snap.firmatario() : snap.paziente();
                    return new AccettazioneDto.Verifica(true, "Modulo di accettazione", a.getFirmataIl(),
                            iniziale(chi.nome()) + iniziale(chi.cognome()), a.getPdfSha256(), a.getTsaOra() != null,
                            testi.titolare());
                })
                .orElse(new AccettazioneDto.Verifica(false, null, null, null, null, false, testi.titolare()));
    }

    private static String iniziale(String s) {
        return s == null || s.isBlank() ? "" : s.strip().substring(0, 1).toUpperCase(Locale.ROOT) + ".";
    }

    // ------------------------------------------------------------------ utilità

    private AccettazioneFirma trova(String token) {
        if (token == null || token.length() < 20 || token.length() > 80) {
            throw new RisorsaNonTrovataException("Link non valido");
        }
        return repo.findByTokenHash(AccettazioneRegistro.sha256Hex(token.getBytes(StandardCharsets.UTF_8)))
                .orElseThrow(() -> new RisorsaNonTrovataException("Link non valido o sostituito da uno più recente"));
    }

    private AccettazioneFirma firmabile(AccettazioneFirma a) {
        if (a.getStato() == AccettazioneFirma.Stato.FIRMATA) throw new ConflittoException("Il modulo è già firmato");
        if (a.getStato() == AccettazioneFirma.Stato.ANNULLATA) throw new ConflittoException("Questa richiesta è stata annullata");
        if (!a.isFirmabile()) throw new ConflittoException("Il link è scaduto: chiedi a " + testi.titolare() + " di inviartene uno nuovo");
        return a;
    }

    private static byte[] png(String dato) {
        if (!StringUtils.hasText(dato)) {
            throw new IllegalArgumentException("Manca la firma");
        }
        String b64 = dato.contains(",") ? dato.substring(dato.indexOf(',') + 1) : dato;
        byte[] png;
        try {
            png = Base64.getDecoder().decode(b64.strip());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Firma non leggibile: riprova");
        }
        if (png.length < 200 || png.length > FIRMA_MAX_BYTE) {
            throw new IllegalArgumentException(png.length < 200 ? "Traccia la firma nel riquadro" : "Firma troppo grande: riprova");
        }
        for (int i = 0; i < PNG.length; i++) {
            if (png[i] != PNG[i]) throw new IllegalArgumentException("Firma non leggibile: riprova");
        }
        return png;
    }

    private int anniConservazione() {
        try {
            return Math.max(10, Integer.parseInt(config.get("ACCETTAZIONE_CONSERVAZIONE_ANNI").strip()));
        } catch (NumberFormatException e) {
            return 15;
        }
    }
}
