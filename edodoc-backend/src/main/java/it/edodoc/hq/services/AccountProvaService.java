package it.edodoc.hq.services;

import it.edodoc.hq.dto.ChatDto;
import it.edodoc.hq.dto.CheckDto;
import it.edodoc.hq.dto.CorsiDto;
import it.edodoc.hq.dto.FattureDto;
import it.edodoc.hq.dto.PagamentiDto;
import it.edodoc.hq.dto.PazientiDto;
import it.edodoc.hq.dto.PercorsiDto;
import it.edodoc.hq.dto.VisiteDto;
import it.edodoc.hq.models.CheckSettimanale;
import it.edodoc.hq.models.Lezione;
import it.edodoc.hq.models.Messaggio;
import it.edodoc.hq.models.Pagamento;
import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.models.Percorso;
import it.edodoc.hq.models.Utente;
import it.edodoc.hq.models.Visita;
import it.edodoc.hq.repositories.PazienteRepository;
import it.edodoc.hq.repositories.UtenteRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * Account per chi revisiona l'app (Apple, Google): un dottore e un paziente che funzionano sempre.
 * Il dottore vede tutti i pazienti, quindi esistono solo su un server di soli dati inventati: mai accanto a dati reali.
 * Ogni ora tornano com'erano, così nessuna prova di un revisore può chiudere fuori il successivo.
 */
@Service
public class AccountProvaService {

    private static final Logger logger = LoggerFactory.getLogger(AccountProvaService.class);

    /** La partita IVA finta scritta da DemoDataService: un server con dati reali non può averla. */
    private static final String PARTITA_IVA_DEMO = "00000000000";

    private static final int SETTIMANE_DI_STORICO = 4;

    private final UtenteRepository utenteRepository;
    private final PazienteRepository pazienteRepository;
    private final PazienteService pazienteService;
    private final PercorsoService percorsoService;
    private final VisitaService visitaService;
    private final CheckService checkService;
    private final PagamentoService pagamentoService;
    private final FatturaService fatturaService;
    private final ChatService chatService;
    private final CorsoService corsoService;
    private final ConfigService configService;
    private final PasswordEncoder passwordEncoder;
    private final boolean demoAttivo;
    private final String dottoreEmail;
    private final String dottorePassword;
    private final String pazienteEmail;
    private final String pazientePassword;

    public AccountProvaService(UtenteRepository utenteRepository, PazienteRepository pazienteRepository,
                               PazienteService pazienteService, PercorsoService percorsoService,
                               VisitaService visitaService, CheckService checkService,
                               PagamentoService pagamentoService, FatturaService fatturaService,
                               ChatService chatService, CorsoService corsoService, ConfigService configService,
                               PasswordEncoder passwordEncoder,
                               @Value("${app.init.demo-enabled:false}") boolean demoAttivo,
                               @Value("${app.prova.dottore-email:}") String dottoreEmail,
                               @Value("${app.prova.dottore-password:}") String dottorePassword,
                               @Value("${app.prova.paziente-email:}") String pazienteEmail,
                               @Value("${app.prova.paziente-password:}") String pazientePassword) {
        this.utenteRepository = utenteRepository;
        this.pazienteRepository = pazienteRepository;
        this.pazienteService = pazienteService;
        this.percorsoService = percorsoService;
        this.visitaService = visitaService;
        this.checkService = checkService;
        this.pagamentoService = pagamentoService;
        this.fatturaService = fatturaService;
        this.chatService = chatService;
        this.corsoService = corsoService;
        this.configService = configService;
        this.passwordEncoder = passwordEncoder;
        this.demoAttivo = demoAttivo;
        this.dottoreEmail = normalizza(dottoreEmail);
        this.dottorePassword = dottorePassword;
        this.pazienteEmail = normalizza(pazienteEmail);
        this.pazientePassword = pazientePassword;
    }

    /** Il cambio password di un revisore chiuderebbe fuori il successivo. */
    public boolean isAccountProva(String username) {
        String nome = normalizza(username);
        return !nome.isEmpty() && (nome.equals(dottoreEmail) || nome.equals(pazienteEmail));
    }

