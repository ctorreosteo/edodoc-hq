package it.edodoc.hq.services;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.Map;

import static it.edodoc.hq.services.MailingGrafoTest.j;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MailingTriggerTest {

    @Test
    void tipoDiversoNonCorrisponde() {
        assertFalse(MailingTrigger.corrisponde(j("{'tipo':'NUOVO_LEAD','parametri':{}}"), "ACQUISTO", Map.of()));
        assertFalse(MailingTrigger.corrisponde(null, "ACQUISTO", Map.of()));
        assertTrue(MailingTrigger.corrisponde(j("{'tipo':'prima_visita_prenotata'}"), "PRIMA_VISITA_PRENOTATA", null));
    }

    @Test
    void nuovoLeadConFiltroFonte() {
        var t = j("{'tipo':'NUOVO_LEAD','parametri':{'fonte':['YOUTUBE','MASTERCLASS']}}");
        assertTrue(MailingTrigger.corrisponde(t, "NUOVO_LEAD", Map.of("fonte", "youtube")));
        assertTrue(MailingTrigger.corrisponde(t, "NUOVO_LEAD", Map.of("fonte", "MASTERCLASS")));
        assertFalse(MailingTrigger.corrisponde(t, "NUOVO_LEAD", Map.of("fonte", "INSTAGRAM")));
        assertFalse(MailingTrigger.corrisponde(t, "NUOVO_LEAD", Map.of()));
        // filtro vuoto = qualsiasi
        assertTrue(MailingTrigger.corrisponde(j("{'tipo':'NUOVO_LEAD','parametri':{'fonte':[]}}"), "NUOVO_LEAD", Map.of()));
    }

    @Test
    void esitoDellaConoscitiva() {
        var t = j("{'tipo':'ESITO_CONOSCITIVA','parametri':{'esito':'CI_PENSA'}}");
        assertTrue(MailingTrigger.corrisponde(t, "ESITO_CONOSCITIVA", Map.of("esito", "CI_PENSA")));
        assertFalse(MailingTrigger.corrisponde(t, "ESITO_CONOSCITIVA", Map.of("esito", "ACQUISTATO")));
        assertTrue(MailingTrigger.corrisponde(j("{'tipo':'ESITO_CONOSCITIVA'}"), "ESITO_CONOSCITIVA", Map.of("esito", "NON_ADATTO")));
    }

    @Test
    void visitaAcquistoTagConNumeriEIdInFormatiDiversi() {
        assertTrue(MailingTrigger.corrisponde(j("{'tipo':'VISITA_EFFETTUATA','parametri':{'numero':3}}"), "VISITA_EFFETTUATA", Map.of("numeroVisite", 3)));
        assertFalse(MailingTrigger.corrisponde(j("{'tipo':'VISITA_EFFETTUATA','parametri':{'numero':3}}"), "VISITA_EFFETTUATA", Map.of("numeroVisite", 4)));
        assertTrue(MailingTrigger.corrisponde(j("{'tipo':'VISITA_EFFETTUATA','parametri':{'numero':null}}"), "VISITA_EFFETTUATA", Map.of("numeroVisite", 4)));
        assertTrue(MailingTrigger.corrisponde(j("{'tipo':'ACQUISTO','parametri':{'tipoPercorso':'RINNOVO'}}"), "ACQUISTO", Map.of("tipoPercorso", "RINNOVO")));
        assertTrue(MailingTrigger.corrisponde(j("{'tipo':'ACQUISTO','parametri':{'tipoPercorso':['RINNOVO','MANTENIMENTO']}}"), "ACQUISTO", Map.of("tipoPercorso", "MANTENIMENTO")));
        assertFalse(MailingTrigger.corrisponde(j("{'tipo':'ACQUISTO','parametri':{'tipoPercorso':'RINNOVO'}}"), "ACQUISTO", Map.of("tipoPercorso", "METODO_BUSSOLA")));
        assertFalse(MailingTrigger.corrisponde(j("{'tipo':'TAG_AGGIUNTO','parametri':{'tagId':5}}"), "TAG_AGGIUNTO", Map.of()));
        assertTrue(MailingTrigger.corrisponde(j("{'tipo':'TAG_AGGIUNTO','parametri':{'tagId':5}}"), "TAG_AGGIUNTO", Map.of("tagId", 5L)));
    }

    @Test
    void uscitaConStessaFormaDelTriggerOElenco() {
        assertTrue(MailingAutomazioniMotore.uscitaPerEvento(j("{'tipo':'PRIMA_VISITA_PRENOTATA','parametri':{}}"), "PRIMA_VISITA_PRENOTATA", Map.of()));
        assertFalse(MailingAutomazioniMotore.uscitaPerEvento(j("{'tipo':'PRIMA_VISITA_PRENOTATA'}"), "VISITA_PRENOTATA", Map.of()));
        assertTrue(MailingAutomazioniMotore.uscitaPerEvento(j("[{'tipo':'ACQUISTO','parametri':{'tipoPercorso':'RINNOVO'}},{'tipo':'VISITA_PRENOTATA'}]"), "VISITA_PRENOTATA", Map.of()));
        assertTrue(MailingAutomazioniMotore.uscitaPerEvento(j("{'eventi':[{'tipo':'ACQUISTO'}]}"), "ACQUISTO", Map.of("tipoPercorso", "RINNOVO")));
        assertFalse(MailingAutomazioniMotore.uscitaPerEvento(null, "ACQUISTO", Map.of()));
    }

    @Test
    void finestraOrariLavorativi() {
        assertEquals(LocalDateTime.of(2026, 10, 25, 8, 0), MailingTrigger.finestraLavorativa(LocalDateTime.of(2026, 10, 25, 6, 45)));
        assertEquals(LocalDateTime.of(2026, 10, 25, 8, 0), MailingTrigger.finestraLavorativa(LocalDateTime.of(2026, 10, 25, 8, 0)));
        assertEquals(LocalDateTime.of(2026, 10, 25, 19, 59), MailingTrigger.finestraLavorativa(LocalDateTime.of(2026, 10, 25, 19, 59)));
        assertEquals(LocalDateTime.of(2026, 10, 26, 8, 0), MailingTrigger.finestraLavorativa(LocalDateTime.of(2026, 10, 25, 20, 0)));
        assertEquals(LocalDateTime.of(2027, 1, 1, 8, 0), MailingTrigger.finestraLavorativa(LocalDateTime.of(2026, 12, 31, 23, 30)));
    }

    @Test
    void descrizioniInItaliano() {
        var nomi = new MailingTrigger.Nomi() {
            public String tag(Long id) {
                return id == 5 ? "VIP" : null;
            }

            public String segmento(Long id) {
                return "Dormienti";
            }
        };
        assertEquals("Quando arriva un nuovo lead da YouTube o la masterclass",
                MailingTrigger.descrizione(j("{'tipo':'NUOVO_LEAD','parametri':{'fonte':['YOUTUBE','MASTERCLASS']}}"), nomi));
        assertEquals("Quando un paziente acquista il rinnovo", MailingTrigger.descrizione(j("{'tipo':'ACQUISTO','parametri':{'tipoPercorso':'RINNOVO'}}"), nomi));
        assertEquals("Quando l'esito della chiamata conoscitiva è «ci pensa»",
                MailingTrigger.descrizione(j("{'tipo':'ESITO_CONOSCITIVA','parametri':{'esito':'CI_PENSA'}}"), nomi));
        assertEquals("Quando un contatto riceve il tag «VIP»", MailingTrigger.descrizione(j("{'tipo':'TAG_AGGIUNTO','parametri':{'tagId':5}}"), nomi));
        assertEquals("Il giorno del compleanno", MailingTrigger.descrizione(j("{'tipo':'COMPLEANNO','parametri':{'giorniPrima':0}}"), nomi));
        assertEquals("3 giorni prima del compleanno", MailingTrigger.descrizione(j("{'tipo':'COMPLEANNO','parametri':{'giorniPrima':3}}"), nomi));
        assertEquals("Quando un paziente non viene da 180 giorni", MailingTrigger.descrizione(j("{'tipo':'INATTIVO_DA_GIORNI','parametri':{'giorni':180}}"), nomi));
        assertEquals("Quando un paziente ha fatto la 2ª visita", MailingTrigger.descrizione(j("{'tipo':'VISITA_EFFETTUATA','parametri':{'numero':2}}"), nomi));
        assertEquals("Quando un contatto entra nel segmento «Dormienti»", MailingTrigger.descrizione(j("{'tipo':'ENTRATA_SEGMENTO','parametri':{'segmentoId':4}}"), nomi));
        assertEquals("Trigger da scegliere", MailingTrigger.descrizione(j("{}"), nomi));
    }

    @Test
    void parametriGiorni() {
        assertEquals(0, MailingTrigger.giorniPrima(j("{'tipo':'COMPLEANNO','parametri':{}}")));
        assertEquals(60, MailingTrigger.giorniPrima(j("{'tipo':'COMPLEANNO','parametri':{'giorniPrima':400}}")));
        assertEquals(180, MailingTrigger.giorniInattivita(j("{'tipo':'INATTIVO_DA_GIORNI','parametri':{}}")));
        assertEquals(1, MailingTrigger.giorniInattivita(j("{'tipo':'INATTIVO_DA_GIORNI','parametri':{'giorni':0}}")));
    }

    @Test
    void inattiviDefaultSoloChiSuperaLaSogliaDallAttivazione() {
        var t = j("{'tipo':'INATTIVO_DA_GIORNI','parametri':{'giorni':180}}");
        java.time.LocalDate oggi = java.time.LocalDate.of(2026, 10, 25);
        // prima esecuzione il giorno dell'attivazione: esattamente oggi - 180
        var f = MailingTrigger.finestraInattivi(t, oggi, LocalDateTime.of(2026, 10, 25, 6, 0));
        assertEquals(java.time.LocalDate.of(2026, 4, 28), f.soglia());
        assertEquals(f.soglia(), f.ultimaMinima());
        assertEquals(null, f.limite());
        // tre giorni dopo: chi ha superato la soglia dall'attivazione (anche se un giorno il job non è girato)
        var dopo = MailingTrigger.finestraInattivi(t, oggi.plusDays(3), LocalDateTime.of(2026, 10, 25, 6, 0));
        assertEquals(java.time.LocalDate.of(2026, 4, 28), dopo.ultimaMinima());
        assertEquals(java.time.LocalDate.of(2026, 5, 1), dopo.soglia());
        // attivazione senza data (non dovrebbe capitare): come attivata oggi
        assertEquals(f, MailingTrigger.finestraInattivi(t, oggi, null));
        assertEquals("Quando un paziente non viene da 180 giorni", MailingTrigger.descrizione(t, null));
    }

    @Test
    void inattiviConGiaInattiviAScaglioni() {
        var t = j("{'tipo':'INATTIVO_DA_GIORNI','parametri':{'giorni':180,'includiGiaInattivi':true}}");
        var f = MailingTrigger.finestraInattivi(t, java.time.LocalDate.of(2026, 10, 25), LocalDateTime.of(2026, 10, 25, 6, 0));
        assertEquals(null, f.ultimaMinima());
        assertEquals(300, f.limite());
        assertEquals("Pazienti senza visite da 180 giorni (anche quelli già inattivi, 300 al giorno)", MailingTrigger.descrizione(t, null));
        var t2 = j("{'tipo':'INATTIVO_DA_GIORNI','parametri':{'giorni':90,'includiGiaInattivi':'true','maxIniziali':50}}");
        assertEquals(50, MailingTrigger.finestraInattivi(t2, java.time.LocalDate.of(2026, 10, 25), null).limite());
        assertTrue(MailingTrigger.descrizione(t2, null).contains("50 al giorno"));
        assertEquals(1, MailingTrigger.maxIniziali(j("{'parametri':{'maxIniziali':0}}")));
        assertEquals(false, MailingTrigger.includiGiaInattivi(j("{'parametri':{}}")));
        assertTrue(MailingAutomazioniService.erroriTriggerStatici(j("{'tipo':'INATTIVO_DA_GIORNI','parametri':{'giorni':30,'maxIniziali':9000}}"))
                .get(0).contains("da 1 a 5000"));
    }
}
