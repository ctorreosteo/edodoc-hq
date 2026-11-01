package it.edodoc.hq.services;

import com.google.api.client.googleapis.json.GoogleJsonResponseException;
import com.google.api.client.util.Data;
import com.google.api.client.util.DateTime;
import com.google.api.services.calendar.Calendar;
import com.google.api.services.calendar.model.ConferenceData;
import com.google.api.services.calendar.model.ConferenceSolutionKey;
import com.google.api.services.calendar.model.CreateConferenceRequest;
import com.google.api.services.calendar.model.Event;
import com.google.api.services.calendar.model.EventAttendee;
import com.google.api.services.calendar.model.EventDateTime;
import com.google.api.services.calendar.model.Events;
import it.edodoc.hq.models.Visita;
import it.edodoc.hq.repositories.VisitaRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

/**
 * Ponte tra visite e Google Calendar. Ogni modifica segna la visita DA_SINCRONIZZARE: il tentativo
 * parte subito dopo il commit e il job riprova ciò che è rimasto indietro. A integrazione spenta le
 * visite restano in attesa, così all'accensione quelle future vengono pubblicate da sole.
 */
@Service
public class GoogleCalendarService {

    private static final Logger logger = LoggerFactory.getLogger(GoogleCalendarService.class);
    private static final ZoneId ZONA = ZoneId.of("Europe/Rome");
    private static final String FUSO = "Europe/Rome";

    private final VisitaRepository visitaRepository;
    private final VisitaService visitaService;
    private final GoogleClients googleClients;
    private final ConfigService configService;

    public GoogleCalendarService(VisitaRepository visitaRepository, VisitaService visitaService,
                                 GoogleClients googleClients, ConfigService configService) {
        this.visitaRepository = visitaRepository;
        this.visitaService = visitaService;
        this.googleClients = googleClients;
        this.configService = configService;
    }

    public boolean isAttivo() {
        return configService.isAttivo(ConfigService.CALENDAR_ENABLED) && googleClients.isConfigurato();
    }

    /** Evento da scrivere su Google. Il link Meet si chiede una volta sola: poi resta quello dell'evento. */
    static Event evento(Visita v, String luogoPresenza) {
        Event evento = new Event()
                .setSummary(VisitaService.titoloCalendario(v))
                .setDescription(v.getNote())
                .setStart(dataOra(v.getInizio()))
                .setEnd(dataOra(v.getFine()))
                .setLocation(v.getModalita() == Visita.Modalita.PRESENZA ? luogoPresenza : null);
        String email = v.getPaziente().getEmail();
        if (Boolean.TRUE.equals(v.getInvitaPaziente()) && email != null && !email.isBlank()) {
            evento.setAttendees(List.of(new EventAttendee().setEmail(email.trim())
                    .setDisplayName(v.getPaziente().getNomeCompleto())));
        }
        if (Boolean.TRUE.equals(v.getConMeet())) {
            if (v.getMeetUrl() == null) {
                evento.setConferenceData(new ConferenceData().setCreateRequest(new CreateConferenceRequest()
                        .setRequestId("edodoc-visita-" + v.getId())
                        .setConferenceSolutionKey(new ConferenceSolutionKey().setType("hangoutsMeet"))));
            }
        } else if (v.getMeetUrl() != null) {
            evento.setConferenceData(Data.nullOf(ConferenceData.class));
        }
        return evento;
    }

    private static EventDateTime dataOra(LocalDateTime valore) {
        return new EventDateTime()
                .setDateTime(new DateTime(valore.atZone(ZONA).toInstant().toEpochMilli()))
                .setTimeZone(FUSO);
    }

