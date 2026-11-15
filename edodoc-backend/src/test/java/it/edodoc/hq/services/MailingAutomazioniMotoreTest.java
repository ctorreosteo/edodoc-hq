package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import it.edodoc.hq.models.MailingAutomazioneIscrizione;
import it.edodoc.hq.models.MailingContatto;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import static it.edodoc.hq.services.MailingGrafoTest.j;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MailingAutomazioniMotoreTest {

    /** Azioni finte: registrano cosa è stato chiesto e rispondono come configurato. */
    static class Finte implements MailingAutomazioniMotore.Azioni {
        final List<String> chiamate = new ArrayList<>();
        final List<LocalDateTime> quando = new ArrayList<>();
        boolean aperto;
        boolean cliccato;
        boolean regole;
        long prossimoInvio = 100;

        public Long accodaEmail(long emailId, long iscrizioneId, LocalDateTime q) {
            chiamate.add("email:" + emailId);
            quando.add(q);
            return prossimoInvio++;
        }

        public boolean haAperto(long iscrizioneId, long emailId) {
            chiamate.add("aperto?" + emailId);
            return aperto;
        }

        public boolean haCliccato(long iscrizioneId, long emailId) {
            chiamate.add("cliccato?" + emailId);
            return cliccato;
        }

        public boolean soddisfaRegole(JsonNode r) {
            chiamate.add("regole?");
            return regole;
        }

        public void aggiungiTag(JsonNode c) {
            chiamate.add("tag+" + c.path("tagId").asLong());
        }

        public void rimuoviTag(JsonNode c) {
            chiamate.add("tag-" + c.path("tagId").asLong());
        }

        public void notificaStaff(JsonNode c) {
            chiamate.add("notifica");
        }
    }

    /** email n1 → attesa 2g → condizione ha aperto n1 → SI: tag 7, email 2 → FINE ; NO: email 3 (fine implicita). */
    private static final String GRAFO = "{'nodi':["
            + "{'id':'n1','tipo':'EMAIL','config':{'emailId':1}},"
            + "{'id':'n2','tipo':'ATTESA','config':{'quantita':2,'unita':'GIORNI'}},"
            + "{'id':'n3','tipo':'CONDIZIONE','config':{'haAperto':'n1'}},"
            + "{'id':'n4','tipo':'AGGIUNGI_TAG','config':{'tagId':7}},"
            + "{'id':'n5','tipo':'EMAIL','config':{'emailId':2}},"
            + "{'id':'n6','tipo':'FINE','config':{}},"
            + "{'id':'n7','tipo':'EMAIL','config':{'emailId':3}}],"
            + "'archi':[{'da':'n1','a':'n2'},{'da':'n2','a':'n3'},{'da':'n3','a':'n4','ramo':'SI'},{'da':'n4','a':'n5'},"
            + "{'da':'n5','a':'n6'},{'da':'n3','a':'n7','ramo':'NO'}]}";

    private static MailingAutomazioneIscrizione iscrizione(String nodo) {
        return MailingAutomazioneIscrizione.builder().id(55L).automazioneId(1L).contattoId(9L).nodoCorrente(nodo)
                .stato(MailingAutomazioneIscrizione.Stato.ATTIVA).build();
    }

    private static ObjectNode ctx(String nodo) {
        ObjectNode c = JsonNodeFactory.instance.objectNode();
        c.putArray("percorso").add(nodo);
        return c;
    }

    private static final LocalDateTime MARTEDI_10 = LocalDateTime.of(2026, 10, 27, 10, 0);

    @Test
    void primaEmailPoiAttesaDiDueGiorni() {
        Finte f = new Finte();
        MailingGrafo g = MailingGrafo.leggi(j(GRAFO));
        ObjectNode c = ctx("n1");
        var esito = MailingAutomazioniMotore.esegui(g, iscrizione("n1"), c, MARTEDI_10, false, f);
        assertEquals(List.of("email:1"), f.chiamate);
        assertEquals(MailingAutomazioneIscrizione.Stato.IN_ATTESA, esito.stato());
        assertEquals("n2", esito.nodo());
        assertEquals(MARTEDI_10.plusDays(2), esito.prossimaAzioneIl());
        assertEquals("n2", esito.contesto().path("attesa").asText());
        assertEquals(100, esito.contesto().path("email").path("n1").asLong());
        assertEquals("[\"n1\",\"n2\"]", esito.contesto().path("percorso").toString());
    }

    @Test
    void dopoLAttesaRamoSiSeHaAperto() {
        Finte f = new Finte();
        f.aperto = true;
        MailingGrafo g = MailingGrafo.leggi(j(GRAFO));
        ObjectNode c = ctx("n1");
        var primo = MailingAutomazioniMotore.esegui(g, iscrizione("n1"), c, MARTEDI_10, false, f);
        var secondo = MailingAutomazioniMotore.esegui(g, iscrizione(primo.nodo()), primo.contesto(),
                primo.prossimaAzioneIl(), false, f);
        assertEquals(List.of("email:1", "aperto?1", "tag+7", "email:2"), f.chiamate);
        assertEquals(MailingAutomazioneIscrizione.Stato.COMPLETATA, secondo.stato());
        assertEquals("n6", secondo.nodo());
        assertEquals("SI", secondo.contesto().path("esiti").path("n3").asText());
        assertFalse(secondo.contesto().has("attesa"));
    }

    @Test
    void ramoNoSenzaSeguitoCompletaIlPercorso() {
        Finte f = new Finte();
        MailingGrafo g = MailingGrafo.leggi(j(GRAFO));
        ObjectNode c = ctx("n2");
        c.put("attesa", "n2"); // l'attesa era già impostata ed è scaduta
        var esito = MailingAutomazioniMotore.esegui(g, iscrizione("n2"), c, MARTEDI_10, false, f);
        assertEquals(List.of("aperto?1", "email:3"), f.chiamate);
        assertEquals(MailingAutomazioneIscrizione.Stato.COMPLETATA, esito.stato());
        assertEquals("n7", esito.nodo());
        assertNull(esito.prossimaAzioneIl());
    }

    @Test
    void emailGiaAccodataNonRiparteDueVolte() {
        Finte f = new Finte();
        MailingGrafo g = MailingGrafo.leggi(j(GRAFO));
        ObjectNode c = ctx("n1");
        c.putObject("email").put("n1", 42);
        var esito = MailingAutomazioniMotore.esegui(g, iscrizione("n1"), c, MARTEDI_10, false, f);
        assertTrue(f.chiamate.isEmpty(), f.chiamate.toString());
        assertEquals("n2", esito.nodo());
    }

    @Test
    void soloOrariLavorativiSpostaEmailEAttesa() {
        Finte f = new Finte();
        MailingGrafo g = MailingGrafo.leggi(j(GRAFO));
        LocalDateTime notte = LocalDateTime.of(2026, 10, 27, 22, 30);
        var esito = MailingAutomazioniMotore.esegui(g, iscrizione("n1"), ctx("n1"), notte, true, f);
        assertEquals(LocalDateTime.of(2026, 10, 28, 8, 0), f.quando.get(0));
        // l'attesa parte da quando l'email esce davvero
        assertEquals(LocalDateTime.of(2026, 10, 30, 8, 0), esito.prossimaAzioneIl());
        Finte g2 = new Finte();
        MailingAutomazioniMotore.esegui(g, iscrizione("n1"), ctx("n1"), MARTEDI_10, true, g2);
        assertEquals(MARTEDI_10, g2.quando.get(0));
    }

    @Test
    void condizioneARegolaENotificaEFineEsplicita() {
        Finte f = new Finte();
        f.regole = true;
        MailingGrafo g = MailingGrafo.leggi(j("{'nodi':[{'id':'a','tipo':'CONDIZIONE','config':{'regole':{'operatore':'E','condizioni':[{'campo':'tag','op':'HA','valore':1}]}}},"
                + "{'id':'b','tipo':'NOTIFICA_STAFF','config':{'ruoli':['SEGRETERIA'],'testo':'x'}},{'id':'c','tipo':'RIMUOVI_TAG','config':{'tagId':3}},"
                + "{'id':'d','tipo':'FINE'}],'archi':[{'da':'a','a':'b','ramo':'SI'},{'da':'b','a':'c'},{'da':'c','a':'d'}]}"));
        var esito = MailingAutomazioniMotore.esegui(g, iscrizione("a"), ctx("a"), MARTEDI_10, false, f);
        assertEquals(List.of("regole?", "notifica", "tag-3"), f.chiamate);
        assertEquals(MailingAutomazioneIscrizione.Stato.COMPLETATA, esito.stato());
        assertEquals("d", esito.nodo());
    }

    @Test
    void attesaFinoAUnGiornoEOra() {
        Finte f = new Finte();
        MailingGrafo g = MailingGrafo.leggi(j("{'nodi':[{'id':'a','tipo':'ATTESA_FINO_A','config':{'giorni':[1],'ora':'09:30'}},"
                + "{'id':'b','tipo':'FINE'}],'archi':[{'da':'a','a':'b'}]}"));
        var esito = MailingAutomazioniMotore.esegui(g, iscrizione("a"), ctx("a"), MARTEDI_10, false, f);
        assertEquals(LocalDateTime.of(2026, 11, 2, 9, 30), esito.prossimaAzioneIl());
        assertEquals(MailingAutomazioneIscrizione.Stato.IN_ATTESA, esito.stato());
    }

    @Test
    void nodoRimossoFaUscire() {
        var esito = MailingAutomazioniMotore.esegui(MailingGrafo.leggi(j(GRAFO)), iscrizione("sparito"), ctx("sparito"),
                MARTEDI_10, false, new Finte());
        assertEquals(MailingAutomazioneIscrizione.Stato.USCITA, esito.stato());
        assertTrue(esito.contesto().path("motivoUscita").asText().contains("rimosso"));
    }

    @Test
    void protezioneDaiLoopDiPassiIstantanei() {
        Finte f = new Finte();
        MailingGrafo g = MailingGrafo.leggi(j("{'nodi':[{'id':'a','tipo':'AGGIUNGI_TAG','config':{'tagId':1}},"
                + "{'id':'b','tipo':'RIMUOVI_TAG','config':{'tagId':1}}],'archi':[{'da':'a','a':'b'},{'da':'b','a':'a'}]}"));
        var esito = MailingAutomazioniMotore.esegui(g, iscrizione("a"), ctx("a"), MARTEDI_10, false, f);
        assertEquals(MailingAutomazioneIscrizione.Stato.ERRORE, esito.stato());
        assertEquals(MailingAutomazioniMotore.MAX_PASSI, f.chiamate.size());
        assertTrue(esito.errore().contains("Troppi passi"));
    }

    @Test
    void contattoNonIdoneoNonBloccaIlPercorso() {
        Finte f = new Finte() {
            @Override
            public Long accodaEmail(long emailId, long iscrizioneId, LocalDateTime q) {
                chiamate.add("email:" + emailId);
                return null; // categoria esclusa: l'email non parte, il percorso prosegue
            }
        };
        var esito = MailingAutomazioniMotore.esegui(MailingGrafo.leggi(j(GRAFO)), iscrizione("n1"), ctx("n1"), MARTEDI_10, false, f);
        assertEquals("n2", esito.nodo());
        assertTrue(esito.contesto().path("email").path("n1").isNull());
    }

    @Test
    void regoleDiIngresso() {
        assertTrue(MailingAutomazioniMotore.puoEntrare(false, false, false));
        assertFalse(MailingAutomazioniMotore.puoEntrare(false, true, false));
        assertTrue(MailingAutomazioniMotore.puoEntrare(true, true, false));
        assertFalse(MailingAutomazioniMotore.puoEntrare(true, true, true));
    }

    @Test
    void segnapostoDellaNotificaStaff() {
        MailingContatto c = MailingContatto.builder().nome("Anna").cognome("Bianchi").email("anna@example.it").build();
        assertEquals("Chiamare Anna Bianchi (anna@example.it)",
                MailingAutomazioniMotore.sostituisciSegnaposto("Chiamare {{nome_completo}} ({{email}})", c));
        MailingContatto senzaNome = MailingContatto.builder().email("x@example.it").build();
        assertEquals("Ciao amico, x@example.it",
                MailingAutomazioniMotore.sostituisciSegnaposto("Ciao {{ nome | amico}}, {{nome_completo}}", senzaNome));
        assertEquals("resta ?", MailingAutomazioniMotore.sostituisciSegnaposto("resta {{ignoto}}?", senzaNome));
    }
}
