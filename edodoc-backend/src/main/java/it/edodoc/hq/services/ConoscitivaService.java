package it.edodoc.hq.services;

import it.edodoc.hq.dto.AgendaDto;
import it.edodoc.hq.dto.ConoscitivaDto;
import it.edodoc.hq.dto.VisiteDto;
import it.edodoc.hq.exception.ConflittoException;
import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.models.Visita;
import it.edodoc.hq.repositories.PazienteRepository;
import it.edodoc.hq.repositories.VisitaRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * La chiamata conoscitiva prenotata dal sito. Gli slot liberi incrociano le fasce del dottore con il suo Google Calendar
 * e con le visite in agenda. La prenotazione crea il contatto (o ritrova il paziente per email) e una visita
 * CHIAMATA_CONOSCITIVA online con Meet e invito: la scrive su Google la sincronizzazione delle visite, subito dopo il commit.
 */
@Service
public class ConoscitivaService {

    private static final Logger logger = LoggerFactory.getLogger(ConoscitivaService.class);
    private static final ZoneId ROMA = ZoneId.of("Europe/Rome");
    private static final DateTimeFormatter ORA = DateTimeFormatter.ofPattern("HH:mm");
    private static final DateTimeFormatter QUANDO = DateTimeFormatter.ofPattern("EEEE d MMMM 'alle' HH:mm", Locale.ITALIAN);
    private static final long CACHE_MS = 60_000;

    private final ConfigService configService;
    private final GoogleClients googleClients;
    private final AgendaService agendaService;
    private final VisitaRepository visitaRepository;
    private final PazienteRepository pazienteRepository;
    private final VisitaService visitaService;
    private final PrenotazioneService prenotazioneService;
    private final MailingEventiGestionaleService mailing;
    private final ApplicationEventPublisher eventi;
    private final boolean demoAttiva;

    private volatile ConoscitivaDto.Disponibilita cache;
    private volatile long cacheAl;

    public ConoscitivaService(ConfigService configService, GoogleClients googleClients, AgendaService agendaService,
                              VisitaRepository visitaRepository, PazienteRepository pazienteRepository, VisitaService visitaService,
                              PrenotazioneService prenotazioneService, MailingEventiGestionaleService mailing,
                              ApplicationEventPublisher eventi,
                              @Value("${app.init.demo-enabled:false}") boolean demoAttiva) {
        this.mailing = mailing;
        this.eventi = eventi;
        this.configService = configService;
        this.googleClients = googleClients;
        this.agendaService = agendaService;
        this.visitaRepository = visitaRepository;
        this.pazienteRepository = pazienteRepository;
        this.visitaService = visitaService;
        this.prenotazioneService = prenotazioneService;
        this.demoAttiva = demoAttiva;
    }

    /** L'invito parte solo con il calendario collegato e la sincronizzazione delle visite accesa. */
    private boolean googlePronto() {
        return googleClients.isConfigurato() && configService.isAttivo(ConfigService.CALENDAR_ENABLED);
    }

    private boolean attiva() {
        return googlePronto() || demoAttiva;
    }

    /** Per il sito: un minuto di cache, così un picco di visite non diventa un picco di richieste a Google. */
    public ConoscitivaDto.Disponibilita disponibilita() {
        long adesso = System.currentTimeMillis();
        ConoscitivaDto.Disponibilita c = cache;
        if (c != null && adesso - cacheAl < CACHE_MS) return c;
        ConoscitivaDto.Disponibilita nuova = calcola();
        cache = nuova;
        cacheAl = adesso;
        return nuova;
    }

    private ConoscitivaDto.Disponibilita calcola() {
        if (!attiva()) {
            return new ConoscitivaDto.Disponibilita(false, SlotConoscitiva.DURATA_MINUTI, ROMA.getId(), List.of());
        }
        try {
            Map<LocalDate, List<LocalTime>> liberi = liberi(LocalDateTime.now(ROMA));
            List<ConoscitivaDto.Giorno> giorni = liberi.entrySet().stream()
                    .map(e -> new ConoscitivaDto.Giorno(e.getKey(), e.getValue().stream().map(ORA::format).toList()))
                    .toList();
            return new ConoscitivaDto.Disponibilita(true, SlotConoscitiva.DURATA_MINUTI, ROMA.getId(), giorni);
        } catch (RuntimeException e) {
            // Google irraggiungibile o delega rifiutata: il sito ripiega sul link di riserva invece di mostrare un errore
            logger.warn("Disponibilità della chiamata conoscitiva non calcolabile: {}", e.getMessage());
            return new ConoscitivaDto.Disponibilita(false, SlotConoscitiva.DURATA_MINUTI, ROMA.getId(), List.of());
        }
    }

