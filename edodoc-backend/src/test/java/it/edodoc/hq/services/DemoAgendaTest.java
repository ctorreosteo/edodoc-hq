package it.edodoc.hq.services;

import it.edodoc.hq.dto.AgendaDto;
import it.edodoc.hq.repositories.VisitaRepository;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class DemoAgendaTest {

    private final DemoAgenda agenda = new DemoAgenda(Mockito.mock(VisitaRepository.class));
    private final LocalDate lunedi = LocalDate.now().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
    private final String da = lunedi + "T00:00:00+01:00";
    private final String a = lunedi.plusDays(7) + "T00:00:00+01:00";

    private static AgendaDto.EventoRequest titolo(String titolo, String inizio, String fine) {
        return new AgendaDto.EventoRequest(titolo, null, null, inizio, fine, false, null, null, null, null, null, null, null, null, null, null, null, null, null);
    }

    @Test
    void creaSpostaEdElimina_siVedonoNegliEventi() {
        long dal = System.currentTimeMillis() - 1;
        AgendaDto.Evento nuovo = agenda.crea(AgendaFonte.PRINCIPALE,
                titolo("Prova", lunedi + "T10:00:00+01:00", lunedi + "T11:00:00+01:00"), false);
        assertThat(agenda.novita(List.of(), dal).cambiato()).isTrue();
        assertThat(agenda.eventi(List.of(AgendaFonte.PRINCIPALE), da, a).eventi()).anyMatch(e -> e.id().equals(nuovo.id()));

        agenda.modifica(AgendaFonte.PRINCIPALE, nuovo.id(), titolo("Rinominato", null, null), AgendaFonte.Ambito.QUESTO, false);
        assertThat(agenda.evento(AgendaFonte.PRINCIPALE, nuovo.id()).titolo()).isEqualTo("Rinominato");

        agenda.elimina(AgendaFonte.PRINCIPALE, nuovo.id(), AgendaFonte.Ambito.QUESTO, false);
        assertThat(agenda.eventi(List.of(AgendaFonte.PRINCIPALE), da, a).eventi()).noneMatch(e -> e.id().equals(nuovo.id()));
    }

    @Test
    void eventi_filtraPerCalendario() {
        assertThat(agenda.eventi(List.of("personale@demo"), da, a).eventi())
                .isNotEmpty().allMatch(e -> e.calendarioId().equals("personale@demo"));
    }
}
