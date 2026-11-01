package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import it.edodoc.hq.dto.PercorsiDto;
import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.models.Percorso;
import it.edodoc.hq.models.Visita;
import it.edodoc.hq.repositories.FatturaRepository;
import it.edodoc.hq.repositories.PagamentoRepository;
import it.edodoc.hq.repositories.PazienteRepository;
import it.edodoc.hq.repositories.PercorsoRepository;
import it.edodoc.hq.repositories.VisitaRepository;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PercorsoAppTest {

    private final PercorsoRepository percorsi = mock(PercorsoRepository.class);
    private final VisitaRepository visite = mock(VisitaRepository.class);
    private final PercorsoService service = new PercorsoService(percorsi, mock(PazienteRepository.class),
            mock(PagamentoRepository.class), visite, mock(ConfigService.class), mock(TaskService.class),
            mock(FatturaRepository.class));

    private final Paziente paziente = new Paziente();

    private Percorso percorso(Long id, Percorso.Stato stato) {
        paziente.setId(7L);
        Percorso percorso = new Percorso();
        percorso.setId(id);
        percorso.setPaziente(paziente);
        percorso.setTipo(Percorso.Tipo.METODO_BUSSOLA);
        percorso.setDataInizio(LocalDate.of(2026, 6, 1));
        percorso.setDataFine(LocalDate.of(2026, 12, 1));
        percorso.setVisiteTotali(6);
        percorso.setStato(stato);
        percorso.setNote("nota riservata del dottore");
        return percorso;
    }

    private Visita visita(Long id, Percorso percorso, Visita.Stato stato, LocalDateTime inizio) {
        Visita visita = new Visita();
        visita.setId(id);
        visita.setPaziente(paziente);
        visita.setPercorso(percorso);
        visita.setTipo(Visita.Tipo.CONTROLLO);
        visita.setModalita(Visita.Modalita.ONLINE);
        visita.setStato(stato);
        visita.setInizio(inizio);
        visita.setFine(inizio.plusMinutes(30));
        visita.setNote("nota riservata del dottore");
        visita.setGoogleEventId("evento-google");
        return visita;
    }

    @Test
    void percorsoInCorso_conContatoriEVisiteDallaPiuVecchia() {
        Percorso attivo = percorso(1L, Percorso.Stato.ATTIVO);
        Visita fatta = visita(10L, attivo, Visita.Stato.EFFETTUATA, LocalDateTime.of(2026, 6, 1, 10, 0));
        Visita prossima = visita(11L, attivo, Visita.Stato.PROGRAMMATA, LocalDateTime.of(2026, 12, 1, 10, 0));
        Visita fuori = visita(12L, null, Visita.Stato.ANNULLATA, LocalDateTime.of(2026, 7, 1, 10, 0));
        when(percorsi.findFirstByPazienteIdAndStatoOrderByDataInizioDesc(7L, Percorso.Stato.ATTIVO)).thenReturn(Optional.of(attivo));
        when(visite.findValideDelPercorso(1L)).thenReturn(List.of(fatta, prossima));
        when(visite.findDelPaziente(7L)).thenReturn(List.of(prossima, fuori, fatta));

        PercorsiDto.AppRiepilogo riepilogo = service.delPazienteApp(7L);

        assertThat(riepilogo.percorso().id()).isEqualTo(1L);
        assertThat(riepilogo.percorso().visiteFissate()).isEqualTo(2);
        assertThat(riepilogo.percorso().visiteEffettuate()).isEqualTo(1);
        assertThat(riepilogo.visite()).extracting("id").containsExactly(10L, 12L, 11L);
        assertThat(riepilogo.visite().get(0).visiteTotali()).isEqualTo(6);
        assertThat(riepilogo.visite().get(1).visiteTotali()).isNull();
    }

    @Test
    void senzaPercorsoInCorso_ilPiuRecente() {
        when(percorsi.findFirstByPazienteIdAndStatoOrderByDataInizioDesc(7L, Percorso.Stato.ATTIVO)).thenReturn(Optional.empty());
        when(percorsi.findByPazienteIdOrderByDataInizioDesc(7L)).thenReturn(List.of(percorso(2L, Percorso.Stato.CONCLUSO)));

        assertThat(service.delPazienteApp(7L).percorso().stato()).isEqualTo(Percorso.Stato.CONCLUSO);
    }

    @Test
    void senzaPercorsi_null() {
        when(percorsi.findFirstByPazienteIdAndStatoOrderByDataInizioDesc(7L, Percorso.Stato.ATTIVO)).thenReturn(Optional.empty());
        when(percorsi.findByPazienteIdOrderByDataInizioDesc(7L)).thenReturn(List.of());

        PercorsiDto.AppRiepilogo riepilogo = service.delPazienteApp(7L);

        assertThat(riepilogo.percorso()).isNull();
        assertThat(riepilogo.visite()).isEmpty();
    }

    @Test
    void ilJson_nonContieneNoteNeDatiGoogleNeImporti() throws Exception {
        Percorso attivo = percorso(1L, Percorso.Stato.ATTIVO);
        when(percorsi.findFirstByPazienteIdAndStatoOrderByDataInizioDesc(7L, Percorso.Stato.ATTIVO)).thenReturn(Optional.of(attivo));
        when(visite.findDelPaziente(7L)).thenReturn(List.of(visita(10L, attivo, Visita.Stato.PROGRAMMATA, LocalDateTime.of(2026, 6, 1, 10, 0))));

        String json = new ObjectMapper().registerModule(new JavaTimeModule()).writeValueAsString(service.delPazienteApp(7L));

        assertThat(json).doesNotContainIgnoringCase("note").doesNotContainIgnoringCase("google").doesNotContain("importo");
    }
}
