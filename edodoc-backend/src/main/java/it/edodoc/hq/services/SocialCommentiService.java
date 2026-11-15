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
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Commenti dei post Facebook e Instagram della pagina, in un'unica lista "da rispondere".
 *
 * <p>Una sola chiamata per piattaforma: gli ultimi post con i loro commenti e le risposte annidati (field expansion).
 * Meta resta la fonte: qui si aggiungono solo lo stato "gestito" e chi ha risposto dal gestionale.
 */
@Service
public class SocialCommentiService {

    private static final Logger logger = LoggerFactory.getLogger(SocialCommentiService.class);

    public static final String FACEBOOK = "FACEBOOK";
    public static final String INSTAGRAM = "INSTAGRAM";

    private static final Duration TTL = Duration.ofSeconds(20);
    private static final int POST = 25;
    private static final int MAX_TESTO = 8000;

    static final String CAMPI_FB_COMMENTO = "id,message,created_time,from{id,name},like_count,comment_count,is_hidden,"
            + "can_hide,can_remove,can_like,user_likes,attachment{media{image{src}}}";
    static final String CAMPI_FB = "id,message,full_picture,permalink_url,created_time,"
            + "comments.limit(50).order(reverse_chronological).filter(toplevel){" + CAMPI_FB_COMMENTO
            + ",comments.limit(25){id,message,created_time,from{id,name},like_count,is_hidden}}";
    static final String CAMPI_FB_MINIMI = "id,message,full_picture,permalink_url,created_time,"
            + "comments.limit(50).order(reverse_chronological).filter(toplevel){id,message,created_time,from{id,name},"
            + "like_count,is_hidden,comments.limit(25){id,message,created_time,from{id,name}}}";
    static final String CAMPI_IG = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,"
            + "comments.limit(50){id,text,timestamp,username,like_count,hidden,from{id,username},"
            + "replies.limit(25){id,text,timestamp,username,like_count,hidden,from{id,username}}}";
    static final String CAMPI_IG_MINIMI = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,"
            + "comments.limit(50){id,text,timestamp,username,like_count,hidden,replies.limit(25){id,text,timestamp,username}}";

    private final SocialAccountService accountService;
    private final SocialGraphClient graph;
    private final SocialCache cache;
    private final SocialAzioniService azioni;
    private final SocialMessaggiService messaggi;
    private final ObjectMapper objectMapper;

    public SocialCommentiService(SocialAccountService accountService, SocialGraphClient graph, SocialCache cache,
                                 SocialAzioniService azioni, SocialMessaggiService messaggi, ObjectMapper objectMapper) {
        this.accountService = accountService;
        this.graph = graph;
        this.cache = cache;
        this.azioni = azioni;
        this.messaggi = messaggi;
        this.objectMapper = objectMapper;
    }

    public static String piattaforma(String p) {
        String n = p == null ? "" : p.trim().toUpperCase(Locale.ROOT);
        if (FACEBOOK.equals(n) || INSTAGRAM.equals(n)) {
            return n;
        }
        throw new IllegalArgumentException("Piattaforma non valida: usa FACEBOOK o INSTAGRAM.");
    }

    // ── Lettura ──

    public SocialDto.ElencoCommenti elenco(String pageId, String filtro) {
        AccountInterno a = accountService.risolvi(pageId);
        String f = filtro == null ? "TUTTE" : filtro.toUpperCase(Locale.ROOT);
        // Le conversazioni servono solo al contatore dei non letti: si chiedono in parallelo ai commenti.
        java.util.concurrent.CompletableFuture<Integer> nonLetteFuturo = java.util.concurrent.CompletableFuture.supplyAsync(() -> {
            try {
                return (int) messaggi.conversazioni(a.pageId(), "TUTTE").stream().filter(c -> c.nonLetti() > 0).count();
            } catch (SocialIntegrazioneException e) {
                logger.debug("Social: conversazioni non disponibili per la community: {}", e.getMessage());
                return 0;
            }
        });
        List<SocialDto.Commento> commenti = cache.ottieni(a.pageId(), "commenti:" + f, TTL, () -> carica(a, f));
        int nonLette = nonLetteFuturo.join();
        return new SocialDto.ElencoCommenti(commenti, SocialCalcoli.community(commenti, nonLette), SocialTempo.adesso());
    }

