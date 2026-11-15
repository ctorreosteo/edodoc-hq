package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import it.edodoc.hq.exception.SocialIntegrazioneException;
import it.edodoc.hq.models.PlannerMedia;
import it.edodoc.hq.services.SocialAccountService.AccountInterno;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Facebook e Instagram per il Planner social, con il token della pagina scelta (pagina Meta).
 *
 * <p>Meta scarica immagini e video dall'indirizzo pubblico del media ({@link PlannerMediaService#urlAssoluto}):
 * niente byte nelle chiamate. Facebook: post (testo, link, fino a 10 foto o un video), reel e storie. Instagram:
 * post, carosello (2–10), reel e storia, con il container che si attende finché Meta non ha elaborato il file.
 * Il primo commento si scrive subito dopo, sotto il post.
 */
@Service
public class PlannerMetaPubblicatore implements PlannerPubblicatore {

    private static final Logger logger = LoggerFactory.getLogger(PlannerMetaPubblicatore.class);

    /** Le immagini Meta le elabora in pochi secondi, i video anche minuti. */
    private static final int ATTESA_IMMAGINE_SECONDI = 60;
    private static final int ATTESA_VIDEO_SECONDI = 600;

    private final SocialAccountService accountService;
    private final SocialGraphClient graph;
    private final SocialConfigService configService;
    private final PlannerMediaService mediaService;
    private final ObjectMapper objectMapper;
    private final RestTemplate rupload;

