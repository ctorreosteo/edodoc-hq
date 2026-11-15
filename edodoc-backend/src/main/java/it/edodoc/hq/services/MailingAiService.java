package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import it.edodoc.hq.ai.AiClient;
import it.edodoc.hq.dto.MailingDto;
import it.edodoc.hq.models.MailingCampagna;
import it.edodoc.hq.repositories.MailingCampagnaRepository;
import it.edodoc.hq.repositories.MailingSegmentoRepository;
import org.jsoup.Jsoup;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * AI della pagina Email Marketing: email a blocchi da un brief, oggetti alternativi, riscrittura di un testo con un
 * tono, regole di segmento da una frase, lettura dei risultati di una campagna.
 * Ad Anthropic vanno solo testi delle email, descrizioni e metriche aggregate: mai email, nomi o dati dei contatti.
 * I prompt stanno qui (come YoutubeAiService). Le risposte si validano e normalizzano lato server.
 */
@Service
public class MailingAiService {

    private static final String CONTESTO = """
            Lavori per il Dr. Edoardo Bo, biologo nutrizionista e mental coach italiano. Scrivi email ai suoi pazienti e
            ai contatti che lo seguono (YouTube, Instagram, masterclass, libro): persone che vogliono cambiare
            alimentazione, peso, energia e rapporto con il cibo, o che hanno già un percorso con lui (Metodo Bussola).
            Le email parlano in prima persona come Edoardo.
            Regole di comunicazione sanitaria, obbligatorie: niente promesse di dimagrimento o risultati garantiti, niente
            numeri di chili in un tempo dato, niente diagnosi né diete o indicazioni personali, nessun confronto
            denigratorio con altri professionisti, nessun allarmismo né colpevolizzazione sul corpo; per sintomi o
            patologie si consiglia di sentire il medico. Tono competente, umano, diretto, mai commerciale aggressivo.
            Scrivi in italiano, dando del tu.
            Segnaposto disponibili (vanno scritti esattamente così): {{nome|Ciao}} (nome con fallback), {{cognome}},
            {{nome_completo}}, {{prossima_visita}},
            {{link_preferenze}}, {{link_disiscrizione}}, {{link_browser}}, {{anno}}.
            """;

    private static final String SYSTEM_EMAIL = CONTESTO + """
            Sei un copywriter di email marketing di livello mondiale per la sanità. Dal brief prepari un'email completa.
            Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo:
            {"oggetti": ["...", "...", "..."], "preheader": "...",
             "documento": {"blocchi": [{"tipo": "...", "props": {...}}]}}
            Blocchi ammessi e props:
            - intestazione {"testo": sottotitolo breve opzionale} (niente logo)
            - titolo {"testo": "...", "livello": 1|2|3}
            - testo {"html": "<p>...</p>"} solo con i tag p, br, strong, em, u, a href, ul, ol, li, h2, h3
            - pulsante {"testo": "...", "url": "https://..."}
            - immagine {"url": "https://...", "alt": "..."} SOLO se il brief fornisce l'URL dell'immagine
            - divisore {}
            - spazio {"altezza": 16}
            - recensione {"testo": "...", "autore": "...", "stelle": 5} SOLO se il brief fornisce una recensione vera
            - piedipagina {"testo": "<p>perché ricevi questa email</p>"}
            Struttura consigliata: intestazione, titolo, 2-4 blocchi testo brevi e leggibili su telefono, un pulsante
            con una sola azione chiara, eventuale divisore, piedipagina per ultimo. Apri con {{nome|Ciao}}.
            Se il brief non indica un link usa https://edodoc.it per il pulsante.
            oggetti: 3 oggetti diversi per angolo, massimo 60 caratteri, niente maiuscolo urlato né punti esclamativi
            multipli, niente parole tipiche dello spam (gratis!!!, urgente, offerta imperdibile).
            preheader: massimo 100 caratteri, completa l'oggetto senza ripeterlo.
            """;

