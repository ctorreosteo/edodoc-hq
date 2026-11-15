package it.edodoc.hq.services;

import it.edodoc.hq.dto.MailingDto;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.LongStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MailingCampagneServiceTest {

    private static String esito(MailingCampagneService.AnalisiContenuto a, String chiave) {
        return a.controlli().stream().filter(c -> c.chiave().equals(chiave)).findFirst().map(MailingDto.Controllo::esito).orElse(null);
    }

    private static final String HTML_PULITO = "<p>Ciao {{nome|}}, questo mese parliamo di postura in ufficio: tre esercizi "
            + "semplici da fare alla scrivania, cinque minuti al giorno, per arrivare a sera con la schiena più leggera. "
            + "Li trovi spiegati passo per passo nel nostro articolo.</p><p><a href=\"https://www.edodoc.it/blog\">Leggi l'articolo</a></p>"
            + "<img src=\"https://x.it/a.png\" alt=\"Esercizio\"><p>{{link_disiscrizione}}</p>";

    @Test
    void contenutoPulitoSenzaBloccanti() {
        MailingCampagneService.AnalisiContenuto a = MailingCampagneService.analizza("Tre esercizi per la schiena", "Cinque minuti al giorno",
                HTML_PULITO, null);
        assertTrue(a.controlli().stream().noneMatch(c -> "BLOCCANTE".equals(c.esito())), a.controlli().toString());
        assertEquals(0, a.punteggioSpam());
        assertEquals("OK", esito(a, "disiscrizione"));
    }

    @Test
    void oggettoMancanteBloccaEOggettoLungoAvvisa() {
        assertEquals("BLOCCANTE", esito(MailingCampagneService.analizza("", "p", HTML_PULITO, null), "oggetto"));
        assertEquals("AVVISO", esito(MailingCampagneService.analizza("x".repeat(95), "p", HTML_PULITO, null), "oggetto"));
        assertEquals("AVVISO", esito(MailingCampagneService.analizza("Ok", null, HTML_PULITO, null), "preheader"));
    }

    @Test
    void segnaliDiSpamAlzanoIlPunteggio() {
        String html = "<p>GRATIS! Clicca qui! Offerta imperdibile, solo oggi!!! Risultato garantito!</p>"
                + "<img src=\"https://x.it/1.png\"><img src=\"https://x.it/2.png\" alt=\"\"><a href=\"https://bit.ly/abc\">vai</a>";
        MailingCampagneService.AnalisiContenuto a = MailingCampagneService.analizza("OFFERTA GRATIS!!!", null, html, null);
        assertEquals("AVVISO", esito(a, "maiuscole"));
        assertEquals("AVVISO", esito(a, "esclamativi"));
        assertEquals("AVVISO", esito(a, "paroleSpam"));
        assertEquals("AVVISO", esito(a, "alt"));
        assertEquals("AVVISO", esito(a, "accorciati"));
        assertEquals("AVVISO", esito(a, "testoImmagini"));
        assertTrue(a.punteggioSpam() >= 8, "punteggio " + a.punteggioSpam());
        assertTrue(a.punteggioSpam() <= 10);
    }

    @Test
    void linkNonValidiBloccanoEPesoOltre100KbAvvisa() {
        MailingCampagneService.AnalisiContenuto a = MailingCampagneService.analizza("Ciao", "p",
                "<a href=\"https://\">x</a><a href=\"www.sito.it\">y</a><a href=\"mailto:a@b.it\">m</a>", null);
        assertEquals("BLOCCANTE", esito(a, "link"));
        String grande = "<p>" + "Testo lungo e tranquillo. ".repeat(4500) + "</p>";
        assertEquals("AVVISO", esito(MailingCampagneService.analizza("Ciao", "p", grande, null), "peso"));
    }

    @Test
    void testAbIncompletoBlocca() {
        MailingDto.TestAb ab = new MailingDto.TestAb(List.of(new MailingDto.VarianteAb("A", "Uno", null),
                new MailingDto.VarianteAb("B", " ", null)), 20, "APERTURE", 4, null, null);
        assertEquals("BLOCCANTE", esito(MailingCampagneService.analizza("Ciao", "p", HTML_PULITO, ab), "testAb"));
    }

    @Test
    void vincitoreAbPerTassoPoiSuccessiPoiOrdine() {
        assertEquals("B", MailingCampagneService.sceltaVincitore(List.of(
                new MailingCampagneService.RisultatoVariante("A", 100, 30),
                new MailingCampagneService.RisultatoVariante("B", 80, 30))));
        assertEquals("A", MailingCampagneService.sceltaVincitore(List.of(
                new MailingCampagneService.RisultatoVariante("A", 100, 20),
                new MailingCampagneService.RisultatoVariante("B", 100, 20),
                new MailingCampagneService.RisultatoVariante("C", 0, 0))));
        assertEquals("B", MailingCampagneService.sceltaVincitore(List.of(
                new MailingCampagneService.RisultatoVariante("A", 10, 1),
                new MailingCampagneService.RisultatoVariante("B", 20, 2))));
        assertEquals("A", MailingCampagneService.sceltaVincitore(List.of(
                new MailingCampagneService.RisultatoVariante("A", 0, 0),
                new MailingCampagneService.RisultatoVariante("B", 0, 0))));
    }

    @Test
    void gruppiTestDisgiuntiEDivisiFraLeVarianti() {
        List<Long> ids = new ArrayList<>(LongStream.rangeClosed(1, 1000).boxed().toList());
        List<List<Long>> g = MailingCampagneService.gruppiTest(ids, 20, 2, 42L);
        assertEquals(100, g.get(0).size());
        assertEquals(100, g.get(1).size());
        Set<Long> tutti = new HashSet<>(g.get(0));
        tutti.addAll(g.get(1));
        assertEquals(200, tutti.size());
        assertEquals(g, MailingCampagneService.gruppiTest(ids, 20, 2, 42L));
        List<List<Long>> piccoli = MailingCampagneService.gruppiTest(List.of(1L, 2L, 3L), 10, 3, 1L);
        assertTrue(piccoli.stream().allMatch(x -> x.size() == 1));
    }

    @Test
    void stimaFineSuPiuGiorniConLaQuota() {
        LocalDateTime ora = LocalDateTime.of(2026, 10, 25, 10, 0);
        assertEquals(ora.plusMinutes(5), MailingCampagneService.stimaFine(100, 1500, 0, 20, ora));
        assertEquals(ora.plusDays(1).plusMinutes(25), MailingCampagneService.stimaFine(2000, 1500, 0, 20, ora));
        assertEquals(ora.plusDays(2).plusMinutes(5), MailingCampagneService.stimaFine(3100, 1500, 0, 20, ora));
        assertEquals(ora.plusDays(1).plusMinutes(5), MailingCampagneService.stimaFine(100, 1500, 1500, 20, ora));
    }

    @Test
    void invioIntelligenteEntro24Ore() {
        LocalDateTime ora = LocalDateTime.of(2026, 10, 25, 10, 30);
        assertEquals(LocalDateTime.of(2026, 10, 25, 18, 7), MailingCampagneService.prossimaOccorrenza(ora, 18, 7));
        assertEquals(LocalDateTime.of(2026, 10, 26, 8, 0), MailingCampagneService.prossimaOccorrenza(ora, 8, 60));
        assertEquals(LocalDateTime.of(2026, 10, 25, 10, 45), MailingCampagneService.prossimaOccorrenza(ora, 10, 45));
        assertEquals(LocalDateTime.of(2026, 10, 26, 10, 15), MailingCampagneService.prossimaOccorrenza(ora, 10, 15));
    }

    @Test
    void maiuscoleSoloSeTutteLeLettere() {
        assertTrue(MailingCampagneService.tuttoMaiuscolo("OFFERTA SPECIALE 2026"));
        assertFalse(MailingCampagneService.tuttoMaiuscolo("Offerta ATM"));
        assertFalse(MailingCampagneService.tuttoMaiuscolo("OK!"));
    }
}
