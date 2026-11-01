package it.edodoc.hq.services;

import it.edodoc.hq.exception.RisorsaNonTrovataException;
import it.edodoc.hq.models.Fattura;
import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.repositories.ConfigRepository;
import it.edodoc.hq.repositories.FatturaRepository;
import it.edodoc.hq.repositories.PagamentoRepository;
import it.edodoc.hq.repositories.PazienteRepository;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class FatturaServiceTest {

    private final FatturaRepository fatture = mock(FatturaRepository.class);
    private final FatturaPdfService pdf = mock(FatturaPdfService.class);
    private final FatturaService service = new FatturaService(fatture, mock(PagamentoRepository.class),
            mock(PazienteRepository.class), mock(ConfigRepository.class), mock(ConfigService.class), pdf);

    private Fattura fattura(Fattura.Stato stato) {
        Paziente paziente = new Paziente();
        paziente.setId(7L);
        paziente.setCognome("Rossi");
        Fattura f = new Fattura();
        f.setId(1L);
        f.setNumero(442);
        f.setPaziente(paziente);
        f.setStato(stato);
        return f;
    }

    @Test
    void app_laFatturaAnnullataNonCompare() {
        when(fatture.findDelPaziente(7L)).thenReturn(List.of(fattura(Fattura.Stato.ANNULLATA), fattura(Fattura.Stato.EMESSA)));
        assertThat(service.delPazienteApp(7L)).hasSize(1);
    }

    @Test
    void pdfApp_ilPazienteScaricaLaSua() throws IOException {
        Fattura fattura = fattura(Fattura.Stato.EMESSA);
        when(fatture.findConDettagli(1L)).thenReturn(Optional.of(fattura));
        when(pdf.genera(any())).thenReturn(new byte[]{1});

        assertThat(service.pdfApp(7L, 1L).nomeFile()).isEqualTo("442_Rossi.pdf");
        verify(pdf).genera(fattura);
    }

    @Test
    void pdfApp_nonDiUnAltroPaziente() {
        when(fatture.findConDettagli(1L)).thenReturn(Optional.of(fattura(Fattura.Stato.EMESSA)));
        assertThatThrownBy(() -> service.pdfApp(8L, 1L)).isInstanceOf(RisorsaNonTrovataException.class);
        verifyNoInteractions(pdf);
    }

    @Test
    void pdfApp_nonSeAnnullata() {
        when(fatture.findConDettagli(1L)).thenReturn(Optional.of(fattura(Fattura.Stato.ANNULLATA)));
        assertThatThrownBy(() -> service.pdfApp(7L, 1L)).isInstanceOf(RisorsaNonTrovataException.class);
        verifyNoInteractions(pdf);
    }
}
