package it.edodoc.hq.services;

import com.google.api.client.googleapis.json.GoogleJsonResponseException;
import com.google.api.client.util.Data;
import com.google.api.client.util.DateTime;
import com.google.api.services.calendar.Calendar;
import com.google.api.services.calendar.model.CalendarListEntry;
import com.google.api.services.calendar.model.CalendarList;
import com.google.api.services.calendar.model.ColorDefinition;
import com.google.api.services.calendar.model.Colors;
import com.google.api.services.calendar.model.ConferenceData;
import com.google.api.services.calendar.model.ConferenceSolutionKey;
import com.google.api.services.calendar.model.CreateConferenceRequest;
import com.google.api.services.calendar.model.EntryPoint;
import com.google.api.services.calendar.model.Event;
import com.google.api.services.calendar.model.EventAttachment;
import com.google.api.services.calendar.model.EventAttendee;
import com.google.api.services.calendar.model.EventDateTime;
import com.google.api.services.calendar.model.EventFocusTimeProperties;
import com.google.api.services.calendar.model.EventOutOfOfficeProperties;
import com.google.api.services.calendar.model.EventReminder;
import com.google.api.services.calendar.model.Events;
import com.google.api.services.calendar.model.FreeBusyCalendar;
import com.google.api.services.calendar.model.FreeBusyRequest;
import com.google.api.services.calendar.model.FreeBusyRequestItem;
import com.google.api.services.calendar.model.FreeBusyResponse;
import it.edodoc.hq.dto.AgendaDto;
import it.edodoc.hq.exception.GoogleRifiutoException;
import it.edodoc.hq.exception.IntegrazioneDisattivataException;
import it.edodoc.hq.models.Visita;
import it.edodoc.hq.repositories.PazienteRepository;
import it.edodoc.hq.repositories.VisitaRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;

/**
 * Il Google Calendar del dottore, impersonato col Service Account. Nessuna copia locale: ogni lettura e scrittura va
 * a Google, che resta l'unica fonte di verità; le modifiche fatte altrove (app di Google, telefono) arrivano col
 * controllo delle novità ({@link #novita}). Sugli eventi pubblicati dalle visite si aggiunge il collegamento al
 * gestionale, così dal calendario si apre il paziente.
 */
@Component
public class GoogleAgenda implements AgendaFonte {

    private static final Logger logger = LoggerFactory.getLogger(GoogleAgenda.class);

