package it.edodoc.hq.services;

import it.edodoc.hq.dto.PercorsiDto;
import it.edodoc.hq.models.Pagamento;
import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.models.Percorso;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class PercorsoServiceTest {

    private static final LocalDate INIZIO = LocalDate.of(2027, 1, 12);
    private static final PercorsiDto.Listino LISTINO = new PercorsiDto.Listino(new BigDecimal("1500"), new BigDecimal("700"),
            new BigDecimal("50"), new BigDecimal("600"), new BigDecimal("400"));

    private static BigDecimal totale(List<PercorsoService.Rata> rate) {
        return rate.stream().map(PercorsoService.Rata::importo).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    @Test
    void pagamentoUnico_senzaAcconto() {
        assertThat(totale(PercorsoService.calcolaRate(Percorso.Tipo.METODO_BUSSOLA, Percorso.PianoPagamento.UNICO, INIZIO, LISTINO, BigDecimal.ZERO)))
                .isEqualByComparingTo("1500");
    }

    @Test
    void acconto_siScalaDalPagamentoUnico() {
        List<PercorsoService.Rata> rate = PercorsoService.calcolaRate(Percorso.Tipo.METODO_BUSSOLA, Percorso.PianoPagamento.UNICO, INIZIO, LISTINO, new BigDecimal("50"));
        assertThat(totale(rate)).isEqualByComparingTo("1450");
    }

    @Test
    void percorsoARate_treRateDa700OgniDueMesi() {
        List<PercorsoService.Rata> rate = PercorsoService.calcolaRate(Percorso.Tipo.METODO_BUSSOLA, Percorso.PianoPagamento.RATE, INIZIO, LISTINO, BigDecimal.ZERO);
        assertThat(rate).hasSize(3);
        assertThat(rate).allSatisfy(r -> assertThat(r.importo()).isEqualByComparingTo("700"));
        assertThat(rate).extracting(PercorsoService.Rata::scadenza)
                .containsExactly(INIZIO, INIZIO.plusMonths(2), INIZIO.plusMonths(4));
        assertThat(totale(rate)).isEqualByComparingTo("2100");
    }

    @Test
    void acconto_nonRiduceLeRate() {
        List<PercorsoService.Rata> rate = PercorsoService.calcolaRate(Percorso.Tipo.METODO_BUSSOLA, Percorso.PianoPagamento.RATE, INIZIO, LISTINO, new BigDecimal("50"));
        assertThat(totale(rate)).isEqualByComparingTo("2100");
    }

    @Test
    void mantenimentoInAnticipo_600Euro() {
        List<PercorsoService.Rata> rate = PercorsoService.calcolaRate(Percorso.Tipo.MANTENIMENTO, Percorso.PianoPagamento.UNICO, INIZIO, LISTINO, BigDecimal.ZERO);
        assertThat(rate).hasSize(1);
        assertThat(totale(rate)).isEqualByComparingTo("600");
    }

    @Test
    void mantenimentoARate_dueRateDa400Semestrali() {
        List<PercorsoService.Rata> rate = PercorsoService.calcolaRate(Percorso.Tipo.MANTENIMENTO, Percorso.PianoPagamento.RATE, INIZIO, LISTINO, BigDecimal.ZERO);
        assertThat(rate).hasSize(2);
        assertThat(rate).allSatisfy(r -> assertThat(r.importo()).isEqualByComparingTo("400"));
        assertThat(rate).extracting(PercorsoService.Rata::scadenza).containsExactly(INIZIO, INIZIO.plusMonths(6));
        assertThat(totale(rate)).isEqualByComparingTo("800");
    }

    private static Pagamento pagamento(long id, String importo, LocalDate scadenza, Pagamento.Stato stato, Percorso percorso) {
        Pagamento pagamento = new Pagamento();
        pagamento.setId(id);
        pagamento.setPaziente(percorso.getPaziente());
        pagamento.setPercorso(percorso);
        pagamento.setTipo(Pagamento.Tipo.RATA);
        pagamento.setDescrizione("Rata");
        pagamento.setImporto(new BigDecimal(importo));
        pagamento.setScadenza(scadenza);
        pagamento.setStato(stato);
        return pagamento;
    }

    @Test
    void acquisto_separaPagatoDaPagareEScadutoEIndicaLaProssimaScadenza() {
        Paziente paziente = new Paziente();
        paziente.setNome("Giulia");
        paziente.setCognome("Ferrari");
        Percorso percorso = new Percorso();
        percorso.setId(1L);
        percorso.setPaziente(paziente);
        LocalDate oggi = INIZIO.plusMonths(3);
        List<Pagamento> pagamenti = List.of(
                pagamento(1, "700", INIZIO, Pagamento.Stato.PAGATO, percorso),
                pagamento(2, "700", INIZIO.plusMonths(2), Pagamento.Stato.DA_PAGARE, percorso),
                pagamento(3, "700", INIZIO.plusMonths(4), Pagamento.Stato.DA_PAGARE, percorso));

        PercorsiDto.Acquisto acquisto = PercorsoService.acquisto(percorso, null, pagamenti, Set.of(1L), oggi);

        assertThat(acquisto.pazienteNome()).isEqualTo("Giulia Ferrari");
        assertThat(acquisto.pagato()).isEqualByComparingTo("700");
        assertThat(acquisto.scaduto()).isEqualByComparingTo("700");
        assertThat(acquisto.daPagare()).isEqualByComparingTo("700");
        assertThat(acquisto.prossimaScadenza()).isEqualTo(INIZIO.plusMonths(2));
        assertThat(acquisto.pagamenti()).hasSize(3);
        assertThat(acquisto.pagamenti().get(0).fatturato()).isTrue();
    }
}
