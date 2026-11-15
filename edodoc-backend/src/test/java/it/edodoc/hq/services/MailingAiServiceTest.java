package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import it.edodoc.hq.dto.MailingDto;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static it.edodoc.hq.services.MailingGrafoTest.j;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MailingAiServiceTest {

    private static final ObjectMapper OM = new ObjectMapper();

    private static final List<MailingDto.CatalogoCampo> CATALOGO = List.of(
            new MailingDto.CatalogoCampo("tag", "Tag", "Contatto", "SELECT", List.of("HA", "NON_HA"),
                    List.of(new MailingDto.Opzione("1", "VIP")), null),
            new MailingDto.CatalogoCampo("fonte", "Fonte", "Paziente", "MULTI_SELECT", List.of("IN", "NON_IN"),
                    List.of(new MailingDto.Opzione("YOUTUBE", "YouTube"), new MailingDto.Opzione("INSTAGRAM", "Instagram")), null),
            new MailingDto.CatalogoCampo("ultimaVisitaGiorni", "Giorni dall'ultima visita", "Visite", "NUMERO",
                    List.of("MAGGIORE", "MINORE"), List.of(), null),
            new MailingDto.CatalogoCampo("haVisitaFutura", "Ha una visita prenotata", "Visite", "NESSUNO",
                    List.of("VERO", "FALSO"), List.of(), null));

    @Test
    void emailDaRispostaSporcaConBlocchiNonValidiScartati() {
        String risposta = "Ecco la tua email!\n```json\n{\"oggetti\": [\"Un consiglio per la schiena\", \"«Come stai?»\", "
                + "\"Un consiglio per la schiena\", \"Quarto\", \"Quinto\"], \"preheader\": \"Due minuti per te\", "
                + "\"documento\": {\"impostazioni\": {\"colorePrimario\": \"#ABCDEF\", \"sfondo\": \"rosso\"}, \"blocchi\": ["
                + "{\"id\": \"x\", \"tipo\": \"titolo\", \"props\": {\"testo\": \"Ciao {{nome|Ciao}}\", \"livello\": 9}},"
                + "{\"tipo\": \"testo\", \"props\": {\"html\": \"<p>Muoviti <script>alert(1)</script><strong>ogni ora</strong></p>\"}},"
                + "{\"tipo\": \"video\", \"props\": {\"url\": \"https://youtube.com/x\"}},"
                + "{\"tipo\": \"pulsante\", \"props\": {\"testo\": \"Prenota\", \"url\": \"javascript:alert(1)\"}},"
                + "{\"tipo\": \"pulsante\", \"props\": {\"testo\": \"Prenota\", \"url\": \"https://www.edodoc.it\"}},"
                + "{\"tipo\": \"testo\", \"props\": {\"html\": \"   \"}},"
                + "{\"tipo\": \"spazio\", \"props\": {\"altezza\": 5000}}"
                + "]}}\n```\nFammi sapere!";
        MailingDto.AiEmail e = MailingAiService.interpretaEmail(risposta, OM, null);
        JsonNode blocchi = e.design().path("blocchi");
        List<String> tipi = new java.util.ArrayList<>();
        blocchi.forEach(b -> tipi.add(b.path("tipo").asText()));
        assertEquals(List.of("titolo", "testo", "pulsante", "spazio", "piedipagina"), tipi);
        assertEquals(3, blocchi.get(0).path("props").path("livello").asInt());
        assertNotEquals("x", blocchi.get(0).path("id").asText());
        assertTrue(blocchi.get(0).path("id").asText().matches("b_[a-z0-9]{6}"));
        assertFalse(blocchi.get(1).path("props").path("html").asText().contains("script"));
        assertTrue(blocchi.get(1).path("props").path("html").asText().contains("<strong>ogni ora</strong>"));
        assertEquals(120, blocchi.get(3).path("props").path("altezza").asInt());
        assertEquals("#abcdef", e.design().path("impostazioni").path("colorePrimario").asText());
        assertEquals("#f4f5f7", e.design().path("impostazioni").path("sfondo").asText());
        assertEquals(1, e.design().path("versione").asInt());
        assertEquals(List.of("Un consiglio per la schiena", "Come stai?", "Quarto"), e.oggetti());
        assertEquals("Due minuti per te", e.preheader());
    }

    @Test
    void piedipaginaSpostatoInFondoEImpostazioniRichieste() {
        String r = "{\"documento\":{\"blocchi\":[{\"tipo\":\"piedipagina\",\"props\":{\"testo\":\"Perché sei paziente\"}},"
                + "{\"tipo\":\"testo\",\"props\":{\"html\":\"Riga uno\\n\\nRiga due\"}}]},\"oggetti\":[],\"preheader\":\"\"}";
        MailingDto.AiEmail e = MailingAiService.interpretaEmail(r, OM, j("{'colorePrimario':'#112233','larghezza':640}"));
        JsonNode b = e.design().path("blocchi");
        assertEquals("testo", b.get(0).path("tipo").asText());
        assertEquals("<p>Riga uno</p><p>Riga due</p>", b.get(0).path("props").path("html").asText());
        assertEquals("piedipagina", b.get(1).path("tipo").asText());
        assertEquals("#112233", e.design().path("impostazioni").path("colorePrimario").asText());
        assertEquals(640, e.design().path("impostazioni").path("larghezza").asInt());
        assertEquals(null, e.preheader());
    }

    @Test
    void emailSenzaContenutoORispostaIlleggibileDa502() {
        assertThrows(ResponseStatusException.class, () -> MailingAiService.interpretaEmail("non è json", OM, null));
        assertThrows(ResponseStatusException.class, () -> MailingAiService.interpretaEmail("{\"documento\":{\"blocchi\":[{\"tipo\":\"divisore\"}]}}", OM, null));
        assertThrows(ResponseStatusException.class, () -> MailingAiService.interpretaEmail("{rotto: }", OM, null));
        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> MailingAiService.interpretaEmail("", OM, null));
        assertEquals(502, e.getStatusCode().value());
    }

    @Test
    void oggettiConPunteggioLimitatoEDuplicatiTolti() {
        String r = "Proposte: {\"oggetti\":[{\"oggetto\":\"A\",\"punteggio\":150,\"motivazione\":\"m\"},"
                + "{\"oggetto\":\"a\",\"punteggio\":50},{\"oggetto\":\"B\",\"punteggio\":\"-3\"},{\"oggetto\":\"\"},"
                + "{\"oggetto\":\"C\"},{\"oggetto\":\"D\"},{\"oggetto\":\"E\"},{\"oggetto\":\"F\"}]}";
        List<MailingDto.AiOggetto> o = MailingAiService.interpretaOggetti(r, OM);
        assertEquals(5, o.size());
        assertEquals(100, o.get(0).punteggio());
        assertEquals(1, o.get(1).punteggio());
        assertEquals(50, o.get(2).punteggio());
        assertEquals(List.of("A", "B", "C", "D", "E"), o.stream().map(MailingDto.AiOggetto::oggetto).toList());
    }

    @Test
    void riscritturaAccettaAncheTestoSempliceEPulisceHtml() {
        assertEquals("Ciao!", MailingAiService.interpretaRiscrittura("Ciao!", OM, "Salve").testo());
        assertEquals("<p>Ciao <strong>tu</strong></p>",
                MailingAiService.interpretaRiscrittura("{\"testo\":\"<p onclick='x'>Ciao <strong>tu</strong></p>\"}", OM, "<p>Salve</p>").testo());
        assertThrows(ResponseStatusException.class, () -> MailingAiService.interpretaRiscrittura("{\"testo\":\"\"}", OM, "x"));
    }

    @Test
    void segmentoValidatoControIlCatalogo() {
        String r = "{\"regole\":{\"operatore\":\"E\",\"condizioni\":["
                + "{\"campo\":\"tag\",\"op\":\"HA\",\"valore\":\"1\"},"
                + "{\"campo\":\"tag\",\"op\":\"HA\",\"valore\":\"99\"},"
                + "{\"campo\":\"inventato\",\"op\":\"UGUALE\",\"valore\":1},"
                + "{\"campo\":\"ultimaVisitaGiorni\",\"op\":\"TRA\",\"valore\":[1,2]},"
                + "{\"operatore\":\"O\",\"condizioni\":[{\"campo\":\"fonte\",\"op\":\"IN\",\"valore\":[\"YOUTUBE\",\"TIKTOK\"]},"
                + "{\"campo\":\"ultimaVisitaGiorni\",\"op\":\"MAGGIORE\",\"valore\":180}]},"
                + "{\"campo\":\"haVisitaFutura\",\"op\":\"FALSO\"},"
                + "{\"operatore\":\"E\",\"condizioni\":[{\"campo\":\"fonte\",\"op\":\"IN\",\"valore\":[\"TIKTOK\"]}]}"
                + "]},\"spiegazione\":\"Pazienti VIP arrivati da YouTube.\"}";
        MailingDto.AiSegmento s = MailingAiService.interpretaSegmento(r, OM, CATALOGO);
        JsonNode c = s.regole().path("condizioni");
        assertEquals(3, c.size(), s.regole().toString());
        assertEquals("tag", c.get(0).path("campo").asText());
        assertEquals("O", c.get(1).path("operatore").asText());
        assertEquals("[\"YOUTUBE\"]", c.get(1).path("condizioni").get(0).path("valore").toString());
        assertEquals("haVisitaFutura", c.get(2).path("campo").asText());
        assertTrue(s.spiegazione().startsWith("Pazienti VIP arrivati da YouTube."));
        assertTrue(s.spiegazione().contains("4 condizioni non valide"), s.spiegazione());
    }

    @Test
    void segmentoSenzaCondizioniValideDa502() {
        assertThrows(ResponseStatusException.class, () -> MailingAiService.interpretaSegmento(
                "{\"regole\":{\"condizioni\":[{\"campo\":\"boh\",\"op\":\"HA\"}]}}", OM, CATALOGO));
    }

    @Test
    void analisiConConsigliLimitatiATre() {
        MailingDto.AiAnalisi a = MailingAiService.interpretaAnalisi("ok {\"sintesi\":\"Buona apertura (42%).\","
                + "\"puntiForza\":[\"Oggetto chiaro\"],\"consigli\":[\"1\",\"2\",\"3\",\"4\"]} fine", OM);
        assertEquals(3, a.consigli().size());
        assertEquals("Buona apertura (42%).", a.sintesi());
        assertThrows(ResponseStatusException.class, () -> MailingAiService.interpretaAnalisi("{}", OM));
    }

    @Test
    void catalogoPerIlPromptCompatto() {
        String s = MailingAiService.catalogoPerAi(CATALOGO, OM);
        assertTrue(s.contains("\"campo\":\"fonte\""));
        assertTrue(s.contains("\"valore\":\"YOUTUBE\""));
    }
}
