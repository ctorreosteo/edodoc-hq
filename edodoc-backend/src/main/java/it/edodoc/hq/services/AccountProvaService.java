package it.edodoc.hq.services;

import it.edodoc.hq.dto.ChatDto;
import it.edodoc.hq.dto.CheckDto;
import it.edodoc.hq.dto.PagamentiDto;
import it.edodoc.hq.dto.PazientiDto;
import it.edodoc.hq.dto.PercorsiDto;
import it.edodoc.hq.models.CheckSettimanale;
import it.edodoc.hq.models.Messaggio;
import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.models.Percorso;
import it.edodoc.hq.models.Utente;
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
import java.util.Locale;
import java.util.Optional;

/**
 * Account per chi revisiona l'app (Apple, Google): un dottore e un paziente che funzionano sempre, nelle tabelle normali.
 * Il paziente è inventato e vede solo se stesso. Il dottore ha il ruolo REVISORE: entra, ma non può leggere alcun dato.
 * Ogni ora tornano com'erano, così nessuna prova di un revisore può chiudere fuori il successivo.
 * Qui non nascono visite, fatture, pagamenti o corsi: finirebbero nel calendario, nella numerazione e nel catalogo veri.
 */
@Service
public class AccountProvaService {

    private static final Logger logger = LoggerFactory.getLogger(AccountProvaService.class);

    private static final int SETTIMANE_DI_STORICO = 4;

    private final UtenteRepository utenteRepository;
    private final PazienteRepository pazienteRepository;
    private final PazienteService pazienteService;
    private final PercorsoService percorsoService;
    private final CheckService checkService;
    private final PagamentoService pagamentoService;
    private final ChatService chatService;
    private final PasswordEncoder passwordEncoder;
    private final String dottoreEmail;
    private final String dottorePassword;
    private final String pazienteEmail;
    private final String pazientePassword;

    public AccountProvaService(UtenteRepository utenteRepository, PazienteRepository pazienteRepository,
                               PazienteService pazienteService, PercorsoService percorsoService,
                               CheckService checkService, PagamentoService pagamentoService, ChatService chatService,
                               PasswordEncoder passwordEncoder,
                               @Value("${app.prova.dottore-email:}") String dottoreEmail,
                               @Value("${app.prova.dottore-password:}") String dottorePassword,
                               @Value("${app.prova.paziente-email:}") String pazienteEmail,
                               @Value("${app.prova.paziente-password:}") String pazientePassword) {
        this.utenteRepository = utenteRepository;
        this.pazienteRepository = pazienteRepository;
        this.pazienteService = pazienteService;
        this.percorsoService = percorsoService;
        this.checkService = checkService;
        this.pagamentoService = pagamentoService;
        this.chatService = chatService;
        this.passwordEncoder = passwordEncoder;
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

    /** All'avvio e ogni ora. Un errore qui non deve fermare il server. */
    @Scheduled(cron = "0 7 * * * *", zone = "Europe/Rome")
    public void allinea() {
        if (!configurati()) {
            return;
        }
        try {
            allineaDottore();
            allineaPaziente();
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
        dottore.setRuolo(Utente.Ruolo.REVISORE);
        ripristinaAccesso(dottore, dottorePassword);
    }

    private void allineaPaziente() {
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
            return;
        }
        Utente utente = esistente.get();
        Long pazienteId = utente.getPaziente().getId();
        pazienteRepository.findById(pazienteId).filter(p -> !Boolean.TRUE.equals(p.getAttivo())).ifPresent(p -> {
            p.setAttivo(true);
            p.setArchiviatoIl(null);
            pazienteRepository.save(p);
        });
        ripristinaAccesso(utente, pazientePassword);
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
        pagamentoService.delPaziente(id).righe().forEach(r -> pagamentoService.annulla(r.id()));

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

    private static String normalizza(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }
}