    /** Commento (o risposta) fra quelli caricati: serve all'AI per il contesto. */
    public SocialDto.Commento trova(String pageId, String piattaforma, String commentoId) {
        for (SocialDto.Commento c : elenco(pageId, piattaforma).commenti()) {
            if (c.id().equals(commentoId)) {
                return c;
            }
            for (SocialDto.Commento r : c.risposte()) {
                if (r.id().equals(commentoId)) {
                    return r;
                }
            }
        }
        throw new SocialIntegrazioneException("Commento non trovato fra quelli recenti della pagina.");
    }

    private List<SocialDto.Commento> carica(AccountInterno a, String filtro) {
        List<Grezzo> grezzi = new ArrayList<>();
        SocialIntegrazioneException errore = null;
        // Instagram parte subito in parallelo a Facebook: sono due chiamate lente e indipendenti.
        boolean conInstagram = !FACEBOOK.equals(filtro) && a.haInstagram();
        java.util.concurrent.CompletableFuture<List<Grezzo>> igFuturo = conInstagram
                ? java.util.concurrent.CompletableFuture.supplyAsync(() -> instagram(a)) : null;
        if (!INSTAGRAM.equals(filtro)) {
            try {
                grezzi.addAll(facebook(a));
            } catch (SocialIntegrazioneException e) {
                errore = e;
                logger.warn("Social: commenti Facebook non disponibili: {}", e.getMessage());
            }
        }
        if (conInstagram) {
            try {
                grezzi.addAll(SocialMessaggiService.attendi(igFuturo));
            } catch (SocialIntegrazioneException e) {
                if (errore != null || INSTAGRAM.equals(filtro)) {
                    throw e;
                }
                logger.warn("Social: commenti Instagram non disponibili: {}", e.getMessage());
            }
        } else if (errore != null) {
            throw errore;
        }

        Set<String> ids = new HashSet<>();
        grezzi.forEach(g -> ids.add(g.id()));
        Map<String, SocialAzioniService.StatoGestito> gestiti = azioni.gestiti(ids);
        Map<String, SocialAzioniService.Autore> autori = azioni.autoriRisposte(ids);

        return grezzi.stream()
                .map(g -> g.completa(gestiti.get(g.id()), autori.get(g.id())))
                .sorted(Comparator.comparing((SocialDto.Commento c) -> c.creatoIl() == null ? "" : c.creatoIl()).reversed())
                .toList();
    }

    /** Commento letto da Meta prima di aggiungere i dati del gestionale. */
    record Grezzo(SocialDto.Commento base) {
        String id() {
            return base.id();
        }

        SocialDto.Commento completa(SocialAzioniService.StatoGestito g, SocialAzioniService.Autore autore) {
            SocialDto.Commento c = base;
            return new SocialDto.Commento(c.id(), c.piattaforma(), c.postId(), c.postTesto(), c.postImmagine(), c.postLink(),
                    c.autoreId(), c.autoreNome(), c.autoreImmagine(), c.testo(), c.allegatoImmagine(), c.creatoIl(),
                    c.miPiace(), c.nascosto(), c.piaceAllaPagina(), c.puoNascondere(), c.puoEliminare(),
                    c.puoMettereMiPiace(), c.daPagina(), c.risposto(), c.rispostoIl(),
                    g != null, g == null ? null : g.gestitoDa(), g == null ? null : g.gestitoIl(), c.risposte(),
                    autore == null ? null : autore.utenteId(), autore == null ? null : autore.nome());
        }
    }

