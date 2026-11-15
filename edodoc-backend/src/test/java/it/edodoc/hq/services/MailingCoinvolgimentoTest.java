package it.edodoc.hq.services;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;

class MailingCoinvolgimentoTest {

    private static final LocalDateTime ADESSO = LocalDateTime.of(2026, 10, 25, 12, 0);

    @Test
    void attivoSeHaApertoNegliUltimiTrentaGiorni() {
        assertEquals("ATTIVO", MailingSegmentiSql.coinvolgimento(ADESSO.minusDays(1), 10, ADESSO));
        assertEquals("ATTIVO", MailingSegmentiSql.coinvolgimento(ADESSO.minusDays(30), 0, ADESSO));
    }

    @Test
    void tiepidoTraTrentaENovantaGiorni() {
        assertEquals("TIEPIDO", MailingSegmentiSql.coinvolgimento(ADESSO.minusDays(31), 5, ADESSO));
        assertEquals("TIEPIDO", MailingSegmentiSql.coinvolgimento(ADESSO.minusDays(90), 5, ADESSO));
    }

    @Test
    void dormienteSeNessunaAperturaDaNovantaGiorni() {
        assertEquals("DORMIENTE", MailingSegmentiSql.coinvolgimento(ADESSO.minusDays(91), 5, ADESSO));
        assertEquals("DORMIENTE", MailingSegmentiSql.coinvolgimento(ADESSO.minusYears(2), 0, ADESSO));
    }

    @Test
    void maiSeNonHaMaiApertoConAlmenoTreInvii() {
        assertEquals("MAI", MailingSegmentiSql.coinvolgimento(null, 3, ADESSO));
        assertEquals("MAI", MailingSegmentiSql.coinvolgimento(null, 40, ADESSO));
    }

    @Test
    void tiepidoSeTroppoPocheEmailPerGiudicare() {
        assertEquals("TIEPIDO", MailingSegmentiSql.coinvolgimento(null, 0, ADESSO));
        assertEquals("TIEPIDO", MailingSegmentiSql.coinvolgimento(null, 2, ADESSO));
    }
}
