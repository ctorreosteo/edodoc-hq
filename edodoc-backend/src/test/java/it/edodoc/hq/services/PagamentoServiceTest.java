package it.edodoc.hq.services;

import it.edodoc.hq.dto.PagamentiDto;
import it.edodoc.hq.models.Fattura;
import it.edodoc.hq.models.Pagamento;
import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.repositories.FatturaRepository;
import it.edodoc.hq.repositories.PagamentoRepository;
import it.edodoc.hq.repositories.PazienteRepository;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PagamentoServiceTest {

    private final PagamentoRepository pagamenti = mock(PagamentoRepository.class);
    private final FatturaRepository fatture = mock(FatturaRepository.class);
    private final PagamentoService service = new PagamentoService(pagamenti, mock(PazienteRepository.class), fatture);

    private Pagamento pagamento(long id) {
        Paziente paziente = new Paziente();
        paziente.setId(7L);
        paziente.setNome("Anna");
        paziente.setCognome("Rossi");
        Pagamento p = new Pagamento();
        p.setId(id);
        p.setPaziente(paziente);
        p.setTipo(Pagamento.Tipo.RATA);
        p.setDescrizione("Rata");
        p.setImporto(new BigDecimal("700"));
        p.setScadenza(LocalDate.now());
        p.setStato(Pagamento.Stato.PAGATO);
        return p;
    }

    private Fattura fattura(long id, Pagamento pagamento, Fattura.Stato stato) {
        Fattura f = new Fattura();
        f.setId(id);
        f.setPagamento(pagamento);
        f.setStato(stato);
        return f;
    }

    @Test
    void app_collegaSoloLaFatturaValida() {
        Pagamento fatturato = pagamento(1);
        Pagamento annullato = pagamento(2);
        when(pagamenti.findDelPaziente(7L)).thenReturn(List.of(fatturato, annullato));
        when(fatture.findPagamentiFatturati(any())).thenReturn(List.of(1L));
        when(fatture.findDelPaziente(7L)).thenReturn(List.of(
                fattura(10, fatturato, Fattura.Stato.EMESSA),
                fattura(11, annullato, Fattura.Stato.ANNULLATA)));

        PagamentiDto.AppLista lista = service.delPazienteApp(7L);

        assertThat(lista.righe()).extracting(PagamentiDto.AppPagamento::fatturaId).containsExactly(10L, null);
        assertThat(lista.riepilogo().pagato()).isEqualByComparingTo("1400");
    }
}