    private List<Grezzo> facebook(AccountInterno a) {
        List<JsonNode> post;
        try {
            post = graph.getTutti(a.pageId() + "/published_posts",
                    Map.of("fields", CAMPI_FB, "limit", String.valueOf(POST)), a.token(), POST);
        } catch (SocialIntegrazioneException e) {
            if (e.getCodiceMeta() != SocialGraphClient.CODICE_PARAMETRO_NON_VALIDO) {
                throw e;
            }
            post = graph.getTutti(a.pageId() + "/published_posts",
                    Map.of("fields", CAMPI_FB_MINIMI, "limit", String.valueOf(POST)), a.token(), POST);
        }
        List<Grezzo> out = new ArrayList<>();
        for (JsonNode p : post) {
            out.addAll(daPostFacebook(p, a.pageId()));
        }
        return out;
    }

    static List<Grezzo> daPostFacebook(JsonNode p, String pageId) {
        List<Grezzo> out = new ArrayList<>();
        String postId = p.path("id").asText();
        String postTesto = p.path("message").asText(null);
        String postImmagine = p.path("full_picture").asText(null);
        String postLink = p.path("permalink_url").asText(null);
        for (JsonNode c : p.path("comments").path("data")) {
            List<SocialDto.Commento> risposte = new ArrayList<>();
            String rispostoIl = null;
            for (JsonNode r : c.path("comments").path("data")) {
                boolean daPagina = pageId.equals(r.path("from").path("id").asText(null));
                String creato = SocialTempo.iso(r.path("created_time").asText(null));
                if (daPagina && (rispostoIl == null || (creato != null && creato.compareTo(rispostoIl) < 0))) {
                    rispostoIl = creato;
                }
                risposte.add(new SocialDto.Commento(r.path("id").asText(), FACEBOOK, postId, null, null, postLink,
                        r.path("from").path("id").asText(null), r.path("from").path("name").asText(null), null,
                        r.path("message").asText(""), null, creato, numero(r.path("like_count")),
                        r.path("is_hidden").asBoolean(false), false, !daPagina, true, true, daPagina, false, null,
                        false, null, null, List.of(), null, null));
            }
            risposte.sort(Comparator.comparing(x -> x.creatoIl() == null ? "" : x.creatoIl()));
            boolean daPagina = pageId.equals(c.path("from").path("id").asText(null));
            String allegato = c.path("attachment").path("media").path("image").path("src").asText(null);
            out.add(new Grezzo(new SocialDto.Commento(c.path("id").asText(), FACEBOOK, postId, postTesto, postImmagine, postLink,
                    c.path("from").path("id").asText(null), c.path("from").path("name").asText(null), null,
                    c.path("message").asText(""), allegato, SocialTempo.iso(c.path("created_time").asText(null)),
                    numero(c.path("like_count")), c.path("is_hidden").asBoolean(false), c.path("user_likes").asBoolean(false),
                    c.path("can_hide").asBoolean(!daPagina), c.path("can_remove").asBoolean(true),
                    c.path("can_like").asBoolean(true), daPagina, rispostoIl != null, rispostoIl,
                    false, null, null, List.copyOf(risposte), null, null)));
        }
        return out;
    }

    private List<Grezzo> instagram(AccountInterno a) {
        List<JsonNode> media;
        try {
            media = graph.getTutti(a.instagramId() + "/media",
                    Map.of("fields", CAMPI_IG, "limit", String.valueOf(POST)), a.token(), POST);
        } catch (SocialIntegrazioneException e) {
            if (e.getCodiceMeta() != SocialGraphClient.CODICE_PARAMETRO_NON_VALIDO) {
                throw e;
            }
            media = graph.getTutti(a.instagramId() + "/media",
                    Map.of("fields", CAMPI_IG_MINIMI, "limit", String.valueOf(POST)), a.token(), POST);
        }
        List<Grezzo> out = new ArrayList<>();
        for (JsonNode m : media) {
            out.addAll(daMediaInstagram(m, a.instagramUsername()));
        }
        return out;
    }

