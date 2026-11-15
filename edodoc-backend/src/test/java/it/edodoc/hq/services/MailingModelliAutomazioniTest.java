package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import it.edodoc.hq.dto.MailingDto;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MailingModelliAutomazioniTest {

    private static final MailingModelliAutomazioni.Riferimenti RIF = new MailingModelliAutomazioni.Riferimenti(
            "https://edodoc.it", "https://edodoc.it/prenota?da=email");

    private static final List<String> VIETATE = List.of("guari", "garantit", "diagnos", "miracol", "definitivamente", "cura definitiva",
            "chili in", "dimagrisci", "osteopat", "dolore");

    @Test
    void almenoCinqueModelliConChiaviUniche() {
        List<MailingDto.ModelloAutomazione> m = MailingModelliAutomazioni.tutti(RIF);
        assertTrue(m.size() >= 5);
        Set<String> chiavi = new HashSet<>();
        m.forEach(x -> assertTrue(chiavi.add(x.chiave()), x.chiave()));
        assertTrue(chiavi.containsAll(List.of("benvenuto-lead", "prima-della-conoscitiva", "ci-pensa",
                "benvenuto-percorso", "riattivazione", "compleanno")));
    }

    @Test
    void ogniModelloPassaLaValidazioneDelGrafoEDelTrigger() {
        for (MailingDto.ModelloAutomazione m : MailingModelliAutomazioni.tutti(RIF)) {
            List<Long> ids = new ArrayList<>();
            Map<Long, MailingGrafo.EmailInfo> email = new HashMap<>();
            for (int i = 0; i < m.email().size(); i++) {
                long id = 1000L + i;
                ids.add(id);
                email.put(id, new MailingGrafo.EmailInfo(m.email().get(i).oggetto(), m.email().get(i).html()));
            }
            JsonNode grafo = MailingAutomazioniService.collegaEmailModello(m.grafo(), ids);
            List<String> errori = MailingGrafo.leggi(grafo).valida(email);
            assertTrue(errori.isEmpty(), m.chiave() + ": " + errori);
            assertTrue(MailingAutomazioniService.erroriTriggerStatici(m.trigger()).isEmpty(), m.chiave());
            // ogni email del modello è usata da un nodo, nessun emailIndice rimasto
            Set<Long> usate = new HashSet<>();
            MailingGrafo.leggi(grafo).nodi().stream().filter(n -> "EMAIL".equals(n.tipo())).forEach(n -> {
                assertFalse(n.cfg().has("emailIndice"));
                usate.add(n.cfg().path("emailId").asLong());
            });
            assertEquals(new HashSet<>(ids), usate, m.chiave());
            // il modello non tocca il grafo originale
            assertTrue(m.grafo().toString().contains("emailIndice"));
        }
    }

    @Test
    void emailCompleteInFormatoDocumentoConHtml() {
        for (MailingDto.ModelloAutomazione m : MailingModelliAutomazioni.tutti(RIF)) {
            for (MailingDto.AutomazioneEmailInput e : m.email()) {
                String dove = m.chiave() + " / " + e.nome();
                assertNotNull(e.oggetto(), dove);
                assertTrue(e.oggetto().length() <= 80, dove);
                assertNotNull(e.preheader(), dove);
                assertEquals(1, e.design().path("versione").asInt(), dove);
                assertEquals(600, e.design().path("impostazioni").path("larghezza").asInt(), dove);
                JsonNode blocchi = e.design().path("blocchi");
                assertTrue(blocchi.size() >= 3, dove);
                Set<String> ids = new HashSet<>();
                blocchi.forEach(b -> {
                    assertTrue(ids.add(b.path("id").asText()), dove);
                    assertTrue(b.path("id").asText().startsWith("b_"), dove);
                });
                assertEquals("piedipagina", blocchi.get(blocchi.size() - 1).path("tipo").asText(), dove);
                assertTrue(e.html().startsWith("<!DOCTYPE html>"), dove);
                assertTrue(e.html().contains("width:600px"), dove);
                assertTrue(e.html().contains("{{link_disiscrizione}}"), dove);
                assertTrue(e.oggetto().contains("{{nome|") || e.html().contains("{{nome|"), dove);
                String testo = (e.oggetto() + " " + MailingDocumentoEmail.testoSemplice(e.design())).toLowerCase(Locale.ROOT);
                for (String parola : VIETATE) {
                    assertFalse(testo.contains(parola), dove + " contiene «" + parola + "»");
                }
            }
        }
    }

    @Test
    void strutturaDeiModelli() {
        Map<String, MailingDto.ModelloAutomazione> m = new HashMap<>();
        MailingModelliAutomazioni.tutti(RIF).forEach(x -> m.put(x.chiave(), x));
        assertEquals("NUOVO_LEAD", m.get("benvenuto-lead").trigger().path("tipo").asText());
        assertEquals("CONOSCITIVA_PRENOTATA", m.get("benvenuto-lead").uscita().path("tipo").asText());
        assertTrue(m.get("benvenuto-lead").grafo().toString().contains("haAperto"));
        assertTrue(m.get("benvenuto-lead").email().get(1).html().contains("https://edodoc.it/prenota?da=email"));
        assertEquals("CONOSCITIVA_PRENOTATA", m.get("prima-della-conoscitiva").trigger().path("tipo").asText());
        assertEquals("ESITO_CONOSCITIVA", m.get("ci-pensa").trigger().path("tipo").asText());
        assertEquals("CI_PENSA", m.get("ci-pensa").trigger().path("parametri").path("esito").get(0).asText());
        assertEquals("ACQUISTO", m.get("ci-pensa").uscita().path("tipo").asText());
        assertEquals("ACQUISTO", m.get("benvenuto-percorso").trigger().path("tipo").asText());
        assertEquals(180, m.get("riattivazione").trigger().path("parametri").path("giorni").asInt());
        assertFalse(MailingTrigger.includiGiaInattivi(m.get("riattivazione").trigger()));
        assertTrue(m.get("riattivazione").grafo().toString().contains("NOTIFICA_STAFF"));
        assertTrue(m.get("riattivazione").grafo().toString().contains("haCliccato"));
        assertEquals(0, m.get("compleanno").trigger().path("parametri").path("giorniPrima").asInt());
        assertTrue(MailingModelliAutomazioni.rientroConsentito("compleanno"));
        // senza riferimenti valgono i link del sito
        var predefinito = MailingModelliAutomazioni.trova("benvenuto-lead", new MailingModelliAutomazioni.Riferimenti(null, null));
        assertTrue(predefinito.email().get(1).html().contains(MailingModelliAutomazioni.PRENOTA_PREDEFINITO));
    }

    @Test
    void coordinateVerticaliSullaGrigliaDellaTela() {
        for (MailingDto.ModelloAutomazione m : MailingModelliAutomazioni.tutti(RIF)) {
            MailingGrafo g = MailingGrafo.leggi(m.grafo());
            for (MailingGrafo.Nodo n : g.nodi()) {
                assertEquals(0, (n.y() - MailingModelliAutomazioni.Y0) % MailingModelliAutomazioni.PY, m.chiave() + " " + n.id());
                assertTrue(Math.abs(n.x()) <= MailingModelliAutomazioni.PX, m.chiave());
            }
            // nessuna sovrapposizione
            Set<String> posizioni = new HashSet<>();
            g.nodi().forEach(n -> assertTrue(posizioni.add(n.x() + "," + n.y()), m.chiave() + " " + n.id()));
        }
    }
}
