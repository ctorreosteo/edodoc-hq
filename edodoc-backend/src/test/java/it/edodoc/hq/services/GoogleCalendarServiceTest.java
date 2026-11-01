package it.edodoc.hq.services;

import com.google.api.client.util.Data;
import com.google.api.services.calendar.model.Event;
import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.models.Percorso;
import it.edodoc.hq.models.Visita;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class GoogleCalendarServiceTest {

    private static Visita visita() {
        Paziente paziente = new Paziente();
        paziente.setNome("Giulia");
        paziente.setCognome("Ferrari");
        paziente.setEmail("giulia@esempio.it");
        Percorso percorso = new Percorso();
        percorso.setVisiteTotali(6);
        Visita visita = new Visita();
        visita.setId(7L);
        visita.setPaziente(paziente);
        visita.setPercorso(percorso);
        visita.setNumeroVisita(5);
        visita.setTipo(Visita.Tipo.CONTROLLO);
        visita.setModalita(Visita.Modalita.ONLINE);
        visita.setInizio(LocalDateTime.of(2026, 11, 3, 15, 30));
        visita.setFine(LocalDateTime.of(2026, 11, 3, 16, 0));
        visita.setConMeet(true);
        return visita;
    }

    @Test
    void evento_seguelaConvenzioneDelTitoloEInvitaIlPaziente() {
        Event evento = GoogleCalendarService.evento(visita(), "Milano");
        assertThat(evento.getSummary()).isEqualTo("Dottor Bo - Giulia Ferrari (5 su 6)");
        assertThat(evento.getAttendees()).hasSize(1);
        assertThat(evento.getAttendees().get(0).getEmail()).isEqualTo("giulia@esempio.it");
        assertThat(evento.getStart().getTimeZone()).isEqualTo("Europe/Rome");
        assertThat(evento.getLocation()).isNull();
    }

    @Test
    void orario_restaQuelloItalianoAndataERitorno() {
        Visita visita = visita();
        Event evento = GoogleCalendarService.evento(visita, "Milano");
        assertThat(GoogleCalendarService.locale(evento.getStart())).isEqualTo(visita.getInizio());
    }

    @Test
    void meet_siChiedeUnaVoltaSola() {
        Visita visita = visita();
        Event nuovo = GoogleCalendarService.evento(visita, "Milano");
        assertThat(nuovo.getConferenceData().getCreateRequest().getConferenceSolutionKey().getType()).isEqualTo("hangoutsMeet");

        visita.setMeetUrl("https://meet.google.com/abc");
        assertThat(GoogleCalendarService.evento(visita, "Milano").getConferenceData()).isNull();
    }

    @Test
    void meetRimosso_azzeraLaConferenzaSuGoogle() {
        Visita visita = visita();
        visita.setMeetUrl("https://meet.google.com/abc");
        visita.setConMeet(false);
        assertThat(Data.isNull(GoogleCalendarService.evento(visita, "Milano").getConferenceData())).isTrue();
    }

    @Test
    void senzaInvito_nessunPartecipante_eDalVivoHaIlLuogo() {
        Visita visita = visita();
        visita.setInvitaPaziente(false);
        visita.setConMeet(false);
        visita.setModalita(Visita.Modalita.PRESENZA);
        Event evento = GoogleCalendarService.evento(visita, "Milano");
        assertThat(evento.getAttendees()).isNull();
        assertThat(evento.getLocation()).isEqualTo("Milano");
    }
}