    static List<Grezzo> daMediaInstagram(JsonNode m, String nostroUsername) {
        List<Grezzo> out = new ArrayList<>();
        String postId = m.path("id").asText();
        String immagine = "VIDEO".equals(m.path("media_type").asText())
                ? m.path("thumbnail_url").asText(null) : m.path("media_url").asText(null);
        for (JsonNode c : m.path("comments").path("data")) {
            List<SocialDto.Commento> risposte = new ArrayList<>();
            String rispostoIl = null;
            for (JsonNode r : c.path("replies").path("data")) {
                boolean daPagina = nostro(r.path("username").asText(null), nostroUsername);
                String creato = SocialTempo.iso(r.path("timestamp").asText(null));
                if (daPagina && (rispostoIl == null || (creato != null && creato.compareTo(rispostoIl) < 0))) {
                    rispostoIl = creato;
                }
                risposte.add(new SocialDto.Commento(r.path("id").asText(), INSTAGRAM, postId, null, null,
                        m.path("permalink").asText(null), r.path("from").path("id").asText(null),
                        r.path("username").asText(null), null, r.path("text").asText(""), null, creato,
                        numero(r.path("like_count")), r.path("hidden").asBoolean(false), false, !daPagina, true, false,
                        daPagina, false, null, false, null, null, List.of(), null, null));
            }
            risposte.sort(Comparator.comparing(x -> x.creatoIl() == null ? "" : x.creatoIl()));
            boolean daPagina = nostro(c.path("username").asText(null), nostroUsername);
            out.add(new Grezzo(new SocialDto.Commento(c.path("id").asText(), INSTAGRAM, postId,
                    m.path("caption").asText(null), immagine, m.path("permalink").asText(null),
                    c.path("from").path("id").asText(null), c.path("username").asText(null), null,
                    c.path("text").asText(""), null, SocialTempo.iso(c.path("timestamp").asText(null)),
                    numero(c.path("like_count")), c.path("hidden").asBoolean(false), false, !daPagina, true, false,
                    daPagina, rispostoIl != null, rispostoIl, false, null, null, List.copyOf(risposte), null, null)));
        }
        return out;
    }

    private static boolean nostro(String username, String nostroUsername) {
        return username != null && nostroUsername != null && username.equalsIgnoreCase(nostroUsername);
    }

    private static Long numero(JsonNode n) {
        return n != null && n.isNumber() ? n.asLong() : null;
    }

    // ── Azioni ──

    public SocialDto.Commento rispondi(String pageId, String commentoId, String piattaformaRichiesta, String testo) {
        AccountInterno a = accountService.risolvi(pageId);
        String p = piattaforma(piattaformaRichiesta);
        String t = testoValido(testo);
        JsonNode r = INSTAGRAM.equals(p)
                ? graph.post(commentoId + "/replies", Map.of("message", t), a.token())
                : graph.post(commentoId + "/comments", Map.of("message", t), a.token());
        String nuovoId = r.path("id").asText(null);
        azioni.registra(SocialAzioniService.RISPOSTA_COMMENTO, p, a.pageId(), commentoId, nuovoId, t);
        cache.invalida(a.pageId(), "commenti:");
        cache.segnaScaduto(a.pageId(), "panoramica:");
        Long utenteId = idOperatore();
        return new SocialDto.Commento(nuovoId, p, null, null, null, null,
                INSTAGRAM.equals(p) ? a.instagramId() : a.pageId(),
                INSTAGRAM.equals(p) ? a.instagramUsername() : a.nome(), INSTAGRAM.equals(p) ? a.instagramImmagine() : a.immagine(),
                t, null, SocialTempo.adesso(), 0L, false, false, false, true, false, true, false, null,
                false, null, null, List.of(), utenteId, azioni.nomeUtente(utenteId));
    }

