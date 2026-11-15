package it.edodoc.hq.services;

import it.edodoc.hq.models.MailingContatto;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MailingContattiServiceTest {

    @Test
    void ordinamentoSoloDaWhitelist() {
        assertEquals("c.creato_il DESC NULLS LAST, c.id DESC", MailingContattiService.ordinamento(null));
        assertEquals("c.punteggio DESC NULLS LAST, c.id DESC", MailingContattiService.ordinamento("punteggio,desc"));
        assertEquals("LOWER(c.cognome) ASC NULLS LAST, c.id ASC", MailingContattiService.ordinamento("cognome,asc"));
        assertEquals("c.ultima_apertura_il DESC NULLS LAST, c.id DESC", MailingContattiService.ordinamento("-ultimaAperturaIl"));
        assertEquals("c.creato_il DESC NULLS LAST, c.id DESC",
                MailingContattiService.ordinamento("email; DROP TABLE mailing_contatti,asc"));
        assertEquals("c.creato_il DESC NULLS LAST, c.id DESC", MailingContattiService.ordinamento("c.token,asc"));
    }

    @Test
    void tipoDelContatto() {
        assertEquals("PAZIENTE", MailingContattiService.tipo("ATTIVO"));
        assertEquals("PAZIENTE", MailingContattiService.tipo("CONCLUSO"));
        assertEquals("LEAD", MailingContattiService.tipo("LEAD"));
        assertEquals("LEAD", MailingContattiService.tipo("LISTA_ATTESA"));
        assertEquals("ALTRO", MailingContattiService.tipo(null));
    }

    @Test
    void notaDiRiattivazioneConDataEOperatore() {
        String nota = MailingContattiService.aggiungiNota("vecchia nota", LocalDateTime.of(2026, 10, 25, 9, 30),
                "Mario Rossi", "DISISCRITTO → ISCRITTO: ha chiesto di riceverle al telefono");
        assertEquals("vecchia nota\n[25/10/2026 09:30 · Mario Rossi] DISISCRITTO → ISCRITTO: ha chiesto di riceverle al telefono",
                nota);
        assertTrue(MailingContattiService.aggiungiNota(null, LocalDateTime.of(2026, 1, 2, 3, 4), null, "x")
                .startsWith("[02/01/2026 03:04] x"));
    }

    @Test
    void statiBloccatiNonSiRiattivanoDaSoli() {
        assertTrue(MailingContattiService.STATI_BLOCCATI.contains(MailingContatto.Stato.DISISCRITTO));
        assertTrue(MailingContattiService.STATI_BLOCCATI.contains(MailingContatto.Stato.RIMBALZATO));
        assertTrue(MailingContattiService.STATI_BLOCCATI.contains(MailingContatto.Stato.SEGNALATO_SPAM));
    }

    @Test
    void sorgentePiuRecenteVinceNellaDeduplica() {
        LocalDateTime t = LocalDateTime.of(2026, 1, 1, 0, 0);
        var vecchio = new MailingContattiService.Sorgente(1, "A", "B", t, t, null);
        var nuovo = new MailingContattiService.Sorgente(2, "C", "D", t.plusDays(1), t, null);
        var senzaData = new MailingContattiService.Sorgente(3, "E", "F", null, null, null);
        assertEquals(2, MailingContattiService.piuRecente(vecchio, nuovo).id());
        assertEquals(2, MailingContattiService.piuRecente(nuovo, vecchio).id());
        assertEquals(1, MailingContattiService.piuRecente(senzaData, vecchio).id());
    }

    @Test
    void validazioniInput() {
        assertThrows(IllegalArgumentException.class, () -> MailingContattiService.emailValida("non valida"));
        assertThrows(IllegalArgumentException.class, () -> MailingContattiService.baseDa("QUALSIASI"));
        assertEquals(MailingContatto.BaseGiuridica.CONSENSO, MailingContattiService.baseDa(" consenso "));
        assertEquals(MailingContatto.Stato.ARCHIVIATO, MailingContattiService.statoDa("archiviato"));
    }
}