    private static final String SYSTEM_OGGETTI = CONTESTO + """
            Sei un esperto di tassi di apertura delle email. Proponi 5 oggetti alternativi per l'email descritta, diversi
            per angolo (curiosità, beneficio concreto, domanda, personale con {{nome|Ciao}}, notizia), massimo 60
            caratteri, senza parole da spam. Per ciascuno stima un punteggio da 1 a 100 della probabilità di apertura
            rispetto a una newsletter media di un professionista della salute e spiega il perché in una frase.
            Rispondi SOLO con un oggetto JSON valido:
            {"oggetti": [{"oggetto": "...", "punteggio": 72, "motivazione": "..."}]}
            """;

    private static final String SYSTEM_RISCRIVI = CONTESTO + """
            Riscrivi il testo che ricevi con il tono richiesto, mantenendo il significato, le informazioni e i segnaposto
            {{...}} esattamente come sono. Se il testo contiene tag HTML, restituisci HTML con gli stessi tipi di tag
            (p, br, strong, em, u, a href, ul, ol, li, h2, h3) e gli stessi link. Non aggiungere promesse né dati inventati.
            Rispondi SOLO con un oggetto JSON valido: {"testo": "..."}
            """;

    private static final String SYSTEM_SEGMENTO = """
            Traduci una descrizione in italiano di un gruppo di contatti di un nutrizionista in regole di segmento.
            Usa SOLO i campi, gli operatori e le opzioni del CATALOGO che ricevi. Formato delle regole:
            {"operatore": "E"|"O", "condizioni": [ {"campo": "...", "op": "...", "valore": ...} | gruppo annidato ]}
            Valori per tipo: SELECT → uno dei "valore" delle opzioni; MULTI_SELECT → elenco di "valore" delle opzioni;
            NUMERO → numero; INTERVALLO → [min, max]; NESSUNO → nessun valore; MESE → 1-12 oppure "CORRENTE";
            TESTO → testo. Al massimo 4 livelli di gruppi. Se una parte della descrizione non è esprimibile col
            catalogo, ignorala e dillo nella spiegazione.
            Rispondi SOLO con un oggetto JSON valido: {"regole": {...}, "spiegazione": "una o due frasi in italiano"}
            """;

    private static final String SYSTEM_ANALISI = CONTESTO + """
            Sei il consulente di email marketing del Dr. Bo. Ricevi le metriche aggregate di una campagna (aperture e
            click umani, cioè senza quelli automatici dei sistemi di sicurezza), il confronto con le campagne recenti,
            oggetto e testo dell'email. Leggi i risultati come farebbe il miglior consulente: concreto, numerico.
            Rispondi SOLO con un oggetto JSON valido:
            {"sintesi": "2-3 frasi con i numeri chiave", "puntiForza": ["..."], "consigli": ["...", "...", "..."]}
            - puntiForza: 2-3, ognuno con un numero a sostegno.
            - consigli: esattamente 3, pratici e applicabili alla prossima email (oggetto, contenuto, pulsante, orario,
              pubblico). Non inventare numeri che non sono nei dati.
            """;

    private final AiClient aiClient;
    private final MailingSegmentiService segmenti;
    private final MailingSegmentoRepository segmentoRepository;
    private final MailingCampagnaRepository campagnaRepository;
    private final MailingMetricheService metriche;
    private final ObjectMapper objectMapper;
    private final boolean disponibile;

    public MailingAiService(AiClient aiClient, MailingSegmentiService segmenti, MailingSegmentoRepository segmentoRepository,
                            MailingCampagnaRepository campagnaRepository, MailingMetricheService metriche,
                            ObjectMapper objectMapper) {
        this.aiClient = aiClient;
        this.segmenti = segmenti;
        this.segmentoRepository = segmentoRepository;
        this.campagnaRepository = campagnaRepository;
        this.metriche = metriche;
        this.objectMapper = objectMapper;
        this.disponibile = aiClient.isDisponibile();
    }

    public boolean isDisponibile() {
        return disponibile;
    }

    // ───────────────────────── Email ─────────────────────────