    private static final ZoneId ROMA = ZoneId.of("Europe/Rome");
    private static final int MAX_GIORNI_FINESTRA = 400;
    private static final int MAX_EVENTI_PER_CALENDARIO = 5_000;
    private static final int MAX_CALENDARI = 30;
    private static final DateTimeFormatter UNTIL_ORARIO = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC);
    private static final DateTimeFormatter UNTIL_DATA = DateTimeFormatter.BASIC_ISO_DATE;

    private final GoogleClients googleClients;
    private final PazienteRepository pazienteRepository;
    private final VisitaRepository visitaRepository;
    /** Le chiamate ai calendari della lista partono in parallelo: con 6-8 calendari la settimana arriva in un colpo. */
    private final ExecutorService pool = Executors.newFixedThreadPool(8, r -> {
        Thread t = new Thread(r, "agenda-google");
        t.setDaemon(true);
        return t;
    });
    private volatile Map<String, AgendaDto.Colore> coloriEventi;

    public GoogleAgenda(GoogleClients googleClients, PazienteRepository pazienteRepository, VisitaRepository visitaRepository) {
        this.googleClients = googleClients;
        this.pazienteRepository = pazienteRepository;
        this.visitaRepository = visitaRepository;
    }

    @FunctionalInterface
    private interface Chiamata<T> {
        T esegui(Calendar calendar) throws IOException;
    }

    /** Traduce gli errori di Google in quelli del gestionale: la delega mancante mostra la guida di collegamento. */
    private <T> T con(Chiamata<T> chiamata) {
        try {
            return chiamata.esegui(googleClients.calendar());
        } catch (GoogleJsonResponseException e) {
            throw tradotto(e);
        } catch (IOException | GeneralSecurityException e) {
            if (e instanceof IOException io && GoogleClients.delegaNegata(io)) {
                logger.warn("Delega Google Calendar non autorizzata: {}", e.getMessage());
                throw new IntegrazioneDisattivataException("Google non autorizza l'accesso al calendario: controlla la delega calendar");
            }
            logger.warn("Errore di rete verso Google Calendar: {}", e.getMessage());
            throw new GoogleRifiutoException(HttpStatus.BAD_GATEWAY, "Google Calendar non risponde, riprova tra poco.", e);
        }
    }

    private static RuntimeException tradotto(GoogleJsonResponseException e) {
        int codice = e.getStatusCode();
        String dettaglio = e.getDetails() != null ? e.getDetails().getMessage() : e.getMessage();
        logger.warn("Google Calendar ha risposto {}: {}", codice, dettaglio);
        return switch (codice) {
            case 400 -> new IllegalArgumentException("Richiesta non valida per Google Calendar: " + dettaglio, e);
            case 401 -> new IntegrazioneDisattivataException("Google ha negato l'accesso al calendario: controlla la delega calendar");
            case 403 -> new GoogleRifiutoException(HttpStatus.FORBIDDEN, "Non hai i permessi per questa operazione sul calendario.", e);
            case 404, 410 -> new GoogleRifiutoException(HttpStatus.NOT_FOUND, "Evento non trovato: forse è stato eliminato.", e);
            // 412 e non 409: nel gestionale il 409 significa integrazione non collegata
            case 409, 412 -> new GoogleRifiutoException(HttpStatus.PRECONDITION_FAILED, "L'evento è cambiato nel frattempo: ricarico la versione aggiornata.", e);
            case 429 -> new GoogleRifiutoException(HttpStatus.TOO_MANY_REQUESTS, "Troppe richieste a Google Calendar, attendi qualche secondo.", e);
            default -> new GoogleRifiutoException(HttpStatus.BAD_GATEWAY, "Errore di Google Calendar: " + dettaglio, e);
        };
    }

    // ───────────────────────── Stato e calendari ─────────────────────────

    @Override
    public AgendaDto.Stato stato() {
        List<AgendaDto.Calendario> calendari = calendari();
        String fuso = calendari.stream().filter(AgendaDto.Calendario::principale).map(AgendaDto.Calendario::fusoOrario)
                .filter(Objects::nonNull).findFirst().orElse(ROMA.getId());
        return new AgendaDto.Stato(io(), io(), fuso, calendari, coloriEventi(), false);
    }

    private List<AgendaDto.Calendario> calendari() {
        List<CalendarListEntry> voci = new ArrayList<>();
        String pagina = null;
        do {
            String token = pagina;
            CalendarList lista = con(c -> c.calendarList().list().setMaxResults(250).setPageToken(token).execute());
            if (lista.getItems() != null) {
                voci.addAll(lista.getItems());
            }
            pagina = lista.getNextPageToken();
        } while (pagina != null);

        return voci.stream()
                .filter(v -> !Boolean.TRUE.equals(v.getDeleted()) && !Boolean.TRUE.equals(v.getHidden()))
                .map(v -> new AgendaDto.Calendario(
                        Boolean.TRUE.equals(v.getPrimary()) ? PRINCIPALE : v.getId(),
                        v.getSummaryOverride() != null && !v.getSummaryOverride().isBlank() ? v.getSummaryOverride() : v.getSummary(),
                        v.getDescription(),
                        v.getBackgroundColor(),
                        v.getForegroundColor(),
                        v.getAccessRole(),
                        Boolean.TRUE.equals(v.getPrimary()),
                        Boolean.TRUE.equals(v.getSelected()) || Boolean.TRUE.equals(v.getPrimary()),
                        v.getTimeZone(),
                        v.getDefaultReminders() == null ? List.of() : v.getDefaultReminders().stream()
                                .map(r -> new AgendaDto.Promemoria(r.getMethod(), r.getMinutes() == null ? 0 : r.getMinutes()))
                                .toList()))
                // Prima il proprio, poi quelli modificabili, poi il resto in ordine alfabetico (come la barra di Google).
                .sorted(Comparator.comparing((AgendaDto.Calendario c) -> !c.principale())
                        .thenComparing(c -> !("owner".equals(c.accesso()) || "writer".equals(c.accesso())))
                        .thenComparing(c -> c.nome() == null ? "" : c.nome().toLowerCase(Locale.ROOT)))
                .toList();
    }

    private Map<String, AgendaDto.Colore> coloriEventi() {
        Map<String, AgendaDto.Colore> cache = coloriEventi;
        if (cache != null) {
            return cache;
        }
        try {
            Colors colors = con(c -> c.colors().get().execute());
            Map<String, AgendaDto.Colore> out = new LinkedHashMap<>();
            if (colors.getEvent() != null) {
                for (Map.Entry<String, ColorDefinition> e : colors.getEvent().entrySet()) {
                    out.put(e.getKey(), new AgendaDto.Colore(e.getValue().getBackground(), e.getValue().getForeground()));
                }
            }
            coloriEventi = out;
            return out;
        } catch (GoogleRifiutoException e) {
            return Map.of();
        }
    }

    // ───────────────────────── Lettura ─────────────────────────

    @Override
    public AgendaDto.Eventi eventi(List<String> calendarIds, String da, String a) {
        DateTime min = istante(da, "da");
        DateTime max = istante(a, "a");
        long giorni = Duration.ofMillis(max.getValue() - min.getValue()).toDays();
        if (giorni < 0 || giorni > MAX_GIORNI_FINESTRA) {
            throw new IllegalArgumentException("Intervallo non valido (massimo " + MAX_GIORNI_FINESTRA + " giorni).");
        }
        List<String> ids = idsCalendari(calendarIds);

        Map<String, CompletableFuture<List<Event>>> futuri = new LinkedHashMap<>();
        Map<String, String> ruoli = new java.util.concurrent.ConcurrentHashMap<>();
        for (String id : ids) {
            futuri.put(id, CompletableFuture.supplyAsync(() -> {
                List<Event> out = new ArrayList<>();
                String pagina = null;
                do {
                    String token = pagina;
                    Events risposta = con(c -> c.events().list(id)
                            .setTimeMin(min).setTimeMax(max)
                            .setSingleEvents(true)
                            .setMaxResults(2500)
                            .setPageToken(token)
                            .execute());
                    if (risposta.getAccessRole() != null) {
                        ruoli.put(id, risposta.getAccessRole());
                    }
                    if (risposta.getItems() != null) {
                        out.addAll(risposta.getItems());
                    }
                    pagina = risposta.getNextPageToken();
                } while (pagina != null && out.size() < MAX_EVENTI_PER_CALENDARIO);
                return out;
            }, pool));
        }

        String io = io();
        List<Event> tutti = new ArrayList<>();
        Map<Event, String> calendarioDi = new java.util.IdentityHashMap<>();
        List<String> nonLetti = new ArrayList<>();
        for (Map.Entry<String, CompletableFuture<List<Event>>> f : futuri.entrySet()) {
            try {
                for (Event e : f.getValue().join()) {
                    tutti.add(e);
                    calendarioDi.put(e, f.getKey());
                }
            } catch (java.util.concurrent.CompletionException ex) {
                if (ex.getCause() instanceof IntegrazioneDisattivataException delega) {
                    throw delega;
                }
                logger.info("Calendario {} non letto: {}", f.getKey(), ex.getCause() != null ? ex.getCause().getMessage() : ex.getMessage());
                nonLetti.add(f.getKey());
            }
        }

        Collegamenti collegamenti = collegamenti(tutti);
        List<AgendaDto.Evento> out = tutti.stream()
                .filter(e -> !"cancelled".equals(e.getStatus()))
                .map(e -> mappa(e, calendarioDi.get(e), ruoli.get(calendarioDi.get(e)), io, collegamenti, null))
                .toList();
        return new AgendaDto.Eventi(out, nonLetti);
    }

    /** Dettaglio di un evento; per un'occorrenza aggiunge le regole della serie (per l'editor). */
    @Override
    public AgendaDto.Evento evento(String calendarioId, String eventoId) {
        String cal = calendario(calendarioId);
        Event e = con(c -> c.events().get(cal, eventoId).execute());
        List<String> regole = e.getRecurrence();
        if (e.getRecurringEventId() != null) {
            try {
                Event serie = con(c -> c.events().get(cal, e.getRecurringEventId()).execute());
                regole = serie.getRecurrence();
            } catch (GoogleRifiutoException ignorata) {
                // La serie può non essere leggibile (calendario altrui in sola lettura): l'occorrenza basta.
            }
        }
        String ruolo = ruoloCalendario(cal);
        return mappa(e, cal, ruolo, io(), collegamenti(List.of(e)), regole);
    }

    @Override
    public List<AgendaDto.Evento> cerca(String q, List<String> calendarIds) {
        if (q == null || q.isBlank()) {
            return List.of();
        }
        String io = io();
        String testo = q.trim();
        Instant ora = Instant.now();
        DateTime min = new DateTime(ora.minus(730, ChronoUnit.DAYS).toEpochMilli());
        DateTime max = new DateTime(ora.plus(730, ChronoUnit.DAYS).toEpochMilli());
        List<String> ids = idsCalendari(calendarIds);
        List<CompletableFuture<List<AgendaDto.Evento>>> futuri = ids.stream()
                .map(id -> CompletableFuture.supplyAsync(() -> {
                    Events r = con(c -> c.events().list(id).setQ(testo).setTimeMin(min).setTimeMax(max)
                            .setSingleEvents(true).setOrderBy("startTime").setMaxResults(80).execute());
                    List<Event> items = r.getItems() == null ? List.of() : r.getItems();
                    Collegamenti utenti = collegamenti(items);
                    return items.stream().filter(e -> !"cancelled".equals(e.getStatus()))
                            .map(e -> mappa(e, id, r.getAccessRole(), io, utenti, null)).toList();
                }, pool).exceptionally(ex -> List.of()))
                .toList();
        long adesso = ora.toEpochMilli();
        return futuri.stream().flatMap(f -> f.join().stream())
                // Prima i prossimi (dal più vicino), poi i passati (dal più recente).
                .sorted(Comparator.comparing((AgendaDto.Evento ev) -> inizioMs(ev) < adesso)
                        .thenComparing(ev -> inizioMs(ev) < adesso ? -inizioMs(ev) : inizioMs(ev)))
                .limit(120)
                .toList();
    }

    /**
     * C'è qualcosa di nuovo dopo {@code dal} (ms epoch)? Una chiamata leggera per calendario (updatedMin, solo id):
     * il client ricarica la finestra visibile solo quando serve.
     */
    @Override
    public AgendaDto.Novita novita(List<String> calendarIds, long dal) {
        long adesso = System.currentTimeMillis();
        // Google ignora updatedMin troppo vecchi in modo poco prevedibile: oltre un giorno si ricarica comunque.
        if (dal <= 0 || adesso - dal > Duration.ofDays(1).toMillis()) {
            return new AgendaDto.Novita(true, adesso, idsCalendari(calendarIds));
        }
        // Margine per l'orologio di Google rispetto al nostro: meglio un ricaricamento in più che una modifica persa.
        DateTime da = new DateTime(dal - 5_000);
        List<String> ids = idsCalendari(calendarIds);
        List<CompletableFuture<String>> futuri = ids.stream()
                .map(id -> CompletableFuture.supplyAsync(() -> {
                    Events r = con(c -> c.events().list(id).setUpdatedMin(da).setShowDeleted(true)
                            .setMaxResults(1).setFields("items(id)").execute());
                    return r.getItems() != null && !r.getItems().isEmpty() ? id : null;
                }, pool).exceptionally(ex -> {
                    if (ex.getCause() instanceof IntegrazioneDisattivataException delega) {
                        throw delega;
                    }
                    return null;
                }))
                .toList();
        List<String> cambiati = futuri.stream().map(CompletableFuture::join).filter(Objects::nonNull).toList();
        return new AgendaDto.Novita(!cambiati.isEmpty(), adesso, cambiati);
    }

    // ───────────────────────── Scrittura ─────────────────────────

    @Override
    public AgendaDto.Evento crea(String calendarioId, AgendaDto.EventoRequest req, boolean notifica) {
        String cal = calendario(calendarioId);
        if (req == null || req.inizio() == null || req.fine() == null) {
            throw new IllegalArgumentException("Inizio e fine sono obbligatori.");
        }
        Event e = new Event();
        applica(e, req, null, fusoDi(req));
        if (e.getSummary() == null || e.getSummary().isBlank()) {
            e.setSummary(req.tipo() != null && "outOfOffice".equals(req.tipo()) ? "Fuori sede" : "(Senza titolo)");
        }
        Event creato = con(c -> c.events().insert(cal, e)
                .setConferenceDataVersion(1)
                .setSendUpdates(notifica ? "all" : "none")
                .setSupportsAttachments(true)
                .execute());
        return mappa(creato, cal, ruoloCalendario(cal), io(), collegamenti(List.of(creato)), creato.getRecurrence());
    }

    @Override
    public AgendaDto.Evento modifica(String calendarioId, String eventoId, AgendaDto.EventoRequest req,
                                     Ambito ambito, boolean notifica) {
        String cal = calendario(calendarioId);
        if (req == null) {
            throw new IllegalArgumentException("Nessuna modifica.");
        }
        Event attuale = con(c -> c.events().get(cal, eventoId).execute());
        String serieId = attuale.getRecurringEventId();
        Ambito a = ambito == null || serieId == null ? Ambito.QUESTO : ambito;
        String fuso = fusoDi(req);

        Event risultato = switch (a) {
            case QUESTO -> {
                Event patch = new Event();
                applica(patch, req, attuale, fuso);
                yield patch(cal, eventoId, patch, notifica);
            }
            case TUTTI -> {
                Event serie = con(c -> c.events().get(cal, serieId).execute());
                Event patch = new Event();
                applica(patch, spostaSullaSerie(req, attuale, serie), serie, fuso);
                yield patch(cal, serieId, patch, notifica);
            }
            case SEGUENTI -> {
                Event serie = con(c -> c.events().get(cal, serieId).execute());
                if (primaOccorrenza(attuale, serie)) {
                    Event patch = new Event();
                    applica(patch, spostaSullaSerie(req, attuale, serie), serie, fuso);
                    yield patch(cal, serieId, patch, notifica);
                }
                List<String> regoleOriginali = serie.getRecurrence();
                tronca(cal, serie, attuale, notifica);
                Event nuova = copiaSerie(serie, attuale, regoleOriginali);
                applica(nuova, req, serie, fuso);
                yield con(c -> c.events().insert(cal, nuova)
                        .setConferenceDataVersion(1)
                        .setSendUpdates(notifica ? "all" : "none")
                        .setSupportsAttachments(true)
                        .execute());
            }
        };
        return mappa(risultato, cal, ruoloCalendario(cal), io(), collegamenti(List.of(risultato)), risultato.getRecurrence());
    }

    @Override
    public void elimina(String calendarioId, String eventoId, Ambito ambito, boolean notifica) {
        String cal = calendario(calendarioId);
        String invio = notifica ? "all" : "none";
        if (ambito == null || ambito == Ambito.QUESTO) {
            con(c -> c.events().delete(cal, eventoId).setSendUpdates(invio).execute());
            return;
        }
        Event attuale = con(c -> c.events().get(cal, eventoId).execute());
        String serieId = attuale.getRecurringEventId() != null ? attuale.getRecurringEventId() : attuale.getId();
        if (ambito == Ambito.TUTTI) {
            con(c -> c.events().delete(cal, serieId).setSendUpdates(invio).execute());
            return;
        }
        Event serie = con(c -> c.events().get(cal, serieId).execute());
        if (attuale.getRecurringEventId() == null || primaOccorrenza(attuale, serie)) {
            con(c -> c.events().delete(cal, serieId).setSendUpdates(invio).execute());
        } else {
            tronca(cal, serie, attuale, notifica);
        }
    }

    /** Sposta l'evento (o la sua serie) su un altro calendario della lista. */
    @Override
    public AgendaDto.Evento sposta(String calendarioId, String eventoId, String destinazione, boolean notifica) {
        String cal = calendario(calendarioId);
        String dest = calendario(destinazione);
        Event attuale = con(c -> c.events().get(cal, eventoId).execute());
        String id = attuale.getRecurringEventId() != null ? attuale.getRecurringEventId() : eventoId;
        Event spostato = con(c -> c.events().move(cal, id, dest).setSendUpdates(notifica ? "all" : "none").execute());
        return mappa(spostato, dest, ruoloCalendario(dest), io(), collegamenti(List.of(spostato)), spostato.getRecurrence());
    }

    /** Risposta a un invito (sì, no, forse), per l'occorrenza o per tutta la serie. */
    @Override
    public AgendaDto.Evento rispondi(String calendarioId, String eventoId, AgendaDto.RispostaRequest req, Ambito ambito) {
        String cal = calendario(calendarioId);
        String risposta = req == null || req.risposta() == null ? "" : req.risposta().trim();
        if (!Set.of("accepted", "declined", "tentative").contains(risposta)) {
            throw new IllegalArgumentException("Risposta non valida.");
        }
        Event attuale = con(c -> c.events().get(cal, eventoId).execute());
        String id = ambito == Ambito.TUTTI && attuale.getRecurringEventId() != null ? attuale.getRecurringEventId() : eventoId;
        Event bersaglio = id.equals(eventoId) ? attuale : con(c -> c.events().get(cal, id).execute());
        List<EventAttendee> invitati = bersaglio.getAttendees() == null ? new ArrayList<>() : new ArrayList<>(bersaglio.getAttendees());
        boolean trovato = false;
        for (EventAttendee p : invitati) {
            if (Boolean.TRUE.equals(p.getSelf()) || io().equalsIgnoreCase(p.getEmail())) {
                p.setResponseStatus(risposta);
                if (req.commento() != null) {
                    p.setComment(req.commento().isBlank() ? null : req.commento().trim());
                }
                trovato = true;
            }
        }
        if (!trovato) {
            throw new IllegalArgumentException("Non sei tra gli invitati di questo evento.");
        }
        Event patch = new Event().setAttendees(invitati);
        Event aggiornato = con(c -> c.events().patch(cal, id, patch).setSendUpdates("all").execute());
        return mappa(aggiornato, cal, ruoloCalendario(cal), io(), collegamenti(List.of(aggiornato)), aggiornato.getRecurrence());
    }

    // ───────────────────────── Persone e disponibilità ─────────────────────────

    /** Occupato/libero delle persone indicate (solo ciò che Google mostra al dottore). */
    @Override
    public List<AgendaDto.Disponibilita> disponibilita(AgendaDto.DisponibilitaRequest req) {
        if (req == null || req.email() == null || req.email().isEmpty()) {
            return List.of();
        }
        List<String> persone = req.email().stream().map(GoogleAgenda::normalizza).filter(s -> s.contains("@")).distinct().limit(40).toList();
        DateTime min = istante(req.da(), "da");
        DateTime max = istante(req.a(), "a");
        if (max.getValue() - min.getValue() > Duration.ofDays(62).toMillis()) {
            throw new IllegalArgumentException("Intervallo troppo ampio per la disponibilità.");
        }
        FreeBusyRequest richiesta = new FreeBusyRequest().setTimeMin(min).setTimeMax(max).setTimeZone(ROMA.getId())
                .setItems(persone.stream().map(p -> new FreeBusyRequestItem().setId(p)).toList());
        FreeBusyResponse r = con(c -> c.freebusy().query(richiesta).execute());
        Map<String, FreeBusyCalendar> calendari = r.getCalendars() == null ? Map.of() : r.getCalendars();
        return persone.stream().map(p -> {
            FreeBusyCalendar fb = calendari.get(p);
            if (fb == null) {
                return new AgendaDto.Disponibilita(p, List.of(), "non disponibile");
            }
            String errore = fb.getErrors() != null && !fb.getErrors().isEmpty() ? fb.getErrors().get(0).getReason() : null;
            List<AgendaDto.Intervallo> occupato = fb.getBusy() == null ? List.of() : fb.getBusy().stream()
                    .map(b -> new AgendaDto.Intervallo(b.getStart().toStringRfc3339(), b.getEnd().toStringRfc3339()))
                    .toList();
            return new AgendaDto.Disponibilita(p, occupato, errore);
        }).toList();
    }

    // ───────────────────────── Supporto ─────────────────────────

    private String io() {
        return normalizza(googleClients.account());
    }

    private Event patch(String cal, String id, Event patch, boolean notifica) {
        return con(c -> c.events().patch(cal, id, patch)
                .setConferenceDataVersion(1)
                .setSendUpdates(notifica ? "all" : "none")
                .setSupportsAttachments(true)
                .execute());
    }

    /**
     * Copia sull'evento i campi presenti nella richiesta. {@code esistente} (per le modifiche) serve a conservare
     * le risposte degli invitati che restano e a sapere se il Meet c'è già.
     */
    @SuppressWarnings("unchecked")
    static void applica(Event e, AgendaDto.EventoRequest req, Event esistente, String fuso) {
        if (req.titolo() != null) {
            e.setSummary(req.titolo().trim());
        }
        if (req.descrizione() != null) {
            e.setDescription(req.descrizione().isBlank() ? Data.NULL_STRING : req.descrizione());
        }
        if (req.luogo() != null) {
            e.setLocation(req.luogo().isBlank() ? Data.NULL_STRING : req.luogo().trim());
        }
        boolean tuttoIlGiorno = req.tuttoIlGiorno() != null ? req.tuttoIlGiorno()
                : esistente != null && esistente.getStart() != null && esistente.getStart().getDate() != null;
        if (req.inizio() != null || req.fine() != null || req.tuttoIlGiorno() != null) {
            String inizio = req.inizio() != null ? req.inizio() : esistente != null ? rfc(esistente.getStart()) : null;
            String fine = req.fine() != null ? req.fine() : esistente != null ? rfc(esistente.getEnd()) : null;
            if (inizio == null || fine == null) {
                throw new IllegalArgumentException("Inizio e fine sono obbligatori.");
            }
            EventDateTime[] estremi = estremi(inizio, fine, tuttoIlGiorno, fuso);
            e.setStart(estremi[0]);
            e.setEnd(estremi[1]);
        }
        if (req.colorId() != null) {
            e.setColorId(req.colorId().isBlank() ? Data.NULL_STRING : req.colorId());
        }
        if (req.partecipanti() != null) {
            Map<String, EventAttendee> prima = new LinkedHashMap<>();
            if (esistente != null && esistente.getAttendees() != null) {
                esistente.getAttendees().forEach(p -> prima.put(normalizza(p.getEmail()), p));
            }
            List<EventAttendee> invitati = new ArrayList<>();
            Set<String> visti = new HashSet<>();
            for (AgendaDto.PartecipanteRequest p : req.partecipanti()) {
                String indirizzo = normalizza(p.email());
                if (!indirizzo.contains("@") || !visti.add(indirizzo)) {
                    continue;
                }
                EventAttendee a = prima.getOrDefault(indirizzo, new EventAttendee().setEmail(indirizzo));
                if (p.facoltativo() != null) {
                    a.setOptional(p.facoltativo());
                }
                invitati.add(a);
            }
            // Le risorse (sale) non passano dall'editor: restano com'erano.
            prima.values().stream().filter(p -> Boolean.TRUE.equals(p.getResource()) && !visti.contains(normalizza(p.getEmail())))
                    .forEach(invitati::add);
            e.setAttendees(invitati);
        }
        if (req.conMeet() != null) {
            boolean haMeet = esistente != null && (esistente.getHangoutLink() != null || esistente.getConferenceData() != null);
            if (req.conMeet() && !haMeet) {
                e.setConferenceData(new ConferenceData().setCreateRequest(new CreateConferenceRequest()
                        .setRequestId(UUID.randomUUID().toString())
                        .setConferenceSolutionKey(new ConferenceSolutionKey().setType("hangoutsMeet"))));
            } else if (!req.conMeet() && haMeet) {
                e.setConferenceData(Data.nullOf(ConferenceData.class));
            }
        }
        if (req.promemoriaPredefiniti() != null || req.promemoria() != null) {
            boolean predefiniti = Boolean.TRUE.equals(req.promemoriaPredefiniti());
            Event.Reminders r = new Event.Reminders().setUseDefault(predefiniti);
            if (!predefiniti) {
                r.setOverrides((req.promemoria() == null ? List.<AgendaDto.Promemoria>of() : req.promemoria()).stream()
                        .limit(5)
                        .map(p -> new EventReminder().setMethod("email".equals(p.metodo()) ? "email" : "popup")
                                .setMinutes(Math.max(0, Math.min(40_320, p.minuti()))))
                        .toList());
            }
            e.setReminders(r);
        }
        if (req.ricorrenza() != null) {
            List<String> regole = req.ricorrenza().stream().filter(s -> s != null && !s.isBlank()).map(String::trim).toList();
            e.setRecurrence(regole.isEmpty() ? (List<String>) Data.nullOf(ArrayList.class) : regole);
        }
        if (req.trasparenza() != null) {
            e.setTransparency("transparent".equals(req.trasparenza()) ? "transparent" : "opaque");
        }
        if (req.visibilita() != null) {
            e.setVisibility(Set.of("default", "public", "private", "confidential").contains(req.visibilita()) ? req.visibilita() : "default");
        }
        if (req.tipo() != null && esistente == null) {
            switch (req.tipo()) {
                case "outOfOffice" -> e.setEventType("outOfOffice").setOutOfOfficeProperties(new EventOutOfOfficeProperties()
                        .setAutoDeclineMode("declineOnlyNewConflictingInvitations")
                        .setDeclineMessage("Sono fuori sede, ti rispondo appena rientro."));
                case "focusTime" -> e.setEventType("focusTime").setFocusTimeProperties(new EventFocusTimeProperties()
                        .setAutoDeclineMode("declineNone")
                        .setChatStatus("doNotDisturb"));
                default -> { }
            }
        }
        if (req.ospitiPossonoModificare() != null) {
            e.setGuestsCanModify(req.ospitiPossonoModificare());
        }
        if (req.ospitiPossonoInvitare() != null) {
            e.setGuestsCanInviteOthers(req.ospitiPossonoInvitare());
        }
        if (req.ospitiVedonoAltri() != null) {
            e.setGuestsCanSeeOtherGuests(req.ospitiVedonoAltri());
        }
    }

    private static EventDateTime[] estremi(String inizio, String fine, boolean tuttoIlGiorno, String fuso) {
        try {
            if (tuttoIlGiorno) {
                LocalDate di = LocalDate.parse(inizio.length() > 10 ? inizio.substring(0, 10) : inizio);
                LocalDate df = LocalDate.parse(fine.length() > 10 ? fine.substring(0, 10) : fine);
                if (!df.isAfter(di)) {
                    df = di.plusDays(1);
                }
                return new EventDateTime[]{
                        new EventDateTime().setDate(new DateTime(di.toString())).setDateTime(Data.NULL_DATE_TIME).setTimeZone(Data.NULL_STRING),
                        new EventDateTime().setDate(new DateTime(df.toString())).setDateTime(Data.NULL_DATE_TIME).setTimeZone(Data.NULL_STRING)};
            }
            OffsetDateTime oi = orario(inizio, fuso);
            OffsetDateTime of = orario(fine, fuso);
            if (!of.isAfter(oi)) {
                throw new IllegalArgumentException("La fine deve essere dopo l'inizio.");
            }
            return new EventDateTime[]{
                    new EventDateTime().setDateTime(rfc3339(oi)).setDate(Data.NULL_DATE_TIME).setTimeZone(fuso),
                    new EventDateTime().setDateTime(rfc3339(of)).setDate(Data.NULL_DATE_TIME).setTimeZone(fuso)};
        } catch (java.time.format.DateTimeParseException ex) {
            throw new IllegalArgumentException("Data o ora non valida.", ex);
        }
    }

    /** Sempre con i secondi: OffsetDateTime.toString() li omette quando sono zero e il parser di Google li vuole. */
    private static DateTime rfc3339(OffsetDateTime t) {
        return new DateTime(t.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
    }

    /** ISO con offset; una data sola vale come mezzanotte nel fuso dell'evento. */
    private static OffsetDateTime orario(String s, String fuso) {
        if (s.length() <= 10) {
            return LocalDate.parse(s).atStartOfDay(ZoneId.of(fuso)).toOffsetDateTime();
        }
        return OffsetDateTime.parse(s);
    }

    /**
     * "Tutti gli eventi": la nuova ora dell'occorrenza diventa uno spostamento della serie (stesso scarto e nuova
     * durata), altrimenti la serie partirebbe dal giorno dell'occorrenza trascinata.
     */
    static AgendaDto.EventoRequest spostaSullaSerie(AgendaDto.EventoRequest req, Event occorrenza, Event serie) {
        if (req.inizio() == null && req.fine() == null) {
            return req;
        }
        String inizioOcc = rfc(occorrenza.getOriginalStartTime() != null ? occorrenza.getOriginalStartTime() : occorrenza.getStart());
        String inizioSerie = rfc(serie.getStart());
        String nuovoInizio = req.inizio() != null ? req.inizio() : rfc(occorrenza.getStart());
        String nuovaFine = req.fine() != null ? req.fine() : rfc(occorrenza.getEnd());
        boolean tuttoIlGiorno = req.tuttoIlGiorno() != null ? req.tuttoIlGiorno() : serie.getStart().getDate() != null;
        String inizio;
        String fine;
        if (tuttoIlGiorno) {
            LocalDate occ = LocalDate.parse(inizioOcc.substring(0, 10));
            LocalDate ni = LocalDate.parse(nuovoInizio.substring(0, 10));
            LocalDate nf = LocalDate.parse(nuovaFine.substring(0, 10));
            LocalDate si = LocalDate.parse(inizioSerie.substring(0, 10)).plusDays(ChronoUnit.DAYS.between(occ, ni));
            inizio = si.toString();
            fine = si.plusDays(Math.max(1, ChronoUnit.DAYS.between(ni, nf))).toString();
        } else {
            OffsetDateTime occ = orario(inizioOcc, ROMA.getId());
            OffsetDateTime ni = orario(nuovoInizio, ROMA.getId());
            OffsetDateTime nf = orario(nuovaFine, ROMA.getId());
            String fusoSerie = serie.getStart().getTimeZone() != null ? serie.getStart().getTimeZone() : ROMA.getId();
            // Lo scarto si misura sull'ora locale: così la serie non "salta" di un'ora a cavallo dell'ora legale.
            java.time.ZonedDateTime base = orario(inizioSerie, fusoSerie).atZoneSameInstant(ZoneId.of(fusoSerie));
            Duration scarto = Duration.between(occ.atZoneSameInstant(ZoneId.of(fusoSerie)).toLocalDateTime(),
                    ni.atZoneSameInstant(ZoneId.of(fusoSerie)).toLocalDateTime());
            java.time.ZonedDateTime si = base.toLocalDateTime().plus(scarto).atZone(ZoneId.of(fusoSerie));
            inizio = si.toOffsetDateTime().toString();
            fine = si.plus(Duration.between(ni, nf)).toOffsetDateTime().toString();
        }
        return new AgendaDto.EventoRequest(req.titolo(), req.descrizione(), req.luogo(), inizio, fine, req.tuttoIlGiorno(),
                req.fusoOrario(), req.colorId(), req.partecipanti(), req.conMeet(), req.promemoriaPredefiniti(), req.promemoria(),
                req.ricorrenza(), req.trasparenza(), req.visibilita(), req.tipo(), req.ospitiPossonoModificare(),
                req.ospitiPossonoInvitare(), req.ospitiVedonoAltri());
    }

    private static boolean primaOccorrenza(Event occorrenza, Event serie) {
        EventDateTime originale = occorrenza.getOriginalStartTime() != null ? occorrenza.getOriginalStartTime() : occorrenza.getStart();
        return istanteDi(originale) <= istanteDi(serie.getStart());
    }

    /** Chiude la serie prima dell'occorrenza: le regole RRULE ricevono UNTIL (e perdono COUNT). */
    private void tronca(String cal, Event serie, Event occorrenza, boolean notifica) {
        EventDateTime originale = occorrenza.getOriginalStartTime() != null ? occorrenza.getOriginalStartTime() : occorrenza.getStart();
        String until = originale.getDate() != null
                ? UNTIL_DATA.format(LocalDate.parse(originale.getDate().toStringRfc3339()).minusDays(1))
                : UNTIL_ORARIO.format(Instant.ofEpochMilli(originale.getDateTime().getValue() - 1_000));
        List<String> regole = (serie.getRecurrence() == null ? List.<String>of() : serie.getRecurrence()).stream()
                .map(r -> r.startsWith("RRULE:") ? conUntil(r, until) : r)
                .toList();
        Event patch = new Event().setRecurrence(regole);
        con(c -> c.events().patch(cal, serie.getId(), patch).setSendUpdates(notifica ? "all" : "none").execute());
    }

    static String conUntil(String rrule, String until) {
        String corpo = rrule.substring("RRULE:".length());
        String parti = java.util.Arrays.stream(corpo.split(";"))
                .filter(p -> !p.startsWith("UNTIL=") && !p.startsWith("COUNT="))
                .collect(Collectors.joining(";"));
        return "RRULE:" + parti + ";UNTIL=" + until;
    }

    /** Nuova serie che riparte dall'occorrenza, con le stesse regole (senza COUNT: la vecchia serie ne ha consumate). */
    private static Event copiaSerie(Event serie, Event occorrenza, List<String> regoleOriginali) {
        Event nuova = new Event()
                .setSummary(serie.getSummary())
                .setDescription(serie.getDescription())
                .setLocation(serie.getLocation())
                .setColorId(serie.getColorId())
                .setAttendees(serie.getAttendees() == null ? null : serie.getAttendees().stream()
                        .map(p -> new EventAttendee().setEmail(p.getEmail()).setOptional(p.getOptional())
                                .setResponseStatus(Boolean.TRUE.equals(p.getSelf()) ? p.getResponseStatus() : null))
                        .toList())
                .setReminders(serie.getReminders())
                .setTransparency(serie.getTransparency())
                .setVisibility(serie.getVisibility())
                .setGuestsCanModify(serie.getGuestsCanModify())
                .setGuestsCanInviteOthers(serie.getGuestsCanInviteOthers())
                .setGuestsCanSeeOtherGuests(serie.getGuestsCanSeeOtherGuests())
                .setStart(copia(occorrenza.getStart(), serie.getStart()))
                .setEnd(copia(occorrenza.getEnd(), serie.getEnd()))
                .setRecurrence(regoleOriginali == null ? null : regoleOriginali.stream()
                        .map(r -> r.startsWith("RRULE:") ? senzaCount(r) : r)
                        .toList());
        if (serie.getConferenceData() != null && serie.getConferenceData().getConferenceId() != null) {
            nuova.setConferenceData(new ConferenceData()
                    .setConferenceId(serie.getConferenceData().getConferenceId())
                    .setConferenceSolution(serie.getConferenceData().getConferenceSolution())
                    .setEntryPoints(serie.getConferenceData().getEntryPoints()));
        }
        return nuova;
    }

    private static EventDateTime copia(EventDateTime occorrenza, EventDateTime serie) {
        EventDateTime out = new EventDateTime();
        if (occorrenza.getDate() != null) {
            return out.setDate(occorrenza.getDate());
        }
        return out.setDateTime(occorrenza.getDateTime())
                .setTimeZone(serie.getTimeZone() != null ? serie.getTimeZone() : ROMA.getId());
    }

    private static String senzaCount(String rrule) {
        return "RRULE:" + java.util.Arrays.stream(rrule.substring("RRULE:".length()).split(";"))
                .filter(p -> !p.startsWith("COUNT="))
                .collect(Collectors.joining(";"));
    }

    private static String fusoDi(AgendaDto.EventoRequest req) {
        if (req.fusoOrario() != null && !req.fusoOrario().isBlank()) {
            try {
                return ZoneId.of(req.fusoOrario()).getId();
            } catch (Exception ignorata) {
                // fuso non valido: si usa quello di Roma
            }
        }
        return ROMA.getId();
    }

    private String ruoloCalendario(String cal) {
        try {
            return con(c -> c.calendarList().get(cal).setFields("accessRole").execute()).getAccessRole();
        } catch (GoogleRifiutoException e) {
            return null;
        }
    }

    private AgendaDto.Evento mappa(Event e, String calendarioId, String ruolo, String io, Collegamenti utenti, List<String> ricorrenza) {
        boolean tuttoIlGiorno = e.getStart() != null && e.getStart().getDate() != null;
        AgendaDto.Persona organizzatore = e.getOrganizer() == null ? null : new AgendaDto.Persona(
                normalizza(e.getOrganizer().getEmail()),
                e.getOrganizer().getDisplayName(),
                null, true,
                Boolean.TRUE.equals(e.getOrganizer().getSelf()),
                false, false, null,
                utenti.pazienti().get(normalizza(e.getOrganizer().getEmail())));
        List<AgendaDto.Persona> partecipanti = e.getAttendees() == null ? List.of() : e.getAttendees().stream()
                .map(p -> new AgendaDto.Persona(
                        normalizza(p.getEmail()),
                        p.getDisplayName(),
                        p.getResponseStatus(),
                        Boolean.TRUE.equals(p.getOrganizer()),
                        Boolean.TRUE.equals(p.getSelf()) || io.equalsIgnoreCase(p.getEmail()),
                        Boolean.TRUE.equals(p.getOptional()),
                        Boolean.TRUE.equals(p.getResource()),
                        p.getComment(),
                        utenti.pazienti().get(normalizza(p.getEmail()))))
                .toList();
        String miaRisposta = partecipanti.stream().filter(AgendaDto.Persona::io).map(AgendaDto.Persona::risposta).findFirst().orElse(null);
        String meet = e.getHangoutLink();
        if (meet == null && e.getConferenceData() != null && e.getConferenceData().getEntryPoints() != null) {
            meet = e.getConferenceData().getEntryPoints().stream().filter(p -> "video".equals(p.getEntryPointType()))
                    .map(EntryPoint::getUri).findFirst().orElse(null);
        }
        String tipo = e.getEventType() == null ? "default" : e.getEventType();
        boolean scrivibile = "owner".equals(ruolo) || "writer".equals(ruolo);
        boolean organizzo = e.getOrganizer() == null || Boolean.TRUE.equals(e.getOrganizer().getSelf())
                || normalizza(e.getOrganizer().getEmail()).equals(normalizza(calendarioId.equals(PRINCIPALE) ? io : calendarioId));
        boolean modificabile = scrivibile && !Set.of("birthday", "fromGmail").contains(tipo)
                && (organizzo || Boolean.TRUE.equals(e.getGuestsCanModify()))
                && !Boolean.TRUE.equals(e.getLocked());
        Event.Reminders r = e.getReminders();
        Visita visita = utenti.visite().get(e.getId());
        return new AgendaDto.Evento(
                e.getId(),
                calendarioId,
                e.getSummary(),
                e.getDescription(),
                e.getLocation(),
                rfc(e.getStart()),
                rfc(e.getEnd()),
                tuttoIlGiorno,
                e.getColorId(),
                e.getStatus(),
                e.getTransparency() == null ? "opaque" : e.getTransparency(),
                e.getVisibility() == null ? "default" : e.getVisibility(),
                tipo,
                e.getRecurringEventId(),
                ricorrenza,
                organizzatore,
                partecipanti,
                miaRisposta,
                meet,
                e.getHtmlLink(),
                r == null || Boolean.TRUE.equals(r.getUseDefault()),
                r == null || r.getOverrides() == null ? List.of() : r.getOverrides().stream()
                        .map(o -> new AgendaDto.Promemoria(o.getMethod(), o.getMinutes() == null ? 0 : o.getMinutes())).toList(),
                e.getAttachments() == null ? List.of() : e.getAttachments().stream()
                        .map((EventAttachment a) -> new AgendaDto.Allegato(a.getTitle(), a.getFileUrl(), a.getIconLink(), a.getMimeType())).toList(),
                modificabile,
                Boolean.TRUE.equals(e.getGuestsCanModify()),
                e.getGuestsCanInviteOthers() == null || e.getGuestsCanInviteOthers(),
                e.getGuestsCanSeeOtherGuests() == null || e.getGuestsCanSeeOtherGuests(),
                e.getUpdated() == null ? null : e.getUpdated().getValue(),
                visita == null ? null : visita.getId(),
                visita == null ? null : visita.getPaziente().getId(),
                visita == null ? null : visita.getPaziente().getNomeCompleto());
    }

    /** Pazienti per email e visite per id dell'evento Google, per collegare gli eventi al gestionale. */
    private record Collegamenti(Map<String, Long> pazienti, Map<String, Visita> visite) {
    }

    private Collegamenti collegamenti(Collection<Event> eventi) {
        Set<String> indirizzi = new HashSet<>();
        for (Event e : eventi) {
            if (e.getOrganizer() != null && e.getOrganizer().getEmail() != null) {
                indirizzi.add(normalizza(e.getOrganizer().getEmail()));
            }
            if (e.getAttendees() != null) {
                e.getAttendees().forEach(p -> {
                    if (p.getEmail() != null) {
                        indirizzi.add(normalizza(p.getEmail()));
                    }
                });
            }
        }
        Map<String, Long> pazienti = new java.util.HashMap<>();
        if (!indirizzi.isEmpty()) {
            pazienteRepository.findConEmailIn(indirizzi).forEach(p -> pazienti.putIfAbsent(normalizza(p.getEmail()), p.getId()));
        }
        Set<String> ids = eventi.stream().map(Event::getId).collect(Collectors.toSet());
        Map<String, Visita> visite = ids.isEmpty() ? Map.of() : visitaRepository.findByGoogleEventIdIn(ids).stream()
                .collect(Collectors.toMap(Visita::getGoogleEventId, v -> v, (a, b) -> a));
        return new Collegamenti(pazienti, visite);
    }

    private static List<String> idsCalendari(List<String> calendarIds) {
        List<String> ids = calendarIds == null ? List.of() : calendarIds.stream()
                .filter(s -> s != null && !s.isBlank()).map(String::trim).distinct().limit(MAX_CALENDARI).toList();
        return ids.isEmpty() ? List.of(PRINCIPALE) : ids;
    }

    private static String calendario(String id) {
        return id == null || id.isBlank() ? PRINCIPALE : id.trim();
    }

    private static DateTime istante(String s, String campo) {
        if (s == null || s.isBlank()) {
            throw new IllegalArgumentException("Parametro '" + campo + "' mancante.");
        }
        try {
            return new DateTime(OffsetDateTime.parse(s.trim()).toInstant().toEpochMilli());
        } catch (java.time.format.DateTimeParseException e) {
            throw new IllegalArgumentException("Parametro '" + campo + "' non valido.", e);
        }
    }

    private static String rfc(EventDateTime d) {
        if (d == null) {
            return null;
        }
        if (d.getDate() != null) {
            return d.getDate().toStringRfc3339();
        }
        return d.getDateTime() == null ? null : d.getDateTime().toStringRfc3339();
    }

    private static long istanteDi(EventDateTime d) {
        if (d == null) {
            return 0;
        }
        if (d.getDate() != null) {
            return LocalDate.parse(d.getDate().toStringRfc3339()).atStartOfDay(ROMA).toInstant().toEpochMilli();
        }
        return d.getDateTime() == null ? 0 : d.getDateTime().getValue();
    }

    private static long inizioMs(AgendaDto.Evento ev) {
        if (ev.inizio() == null) {
            return 0;
        }
        try {
            return ev.tuttoIlGiorno()
                    ? LocalDate.parse(ev.inizio()).atStartOfDay(ROMA).toInstant().toEpochMilli()
                    : OffsetDateTime.parse(ev.inizio()).toInstant().toEpochMilli();
        } catch (Exception e) {
            return 0;
        }
    }

    private static String normalizza(String s) {
        return s == null ? "" : s.trim().toLowerCase(Locale.ROOT);
    }
}