    private SlotConoscitiva.Regole regole() {
        return new SlotConoscitiva.Regole(SlotConoscitiva.leggiOrari(configService.get("CONOSCITIVA_ORARI")),
                intero("CONOSCITIVA_PREAVVISO_ORE", 12), intero("CONOSCITIVA_GIORNI_MINIMI", 2),
                Math.min(intero("CONOSCITIVA_GIORNI", 21), 60),
                intero("CONOSCITIVA_MARGINE_MINUTI", 10), intero("CONOSCITIVA_MAX_AL_GIORNO", 4));
    }

    private Map<LocalDate, List<LocalTime>> liberi(LocalDateTime adesso) {
        SlotConoscitiva.Regole regole = regole();
        LocalDate dal = adesso.toLocalDate();
        LocalDate al = dal.plusDays(regole.giorni());
        List<SlotConoscitiva.Impegno> impegni = new ArrayList<>();
        Map<LocalDate, Integer> chiamate = new HashMap<>();
        for (Visita v : visitaRepository.findNelPeriodo(dal.atStartOfDay(), al.plusDays(1).atStartOfDay())) {
            if (v.getStato() == Visita.Stato.ANNULLATA) continue;
            impegni.add(new SlotConoscitiva.Impegno(v.getInizio(), v.getFine()));
            if (v.getTipo() == Visita.Tipo.CHIAMATA_CONOSCITIVA) chiamate.merge(v.getInizio().toLocalDate(), 1, Integer::sum);
        }
        String account = googleClients.account().isBlank() ? "dottore@edodoc.it" : googleClients.account();
        List<AgendaDto.Disponibilita> occupato = agendaService.fonte().disponibilita(new AgendaDto.DisponibilitaRequest(
                List.of(account), dal.atStartOfDay(ROMA).toOffsetDateTime().toString(), al.plusDays(1).atStartOfDay(ROMA).toOffsetDateTime().toString()));
        for (AgendaDto.Disponibilita d : occupato) {
            if (d.errore() != null) throw new IllegalStateException("Google non ha dato la disponibilità: " + d.errore());
            for (AgendaDto.Intervallo i : d.occupato()) {
                impegni.add(new SlotConoscitiva.Impegno(locale(i.inizio()), locale(i.fine())));
            }
        }
        return SlotConoscitiva.liberi(adesso, regole, impegni, chiamate);
    }

    private static LocalDateTime locale(String rfc3339) {
        return OffsetDateTime.parse(rfc3339).atZoneSameInstant(ROMA).toLocalDateTime();
    }

    /**
     * Lo slot si ricontrolla dal vivo, senza cache: due persone sullo stesso orario, vince la prima.
     * synchronized basta: le prenotazioni sono poche e le istanze del backend al massimo tre.
     */
    @Transactional
    public synchronized ConoscitivaDto.Conferma prenota(ConoscitivaDto.Prenota r) {
        LocalDateTime inizio = r.inizio().withSecond(0).withNano(0);
        LocalDateTime fine = inizio.plusMinutes(SlotConoscitiva.DURATA_MINUTI);
        String email = r.email().trim().toLowerCase(Locale.ROOT);
        if (r.sito() != null && !r.sito().isBlank()) {
            logger.info("Prenotazione dal sito scartata: campo esca compilato");
            return new ConoscitivaDto.Conferma(inizio, fine, email, r.nome().trim(), true);
        }
        if (!attiva()) {
            throw new ConflittoException("Le prenotazioni online sono chiuse in questo momento: riprova tra poco");
        }
        List<LocalTime> delGiorno = liberi(LocalDateTime.now(ROMA)).getOrDefault(inizio.toLocalDate(), List.of());
        if (!delGiorno.contains(inizio.toLocalTime()) || !visitaRepository.findSovrapposte(inizio, fine, null).isEmpty()) {
            cache = null;
            throw new ConflittoException("Questo orario è appena stato preso. Scegline un altro: gli slot sono aggiornati.");
        }

        Paziente paziente = pazienteRepository.findConEmailIn(List.of(email)).stream().findFirst().orElse(null);
        boolean nuovo = paziente == null;
        if (paziente != null) {
            LocalDateTime adesso = LocalDateTime.now(ROMA);
            visitaRepository.findDelPaziente(paziente.getId()).stream()
                    .filter(v -> v.getTipo() == Visita.Tipo.CHIAMATA_CONOSCITIVA && v.getStato() == Visita.Stato.PROGRAMMATA
                            && v.getInizio().isAfter(adesso))
                    .findFirst().ifPresent(v -> {
                        throw new ConflittoException("Hai già una chiamata fissata per " + v.getInizio().format(QUANDO)
                                + ". Trovi il link nell'invito che ti è arrivato via email.");
                    });
            if (vuoto(paziente.getCellulare()) && !vuoto(r.telefono())) paziente.setCellulare(r.telefono().trim());
        } else {
            paziente = new Paziente();
            paziente.setNome(maiuscola(r.nome()));
            paziente.setCognome(vuoto(r.cognome()) ? "" : maiuscola(r.cognome()));
            paziente.setEmail(email);
            paziente.setCellulare(vuoto(r.telefono()) ? null : r.telefono().trim());
            paziente.setStato(Paziente.Stato.LEAD);
            paziente.setFonte(Paziente.Fonte.SITO);
            paziente.setSituazione(situazione(r));
            pazienteRepository.save(paziente);
        }
        if (nuovo) {
            mailing.pazienteCreato(paziente.getId());
        } else {
            mailing.pazienteSalvato(paziente.getId());
        }

        VisiteDto.Riga visita = visitaService.crea(new VisiteDto.Salva(paziente.getId(), Visita.Tipo.CHIAMATA_CONOSCITIVA, Visita.Modalita.ONLINE,
                inizio, SlotConoscitiva.DURATA_MINUTI, true, true, situazione(r)));
        prenotazioneService.registra(visita.id(), paziente, r, nuovo);
        eventi.publishEvent(avviso(paziente, r, inizio, nuovo));
        cache = null;
        logger.info("Chiamata conoscitiva prenotata dal sito per {}", inizio);
        return new ConoscitivaDto.Conferma(inizio, fine, email, paziente.getNome(), googlePronto());
    }

