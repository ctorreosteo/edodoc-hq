package it.edodoc.hq.services;

import it.edodoc.hq.exception.ConflittoException;
import it.edodoc.hq.models.CheckSettimanale;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CheckServiceTest {

    private static final LocalDate LUNEDI = LocalDate.of(2026, 11, 2);

    @Test
    void settimana_ilFineSettimanaRispondeAlLunediInArrivo() {
        assertThat(CheckService.settimanaDi(LocalDate.of(2026, 10, 31))).isEqualTo(LUNEDI); // sabato
        assertThat(CheckService.settimanaDi(LocalDate.of(2026, 11, 1))).isEqualTo(LUNEDI);  // domenica
        assertThat(CheckService.settimanaDi(LUNEDI)).isEqualTo(LUNEDI);
        assertThat(CheckService.settimanaDi(LocalDate.of(2026, 11, 6))).isEqualTo(LUNEDI);  // venerdì
    }

    private static CheckSettimanale check(String peso, Boolean migliorata, Integer energia) {
        CheckSettimanale check = new CheckSettimanale();
        check.setPesoKg(peso != null ? new BigDecimal(peso) : null);
        check.setPercezioneMigliorata(migliorata);
        check.setEnergia(energia);
        return check;
    }

    @Test
    void pesoFermo_quandoNonScende() {
        CheckSettimanale uguale = check("80.0", true, 4);
        CheckService.calcolaSegnali(uguale, new BigDecimal("80.00"), 2);
        assertThat(uguale.getPesoFermo()).isTrue();

        CheckSettimanale sceso = check("79.9", true, 4);
        CheckService.calcolaSegnali(sceso, new BigDecimal("80.00"), 2);
        assertThat(sceso.haSegnali()).isFalse();
    }

    @Test
    void primoCheck_senzaPesoPrecedente_nonEUnSegnale() {
        CheckSettimanale primo = check("80.0", true, 4);
        CheckService.calcolaSegnali(primo, null, 2);
        assertThat(primo.getPesoFermo()).isFalse();
    }

    @Test
    void percezioneNonDichiarata_nonEUnSegnale() {
        CheckSettimanale assente = check(null, null, null);
        CheckService.calcolaSegnali(assente, null, 2);
        assertThat(assente.haSegnali()).isFalse();
    }

    @Test
    void energiaEPercezione() {
        CheckSettimanale basso = check(null, false, 2);
        CheckService.calcolaSegnali(basso, null, 2);
        assertThat(basso.getEnergiaBassa()).isTrue();
        assertThat(basso.getPercezioneNegativa()).isTrue();

        CheckSettimanale medio = check(null, true, 3);
        CheckService.calcolaSegnali(medio, null, 2);
        assertThat(medio.getEnergiaBassa()).isFalse();
    }

    @Test
    void conFeedback_ilPazienteNonCambiaPiuLeRisposte() {
        CheckSettimanale check = check(null, null, null);
        assertThatCode(() -> CheckService.verificaModificabile(check, CheckSettimanale.Fonte.APP)).doesNotThrowAnyException();

        check.setFeedback("Bravo");
        assertThatThrownBy(() -> CheckService.verificaModificabile(check, CheckSettimanale.Fonte.APP))
                .isInstanceOf(ConflittoException.class);
        assertThatCode(() -> CheckService.verificaModificabile(check, CheckSettimanale.Fonte.GESTIONALE)).doesNotThrowAnyException();
    }
}