    private boolean configurati() {
        return !dottoreEmail.isEmpty() && !dottorePassword.isBlank()
                && !pazienteEmail.isEmpty() && !pazientePassword.isBlank();
    }

    boolean serverDemo() {
        return demoAttivo && PARTITA_IVA_DEMO.equals(configService.get("EMITTENTE_PARTITA_IVA"));
    }

    /** All'avvio e ogni ora. Un errore qui non deve fermare il server. */
    @Scheduled(cron = "0 7 * * * *", zone = "Europe/Rome")
    public void allinea() {
        if (!configurati()) {
            return;
        }
        if (!serverDemo()) {
            logger.warn("Account di prova non creati: servono APP_INIT_DEMO_ENABLED=true e un database di soli dati demo");
            return;
        }
        try {
            allineaDottore();
            Long pazienteId = allineaPaziente();
            assicuraProssimaVisita(pazienteId);
            assicuraCorso();
        } catch (RuntimeException e) {
            logger.error("Account di prova non allineati: {}", e.getMessage(), e);
        }
    }

    private void allineaDottore() {
        Utente dottore = utenteRepository.findByUsernameIgnoreCase(dottoreEmail).orElseGet(() -> {
            Utente nuovo = new Utente();
            nuovo.setUsername(dottoreEmail);
            nuovo.setNome("Dottore");
            nuovo.setCognome("Prova");
            return nuovo;
        });
        dottore.setRuolo(Utente.Ruolo.ADMIN);
        ripristinaAccesso(dottore, dottorePassword);
    }

    private Long allineaPaziente() {
        Optional<Utente> esistente = utenteRepository.findByUsernameIgnoreCase(pazienteEmail);
        if (esistente.isEmpty()) {
            Long pazienteId = creaPazienteConStoria();
            Utente nuovo = new Utente();
            nuovo.setUsername(pazienteEmail);
            nuovo.setNome("Sofia");
            nuovo.setCognome("Prova");
            nuovo.setRuolo(Utente.Ruolo.PAZIENTE);
            nuovo.setPaziente(pazienteRepository.getReferenceById(pazienteId));
            ripristinaAccesso(nuovo, pazientePassword);
            return pazienteId;
        }
        Utente utente = esistente.get();
        Long pazienteId = utente.getPaziente().getId();
        pazienteRepository.findById(pazienteId).filter(p -> !Boolean.TRUE.equals(p.getAttivo())).ifPresent(p -> {
            p.setAttivo(true);
            pazienteRepository.save(p);
        });
        ripristinaAccesso(utente, pazientePassword);
        return pazienteId;
    }

    private void ripristinaAccesso(Utente utente, String password) {
        boolean invariato = utente.getId() != null && Boolean.TRUE.equals(utente.getAttivo())
                && utente.getInvitoTokenHash() == null && utente.getPasswordHash() != null
                && passwordEncoder.matches(password, utente.getPasswordHash());
        if (invariato) {
            return;
        }
        utente.setPasswordHash(passwordEncoder.encode(password));
        utente.setAttivo(true);
        utente.setInvitoTokenHash(null);
        utente.setInvitoScadenza(null);
        utenteRepository.save(utente);
    }