    /** Email al dottore: chi, quando, come contattarlo e cosa ha scritto nel questionario. */
    static AvvisoPrenotazioneService.Avviso avviso(Paziente paziente, ConoscitivaDto.Prenota r, LocalDateTime inizio, boolean nuovo) {
        String nome = (paziente.getNome() + " " + (paziente.getCognome() == null ? "" : paziente.getCognome())).trim();
        String quando = inizio.format(QUANDO);
        StringBuilder t = new StringBuilder();
        t.append("È arrivata una nuova prenotazione della discovery call dal sito edodoc.it.\n\n");
        t.append("Chi: ").append(nome).append(nuovo ? " (nuovo contatto)" : " (già in anagrafica)").append('\n');
        t.append("Quando: ").append(quando.substring(0, 1).toUpperCase(Locale.ITALIAN)).append(quando.substring(1)).append('\n');
        t.append("Email: ").append(paziente.getEmail()).append('\n');
        if (!vuoto(paziente.getCellulare())) t.append("Telefono: ").append(paziente.getCellulare()).append('\n');
        riga(t, "\nObiettivo", r.obiettivo());
        riga(t, "Professione", r.professione());
        riga(t, "Ci ha conosciuto da", r.conosciutoDa());
        riga(t, "Percorsi già provati", r.percorsiPrecedenti());
        riga(t, "Investimento previsto", r.investimento());
        riga(t, "Priorità", r.priorita());
        riga(t, "Perché adesso", r.percheOra());
        riga(t, "Messaggio", r.messaggio());
        t.append("\nLa trovi nel gestionale, pagina Discovery: https://hq.edodoc.it/discovery");
        return new AvvisoPrenotazioneService.Avviso("Nuova discovery call: " + nome + ", " + inizio.format(QUANDO), t.toString());
    }

    private static void riga(StringBuilder t, String etichetta, String valore) {
        if (!vuoto(valore)) t.append(etichetta).append(": ").append(valore.trim()).append('\n');
    }

    /**
     * Finisce nella descrizione dell'invito: la persona rilegge le proprie parole, il dottore arriva preparato.
     * Investimento, priorità e provenienza restano solo nel gestionale: non servono nell'invito.
     */
    private static String situazione(ConoscitivaDto.Prenota r) {
        StringBuilder s = new StringBuilder("Prenotata dal sito edodoc.it.");
        if (!vuoto(r.professione())) s.append("\nProfessione: ").append(r.professione().trim());
        if (!vuoto(r.obiettivo())) s.append("\nObiettivo: ").append(r.obiettivo().trim());
        if (!vuoto(r.percorsiPrecedenti())) s.append("\n\nPercorsi già provati: ").append(r.percorsiPrecedenti().trim());
        if (!vuoto(r.messaggio())) s.append("\n\n").append(r.messaggio().trim());
        return s.toString();
    }

    private int intero(String chiave, int altrimenti) {
        try {
            return Integer.parseInt(configService.get(chiave).trim());
        } catch (RuntimeException e) {
            return altrimenti;
        }
    }

    private static boolean vuoto(String s) {
        return s == null || s.isBlank();
    }

    private static String maiuscola(String s) {
        String t = s.trim().replaceAll("\\s+", " ");
        return t.isEmpty() ? t : t.substring(0, 1).toUpperCase(Locale.ITALIAN) + t.substring(1);
    }
}