    public MailingDto.AiEmail email(MailingDto.AiEmailInput in) {
        verificaDisponibile();
        if (in == null || !StringUtils.hasText(in.brief())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Descrivi l'email che vuoi scrivere.");
        }
        StringBuilder u = new StringBuilder();
        u.append("BRIEF:\n").append(tronca(in.brief().trim(), 6000)).append('\n');
        if (StringUtils.hasText(in.obiettivo())) {
            u.append("OBIETTIVO: ").append(tronca(in.obiettivo().trim(), 500)).append('\n');
        }
        u.append("TONO: ").append(tono(in.tono())).append('\n');
        if (in.segmentoId() != null) {
            segmentoRepository.findById(in.segmentoId()).ifPresent(s -> u.append("DESTINATARI (segmento): ")
                    .append(s.getNome()).append(StringUtils.hasText(s.getDescrizione()) ? " – " + s.getDescrizione() : "")
                    .append('\n'));
        }
        String risposta = aiClient.generateContent(SYSTEM_EMAIL, u.toString(), AiClient.LONG_OUTPUT_MAX_TOKENS);
        return interpretaEmail(risposta, objectMapper, in.impostazioni());
    }

    /** Risposta AI → email valida per l'editor: documento normalizzato (id del backend), 3 oggetti, preheader. */
    static MailingDto.AiEmail interpretaEmail(String risposta, ObjectMapper om, JsonNode impostazioni) {
        JsonNode j = estraiJson(risposta, om);
        JsonNode doc = j.path("documento").isObject() ? j.path("documento") : j.path("design");
        if (!doc.isObject() && j.path("blocchi").isArray()) {
            doc = j;
        }
        MailingDocumentoEmail.Normalizzato n = MailingDocumentoEmail.normalizza(doc, MailingDocumentoEmail.TIPI_AI, impostazioni);
        ObjectNode documento = n.documento();
        ArrayNode blocchi = (ArrayNode) documento.path("blocchi");
        boolean haContenuto = false;
        for (JsonNode b : blocchi) {
            String t = b.path("tipo").asText();
            if (t.equals("testo") || t.equals("titolo")) {
                haContenuto = true;
            }
        }
        if (!haContenuto) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "L'AI non ha prodotto un'email utilizzabile, riprova.");
        }
        // Il piedipagina va sempre in fondo (disiscrizione e indirizzo): se manca lo aggiunge il backend.
        boolean piede = false;
        for (int i = 0; i < blocchi.size(); i++) {
            if ("piedipagina".equals(blocchi.get(i).path("tipo").asText())) {
                if (i != blocchi.size() - 1) {
                    JsonNode b = blocchi.remove(i);
                    blocchi.add(b);
                }
                piede = true;
                break;
            }
        }
        if (!piede) {
            blocchi.add(MailingDocumentoEmail.piedipagina("Ricevi questa email perché sei in contatto con il Dr. Edoardo Bo."));
        }
        List<String> oggetti = new ArrayList<>();
        for (JsonNode o : MailingGrafo.iterabile(j.path("oggetti"))) {
            String s = pulisciRiga(o.isObject() ? o.path("oggetto").asText("") : o.asText(""), 150);
            if (!s.isEmpty() && !oggetti.contains(s)) {
                oggetti.add(s);
            }
        }
        if (oggetti.size() > 3) {
            oggetti = oggetti.subList(0, 3);
        }
        String preheader = pulisciRiga(j.path("preheader").asText(""), 200);
        return new MailingDto.AiEmail(documento, List.copyOf(oggetti), preheader.isEmpty() ? null : preheader);
    }

    // ───────────────────────── Oggetti ─────────────────────────

    public List<MailingDto.AiOggetto> oggetti(MailingDto.AiOggettiInput in) {
        verificaDisponibile();
        if (in == null || (!StringUtils.hasText(in.oggetto()) && !StringUtils.hasText(in.contenuto()))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Scrivi un oggetto o il contenuto dell'email.");
        }
        StringBuilder u = new StringBuilder();
        if (StringUtils.hasText(in.oggetto())) {
            u.append("OGGETTO ATTUALE: ").append(tronca(in.oggetto().trim(), 300)).append('\n');
        }
        if (StringUtils.hasText(in.obiettivo())) {
            u.append("OBIETTIVO: ").append(tronca(in.obiettivo().trim(), 500)).append('\n');
        }
        if (StringUtils.hasText(in.contenuto())) {
            u.append("CONTENUTO DELL'EMAIL:\n").append(tronca(testoDaHtml(in.contenuto()), 6000)).append('\n');
        }
        return interpretaOggetti(aiClient.generateContent(SYSTEM_OGGETTI, u.toString(), 1500), objectMapper);
    }

    static List<MailingDto.AiOggetto> interpretaOggetti(String risposta, ObjectMapper om) {
        JsonNode j = estraiJson(risposta, om);
        JsonNode arr = j.path("oggetti").isArray() ? j.path("oggetti") : j.path("proposte");
        List<MailingDto.AiOggetto> out = new ArrayList<>();
        Set<String> visti = new HashSet<>();
        for (JsonNode o : MailingGrafo.iterabile(arr)) {
            String oggetto = pulisciRiga(o.isObject() ? o.path("oggetto").asText("") : o.asText(""), 150);
            if (oggetto.isEmpty() || !visti.add(oggetto.toLowerCase(Locale.ROOT))) {
                continue;
            }
            int punteggio = (int) Math.max(1, Math.min(100, MailingGrafo.numero(o.path("punteggio"), 50L)));
            out.add(new MailingDto.AiOggetto(oggetto, punteggio, pulisciRiga(o.path("motivazione").asText(""), 400)));
            if (out.size() == 5) {
                break;
            }
        }
        if (out.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "L'AI non ha proposto oggetti, riprova.");
        }
        return out;
    }

    // ───────────────────────── Riscrittura ─────────────────────────

    public MailingDto.AiTesto riscrivi(MailingDto.AiRiscriviInput in) {
        verificaDisponibile();
        if (in == null || !StringUtils.hasText(in.testo())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Scrivi il testo da riscrivere.");
        }
        String user = "TONO: " + tono(in.tono()) + "\nTESTO:\n" + tronca(in.testo(), 8000);
        return interpretaRiscrittura(aiClient.generateContent(SYSTEM_RISCRIVI, user, 3000), objectMapper, in.testo());
    }

    static MailingDto.AiTesto interpretaRiscrittura(String risposta, ObjectMapper om, String originale) {
        String testo;
        try {
            testo = estraiJson(risposta, om).path("testo").asText("");
        } catch (ResponseStatusException e) {
            testo = risposta == null ? "" : risposta.trim(); // testo semplice senza JSON: si usa così
        }
        if (testo.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "L'AI non ha restituito il testo, riprova.");
        }
        if (originale != null && originale.contains("<")) {
            testo = MailingDocumentoEmail.sanificaTesto(testo);
        }
        return new MailingDto.AiTesto(testo.trim());
    }

    // ───────────────────────── Segmento ─────────────────────────

    public MailingDto.AiSegmento segmento(MailingDto.AiSegmentoInput in) {
        verificaDisponibile();
        if (in == null || !StringUtils.hasText(in.descrizione())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Descrivi a parole chi vuoi includere.");
        }
        List<MailingDto.CatalogoCampo> catalogo = segmenti.catalogo();
        String user = "CATALOGO:\n" + catalogoPerAi(catalogo, objectMapper) + "\n\nDESCRIZIONE: " + tronca(in.descrizione().trim(), 1000);
        return interpretaSegmento(aiClient.generateContent(SYSTEM_SEGMENTO, user, 2000), objectMapper, catalogo);
    }

    /** Catalogo compatto per il prompt (al massimo 60 opzioni per campo). */
    static String catalogoPerAi(List<MailingDto.CatalogoCampo> catalogo, ObjectMapper om) {
        ArrayNode arr = JsonNodeFactory.instance.arrayNode();
        for (MailingDto.CatalogoCampo c : catalogo) {
            ObjectNode o = arr.addObject();
            o.put("campo", c.campo());
            o.put("etichetta", c.etichetta());
            o.put("tipoValore", c.tipoValore());
            o.set("operatori", om.valueToTree(c.operatori()));
            if (c.opzioni() != null && !c.opzioni().isEmpty()) {
                ArrayNode op = o.putArray("opzioni");
                c.opzioni().stream().limit(60).forEach(x -> op.addObject().put("valore", x.valore()).put("etichetta", x.etichetta()));
            }
            if (c.aiuto() != null) {
                o.put("aiuto", c.aiuto());
            }
        }
        return arr.toString();
    }

    static MailingDto.AiSegmento interpretaSegmento(String risposta, ObjectMapper om, List<MailingDto.CatalogoCampo> catalogo) {
        JsonNode j = estraiJson(risposta, om);
        JsonNode regole = j.path("regole").isObject() ? j.path("regole") : (j.has("condizioni") ? j : null);
        int[] scartate = {0};
        ObjectNode valide = regole == null ? null : validaGruppo(regole, catalogo, 1, scartate);
        if (valide == null || valide.path("condizioni").isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Non sono riuscito a tradurre la descrizione in regole valide: prova a dirlo in un altro modo.");
        }
        String spiegazione = pulisciRiga(j.path("spiegazione").asText(""), 600);
        if (scartate[0] > 0) {
            spiegazione = (spiegazione.isEmpty() ? "" : spiegazione + " ")
                    + (scartate[0] == 1 ? "Una condizione non valida è stata scartata."
                    : scartate[0] + " condizioni non valide sono state scartate.");
        }
        return new MailingDto.AiSegmento(valide, spiegazione);
    }

    /** Gruppo con le sole condizioni valide per il catalogo; null se vuoto. */
    static ObjectNode validaGruppo(JsonNode gruppo, List<MailingDto.CatalogoCampo> catalogo, int profondita, int[] scartate) {
        if (gruppo == null || !gruppo.isObject() || profondita > MailingSegmentiSql.PROFONDITA_MAX) {
            scartate[0]++;
            return null;
        }
        String operatore = gruppo.path("operatore").asText("E").trim().toUpperCase(Locale.ROOT);
        ObjectNode out = JsonNodeFactory.instance.objectNode();
        out.put("operatore", "O".equals(operatore) || "OR".equals(operatore) ? "O" : "E");
        ArrayNode condizioni = out.putArray("condizioni");
        for (JsonNode c : MailingGrafo.iterabile(gruppo.path("condizioni"))) {
            if (condizioni.size() >= MailingSegmentiSql.CONDIZIONI_MAX) {
                scartate[0]++;
                continue;
            }
            if (c.has("condizioni")) {
                ObjectNode sotto = validaGruppo(c, catalogo, profondita + 1, scartate);
                if (sotto != null && !sotto.path("condizioni").isEmpty()) {
                    condizioni.add(sotto);
                }
                continue;
            }
            ObjectNode foglia = validaCondizione(c, catalogo);
            if (foglia == null) {
                scartate[0]++;
            } else {
                condizioni.add(foglia);
            }
        }
        return condizioni.isEmpty() ? null : out;
    }

    /** Una condizione è valida se campo e operatore sono nel catalogo, il valore è tra le opzioni e il compilatore la accetta. */
    static ObjectNode validaCondizione(JsonNode c, List<MailingDto.CatalogoCampo> catalogo) {
        String campo = MailingGrafo.testo(c.path("campo"));
        String op = MailingGrafo.testo(c.path("op"));
        if (campo == null || op == null) {
            return null;
        }
        MailingDto.CatalogoCampo def = catalogo.stream().filter(x -> x.campo().equals(campo)).findFirst().orElse(null);
        if (def == null || def.operatori() == null || !def.operatori().contains(op.toUpperCase(Locale.ROOT))) {
            return null;
        }
        ObjectNode out = JsonNodeFactory.instance.objectNode();
        out.put("campo", campo);
        out.put("op", op.toUpperCase(Locale.ROOT));
        JsonNode valore = c.path("valore");
        Set<String> ammessi = new LinkedHashSet<>();
        if (def.opzioni() != null) {
            def.opzioni().forEach(o -> ammessi.add(o.valore()));
        }
        String tipo = def.tipoValore() == null ? "" : def.tipoValore();
        switch (tipo) {
            case "NESSUNO" -> {
            }
            case "MULTI_SELECT" -> {
                ArrayNode lista = out.putArray("valore");
                List<JsonNode> valori = new ArrayList<>();
                if (valore.isArray()) {
                    valore.forEach(valori::add);
                } else if (!valore.isMissingNode() && !valore.isNull()) {
                    valori.add(valore);
                }
                for (JsonNode v : valori) {
                    String s = MailingGrafo.testo(v);
                    if (s != null && (ammessi.isEmpty() || ammessi.contains(s))) {
                        lista.add(v.isNumber() ? v : JsonNodeFactory.instance.textNode(s));
                    }
                }
                if (lista.isEmpty()) {
                    return null;
                }
            }
            case "SELECT" -> {
                String s = MailingGrafo.testo(valore.isArray() && valore.size() > 0 ? valore.get(0) : valore);
                if (s == null || (!ammessi.isEmpty() && !ammessi.contains(s))) {
                    return null;
                }
                out.set("valore", valore.isArray() ? valore.get(0) : valore);
            }
            default -> {
                if (valore.isMissingNode() || valore.isNull()) {
                    return null;
                }
                out.set("valore", valore);
            }
        }
        // Ultimo controllo: lo stesso compilatore SQL dei segmenti (tipi, intervalli, mesi...).
        try {
            ObjectNode prova = JsonNodeFactory.instance.objectNode();
            prova.put("operatore", "E");
            prova.putArray("condizioni").add(out);
            MailingSegmentiSql.valida(prova);
        } catch (RuntimeException e) {
            return null;
        }
        return out;
    }

    // ───────────────────────── Analisi campagna ─────────────────────────

    public MailingDto.AiAnalisi analisiCampagna(long campagnaId) {
        verificaDisponibile();
        MailingCampagna c = campagnaRepository.findById(campagnaId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Campagna non trovata."));
        if (c.getStato() != MailingCampagna.Stato.INVIATA
                && c.getStato() != MailingCampagna.Stato.IN_INVIO && c.getStato() != MailingCampagna.Stato.TEST_AB) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La campagna non è ancora stata inviata: non ci sono risultati da leggere.");
        }
        StringBuilder u = new StringBuilder();
        u.append("CAMPAGNA: ").append(c.getNome()).append('\n');
        u.append("OGGETTO: ").append(c.getOggetto() == null ? "" : c.getOggetto()).append('\n');
        if (StringUtils.hasText(c.getPreheader())) {
            u.append("PREHEADER: ").append(c.getPreheader()).append('\n');
        }
        if (c.getInvioIniziatoIl() != null) {
            u.append("INVIATA IL: ").append(c.getInvioIniziatoIl().toLocalDate()).append(" alle ")
                    .append(c.getInvioIniziatoIl().toLocalTime().withSecond(0).withNano(0)).append(" (")
                    .append(c.getInvioIniziatoIl().getDayOfWeek().getDisplayName(java.time.format.TextStyle.FULL, Locale.ITALIAN))
                    .append(")\n");
        }
        u.append("METRICHE: ").append(descriviMetriche(metriche.perCampagna(campagnaId))).append('\n');
        List<Long> recenti = campagnaRepository.findByStato(MailingCampagna.Stato.INVIATA).stream()
                .filter(x -> !x.getId().equals(campagnaId) && x.getInvioIniziatoIl() != null)
                .sorted((a, b) -> b.getInvioIniziatoIl().compareTo(a.getInvioIniziatoIl()))
                .limit(10).map(MailingCampagna::getId).toList();
        if (!recenti.isEmpty()) {
            Map<Long, MailingDto.Metriche> m = metriche.perCampagne(recenti);
            double ap = media(m.values().stream().map(MailingDto.Metriche::tassoApertura).toList());
            double cl = media(m.values().stream().map(MailingDto.Metriche::tassoClick).toList());
            u.append("MEDIA ULTIME ").append(recenti.size()).append(" CAMPAGNE: tasso apertura ")
                    .append(ap < 0 ? "n.d." : String.format(Locale.ITALY, "%.1f%%", ap)).append(", tasso click ")
                    .append(cl < 0 ? "n.d." : String.format(Locale.ITALY, "%.1f%%", cl)).append('\n');
        }
        u.append("TESTO DELL'EMAIL:\n").append(tronca(testoDaHtml(c.getHtml()), 6000));
        return interpretaAnalisi(aiClient.generateContent(SYSTEM_ANALISI, u.toString(), 2000), objectMapper);
    }

    static MailingDto.AiAnalisi interpretaAnalisi(String risposta, ObjectMapper om) {
        JsonNode j = estraiJson(risposta, om);
        String sintesi = j.path("sintesi").asText("").trim();
        List<String> consigli = lista(j.path("consigli"));
        if (sintesi.isEmpty() && consigli.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "L'AI non ha restituito un'analisi, riprova.");
        }
        return new MailingDto.AiAnalisi(sintesi, lista(j.path("puntiForza")), consigli.size() > 3 ? consigli.subList(0, 3) : consigli);
    }

    private static String descriviMetriche(MailingDto.Metriche m) {
        return "destinatari " + m.destinatari() + ", inviate " + m.inviati() + ", rimbalzi " + m.rimbalzi()
                + ", aperture uniche umane " + m.apertureUniche() + " (tasso " + perc(m.tassoApertura()) + ")"
                + ", aperture automatiche " + m.apertureAutomatiche()
                + ", click unici " + m.clickUnici() + " (tasso " + perc(m.tassoClick()) + ", click su aperture "
                + perc(m.tassoClickSuAperture()) + ")"
                + ", disiscrizioni " + m.disiscrizioni() + " (" + perc(m.tassoDisiscrizione()) + ")"
                + ", segnalazioni spam " + m.spam() + ", risposte " + m.risposte()
                + ", visite generate " + m.visiteGenerate() + ", fatturato generato " + m.fatturatoGenerato() + " €";
    }

    private static String perc(Double d) {
        return d == null ? "n.d." : String.format(Locale.ITALY, "%.1f%%", d);
    }

    private static double media(List<Double> valori) {
        List<Double> v = valori.stream().filter(x -> x != null).toList();
        return v.isEmpty() ? -1 : v.stream().mapToDouble(Double::doubleValue).average().orElse(-1);
    }

    // ───────────────────────── Supporto ─────────────────────────

    /** JSON dalla risposta AI: dal primo '{' all'ultimo '}' (tollera testo e ```json attorno). 502 se illeggibile. */
    static JsonNode estraiJson(String risposta, ObjectMapper om) {
        if (risposta == null || risposta.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "L'AI non ha risposto, riprova.");
        }
        String s = risposta.trim();
        int inizio = s.indexOf('{');
        int fine = s.lastIndexOf('}');
        if (inizio < 0 || fine <= inizio) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Risposta AI non leggibile, riprova.");
        }
        try {
            return om.readTree(s.substring(inizio, fine + 1));
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Risposta AI non leggibile, riprova.");
        }
    }

    private static List<String> lista(JsonNode n) {
        List<String> out = new ArrayList<>();
        for (JsonNode x : MailingGrafo.iterabile(n)) {
            String s = x.asText("").trim();
            if (!s.isEmpty()) {
                out.add(s);
            }
        }
        return out;
    }

    private static String pulisciRiga(String s, int max) {
        if (s == null) {
            return "";
        }
        String t = Jsoup.parse(s).text().replaceAll("\\s+", " ").trim();
        if (t.length() >= 2 && (t.startsWith("\"") && t.endsWith("\"") || t.startsWith("«") && t.endsWith("»"))) {
            t = t.substring(1, t.length() - 1).trim();
        }
        return t.length() > max ? t.substring(0, max) : t;
    }

    private static String testoDaHtml(String html) {
        if (html == null) {
            return "";
        }
        return html.contains("<") ? Jsoup.parse(html).text() : html;
    }

    private static String tono(String tono) {
        return switch (tono == null ? "" : tono.trim().toUpperCase(Locale.ROOT)) {
            case "PROFESSIONALE" -> "professionale e preciso, autorevole ma accessibile";
            case "BREVE" -> "brevissimo ed essenziale: frasi corte, solo il necessario";
            case "URGENTE" -> "con un senso di tempestività (posti limitati, scadenza vicina) ma senza allarmismo né pressioni";
            default -> "caldo e accogliente, vicino alla persona";
        };
    }

    private static String tronca(String s, int max) {
        return s == null ? "" : (s.length() > max ? s.substring(0, max) + "…" : s);
    }

    private void verificaDisponibile() {
        if (!disponibile) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "L'AI non è configurata su questo gestionale.");
        }
    }
}
