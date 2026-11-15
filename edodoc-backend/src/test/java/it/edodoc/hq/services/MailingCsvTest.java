package it.edodoc.hq.services;

import org.junit.jupiter.api.Test;

import java.nio.charset.Charset;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MailingCsvTest {

    @Test
    void intestazioniItalianeConPuntoEVirgolaEBom() {
        MailingCsv.Esito e = MailingCsv.leggi("﻿Cognome;Nome;E-mail\nRossi;Mario;Mario.Rossi@Example.IT\nBianchi;Anna;anna@example.com\n");
        assertEquals(2, e.righeLette());
        assertEquals(List.of(
                new MailingCsv.Riga(2, "mario.rossi@example.it", "Mario", "Rossi"),
                new MailingCsv.Riga(3, "anna@example.com", "Anna", "Bianchi")), e.righe());
        assertEquals(0, e.nonValidi());
    }

    @Test
    void exportMailchimpInIngleseConVirgoleEVirgolette() {
        MailingCsv.Esito e = MailingCsv.leggi("\"Email Address\",\"First Name\",\"Last Name\",\"Tags\"\n"
                + "\"luca@example.com\",\"Luca\",\"De Santis, jr\",\"a,b\"\n"
                + "\"giulia@example.com\",\"Giulia \"\"Giuly\"\"\",\"\"\n");
        assertEquals(2, e.righe().size());
        assertEquals("De Santis, jr", e.righe().get(0).cognome());
        assertEquals("Giulia \"Giuly\"", e.righe().get(1).nome());
        assertNull(e.righe().get(1).cognome());
    }

    @Test
    void senzaIntestazioneSeLaPrimaRigaEUnEmail() {
        MailingCsv.Esito e = MailingCsv.leggi("a@example.com,Ada,Lovelace\r\nb@example.com\r\n");
        assertEquals(2, e.righe().size());
        assertEquals(new MailingCsv.Riga(1, "a@example.com", "Ada", "Lovelace"), e.righe().get(0));
        assertNull(e.righe().get(1).nome());
    }

    @Test
    void emailNonValideContateConMessaggio() {
        MailingCsv.Esito e = MailingCsv.leggi("email,nome\nnon-una-email,X\n,Y\nok@example.org,Z\nspazio @example.org,W\nsenza@tld,Q\n");
        assertEquals(5, e.righeLette());
        assertEquals(1, e.righe().size());
        assertEquals(4, e.nonValidi());
        assertTrue(e.errori().get(0).startsWith("Riga 2: email non valida"));
        assertTrue(e.errori().get(1).contains("(vuota)"));
    }

    @Test
    void righeVuoteIgnorateEFileVuotoRifiutato() {
        assertEquals(1, MailingCsv.leggi("\n\nemail\n\nx@example.com\n\n").righe().size());
        assertThrows(IllegalArgumentException.class, () -> MailingCsv.leggi("   \n"));
        assertThrows(IllegalArgumentException.class, () -> MailingCsv.leggi("nome,cognome\nMario,Rossi\n"));
    }

    @Test
    void oltreVentimilaRigheRifiutato() {
        StringBuilder sb = new StringBuilder("email\n");
        for (int i = 0; i <= MailingCsv.RIGHE_MAX; i++) {
            sb.append("u").append(i).append("@example.com\n");
        }
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> MailingCsv.leggi(sb.toString()));
        assertTrue(ex.getMessage().contains("20000"));
        StringBuilder ok = new StringBuilder("email\n");
        for (int i = 0; i < MailingCsv.RIGHE_MAX; i++) {
            ok.append("u").append(i).append("@example.com\n");
        }
        assertEquals(MailingCsv.RIGHE_MAX, MailingCsv.leggi(ok.toString()).righe().size());
    }

    @Test
    void normalizzazioneEmail() {
        assertEquals("a.b+c@example.co.uk", MailingCsv.normalizzaEmail("  A.B+c@Example.CO.uk "));
        assertEquals("x@example.it", MailingCsv.normalizzaEmail("mailto:x@example.it"));
        assertNull(MailingCsv.normalizzaEmail("x@example"));
        assertNull(MailingCsv.normalizzaEmail("x@@example.it"));
        assertNull(MailingCsv.normalizzaEmail(null));
    }

    @Test
    void decodificaUtf8OppureWindows1252() {
        assertEquals("città", MailingContattiService.decodifica("città".getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        assertEquals("città", MailingContattiService.decodifica("città".getBytes(Charset.forName("windows-1252"))));
    }
}