    static LocalDateTime locale(EventDateTime valore) {
        return Instant.ofEpochMilli(valore.getDateTime().getValue()).atZone(ZONA).toLocalDateTime();
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void dopoLaModifica(VisitaService.VisitaDaSincronizzare evento) {
        if (isAttivo()) {
            visitaRepository.findConDettagli(evento.visitaId()).ifPresent(this::sincronizzaESalva);
        }
    }

    @Scheduled(fixedDelayString = "PT5M", initialDelayString = "PT1M")
    public void allineaInSospeso() {
        if (!isAttivo()) {
            return;
        }
        visitaRepository.findDaSincronizzare(LocalDateTime.now().minusDays(1)).forEach(this::sincronizzaESalva);
        leggiModificheDaGoogle();
    }

    private void sincronizzaESalva(Visita visita) {
        try {
            sincronizza(visita);
            visita.setGoogleSyncStato(Visita.GoogleSync.SINCRONIZZATA);
            visita.setGoogleSyncErrore(null);
        } catch (IOException | GeneralSecurityException | RuntimeException e) {
            logger.warn("Sincronizzazione Google fallita per la visita {}: {}", visita.getId(), e.getMessage());
            visita.setGoogleSyncStato(Visita.GoogleSync.ERRORE);
            visita.setGoogleSyncErrore("Google non ha accettato la modifica: riprovo automaticamente");
        }
        visitaRepository.save(visita);
    }

    private void sincronizza(Visita visita) throws IOException, GeneralSecurityException {
        Calendar client = googleClients.calendar();
        String calendario = configService.get(ConfigService.CALENDAR_ID);
        String aggiornamenti = Boolean.TRUE.equals(visita.getInvitaPaziente()) ? "all" : "none";

        if (visita.getStato() == Visita.Stato.ANNULLATA) {
            if (visita.getGoogleEventId() != null) {
                try {
                    client.events().delete(calendario, visita.getGoogleEventId()).setSendUpdates(aggiornamenti).execute();
                } catch (GoogleJsonResponseException e) {
                    if (e.getStatusCode() != 404 && e.getStatusCode() != 410) throw e;
                }
                visita.setGoogleEventId(null);
                visita.setMeetUrl(null);
            }
            return;
        }

        Event corpo = evento(visita, configService.get("VISITA_LUOGO_PRESENZA"));
        Event risultato = null;
        if (visita.getGoogleEventId() != null) {
            try {
                risultato = client.events().patch(calendario, visita.getGoogleEventId(), corpo)
                        .setConferenceDataVersion(1).setSendUpdates(aggiornamenti).execute();
            } catch (GoogleJsonResponseException e) {
                // Evento cancellato a mano su Google: si ricrea
                if (e.getStatusCode() != 404 && e.getStatusCode() != 410) throw e;
                visita.setGoogleEventId(null);
                visita.setMeetUrl(null);
                corpo = evento(visita, configService.get("VISITA_LUOGO_PRESENZA"));
            }
        }
        if (risultato == null) {
            risultato = client.events().insert(calendario, corpo)
                    .setConferenceDataVersion(1).setSendUpdates(aggiornamenti).execute();
        }
        visita.setGoogleEventId(risultato.getId());
        visita.setMeetUrl(risultato.getHangoutLink());
    }

    /** Spostamenti e cancellazioni fatti direttamente su Google tornano sulla visita collegata. */
    private void leggiModificheDaGoogle() {
        Instant adesso = Instant.now();
        String ultimo = configService.get(ConfigService.CALENDAR_ULTIMO_SYNC).trim();
        if (ultimo.isEmpty()) {
            configService.salvaDiSistema(ConfigService.CALENDAR_ULTIMO_SYNC, adesso.toString());
            return;
        }
        try {
            Calendar client = googleClients.calendar();
            String pagina = null;
            do {
                Events eventi = client.events().list(configService.get(ConfigService.CALENDAR_ID))
                        .setUpdatedMin(new DateTime(Instant.parse(ultimo).toEpochMilli()))
                        .setShowDeleted(true).setSingleEvents(true).setPageToken(pagina).execute();
                for (Event evento : eventi.getItems()) {
                    visitaRepository.findByGoogleEventId(evento.getId()).ifPresent(v -> applica(v, evento));
                }
                pagina = eventi.getNextPageToken();
            } while (pagina != null);
            configService.salvaDiSistema(ConfigService.CALENDAR_ULTIMO_SYNC, adesso.toString());
        } catch (IOException | GeneralSecurityException | RuntimeException e) {
            logger.warn("Lettura modifiche da Google fallita: {}", e.getMessage());
        }
    }

    private void applica(Visita visita, Event evento) {
        boolean cancellato = "cancelled".equals(evento.getStatus());
        if (cancellato) {
            if (visita.getStato() != Visita.Stato.ANNULLATA) {
                visitaService.applicaModificaDaGoogle(visita.getId(), Visita.Stato.ANNULLATA, visita.getInizio(), visita.getFine(), null);
            }
            return;
        }
        if (evento.getStart() == null || evento.getStart().getDateTime() == null || evento.getEnd() == null) {
            return;
        }
        LocalDateTime inizio = locale(evento.getStart());
        LocalDateTime fine = locale(evento.getEnd());
        boolean cambiata = !inizio.equals(visita.getInizio()) || !fine.equals(visita.getFine());
        if (cambiata) {
            visitaService.applicaModificaDaGoogle(visita.getId(), visita.getStato(), inizio, fine, evento.getHangoutLink());
        }
    }
}
