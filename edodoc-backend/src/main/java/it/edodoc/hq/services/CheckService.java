package it.edodoc.hq.services;

import it.edodoc.hq.dto.CheckDto;
import it.edodoc.hq.exception.ConflittoException;
import it.edodoc.hq.exception.RisorsaNonTrovataException;
import it.edodoc.hq.models.CheckSettimanale;
import it.edodoc.hq.models.ContattoSettimana;
import it.edodoc.hq.models.FeedbackAudio;
import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.repositories.CheckSettimanaleRepository;
import it.edodoc.hq.repositories.ContattoSettimanaRepository;
import it.edodoc.hq.repositories.FeedbackAudioRepository;
import it.edodoc.hq.repositories.PazienteRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class CheckService {

    private static final List<Paziente.Stato> STATI_CON_CHECK = List.of(Paziente.Stato.ATTIVO, Paziente.Stato.MANTENIMENTO);
    private static final int MASSIMO_TESTO_FEEDBACK = 4000;
    /** Il limite di Spring è più alto per gli allegati email: quello dei vocali si controlla qui. */
    static final long MASSIMO_BYTE_VOCALE = 5L * 1024 * 1024;

    /** messaggio: dice al dottore se l'email non è partita. Il feedback in quel caso è comunque salvato. */
    public record FeedbackInviato(CheckDto.Dettaglio check, String messaggio) {
    }

    private final CheckSettimanaleRepository checkRepository;
    private final ContattoSettimanaRepository contattoRepository;
    private final PazienteRepository pazienteRepository;
    private final ConfigService configService;
    private final ApplicationEventPublisher eventi;
    private final FeedbackAudioRepository audioRepository;
    private final EmailService emailService;

    public CheckService(CheckSettimanaleRepository checkRepository, ContattoSettimanaRepository contattoRepository,
                        PazienteRepository pazienteRepository, ConfigService configService,
                        ApplicationEventPublisher eventi, FeedbackAudioRepository audioRepository,
                        EmailService emailService) {
        this.checkRepository = checkRepository;
        this.contattoRepository = contattoRepository;
        this.pazienteRepository = pazienteRepository;
        this.configService = configService;
        this.eventi = eventi;
        this.audioRepository = audioRepository;
        this.emailService = emailService;
    }

    /** Il check si legge il lunedì: chi compila sabato o domenica sta già rispondendo a quello in arrivo. */
    public static LocalDate settimanaDi(LocalDate giorno) {
        return giorno.getDayOfWeek().getValue() >= DayOfWeek.SATURDAY.getValue()
                ? giorno.with(TemporalAdjusters.next(DayOfWeek.MONDAY))
                : giorno.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
    }

    /** I tre segnali del filtro del lunedì: peso non sceso, nessun miglioramento percepito, energia bassa. */
    public static void calcolaSegnali(CheckSettimanale check, BigDecimal pesoPrecedente, int sogliaEnergia) {
        check.setPesoFermo(check.getPesoKg() != null && pesoPrecedente != null
                && check.getPesoKg().compareTo(pesoPrecedente) >= 0);
        check.setPercezioneNegativa(Boolean.FALSE.equals(check.getPercezioneMigliorata()));
        check.setEnergiaBassa(check.getEnergia() != null && check.getEnergia() <= sogliaEnergia);
    }

    /** Il feedback risponde alle risposte che il dottore ha letto: dall'app non si possono più cambiare. */
    static void verificaModificabile(CheckSettimanale check, CheckSettimanale.Fonte fonte) {
        if (fonte == CheckSettimanale.Fonte.APP && check.haFeedback()) {
            throw new ConflittoException("Il Dr. Bo ha già risposto a questo check: scrivigli in chat");
        }
    }

    @Transactional
    public CheckDto.Dettaglio salva(Long pazienteId, CheckDto.Risposte risposte, CheckSettimanale.Fonte fonte, LocalDate settimana) {
        Paziente paziente = pazienteRepository.findByIdAndAttivoTrue(pazienteId)
                .orElseThrow(() -> new RisorsaNonTrovataException("Paziente non trovato"));
        CheckSettimanale check = checkRepository.findByPazienteIdAndSettimana(pazienteId, settimana)
                .orElseGet(CheckSettimanale::new);
        verificaModificabile(check, fonte);
        check.setPaziente(paziente);
        check.setSettimana(settimana);
        check.setFonte(fonte);
        check.setCompilatoIl(LocalDateTime.now());
        check.setPastiOttimali(risposte.pastiOttimali());
        check.setPastiLiberi(risposte.pastiLiberi());
        check.setEnergia(risposte.energia());
        check.setAllenamento(risposte.allenamento());
        check.setPesoKg(risposte.pesoKg());
        check.setAndamentoPeso(risposte.andamentoPeso());
        check.setPercezione(risposte.percezione());
        check.setPercezioneMigliorata(risposte.percezioneMigliorata());
        check.setImpegno(risposte.impegno());
        check.setLettoIl(null);
        BigDecimal pesoPrecedente = checkRepository.findPrecedenteConPeso(pazienteId, settimana)
                .map(CheckSettimanale::getPesoKg).orElse(null);
        calcolaSegnali(check, pesoPrecedente, configService.getDecimale("CHECK_SOGLIA_ENERGIA_BASSA").intValue());
        return CheckDto.Dettaglio.da(checkRepository.save(check));
    }

    @Transactional(readOnly = true)
    public CheckDto.Settimana settimana(LocalDate settimana) {
        Map<Long, CheckSettimanale> check = checkRepository.findDellaSettimana(settimana).stream()
                .collect(Collectors.toMap(c -> c.getPaziente().getId(), Function.identity()));
        Map<Long, ContattoSettimana> contatti = contattoRepository.findBySettimana(settimana).stream()
                .collect(Collectors.toMap(c -> c.getPaziente().getId(), Function.identity()));

        List<CheckDto.RigaSettimana> righe = new ArrayList<>();
        int compilati = 0, segnali = 0, lunedi = 0, mercoledi = 0;
        for (Paziente p : pazienteRepository.findByAttivoTrueAndStatoInOrderByCognomeAscNomeAsc(STATI_CON_CHECK)) {
            CheckSettimanale c = check.get(p.getId());
            ContattoSettimana contatto = contatti.get(p.getId());
            CheckDto.Azione azione = c == null ? CheckDto.Azione.SOLLECITO
                    : c.haSegnali() ? CheckDto.Azione.MESSAGGIO_DEDICATO : CheckDto.Azione.MESSAGGIO_STANDARD;
            if (c != null) compilati++;
            if (c != null && c.haSegnali()) segnali++;
            if (contatto == null || contatto.getLunediFattoIl() == null) lunedi++;
            if (contatto == null || contatto.getMercolediFattoIl() == null) mercoledi++;
            righe.add(new CheckDto.RigaSettimana(p.getId(), p.getNomeCompleto(), p.getCellulare(), p.getStato(),
                    p.getSituazione(), p.getNota(), azione, c != null ? CheckDto.Dettaglio.da(c) : null,
                    contatto != null ? contatto.getLunediFattoIl() : null,
                    contatto != null ? contatto.getMercolediFattoIl() : null));
        }
        return new CheckDto.Settimana(settimana, righe.size(), compilati, segnali, lunedi, mercoledi, righe);
    }

    @Transactional(readOnly = true)
    public List<CheckDto.Dettaglio> storico(Long pazienteId) {
        return checkRepository.findByPazienteIdOrderBySettimanaDesc(pazienteId).stream()
                .map(CheckDto.Dettaglio::da).toList();
    }

    @Transactional
    public void registraContatto(CheckDto.Contatto richiesta) {
        Paziente paziente = pazienteRepository.findByIdAndAttivoTrue(richiesta.pazienteId())
                .orElseThrow(() -> new RisorsaNonTrovataException("Paziente non trovato"));
        ContattoSettimana contatto = contattoRepository
                .findByPazienteIdAndSettimana(paziente.getId(), richiesta.settimana())
                .orElseGet(() -> {
                    ContattoSettimana nuovo = new ContattoSettimana();
                    nuovo.setPaziente(paziente);
                    nuovo.setSettimana(richiesta.settimana());
                    return nuovo;
                });
        LocalDateTime quando = richiesta.fatto() ? LocalDateTime.now() : null;
        if (richiesta.giorno() == CheckDto.Giorno.LUNEDI) {
            contatto.setLunediFattoIl(quando);
        } else {
            contatto.setMercolediFattoIl(quando);
        }
        contattoRepository.save(contatto);
    }

    @Transactional
    public void segnaLetto(Long id) {
        CheckSettimanale check = checkRepository.findById(id)
                .orElseThrow(() -> new RisorsaNonTrovataException("Check non trovato"));
        if (check.getLettoIl() == null) {
            check.setLettoIl(LocalDateTime.now());
        }
    }

    @Transactional
    public FeedbackInviato rispondi(Long id, CheckDto.Feedback feedback) {
        CheckSettimanale check = checkRepository.findById(id)
                .orElseThrow(() -> new RisorsaNonTrovataException("Check non trovato"));
        return registraFeedback(check, feedback.testo().trim(), null, null, Boolean.TRUE.equals(feedback.inviaEmail()));
    }

    /** testo: facoltativo, accompagna il vocale. */
    @Transactional
    public FeedbackInviato rispondiConVocale(Long id, MultipartFile file, int secondi, String testo, boolean inviaEmail) {
        CheckSettimanale check = checkRepository.findById(id)
                .orElseThrow(() -> new RisorsaNonTrovataException("Check non trovato"));
        if (secondi <= 0) {
            throw new IllegalArgumentException("Il vocale è vuoto");
        }
        String pulito = testo == null || testo.isBlank() ? null : testo.trim();
        if (pulito != null && pulito.length() > MASSIMO_TESTO_FEEDBACK) {
            throw new IllegalArgumentException("Feedback troppo lungo");
        }
        FeedbackAudio audio = new FeedbackAudio();
        audio.setId(UUID.randomUUID());
        audio.setDati(leggiVocale(file));
        audioRepository.save(audio);
        return registraFeedback(check, pulito, audio.getId(), secondi, inviaEmail);
    }

    /** Un m4a si riconosce dalla firma del contenitore: il tipo dichiarato cambia da telefono a telefono. */
    static boolean sembraM4a(byte[] dati) {
        return dati.length > 8 && "ftyp".equals(new String(Arrays.copyOfRange(dati, 4, 8), StandardCharsets.ISO_8859_1));
    }

    private static byte[] leggiVocale(MultipartFile file) {
        if (file.getSize() > MASSIMO_BYTE_VOCALE) {
            throw new MaxUploadSizeExceededException(MASSIMO_BYTE_VOCALE);
        }
        try {
            byte[] dati = file.getBytes();
            if (!sembraM4a(dati)) {
                throw new IllegalArgumentException("Il vocale deve essere un file m4a");
            }
            return dati;
        } catch (IOException e) {
            throw new IllegalArgumentException("Vocale non leggibile", e);
        }
    }

    /** Una seconda risposta sostituisce la prima, vocale compreso: il paziente la vede subito e la legge come nuova. */
    private FeedbackInviato registraFeedback(CheckSettimanale check, String testo, UUID audioId, Integer secondi, boolean inviaEmail) {
        LocalDateTime ora = LocalDateTime.now();
        UUID audioPrecedente = check.getFeedbackAudioId();
        check.setFeedback(testo);
        check.setFeedbackAudioId(audioId);
        check.setFeedbackAudioSecondi(secondi);
        check.setFeedbackEmailIl(null);
        check.setFeedbackIl(ora);
        check.setFeedbackLettoIl(null);
        if (check.getLettoIl() == null) {
            check.setLettoIl(ora);
        }
        if (audioPrecedente != null) {
            audioRepository.deleteById(audioPrecedente);
        }
        // Prima si scrive, poi si spedisce: mai un'email per un feedback che il database ha rifiutato
        checkRepository.saveAndFlush(check);
        eventi.publishEvent(new Notifica(check.getPaziente().getId(), "EdoDoc", "Il Dr. Bo ha risposto al tuo check",
                Map.of("tipo", "FEEDBACK", "checkId", check.getId())));
        String messaggio = inviaEmail ? inviaEmail(check, ora) : "Feedback inviato";
        return new FeedbackInviato(CheckDto.Dettaglio.da(check), messaggio);
    }

    /** Il dottore non deve mai perdere il feedback: l'email è un di più e un errore qui non annulla nulla. */
    private String inviaEmail(CheckSettimanale check, LocalDateTime ora) {
        try {
            emailService.inviaFeedback(check.getPaziente(), check.getFeedback(), check.getFeedbackAudioId() != null);
            check.setFeedbackEmailIl(ora);
            return "Feedback inviato anche per email";
        } catch (RuntimeException e) {
            return "Feedback inviato, ma non l'email: " + e.getMessage();
        }
    }

    @Transactional(readOnly = true)
    public byte[] vocaleDelFeedback(Long id) {
        CheckSettimanale check = checkRepository.findById(id)
                .orElseThrow(() -> new RisorsaNonTrovataException("Check non trovato"));
        return vocale(check);
    }

    /** Un check di un altro paziente non esiste: stessa risposta di un id sbagliato. */
    @Transactional(readOnly = true)
    public byte[] vocaleDelFeedback(Long pazienteId, Long id) {
        CheckSettimanale check = checkRepository.findByIdAndPazienteId(id, pazienteId)
                .orElseThrow(() -> new RisorsaNonTrovataException("Check non trovato"));
        return vocale(check);
    }

    private byte[] vocale(CheckSettimanale check) {
        if (check.getFeedbackAudioId() == null) {
            throw new RisorsaNonTrovataException("Vocale non trovato");
        }
        return audioRepository.findById(check.getFeedbackAudioId()).map(FeedbackAudio::getDati)
                .orElseThrow(() -> new RisorsaNonTrovataException("Vocale non trovato"));
    }

    @Transactional
    public void segnaFeedbackLetto(Long pazienteId, Long id) {
        CheckSettimanale check = checkRepository.findByIdAndPazienteId(id, pazienteId)
                .orElseThrow(() -> new RisorsaNonTrovataException("Check non trovato"));
        if (check.haFeedback() && check.getFeedbackLettoIl() == null) {
            check.setFeedbackLettoIl(LocalDateTime.now());
        }
    }

    @Transactional(readOnly = true)
    public long feedbackDaLeggere(Long pazienteId) {
        return checkRepository.contaFeedbackDaLeggere(pazienteId);
    }

    @Transactional(readOnly = true)
    public CheckDto.StatoApp statoApp(Long pazienteId) {
        LocalDate settimana = settimanaDi(LocalDate.now());
        return checkRepository.findByPazienteIdAndSettimana(pazienteId, settimana)
                .map(c -> new CheckDto.StatoApp(settimana, true, CheckDto.Dettaglio.da(c)))
                .orElseGet(() -> new CheckDto.StatoApp(settimana, false, null));
    }
}
