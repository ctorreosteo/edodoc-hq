package it.edodoc.hq.services;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class FatturaCalcoloTest {

    private static final BigDecimal ALIQUOTA = new BigDecimal("0.04");
    private static final BigDecimal SOGLIA = new BigDecimal("77.47");
    private static final BigDecimal BOLLO = new BigDecimal("2");

    private static FatturaCalcolo.Importi calcola(String prezzo, boolean bolloDentro) {
        return FatturaCalcolo.calcola(new BigDecimal(prezzo), ALIQUOTA, SOGLIA, BOLLO, bolloDentro);
    }

    @Test
    void esempioDelDocumento_600Euro() {
        FatturaCalcolo.Importi importi = calcola("600", false);
        assertThat(importi.imponibile()).isEqualByComparingTo("576.92");
        assertThat(importi.contributo()).isEqualByComparingTo("23.08");
        assertThat(importi.bollo()).isEqualByComparingTo("2");
        assertThat(importi.totale()).isEqualByComparingTo("602");
    }

    @Test
    void bolloDentroIlPrezzo_ilTotaleResta600() {
        FatturaCalcolo.Importi importi = calcola("600", true);
        assertThat(importi.imponibile()).isEqualByComparingTo("575");
        assertThat(importi.contributo()).isEqualByComparingTo("23");
        assertThat(importi.totale()).isEqualByComparingTo("600");
    }

    @Test
    void acconto50Euro_senzaBollo() {
        FatturaCalcolo.Importi importi = calcola("50", false);
        assertThat(importi.imponibile()).isEqualByComparingTo("48.08");
        assertThat(importi.contributo()).isEqualByComparingTo("1.92");
        assertThat(importi.bollo()).isEqualByComparingTo("0");
        assertThat(importi.totale()).isEqualByComparingTo("50");
    }

    @Test
    void sogliaEsatta_nonApplicaIlBollo() {
        assertThat(calcola("77.47", false).bollo()).isEqualByComparingTo("0");
        assertThat(calcola("77.48", false).bollo()).isEqualByComparingTo("2");
    }

    @Test
    void imponibilePiuContributo_tornaSempreAlPrezzoAlCentesimo() {
        for (int centesimi = 100; centesimi < 200_000; centesimi += 137) {
            BigDecimal prezzo = BigDecimal.valueOf(centesimi, 2);
            FatturaCalcolo.Importi importi = FatturaCalcolo.calcola(prezzo, ALIQUOTA, SOGLIA, BOLLO, false);
            assertThat(importi.imponibile().add(importi.contributo())).isEqualByComparingTo(prezzo);
        }
    }
}