    public PlannerMetaPubblicatore(SocialAccountService accountService, SocialGraphClient graph,
                                   SocialConfigService configService, PlannerMediaService mediaService,
                                   ObjectMapper objectMapper) {
        this.accountService = accountService;
        this.graph = graph;
        this.configService = configService;
        this.mediaService = mediaService;
        this.objectMapper = objectMapper;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10_000);
        factory.setReadTimeout(300_000);
        this.rupload = new RestTemplate(factory);
    }

    @Override
    public Set<String> canali() {
        return Set.of(PlannerCanali.FACEBOOK, PlannerCanali.INSTAGRAM);
    }

    @Override
    public Risultato pubblica(Contesto ctx) throws Exception {
        AccountInterno a = accountService.risolvi(ctx.canale().getAccount());
        Risultato r = PlannerCanali.FACEBOOK.equals(ctx.canale().getCanale()) ? facebook(a, ctx) : instagram(a, ctx);
        String primo = ctx.post().getPrimoCommento();
        boolean storia = "STORIA".equals(ctx.canale().getFormato());
        if (StringUtils.hasText(primo) && !storia && StringUtils.hasText(r.idEsterno())) {
            try {
                graph.post(r.idEsterno() + "/comments", Map.of("message", primo), a.token());
            } catch (Exception e) {
                // Il post è uscito: il primo commento mancato non lo rende un errore
                logger.warn("Planner: primo commento su {} non riuscito: {}", r.idEsterno(), e.getMessage());
            }
        }
        return r;
    }

    // ── Facebook ──

    private Risultato facebook(AccountInterno a, Contesto ctx) throws Exception {
        List<PlannerMedia> media = ctx.media();
        String formato = ctx.canale().getFormato();
        String link = ctx.link();
        if ("REEL".equals(formato)) {
            String videoId = videoCaricato(a, a.pageId() + "/video_reels", media.get(0));
            Map<String, String> fine = new LinkedHashMap<>();
            fine.put("upload_phase", "finish");
            fine.put("video_id", videoId);
            fine.put("video_state", "PUBLISHED");
            fine.put("description", conLink(ctx.testo(), link));
            graph.post(a.pageId() + "/video_reels", fine, a.token());
            return new Risultato(videoId, "https://www.facebook.com/reel/" + videoId);
        }
        if ("STORIA".equals(formato)) {
            PlannerMedia m = media.get(0);
            JsonNode r;
            if (PlannerMedia.TIPO_VIDEO.equals(m.getTipo())) {
                String videoId = videoCaricato(a, a.pageId() + "/video_stories", m);
                r = graph.post(a.pageId() + "/video_stories", Map.of("upload_phase", "finish", "video_id", videoId), a.token());
            } else {
                String fotoId = graph.post(a.pageId() + "/photos",
                        Map.of("url", mediaService.urlAssoluto(m), "published", "false"), a.token()).path("id").asText(null);
                r = graph.post(a.pageId() + "/photo_stories", Map.of("photo_id", fotoId), a.token());
            }
            String id = testo(r.path("post_id"), r.path("id"));
            return new Risultato(id, permalink(id, "permalink_url", a, "https://www.facebook.com/" + a.pageId()));
        }
        // Post
        if (media.isEmpty()) {
            Map<String, String> p = new LinkedHashMap<>();
            if (StringUtils.hasText(ctx.testo())) {
                p.put("message", ctx.testo());
            }
            if (StringUtils.hasText(link)) {
                p.put("link", link);
            }
            String id = graph.post(a.pageId() + "/feed", p, a.token()).path("id").asText(null);
            return new Risultato(id, permalink(id, "permalink_url", a, "https://www.facebook.com/" + id));
        }
        String messaggio = conLink(ctx.testo(), link);
        if (PlannerMedia.TIPO_VIDEO.equals(media.get(0).getTipo())) {
            Map<String, String> p = new LinkedHashMap<>();
            p.put("file_url", mediaService.urlAssoluto(media.get(0)));
            p.put("description", messaggio);
            p.put("published", "true");
            if (StringUtils.hasText(ctx.canale().getTitolo())) {
                p.put("title", ctx.canale().getTitolo());
            }
            String id = graph.post(a.pageId() + "/videos", p, a.token()).path("id").asText(null);
            return new Risultato(id, permalink(id, "permalink_url", a, "https://www.facebook.com/" + id));
        }
        if (media.size() == 1) {
            Map<String, String> p = new LinkedHashMap<>();
            p.put("url", mediaService.urlAssoluto(media.get(0)));
            p.put("published", "true");
            if (StringUtils.hasText(messaggio)) {
                p.put("message", messaggio);
            }
            JsonNode r = graph.post(a.pageId() + "/photos", p, a.token());
            String id = testo(r.path("post_id"), r.path("id"));
            return new Risultato(id, permalink(id, "permalink_url", a, "https://www.facebook.com/" + id));
        }
        // Più foto: caricate non pubblicate, poi un post che le allega tutte
        Map<String, String> p = new LinkedHashMap<>();
        if (StringUtils.hasText(messaggio)) {
            p.put("message", messaggio);
        }
        for (int i = 0; i < media.size(); i++) {
            String fotoId = graph.post(a.pageId() + "/photos",
                    Map.of("url", mediaService.urlAssoluto(media.get(i)), "published", "false"), a.token()).path("id").asText(null);
            p.put("attached_media[" + i + "]", objectMapper.createObjectNode().put("media_fbid", fotoId).toString());
        }
        String id = graph.post(a.pageId() + "/feed", p, a.token()).path("id").asText(null);
        return new Risultato(id, permalink(id, "permalink_url", a, "https://www.facebook.com/" + id));
    }

    /** Reel e storie video: sessione di caricamento, poi Meta scarica il file dal nostro indirizzo (header file_url). */
    private String videoCaricato(AccountInterno a, String percorso, PlannerMedia video) {
        JsonNode avvio = graph.post(percorso, Map.of("upload_phase", "start"), a.token());
        String videoId = avvio.path("video_id").asText(null);
        String uploadUrl = avvio.path("upload_url").asText(null);
        if (!StringUtils.hasText(videoId)) {
            throw new SocialIntegrazioneException("Meta non ha aperto il caricamento del video.");
        }
        if (!StringUtils.hasText(uploadUrl)) {
            uploadUrl = "https://rupload.facebook.com/video-upload/" + configService.getVersione() + "/" + videoId;
        }
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "OAuth " + a.token());
        headers.set("file_url", mediaService.urlAssoluto(video));
        try {
            ResponseEntity<String> r = rupload.exchange(uploadUrl, HttpMethod.POST, new HttpEntity<>(headers), String.class);
            JsonNode corpo = objectMapper.readTree(r.getBody() == null ? "{}" : r.getBody());
            if (!corpo.path("success").asBoolean(true)) {
                throw new SocialIntegrazioneException("Meta non ha accettato il video.");
            }
        } catch (HttpStatusCodeException e) {
            throw graph.traduciErrore(e.getStatusCode().value(), e.getResponseBodyAsString(), e);
        } catch (SocialIntegrazioneException e) {
            throw e;
        } catch (Exception e) {
            throw new SocialIntegrazioneException("Caricamento del video su Meta non riuscito: " + e.getMessage(), e);
        }
        return videoId;
    }

    // ── Instagram ──

    private Risultato instagram(AccountInterno a, Contesto ctx) throws Exception {
        if (!a.haInstagram()) {
            throw new SocialIntegrazioneException("Questa pagina non ha più un profilo Instagram collegato.");
        }
        String ig = a.instagramId();
        List<PlannerMedia> media = ctx.media();
        String formato = ctx.canale().getFormato();
        String didascalia = conLink(ctx.testo(), ctx.link());
        Map<String, String> p = new LinkedHashMap<>();
        boolean video;
        switch (formato) {
            case "CAROSELLO" -> {
                List<String> figli = new ArrayList<>();
                for (PlannerMedia m : media) {
                    Map<String, String> f = new LinkedHashMap<>();
                    f.put("is_carousel_item", "true");
                    if (PlannerMedia.TIPO_VIDEO.equals(m.getTipo())) {
                        f.put("media_type", "VIDEO");
                        f.put("video_url", mediaService.urlAssoluto(m));
                    } else {
                        f.put("image_url", mediaService.urlAssoluto(m));
                    }
                    String id = graph.post(ig + "/media", f, a.token()).path("id").asText(null);
                    attendi(id, PlannerMedia.TIPO_VIDEO.equals(m.getTipo()), a);
                    figli.add(id);
                }
                p.put("media_type", "CAROUSEL");
                p.put("children", String.join(",", figli));
                video = false;
            }
            case "REEL" -> {
                p.put("media_type", "REELS");
                p.put("video_url", mediaService.urlAssoluto(media.get(0)));
                p.put("share_to_feed", String.valueOf(!ctx.opzioni().path("soloReel").asBoolean(false)));
                video = true;
            }
            case "STORIA" -> {
                PlannerMedia m = media.get(0);
                p.put("media_type", "STORIES");
                video = PlannerMedia.TIPO_VIDEO.equals(m.getTipo());
                p.put(video ? "video_url" : "image_url", mediaService.urlAssoluto(m));
            }
            default -> {
                p.put("image_url", mediaService.urlAssoluto(media.get(0)));
                video = false;
            }
        }
        if (!"STORIA".equals(formato) && StringUtils.hasText(didascalia)) {
            p.put("caption", didascalia);
        }
        String collaboratori = collaboratori(ctx.opzioni());
        if (collaboratori != null && !"STORIA".equals(formato)) {
            p.put("collaborators", collaboratori);
        }
        String container = graph.post(ig + "/media", p, a.token()).path("id").asText(null);
        attendi(container, video, a);
        String mediaId = graph.post(ig + "/media_publish", Map.of("creation_id", container), a.token()).path("id").asText(null);
        return new Risultato(mediaId, permalink(mediaId, "permalink", a, null));
    }

    /** Attende che Meta abbia elaborato il container (FINISHED); ERROR o EXPIRED sono un errore. */
    private void attendi(String container, boolean video, AccountInterno a) throws InterruptedException {
        if (!StringUtils.hasText(container)) {
            throw new SocialIntegrazioneException("Meta non ha creato il contenuto.");
        }
        long limite = System.currentTimeMillis() + 1000L * (video ? ATTESA_VIDEO_SECONDI : ATTESA_IMMAGINE_SECONDI);
        long pausa = video ? 5000 : 1500;
        while (System.currentTimeMillis() < limite) {
            JsonNode s = graph.get(container, Map.of("fields", "status_code,status"), a.token());
            String stato = s.path("status_code").asText("");
            if ("FINISHED".equals(stato) || "PUBLISHED".equals(stato)) {
                return;
            }
            if ("ERROR".equals(stato) || "EXPIRED".equals(stato)) {
                String dettaglio = s.path("status").asText("");
                throw new SocialIntegrazioneException("Instagram non è riuscito a elaborare il file"
                        + (StringUtils.hasText(dettaglio) ? " (" + dettaglio + ")" : "")
                        + ". Controlla formato e proporzioni.");
            }
            Thread.sleep(pausa);
        }
        throw new SocialIntegrazioneException("Instagram ci sta mettendo troppo a elaborare il file: riprova fra qualche minuto.");
    }

    /** Fino a 3 username senza @, come JSON array. */
    private String collaboratori(JsonNode opzioni) {
        String grezzo = opzioni.path("collaboratori").asText("");
        List<String> nomi = new ArrayList<>();
        for (String n : grezzo.split("[\\s,;]+")) {
            String u = n.replaceFirst("^@", "").trim();
            if (u.matches("[A-Za-z0-9._]{1,30}") && nomi.size() < 3) {
                nomi.add(u);
            }
        }
        if (nomi.isEmpty()) {
            return null;
        }
        return objectMapper.valueToTree(nomi).toString();
    }

    // ── Supporto ──

    private String permalink(String id, String campo, AccountInterno a, String fallback) {
        if (!StringUtils.hasText(id)) {
            return fallback;
        }
        try {
            String l = graph.get(id, Map.of("fields", campo), a.token()).path(campo).asText(null);
            return StringUtils.hasText(l) ? l : fallback;
        } catch (Exception e) {
            return fallback;
        }
    }

    /** Dove il link non si allega (foto, video, Instagram) va in fondo al testo. */
    static String conLink(String testo, String link) {
        String t = testo == null ? "" : testo;
        if (StringUtils.hasText(link) && !t.contains(link)) {
            t = t.isEmpty() ? link : t + "\n\n" + link;
        }
        return t;
    }

    private static String testo(JsonNode... nodi) {
        for (JsonNode n : nodi) {
            if (n != null && StringUtils.hasText(n.asText(null))) {
                return n.asText();
            }
        }
        return null;
    }
}