    public void nascondi(String pageId, String commentoId, String piattaformaRichiesta, boolean nascosto) {
        AccountInterno a = accountService.risolvi(pageId);
        String p = piattaforma(piattaformaRichiesta);
        graph.post(commentoId, Map.of(INSTAGRAM.equals(p) ? "hide" : "is_hidden", String.valueOf(nascosto)), a.token());
        azioni.registra(nascosto ? SocialAzioniService.NASCOSTO : SocialAzioniService.MOSTRATO, p, a.pageId(), commentoId, null, null);
        cache.invalida(a.pageId(), "commenti:");
    }

    public void miPiace(String pageId, String commentoId, String piattaformaRichiesta, boolean attivo) {
        AccountInterno a = accountService.risolvi(pageId);
        String p = piattaforma(piattaformaRichiesta);
        if (INSTAGRAM.equals(p)) {
            throw new SocialIntegrazioneException("Instagram non permette di mettere mi piace ai commenti dalle API: fallo dall'app.");
        }
        if (attivo) {
            graph.post(commentoId + "/likes", Map.of(), a.token());
            azioni.registra(SocialAzioniService.MI_PIACE, p, a.pageId(), commentoId, null, null);
        } else {
            graph.delete(commentoId + "/likes", Map.of(), a.token());
        }
        cache.invalida(a.pageId(), "commenti:");
    }

    public void elimina(String pageId, String commentoId, String piattaformaRichiesta) {
        AccountInterno a = accountService.risolvi(pageId);
        String p = piattaforma(piattaformaRichiesta);
        graph.delete(commentoId, Map.of(), a.token());
        azioni.registra(SocialAzioniService.ELIMINATO, p, a.pageId(), commentoId, null, null);
        cache.invalida(a.pageId(), "commenti:");
        cache.segnaScaduto(a.pageId(), "panoramica:");
    }

    /** Risposta privata: apre (o continua) un messaggio diretto con l'autore del commento. */
    public void messaggioPrivato(String pageId, String commentoId, String piattaformaRichiesta, String testo) {
        AccountInterno a = accountService.risolvi(pageId);
        String p = piattaforma(piattaformaRichiesta);
        String t = testoValido(testo);
        ObjectNode corpo = objectMapper.createObjectNode();
        corpo.putObject("recipient").put("comment_id", commentoId);
        corpo.putObject("message").put("text", t);
        JsonNode r;
        try {
            r = graph.postJson(a.pageId() + "/messages", corpo, a.token());
        } catch (SocialIntegrazioneException e) {
            if (e.getCodiceMeta() == 10 || e.getSottocodiceMeta() == 2018278 || e.getCodiceMeta() == 100) {
                throw new SocialIntegrazioneException(
                        "Meta non permette la risposta privata a questo commento: si può inviare una sola volta "
                                + "e solo entro 7 giorni dal commento.", e.getCodiceMeta(), e.getSottocodiceMeta(), e);
            }
            throw e;
        }
        azioni.registra(SocialAzioniService.MESSAGGIO_PRIVATO, p, a.pageId(), commentoId,
                r.path("message_id").asText(null), t);
        azioni.impostaGestito(a.pageId(), p, commentoId, SocialAzioniService.TIPO_COMMENTO, true);
        cache.invalida(a.pageId(), "commenti:");
        cache.invalida(a.pageId(), "conversazioni");
    }

    public void impostaGestito(String pageId, String piattaformaRichiesta, String oggettoId, String tipo, boolean gestito) {
        AccountInterno a = accountService.risolvi(pageId);
        azioni.impostaGestito(a.pageId(), piattaforma(piattaformaRichiesta), oggettoId, tipo, gestito);
        cache.invalida(a.pageId(), "commenti:");
        cache.invalida(a.pageId(), "conversazioni");
    }

    private Long idOperatore() {
        return azioni.operatoreCorrenteId();
    }

    static String testoValido(String testo) {
        if (!StringUtils.hasText(testo)) {
            throw new IllegalArgumentException("Scrivi il testo della risposta.");
        }
        String t = testo.trim();
        if (t.length() > MAX_TESTO) {
            throw new IllegalArgumentException("Il testo è troppo lungo.");
        }
        return t;
    }
}