    private Long creaPazienteConStoria() {
        LocalDate oggi = LocalDate.now();
        Long id = pazienteService.crea(new PazientiDto.Salva("Sofia", "Prova", pazienteEmail, "393330009999",
                "PRVSFO90A41F205X", LocalDate.of(1990, 1, 1), "Via delle Prove 99", "20100", "Milano", "MI",
                Paziente.Stato.LEAD, Paziente.Fonte.ALTRO, "Paziente inventata per la revisione dell'app", null,
                BigDecimal.valueOf(72), BigDecimal.valueOf(65))).id();

        percorsoService.crea(new PercorsiDto.Crea(id, Percorso.Tipo.METODO_BUSSOLA, Percorso.PianoPagamento.UNICO,
                oggi.minusMonths(1), null));
        VisiteDto.Riga primaVisita = visitaService.crea(new VisiteDto.Salva(id, Visita.Tipo.PRIMA_VISITA,
                Visita.Modalita.ONLINE, oggi.minusMonths(1).atTime(10, 0), null, false, false, null));
        visitaService.cambiaStato(primaVisita.id(), Visita.Stato.EFFETTUATA);

        PagamentiDto.Riga pagamento = pagamentoService.delPaziente(id).righe().get(0);
        pagamentoService.registra(pagamento.id(), new PagamentiDto.Registra(oggi, Pagamento.Metodo.BONIFICO, true, null));
        fatturaService.emetti(new FattureDto.Emetti(pagamento.id(), null, null, oggi, null, false));

        LocalDate settimana = CheckService.settimanaDi(oggi);
        CheckDto.Dettaglio ultimo = null;
        for (int s = SETTIMANE_DI_STORICO; s >= 1; s--) {
            ultimo = checkService.salva(id, new CheckDto.Risposte(17, "Una cena fuori", 4, "Tre camminate",
                    BigDecimal.valueOf(72 - (SETTIMANE_DI_STORICO - s) * 0.5), "Pesata il lunedì",
                    "Mi sento più leggera", true, 4), CheckSettimanale.Fonte.APP, settimana.minusWeeks(s));
        }
        checkService.rispondi(ultimo.id(), new CheckDto.Feedback("Ottima settimana, continua così.", false));
        chatService.scrivi(id, Messaggio.Mittente.DOTTORE,
                new ChatDto.Invio("Ciao Sofia, qui puoi scrivermi quando vuoi.", null));
        return id;
    }

    /** I dati demo invecchiano: senza una visita futura il percorso sembrerebbe finito. */
    private void assicuraProssimaVisita(Long pazienteId) {
        LocalDateTime adesso = LocalDateTime.now();
        List<VisiteDto.Riga> programmate = visitaService.delPaziente(pazienteId).stream()
                .filter(v -> v.stato() == Visita.Stato.PROGRAMMATA).toList();
        if (programmate.stream().anyMatch(v -> v.inizio().isAfter(adesso))) {
            return;
        }
        programmate.forEach(v -> visitaService.cambiaStato(v.id(), Visita.Stato.EFFETTUATA));

        Optional<PercorsiDto.Sintesi> attivo = percorsoService.delPaziente(pazienteId).stream()
                .filter(p -> p.stato() == Percorso.Stato.ATTIVO).findFirst();
        LocalDate oggi = adesso.toLocalDate();
        if (attivo.isEmpty()) {
            percorsoService.crea(new PercorsiDto.Crea(pazienteId, Percorso.Tipo.METODO_BUSSOLA,
                    Percorso.PianoPagamento.UNICO, oggi, null));
        } else if (attivo.get().visiteFissate() >= attivo.get().visiteTotali()) {
            percorsoService.crea(new PercorsiDto.Crea(pazienteId, Percorso.Tipo.RINNOVO,
                    Percorso.PianoPagamento.UNICO, oggi, null));
        }
        visitaService.crea(new VisiteDto.Salva(pazienteId, Visita.Tipo.CONTROLLO, Visita.Modalita.ONLINE,
                oggi.plusDays(7).atTime(10, 30), null, false, false, null));
    }

    /** Un revisore può cancellare il corso: ne torna sempre almeno uno. */
    private void assicuraCorso() {
        if (!corsoService.corsiApp().isEmpty()) {
            return;
        }
        Long corso = corsoService.creaCorso(new CorsiDto.SalvaCorso("Il metodo in pratica", "Un corso dimostrativo."));
        Long modulo = corsoService.creaModulo(corso, new CorsiDto.SalvaModulo("Primi passi", null)).id();
        Long lezione = corsoService.creaLezione(modulo, new CorsiDto.SalvaLezione(Lezione.Tipo.TESTO, "Come usare l'app",
                "Una lezione di esempio.", "## Benvenuta\n\nQui trovi le lezioni del corso, da seguire con calma.")).id();
        corsoService.pubblicaLezione(lezione, true);
        corsoService.pubblicaCorso(corso, true);
    }

    private static String normalizza(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }
}
