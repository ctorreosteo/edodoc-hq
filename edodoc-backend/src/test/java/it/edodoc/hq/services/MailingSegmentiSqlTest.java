package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MailingSegmentiSqlTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final LocalDateTime ADESSO = LocalDateTime.of(2026, 10, 25, 10, 0);
    private static final MailingSegmentiSql.Contesto CTX = new MailingSegmentiSql.Contesto(ADESSO);

    private static MailingSegmentiSql.Frammento compila(String json) throws Exception {
        return MailingSegmentiSql.compila(JSON.readTree(json), CTX, "p");
    }

    private static String errore(String json) {
        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> compila(json));
        assertEquals(400, e.getStatusCode().value());
        return e.getReason();
    }

    @Test
    void regoleNulleOGruppoVuotoSonoTuttiIContatti() throws Exception {
        assertEquals("TRUE", MailingSegmentiSql.compila(null, CTX, "p").sql());
        assertEquals("TRUE", compila("{\"operatore\":\"E\",\"condizioni\":[]}").sql());
    }

    @Test
    void esempioConGruppoAnnidato() throws Exception {
        MailingSegmentiSql.Frammento f = compila("""
                { "operatore": "E", "condizioni": [
                  { "campo": "tag", "op": "HA", "valore": 12 },
                  { "operatore": "O", "condizioni": [
                      { "campo": "esitoConoscitiva", "op": "IN", "valore": ["CI_PENSA", "interessato"] },
                      { "campo": "ultimaVisitaGiorni", "op": "MAGGIORE", "valore": 180 } ] } ] }""");
        assertTrue(f.sql().startsWith("(EXISTS (SELECT 1 FROM mailing_contatti_tag ct WHERE ct.contatto_id = c.id AND ct.tag_id = :p1)"));
        assertTrue(f.sql().contains(" AND (EXISTS (SELECT 1 FROM prenotazioni pr WHERE pr.paziente_id = c.paziente_id"));
        assertTrue(f.sql().contains(" OR (SELECT MAX(CAST(v.inizio AS DATE)) FROM visite v"));
        assertTrue(f.sql().contains("v.stato = 'EFFETTUATA' AND v.tipo <> 'CHIAMATA_CONOSCITIVA'"));
        assertEquals(12L, f.parametri().get("p1"));
        assertEquals(List.of("CI_PENSA", "INTERESSATO"), f.parametri().get("p2"));
        assertEquals(LocalDate.of(2026, 10, 25).minusDays(180), f.parametri().get("p3"));
        assertTrue(f.sql().contains("< :p3"));
    }

    @Test
    void statoPazienteEPercorsi() throws Exception {
        MailingSegmentiSql.Frammento f = compila("""
                {"condizioni":[{"campo":"statoPaziente","op":"NON_IN","valore":["LEAD"]},
                               {"campo":"percorsoAcquistato","op":"IN","valore":["METODO_BUSSOLA"]},
                               {"campo":"finePercorsoGiorni","op":"MINORE","valore":30}]}""");
        assertTrue(f.sql().startsWith("(NOT COALESCE(c.paziente_id IN (SELECT p.id FROM pazienti p WHERE p.stato IN (:p1)), FALSE)"));
        assertTrue(f.sql().contains("pc.stato <> 'ANNULLATO' AND pc.tipo IN (:p2)"));
        assertEquals(LocalDate.of(2026, 11, 24), f.parametri().get("p4"));
        assertTrue(f.sql().contains("pc.data_fine <= :p4"));
    }

    @Test
    void tuttiICampiDellaTabellaCompilano() throws Exception {
        String[] condizioni = {
                "{\"campo\":\"tipo\",\"op\":\"UGUALE\",\"valore\":\"SENZA_SCHEDA\"}",
                "{\"campo\":\"stato\",\"op\":\"DIVERSO\",\"valore\":\"ISCRITTO\"}",
                "{\"campo\":\"tag\",\"op\":\"NON_HA\",\"valore\":\"3\"}",
                "{\"campo\":\"statoPaziente\",\"op\":\"IN\",\"valore\":[\"ATTIVO\"]}",
                "{\"campo\":\"fonte\",\"op\":\"IN\",\"valore\":[\"youtube\",\"LIBRO\"]}",
                "{\"campo\":\"haConoscitiva\",\"op\":\"VERO\"}",
                "{\"campo\":\"esitoConoscitiva\",\"op\":\"NON_IN\",\"valore\":\"NON_ADATTO\"}",
                "{\"campo\":\"percorsoAcquistato\",\"op\":\"NON_IN\",\"valore\":[\"RINNOVO\"]}",
                "{\"campo\":\"percorsoAttivo\",\"op\":\"FALSO\"}",
                "{\"campo\":\"finePercorsoGiorni\",\"op\":\"MAGGIORE\",\"valore\":60}",
                "{\"campo\":\"numeroVisite\",\"op\":\"UGUALE\",\"valore\":0}",
                "{\"campo\":\"ultimaVisitaGiorni\",\"op\":\"MINORE\",\"valore\":30}",
                "{\"campo\":\"haVisitaFutura\",\"op\":\"FALSO\"}",
                "{\"campo\":\"primaVisitaGiorni\",\"op\":\"MAGGIORE\",\"valore\":365}",
                "{\"campo\":\"spesaTotale\",\"op\":\"MAGGIORE\",\"valore\":\"250,50\"}",
                "{\"campo\":\"eta\",\"op\":\"TRA\",\"valore\":[30,45]}",
                "{\"campo\":\"citta\",\"op\":\"IN\",\"valore\":[\"Milano\",\" Monza \"]}",
                "{\"campo\":\"compleannoMese\",\"op\":\"UGUALE\",\"valore\":\"CORRENTE\"}",
                "{\"campo\":\"creatoGiorni\",\"op\":\"MINORE\",\"valore\":7}",
                "{\"campo\":\"aperturaCampagna\",\"op\":\"HA\",\"valore\":9}",
                "{\"campo\":\"clickCampagna\",\"op\":\"NON_HA\",\"valore\":9}",
                "{\"campo\":\"coinvolgimento\",\"op\":\"UGUALE\",\"valore\":\"DORMIENTE\"}",
                "{\"campo\":\"punteggio\",\"op\":\"MINORE\",\"valore\":40}",
                "{\"campo\":\"categoriaEsclusa\",\"op\":\"HA\",\"valore\":2}"
        };
        assertEquals(MailingSegmentiSql.Campo.values().length, condizioni.length, "un caso per ogni campo");
        for (String c : condizioni) {
            MailingSegmentiSql.Frammento f = compila("{\"operatore\":\"O\",\"condizioni\":[" + c + "]}");
            assertTrue(f.sql().startsWith("(") && f.sql().endsWith(")"), c);
            assertFalse(f.sql().contains("null"), c);
        }
    }

    @Test
    void valoriTipizzatiNeiParametri() throws Exception {
        MailingSegmentiSql.Frammento f = compila("""
                {"condizioni":[
                  {"campo":"spesaTotale","op":"MAGGIORE","valore":"250,50"},
                  {"campo":"eta","op":"TRA","valore":[30,45]},
                  {"campo":"compleannoMese","op":"UGUALE","valore":"CORRENTE"},
                  {"campo":"creatoGiorni","op":"MINORE","valore":7},
                  {"campo":"citta","op":"IN","valore":"Milano; Monza"}]}""");
        assertEquals(new BigDecimal("250.50"), f.parametri().get("p1"));
        assertEquals(LocalDate.of(1980, 10, 25), f.parametri().get("p2")); // nato dopo: oggi - 46 anni
        assertEquals(LocalDate.of(1996, 10, 25), f.parametri().get("p3")); // nato entro: oggi - 30 anni
        assertEquals(10, f.parametri().get("p4"));
        assertEquals(ADESSO.minusDays(7), f.parametri().get("p5"));
        assertTrue(f.sql().contains("c.creato_il >= :p5"));
        assertEquals(List.of("milano", "monza"), f.parametri().get("p6"));
    }

    @Test
    void spesaMinoreIncludeChiNonHaMaiSpeso() throws Exception {
        String magg = compila("{\"condizioni\":[{\"campo\":\"spesaTotale\",\"op\":\"MAGGIORE\",\"valore\":100}]}").sql();
        String min = compila("{\"condizioni\":[{\"campo\":\"spesaTotale\",\"op\":\"MINORE\",\"valore\":100}]}").sql();
        assertTrue(magg.startsWith("(COALESCE(c.paziente_id IN (SELECT g.paziente_id FROM pagamenti g WHERE g.stato = 'PAGATO'"));
        assertTrue(magg.contains(") > :p1), FALSE)"));
        assertTrue(min.startsWith("(NOT COALESCE(c.paziente_id IN"));
        assertTrue(min.contains(") >= :p1), FALSE)"));
    }

    @Test
    void coinvolgimentoUsaLeSoglieDi30E90Giorni() throws Exception {
        MailingSegmentiSql.Frammento f = compila("""
                {"condizioni":[{"campo":"coinvolgimento","op":"UGUALE","valore":"attivo"}]}""");
        assertEquals(ADESSO.minusDays(30), f.parametri().get("p1"));
        assertEquals(ADESSO.minusDays(90), f.parametri().get("p2"));
        assertEquals("ATTIVO", f.parametri().get("p3"));
        assertTrue(f.sql().contains(">= 3 THEN 'MAI'"));
    }

    @Test
    void prefissoDistingueIParametriDiPiuFrammenti() throws Exception {
        JsonNode r = JSON.readTree("{\"condizioni\":[{\"campo\":\"punteggio\",\"op\":\"MAGGIORE\",\"valore\":50}]}");
        MailingSegmentiSql.Frammento a = MailingSegmentiSql.compila(r, CTX, "si0_");
        MailingSegmentiSql.Frammento b = MailingSegmentiSql.compila(r, CTX, "se0_");
        assertEquals("(c.punteggio > :si0_1)", a.sql());
        assertEquals("(c.punteggio > :se0_1)", b.sql());
        assertThrows(IllegalArgumentException.class, () -> MailingSegmentiSql.compila(r, CTX, "x;DROP"));
    }

    @Test
    void campiEOperatoriFuoriWhitelistSonoRifiutati() {
        assertTrue(errore("{\"condizioni\":[{\"campo\":\"email\",\"op\":\"UGUALE\",\"valore\":\"a@b.it\"}]}")
                .contains("Campo non ammesso"));
        assertTrue(errore("{\"condizioni\":[{\"campo\":\"c.id; DROP TABLE pazienti\",\"op\":\"HA\",\"valore\":1}]}")
                .contains("Campo non ammesso"));
        assertTrue(errore("{\"condizioni\":[{\"campo\":\"tag\",\"op\":\"UGUALE\",\"valore\":1}]}")
                .contains("Operatore non ammesso"));
        assertTrue(errore("{\"condizioni\":[{\"campo\":\"punteggio\",\"op\":\">= 0 OR 1=1 --\",\"valore\":1}]}")
                .contains("Operatore non ammesso"));
        assertTrue(errore("{\"operatore\":\"XOR\",\"condizioni\":[]}").contains("Operatore di gruppo"));
        assertTrue(errore("[1,2]").contains("gruppo"));
        assertTrue(errore("{\"condizioni\":[{\"campo\":\"tipo\",\"op\":\"UGUALE\",\"valore\":\"X\"}]}").contains("Ammessi"));
        assertTrue(errore("{\"condizioni\":[{\"campo\":\"eta\",\"op\":\"TRA\",\"valore\":[50,20]}]}").contains("minimo"));
        assertTrue(errore("{\"condizioni\":[{\"campo\":\"compleannoMese\",\"op\":\"UGUALE\",\"valore\":13}]}").contains("mese"));
        assertTrue(errore("{\"condizioni\":[{\"campo\":\"punteggio\",\"op\":\"MAGGIORE\",\"valore\":101}]}").contains("tra 0 e 100"));
        assertTrue(errore("{\"condizioni\":[{\"campo\":\"tag\",\"op\":\"HA\"}]}").contains("Scegli"));
        assertTrue(errore("{\"condizioni\":[{\"campo\":\"fonte\",\"op\":\"IN\",\"valore\":[]}]}").contains("almeno"));
        assertTrue(errore("{\"condizioni\":[{\"campo\":\"fonte\",\"op\":\"IN\",\"valore\":[\"'; --\"]}]}").contains("Ammessi"));
    }

    @Test
    void iValoriNonEntranoMaiNelTestoSql() throws Exception {
        String cattivo = "x' OR '1'='1'); DROP TABLE mailing_contatti; --";
        MailingSegmentiSql.Frammento f = MailingSegmentiSql.compila(JSON.readTree(
                JSON.writeValueAsString(Map.of("condizioni", List.of(
                        Map.of("campo", "citta", "op", "IN", "valore", List.of(cattivo)))))), CTX, "p");
        assertFalse(f.sql().contains("DROP"));
        assertFalse(f.sql().contains("'1'='1'"));
        assertEquals(List.of(cattivo.toLowerCase()), f.parametri().get("p1"));
        assertEquals("50\\%\\_off", MailingSegmentiSql.escapeLike("50%_off"));
    }

    @Test
    void profonditaMassimaQuattroLivelli() throws Exception {
        assertTrue(compila(annidato(4)).sql().contains("c.punteggio"));
        assertTrue(errore(annidato(5)).contains("annidati"));
    }

    @Test
    void alMassimoCinquantaCondizioni() throws Exception {
        assertTrue(compila(tante(50)).sql().contains(":p50"));
        assertTrue(errore(tante(51)).contains("Troppe condizioni"));
    }

    @Test
    void valoriInElencoLimitati() throws Exception {
        ArrayNode ids = JSON.createArrayNode();
        for (int i = 1; i <= 201; i++) {
            ids.add("citta" + i);
        }
        ObjectNode cond = JSON.createObjectNode().put("campo", "citta").put("op", "IN");
        cond.set("valore", ids);
        ObjectNode g = JSON.createObjectNode();
        g.putArray("condizioni").add(cond);
        assertThrows(ResponseStatusException.class, () -> MailingSegmentiSql.compila(g, CTX, "p"));
    }

    private static String annidato(int livelli) {
        String interno = "{\"campo\":\"punteggio\",\"op\":\"MAGGIORE\",\"valore\":1}";
        for (int i = 0; i < livelli; i++) {
            interno = "{\"operatore\":\"" + (i % 2 == 0 ? "E" : "O") + "\",\"condizioni\":[" + interno + "]}";
        }
        return interno;
    }

    private static String tante(int n) {
        StringBuilder sb = new StringBuilder("{\"operatore\":\"O\",\"condizioni\":[");
        for (int i = 0; i < n; i++) {
            sb.append(i == 0 ? "" : ",").append("{\"campo\":\"punteggio\",\"op\":\"MAGGIORE\",\"valore\":").append(i % 100).append("}");
        }
        return sb.append("]}").toString();
    }
}
