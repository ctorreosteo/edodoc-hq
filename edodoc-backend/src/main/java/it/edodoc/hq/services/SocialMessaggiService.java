package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import it.edodoc.hq.dto.SocialDto;
import it.edodoc.hq.exception.SocialIntegrazioneException;
import it.edodoc.hq.services.SocialAccountService.AccountInterno;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Messaggi diretti di Messenger e Instagram della pagina (Messenger Platform, token di pagina).
 *
 * <p>Meta permette di rispondere liberamente entro 24 ore dall'ultimo messaggio del contatto; dopo, solo col tag
 * {@code HUMAN_AGENT} (7 giorni, permesso da richiedere nell'app Meta). L'invio prova prima la risposta normale e
 * ritenta col tag solo se Meta dice che la finestra e chiusa.
 */
@Service
public class SocialMessaggiService {

    private static final Logger logger = LoggerFactory.getLogger(SocialMessaggiService.class);

    private static final Duration TTL = Duration.ofSeconds(20);
    private static final Duration FINESTRA = Duration.ofHours(24);
    private static final int CONVERSAZIONI = 40;

    static final String CAMPI_MSG_FB = "id,message,created_time,from,to,"
            + "attachments{id,mime_type,name,file_url,image_data{url,preview_url},video_data{url,preview_url}},sticker,shares{link,name}";
    static final String CAMPI_MSG_IG = "id,message,created_time,from,to,"
            + "attachments{image_data{url,preview_url},video_data{url,preview_url},file_url},shares{link,name},story";
    static final String CAMPI_MSG_MINIMI = "id,message,created_time,from";

    private final SocialAccountService accountService;
    private final SocialGraphClient graph;
    private final SocialCache cache;
    private final SocialAzioniService azioni;
    private final ObjectMapper objectMapper;

    public SocialMessaggiService(SocialAccountService accountService, SocialGraphClient graph, SocialCache cache,
                                 SocialAzioniService azioni, ObjectMapper objectMapper) {
        this.accountService = accountService;
        this.graph = graph;
        this.cache = cache;
        this.azioni = azioni;
        this.objectMapper = objectMapper;
    }

    // ── Elenco ──

    public List<SocialDto.Conversazione> conversazioni(String pageId, String filtro) {
        AccountInterno a = accountService.risolvi(pageId);
        String f = filtro == null ? "TUTTE" : filtro.toUpperCase(Locale.ROOT);
        return cache.ottieni(a.pageId(), "conversazioni:" + f, TTL, () -> carica(a, f));
    }

    private List<SocialDto.Conversazione> carica(AccountInterno a, String filtro) {
        List<JsonNode> fb = List.of();
        List<JsonNode> ig = List.of();
        SocialIntegrazioneException errore = null;
        // Instagram in parallelo a Messenger: due elenchi lenti e indipendenti.
        boolean conInstagram = !SocialCommentiService.FACEBOOK.equals(filtro) && a.haInstagram();
        CompletableFuture<List<JsonNode>> igFuturo = conInstagram
                ? CompletableFuture.supplyAsync(() -> elencoGrezzo(a, "instagram", CAMPI_MSG_MINIMI)) : null;
        if (!SocialCommentiService.INSTAGRAM.equals(filtro)) {
            try {
                fb = elencoGrezzo(a, "messenger", CAMPI_MSG_MINIMI);
            } catch (SocialIntegrazioneException e) {
                errore = e;
                logger.warn("Social: conversazioni Messenger non disponibili: {}", e.getMessage());
            }
        }
        if (conInstagram) {
            try {
                ig = attendi(igFuturo);
            } catch (SocialIntegrazioneException e) {
                if (errore != null || SocialCommentiService.INSTAGRAM.equals(filtro)) {
                    throw e;
                }
                logger.warn("Social: conversazioni Instagram non disponibili: {}", e.getMessage());
            }
        } else if (errore != null) {
            throw errore;
        }

        Set<String> ids = new HashSet<>();
        fb.forEach(n -> ids.add(n.path("id").asText()));
        ig.forEach(n -> ids.add(n.path("id").asText()));
        Map<String, SocialAzioniService.StatoGestito> gestiti = azioni.gestiti(ids);
        Set<String> propri = idPropri(a);
        Instant adesso = Instant.now();

        List<SocialDto.Conversazione> out = new ArrayList<>();
        fb.forEach(n -> out.add(daNodo(n, SocialCommentiService.FACEBOOK, propri, a.instagramUsername(),
                gestiti.containsKey(n.path("id").asText()), adesso)));
        ig.forEach(n -> out.add(daNodo(n, SocialCommentiService.INSTAGRAM, propri, a.instagramUsername(),
                gestiti.containsKey(n.path("id").asText()), adesso)));
        out.sort(Comparator.comparing((SocialDto.Conversazione c) -> c.ultimoMessaggioIl() == null ? "" : c.ultimoMessaggioIl()).reversed());
        return List.copyOf(out);
    }

    /** join() che restituisce l'eccezione Meta originale invece di avvolgerla. */
    static <T> T attendi(CompletableFuture<T> f) {
        try {
            return f.join();
        } catch (CompletionException e) {
            if (e.getCause() instanceof SocialIntegrazioneException se) {
                throw se;
            }
            if (e.getCause() instanceof RuntimeException re) {
                throw re;
            }
            throw e;
        }
    }

    private List<JsonNode> elencoGrezzo(AccountInterno a, String platform, String campiMessaggi) {
        return graph.getTutti(a.pageId() + "/conversations", Map.of(
                "platform", platform,
                "fields", "id,updated_time,unread_count,link,participants,messages.limit(10){" + campiMessaggi + "}",
                "limit", "25"), a.token(), CONVERSAZIONI);
    }

    static Set<String> idPropri(AccountInterno a) {
        Set<String> s = new HashSet<>();
        s.add(a.pageId());
        if (a.instagramId() != null) {
            s.add(a.instagramId());
        }
        return s;
    }

    /** Conversazione dal nodo Graph (con gli ultimi messaggi, piu recenti prima). */
    static SocialDto.Conversazione daNodo(JsonNode n, String piattaforma, Set<String> idPropri, String usernameProprio,
                                          boolean gestito, Instant adesso) {
        JsonNode contatto = null;
        for (JsonNode p : n.path("participants").path("data")) {
            if (!eProprio(p, idPropri, usernameProprio)) {
                contatto = p;
                break;
            }
        }
        JsonNode messaggi = n.path("messages").path("data");
        JsonNode ultimo = messaggi.path(0);
        Instant ultimoDelContatto = null;
        for (JsonNode m : messaggi) {
            if (!eProprio(m.path("from"), idPropri, usernameProprio)) {
                ultimoDelContatto = SocialTempo.istante(m.path("created_time").asText(null));
                break;
            }
        }
        Instant scade = ultimoDelContatto == null ? null : ultimoDelContatto.plus(FINESTRA);
        String nome = contatto == null ? null : testo(contatto.path("name").asText(null), contatto.path("username").asText(null));
        String ultimoTesto = ultimo.path("message").asText("");
        if (!StringUtils.hasText(ultimoTesto) && !ultimo.isMissingNode()) {
            ultimoTesto = "📎 Allegato";
        }
        String ultimoIl = SocialTempo.iso(testo(ultimo.path("created_time").asText(null), n.path("updated_time").asText(null)));
        String link = n.path("link").asText(null);
        if (StringUtils.hasText(link) && link.startsWith("/")) {
            link = "https://www.facebook.com" + link;
        }
        return new SocialDto.Conversazione(
                n.path("id").asText(),
                piattaforma,
                contatto == null ? null : contatto.path("id").asText(null),
                nome,
                null,
                ultimoTesto,
                ultimoIl,
                !ultimo.isMissingNode() && eProprio(ultimo.path("from"), idPropri, usernameProprio),
                n.path("unread_count").asInt(0),
                gestito,
                scade != null && scade.isAfter(adesso),
                SocialTempo.iso(scade),
                link);
    }

    static boolean eProprio(JsonNode persona, Set<String> idPropri, String usernameProprio) {
        String id = persona.path("id").asText(null);
        if (id != null && idPropri.contains(id)) {
            return true;
        }
        String username = persona.path("username").asText(null);
        return username != null && usernameProprio != null && username.equalsIgnoreCase(usernameProprio);
    }

    // ── Thread ──

    public SocialDto.ThreadConversazione thread(String pageId, String conversazioneId, String piattaformaRichiesta) {
        AccountInterno a = accountService.risolvi(pageId);
        String p = SocialCommentiService.piattaforma(piattaformaRichiesta);
        String campi = SocialCommentiService.INSTAGRAM.equals(p) ? CAMPI_MSG_IG : CAMPI_MSG_FB;
        JsonNode n;
        try {
            n = graph.get(conversazioneId, Map.of("fields",
                    "id,updated_time,unread_count,link,participants,messages.limit(60){" + campi + "}"), a.token());
        } catch (SocialIntegrazioneException e) {
            if (e.getCodiceMeta() != SocialGraphClient.CODICE_PARAMETRO_NON_VALIDO) {
                throw e;
            }
            n = graph.get(conversazioneId, Map.of("fields",
                    "id,updated_time,unread_count,link,participants,messages.limit(60){" + CAMPI_MSG_MINIMI + "}"), a.token());
        }
        Set<String> propri = idPropri(a);
        boolean gestito = azioni.gestiti(List.of(conversazioneId)).containsKey(conversazioneId);
        SocialDto.Conversazione conv = daNodo(n, p, propri, a.instagramUsername(), gestito, Instant.now());

        List<JsonNode> grezzi = new ArrayList<>();
        n.path("messages").path("data").forEach(grezzi::add);
        Set<String> ids = new HashSet<>();
        grezzi.forEach(m -> ids.add(m.path("id").asText()));
        Map<String, SocialAzioniService.Autore> autori = azioni.autoriMessaggi(ids);

        List<SocialDto.Messaggio> messaggi = new ArrayList<>();
        for (int i = grezzi.size() - 1; i >= 0; i--) {
            JsonNode m = grezzi.get(i);
            SocialAzioniService.Autore autore = autori.get(m.path("id").asText());
            boolean daPagina = eProprio(m.path("from"), propri, a.instagramUsername());
            messaggi.add(new SocialDto.Messaggio(
                    m.path("id").asText(),
                    m.path("message").asText(""),
                    SocialTempo.iso(m.path("created_time").asText(null)),
                    daPagina,
                    testo(m.path("from").path("name").asText(null), m.path("from").path("username").asText(null)),
                    allegati(m),
                    autore == null ? null : autore.utenteId(),
                    autore == null ? null : autore.nome()));
        }
        return new SocialDto.ThreadConversazione(conv, messaggi);
    }

    static List<SocialDto.Allegato> allegati(JsonNode m) {
        List<SocialDto.Allegato> out = new ArrayList<>();
        for (JsonNode at : m.path("attachments").path("data")) {
            String mime = at.path("mime_type").asText("");
            if (at.has("image_data")) {
                out.add(new SocialDto.Allegato("IMMAGINE", at.path("image_data").path("url").asText(null),
                        at.path("image_data").path("preview_url").asText(null), at.path("name").asText(null)));
            } else if (at.has("video_data")) {
                out.add(new SocialDto.Allegato("VIDEO", at.path("video_data").path("url").asText(null),
                        at.path("video_data").path("preview_url").asText(null), at.path("name").asText(null)));
            } else if (mime.startsWith("audio")) {
                out.add(new SocialDto.Allegato("AUDIO", at.path("file_url").asText(null), null, at.path("name").asText(null)));
            } else if (at.has("file_url")) {
                out.add(new SocialDto.Allegato("FILE", at.path("file_url").asText(null), null, at.path("name").asText("File")));
            }
        }
        if (m.hasNonNull("sticker")) {
            out.add(new SocialDto.Allegato("STICKER", m.path("sticker").asText(null), null, null));
        }
        for (JsonNode s : m.path("shares").path("data")) {
            out.add(new SocialDto.Allegato("CONDIVISIONE", s.path("link").asText(null), null, s.path("name").asText(null)));
        }
        JsonNode story = m.path("story");
        if (!story.isMissingNode() && !story.isNull()) {
            String link = testo(story.path("mention").path("link").asText(null), story.path("reply_to").path("link").asText(null));
            out.add(new SocialDto.Allegato("STORIA", link, null,
                    story.has("mention") ? "Ti ha menzionato in una storia" : "Risposta alla tua storia"));
        }
        return out;
    }

    // ── Invio ──

    public SocialDto.Messaggio invia(String pageId, String conversazioneId, String piattaformaRichiesta,
                                     String destinatarioId, String testo) {
        AccountInterno a = accountService.risolvi(pageId);
        String p = SocialCommentiService.piattaforma(piattaformaRichiesta);
        String t = SocialCommentiService.testoValido(testo);
        if (!StringUtils.hasText(destinatarioId)) {
            throw new IllegalArgumentException("Manca il destinatario del messaggio.");
        }
        verificaPartecipante(a, conversazioneId, destinatarioId);

        ObjectNode corpo = objectMapper.createObjectNode();
        corpo.putObject("recipient").put("id", destinatarioId);
        corpo.put("messaging_type", "RESPONSE");
        corpo.putObject("message").put("text", t);
        JsonNode r;
        try {
            r = graph.postJson(a.pageId() + "/messages", corpo, a.token());
        } catch (SocialIntegrazioneException e) {
            if (!isFinestraChiusa(e)) {
                throw e;
            }
            corpo.put("messaging_type", "MESSAGE_TAG");
            corpo.put("tag", "HUMAN_AGENT");
            try {
                r = graph.postJson(a.pageId() + "/messages", corpo, a.token());
            } catch (SocialIntegrazioneException e2) {
                throw new SocialIntegrazioneException(
                        "Sono passate più di 24 ore dall'ultimo messaggio del contatto: Meta permette di rispondere "
                                + "solo entro 7 giorni e con il permesso «Agente umano» attivo sull'app Meta.",
                        e2.getCodiceMeta(), e2.getSottocodiceMeta(), e2);
            }
        }
        String id = r.path("message_id").asText(null);
        azioni.registra(SocialAzioniService.MESSAGGIO, p, a.pageId(), conversazioneId, id, t);
        cache.invalida(a.pageId(), "conversazioni");
        Long utenteId = azioni.operatoreCorrenteId();
        return new SocialDto.Messaggio(id, t, SocialTempo.adesso(), true,
                SocialCommentiService.INSTAGRAM.equals(p) ? a.instagramUsername() : a.nome(),
                List.of(), utenteId, azioni.nomeUtente(utenteId));
    }

    /** Il destinatario deve partecipare alla conversazione indicata: il client non sceglie a chi scrive la pagina. */
    private void verificaPartecipante(AccountInterno a, String conversazioneId, String destinatarioId) {
        JsonNode n = graph.get(conversazioneId, Map.of("fields", "participants"), a.token());
        for (JsonNode p : n.path("participants").path("data")) {
            if (destinatarioId.equals(p.path("id").asText(null))) {
                return;
            }
        }
        throw new IllegalArgumentException("Il destinatario non fa parte di questa conversazione.");
    }

    static boolean isFinestraChiusa(SocialIntegrazioneException e) {
        int s = e.getSottocodiceMeta();
        return s == 2018278 || s == 2018065 || s == 2534022 || (e.getCodiceMeta() == 10 && s == 0);
    }

    /** Segna letta la conversazione su Messenger/Instagram. Best effort: se Meta rifiuta non e un errore. */
    public void segnaLetta(String pageId, String piattaformaRichiesta, String destinatarioId) {
        AccountInterno a = accountService.risolvi(pageId);
        if (!StringUtils.hasText(destinatarioId)) {
            return;
        }
        try {
            ObjectNode corpo = objectMapper.createObjectNode();
            corpo.putObject("recipient").put("id", destinatarioId);
            corpo.put("sender_action", "mark_seen");
            graph.postJson(a.pageId() + "/messages", corpo, a.token());
        } catch (SocialIntegrazioneException e) {
            logger.debug("Social: mark_seen non riuscito ({}): {}", piattaformaRichiesta, e.getMessage());
        }
        cache.invalida(a.pageId(), "conversazioni");
    }

    private static String testo(String a, String b) {
        return StringUtils.hasText(a) ? a : b;
    }
}
