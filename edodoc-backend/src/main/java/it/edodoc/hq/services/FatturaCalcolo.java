package it.edodoc.hq.services;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Importi della parcella. Il prezzo comprende il contributo integrativo, che si scorpora:
 * imponibile = prezzo / 1,04 e contributo = differenza (600 € → 576,92 + 23,08).
 * Il bollo si applica oltre la soglia (77,47 €): dentro il prezzo oppure in aggiunta, secondo config.
 */
public final class FatturaCalcolo {

    public record Importi(BigDecimal imponibile, BigDecimal contributo, BigDecimal bollo, BigDecimal totale) {
    }

    private FatturaCalcolo() {
    }

    public static Importi calcola(BigDecimal prezzo, BigDecimal aliquotaContributo, BigDecimal sogliaBollo,
                                  BigDecimal importoBollo, boolean bolloDentroIlPrezzo) {
        BigDecimal bollo = prezzo.compareTo(sogliaBollo) > 0 ? importoBollo : BigDecimal.ZERO;
        BigDecimal base = bolloDentroIlPrezzo ? prezzo.subtract(bollo) : prezzo;
        BigDecimal imponibile = base.divide(BigDecimal.ONE.add(aliquotaContributo), 2, RoundingMode.HALF_UP);
        BigDecimal contributo = base.subtract(imponibile);
        return new Importi(imponibile, contributo.setScale(2, RoundingMode.HALF_UP),
                bollo.setScale(2, RoundingMode.HALF_UP), base.add(bollo).setScale(2, RoundingMode.HALF_UP));
    }
}
