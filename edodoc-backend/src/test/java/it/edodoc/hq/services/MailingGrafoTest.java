package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MailingGrafoTest {

    private static final ObjectMapper OM = new ObjectMapper();
    private static final Map<Long, MailingGrafo.EmailInfo> EMAIL = Map.of(
            1L, new MailingGrafo.EmailInfo("Ciao", "<p>Testo</p>"),
            2L, new MailingGrafo.EmailInfo("Secondo", "<table><tr><td>Altro</td></tr></table>"),
            3L, new MailingGrafo.EmailInfo("Vuota", "<html><head><style>p{}</style></head><body> </body></html>"),
            4L, new MailingGrafo.EmailInfo("  ", "<p>x</p>"));

    static JsonNode j(String s) {
        try {
            return OM.readTree(s.replace('\'', '"'));
        } catch (Exception e) {
            throw new IllegalArgumentException(e);
        }
    }

    private static List<String> errori(String grafo) {
        return MailingGrafo.leggi(j(grafo)).valida(EMAIL);
    }

    private static boolean contiene(List<String> errori, String pezzo) {
        return errori.stream().anyMatch(e -> e.contains(pezzo));
    }

    @Test
    void grafoLineareValidoNonHaErrori() {
        List<String> e = errori("{'nodi':[{'id':'a','tipo':'EMAIL','config':{'emailId':1}},"
                + "{'id':'b','tipo':'ATTESA','config':{'quantita':2,'unita':'GIORNI'}},"
                + "{'id':'c','tipo':'EMAIL','config':{'emailId':2}},{'id':'d','tipo':'FINE','config':{}}],"
                + "'archi':[{'da':'a','a':'b','ramo':null},{'da':'b','a':'c'},{'da':'c','a':'d'}]}");
        assertTrue(e.isEmpty(), e.toString());
    }

    @Test
    void grafoVuotoChiedeAlmenoUnPasso() {
        assertTrue(contiene(errori("{'nodi':[],'archi':[]}"), "almeno un passo"));
        assertTrue(contiene(MailingGrafo.leggi(null).valida(EMAIL), "almeno un passo"));
    }

    @Test
    void dueNodiIniziali() {
        List<String> e = errori("{'nodi':[{'id':'a','tipo':'FINE','y':0},{'id':'b','tipo':'FINE','y':200}],'archi':[]}");
        assertTrue(contiene(e, "un solo primo passo"), e.toString());
    }

    @Test
    void arcoVersoNodoInesistente() {
        List<String> e = errori("{'nodi':[{'id':'a','tipo':'EMAIL','config':{'emailId':1}}],'archi':[{'da':'a','a':'zzz'}]}");
        assertTrue(contiene(e, "non esiste più"), e.toString());
    }

    @Test
    void cicloRilevatoAncheConPrimoNodo() {
        List<String> e = errori("{'nodi':[{'id':'a','tipo':'EMAIL','config':{'emailId':1}},"
                + "{'id':'b','tipo':'ATTESA','config':{'quantita':1,'unita':'ORE'}},"
                + "{'id':'c','tipo':'EMAIL','config':{'emailId':2}}],"
                + "'archi':[{'da':'a','a':'b'},{'da':'b','a':'c'},{'da':'c','a':'b'}]}");
        assertTrue(contiene(e, "all'infinito"), e.toString());
        assertTrue(MailingGrafo.leggi(j("{'nodi':[{'id':'a','tipo':'FINE'}],'archi':[{'da':'a','a':'a'}]}")).haCiclo());
    }

    @Test
    void condizioneSenzaRamiERamiDoppi() {
        String base = "{'nodi':[{'id':'e','tipo':'EMAIL','config':{'emailId':1}},"
                + "{'id':'c','tipo':'CONDIZIONE','config':{'haAperto':'e'}},"
                + "{'id':'f1','tipo':'FINE'},{'id':'f2','tipo':'FINE'},{'id':'f3','tipo':'FINE'}],'archi':[{'da':'e','a':'c'}%s]}";
        assertTrue(contiene(errori(String.format(base, "")), "non porta da nessuna parte"));
        // un solo ramo: ammesso (chi prende l'altro ramo completa il percorso), ma f2/f3 orfani
        List<String> unRamo = errori(String.format(base, ",{'da':'c','a':'f1','ramo':'SI'},{'da':'c','a':'f2','ramo':'NO'},{'da':'f2','a':'f3'}"));
        assertTrue(contiene(unRamo, "dopo la fine"), unRamo.toString());
        List<String> doppio = errori(String.format(base, ",{'da':'c','a':'f1','ramo':'SI'},{'da':'c','a':'f2','ramo':'SI'},{'da':'c','a':'f3','ramo':'NO'}"));
        assertTrue(contiene(doppio, "partono due strade"), doppio.toString());
        List<String> senzaRamo = errori(String.format(base, ",{'da':'c','a':'f1','ramo':'SI'},{'da':'c','a':'f2','ramo':null},{'da':'c','a':'f3','ramo':'NO'}"));
        assertTrue(contiene(senzaRamo, "ramo Sì o sul ramo No"), senzaRamo.toString());
        List<String> ok = errori(String.format(base, ",{'da':'c','a':'f1','ramo':'SI'},{'da':'c','a':'f2','ramo':'NO'}"))
                .stream().filter(x -> !x.contains("primo passo")).toList();
        // f3 resta scollegato (secondo primo passo), nessun altro errore
        assertTrue(ok.isEmpty(), ok.toString());
    }

    @Test
    void condizioneSuEmailSuccessivaOMancante() {
        List<String> e = errori("{'nodi':[{'id':'c','tipo':'CONDIZIONE','config':{'haCliccato':'e'}},"
                + "{'id':'e','tipo':'EMAIL','config':{'emailId':1}}],'archi':[{'da':'c','a':'e','ramo':'SI'}]}");
        assertTrue(contiene(e, "arriva dopo questa condizione"), e.toString());
        List<String> e2 = errori("{'nodi':[{'id':'c','tipo':'CONDIZIONE','config':{'haAperto':'x'}},{'id':'f','tipo':'FINE'}],"
                + "'archi':[{'da':'c','a':'f','ramo':'NO'}]}");
        assertTrue(contiene(e2, "non c'è più"), e2.toString());
        List<String> e3 = errori("{'nodi':[{'id':'c','tipo':'CONDIZIONE','config':{'regole':{'operatore':'E','condizioni':[]}}},"
                + "{'id':'f','tipo':'FINE'}],'archi':[{'da':'c','a':'f','ramo':'NO'}]}");
        assertTrue(contiene(e3, "almeno una regola"), e3.toString());
        List<String> e4 = errori("{'nodi':[{'id':'c','tipo':'CONDIZIONE','config':{}},{'id':'f','tipo':'FINE'}],"
                + "'archi':[{'da':'c','a':'f','ramo':'NO'}]}");
        assertTrue(contiene(e4, "che cosa deve controllare"), e4.toString());
    }

    @Test
    void emailSenzaContenutoOggettoOId() {
        assertTrue(contiene(errori("{'nodi':[{'id':'a','tipo':'EMAIL','config':{'emailId':null}}],'archi':[]}"), "ancora da scrivere"));
        assertTrue(contiene(errori("{'nodi':[{'id':'a','tipo':'EMAIL','config':{'emailId':99}}],'archi':[]}"), "ancora da scrivere"));
        assertTrue(contiene(errori("{'nodi':[{'id':'a','tipo':'EMAIL','config':{'emailId':3}}],'archi':[]}"), "vuota"));
        assertTrue(contiene(errori("{'nodi':[{'id':'a','tipo':'EMAIL','config':{'emailId':'4'}}],'archi':[]}"), "manca l'oggetto"));
        assertTrue(errori("{'nodi':[{'id':'a','tipo':'EMAIL','config':{'emailId':'2'}}],'archi':[]}").isEmpty());
    }

    @Test
    void attesaZeroNegativaOUnitaSconosciuta() {
        assertTrue(contiene(errori("{'nodi':[{'id':'a','tipo':'ATTESA','config':{'quantita':0,'unita':'ORE'}}],'archi':[]}"), "più di zero"));
        assertTrue(contiene(errori("{'nodi':[{'id':'a','tipo':'ATTESA','config':{'quantita':-3}}],'archi':[]}"), "più di zero"));
        assertTrue(contiene(errori("{'nodi':[{'id':'a','tipo':'ATTESA','config':{'quantita':2,'unita':'ANNI'}}],'archi':[]}"), "minuti, ore o giorni"));
        assertTrue(errori("{'nodi':[{'id':'a','tipo':'ATTESA','config':{'quantita':'2','unita':'giorni'}}],'archi':[]}").isEmpty());
    }

    @Test
    void attesaFinoAEAltriNodi() {
        assertTrue(contiene(errori("{'nodi':[{'id':'a','tipo':'ATTESA_FINO_A','config':{'giorni':[],'ora':'25:00'}}],'archi':[]}"), "almeno un giorno"));
        assertTrue(contiene(errori("{'nodi':[{'id':'a','tipo':'ATTESA_FINO_A','config':{'giorni':[1],'ora':'9'}}],'archi':[]}"), "orario valido"));
        assertTrue(contiene(errori("{'nodi':[{'id':'a','tipo':'AGGIUNGI_TAG','config':{}}],'archi':[]}"), "scegli il tag"));
        assertTrue(contiene(errori("{'nodi':[{'id':'a','tipo':'NOTIFICA_STAFF','config':{'testo':''}}],'archi':[]}"), "titolo del task"));
        assertTrue(errori("{'nodi':[{'id':'a','tipo':'NOTIFICA_STAFF','config':{'testo':'Richiamare {{nome}}'}}],'archi':[]}").isEmpty());
        assertTrue(contiene(errori("{'nodi':[{'id':'a','tipo':'BOH'}],'archi':[]}"), "tipo sconosciuto"));
        assertTrue(contiene(errori("{'nodi':[{'id':'a','tipo':'FINE'},{'id':'a','tipo':'FINE'}],'archi':[]}"), "stesso identificativo"));
    }

    @Test
    void nodoSempliceConDueUscite() {
        List<String> e = errori("{'nodi':[{'id':'a','tipo':'ATTESA','config':{'quantita':1}},{'id':'b','tipo':'FINE'},"
                + "{'id':'c','tipo':'FINE'}],'archi':[{'da':'a','a':'b'},{'da':'a','a':'c'}]}");
        assertTrue(contiene(e, "ne è ammessa una sola"), e.toString());
    }

    @Test
    void inizialeESuccessivoComeLaTela() {
        MailingGrafo g = MailingGrafo.leggi(j("{'nodi':[{'id':'b','tipo':'FINE','y':300},{'id':'a','tipo':'CONDIZIONE','y':100,"
                + "'config':{'regole':{'condizioni':[{'campo':'x'}]}}},{'id':'c','tipo':'FINE','y':300}],"
                + "'archi':[{'da':'a','a':'b','ramo':'SI'},{'da':'a','a':'c','ramo':'no'}]}"));
        assertEquals("a", g.iniziale().id());
        assertEquals("b", g.successivo("a", "SI").id());
        assertEquals("c", g.successivo("a", "NO").id());
        assertNull(g.successivo("b", null));
        assertEquals(Map.of("a", 1, "b", 2, "c", 3), g.numerazione());
    }

    @Test
    void prossimaOccorrenzaAttesaFinoA() {
        LocalDateTime sabato = LocalDateTime.of(2026, 10, 24, 10, 0); // sabato
        // solo feriali alle 9: lunedì 26
        assertEquals(LocalDateTime.of(2026, 10, 26, 9, 0),
                MailingGrafo.prossimaOccorrenza(sabato, Set.of(1, 2, 3, 4, 5), LocalTime.of(9, 0)));
        // qualsiasi giorno, ora già passata: domani
        assertEquals(LocalDateTime.of(2026, 10, 25, 9, 0), MailingGrafo.prossimaOccorrenza(sabato, Set.of(), LocalTime.of(9, 0)));
        // stesso giorno, ora futura
        assertEquals(LocalDateTime.of(2026, 10, 24, 18, 30), MailingGrafo.prossimaOccorrenza(sabato, Set.of(6), LocalTime.of(18, 30)));
    }

    @Test
    void minutiAttesaETipoCondizione() {
        assertEquals(2880, MailingGrafo.minutiAttesa(j("{'quantita':2,'unita':'GIORNI'}")));
        assertEquals(180, MailingGrafo.minutiAttesa(j("{'quantita':3,'unita':'ORE'}")));
        assertEquals(1440, MailingGrafo.minutiAttesa(j("{'quantita':1}")));
        assertEquals("APERTO", MailingGrafo.tipoCondizione(j("{'haAperto':'n1'}")));
        assertEquals("CLICCATO", MailingGrafo.tipoCondizione(j("{'haCliccato':'n1'}")));
        assertEquals("REGOLA", MailingGrafo.tipoCondizione(j("{'regole':{'operatore':'E','condizioni':[]}}")));
        assertNull(MailingGrafo.tipoCondizione(j("{}")));
        assertFalse(MailingGrafo.htmlVuoto("<img src='x'>"));
    }
}
