package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import it.edodoc.hq.dto.PlannerDto;
import it.edodoc.hq.models.Config;
import it.edodoc.hq.models.PlannerAccount;
import it.edodoc.hq.repositories.ConfigRepository;
import it.edodoc.hq.repositories.PlannerAccountRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.util.StringUtils;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * TikTok per il Planner social (Content Posting API, pubblicazione diretta). Ogni account si collega con il consenso
 * OAuth del suo proprietario (Login Kit): access token di 24 ore e refresh token di un anno, in {@link PlannerAccount}.
 * L'app TikTok for Developers sta in {@code planner.tiktok.client-key/secret} (env TIKTOK_CLIENT_KEY/SECRET), con gli
 * scope {@value #SCOPES} e il redirect URI in config ({@value #CHIAVE_REDIRECT}) o in {@code planner.tiktok.redirect-uri}
 * (env TIKTOK_REDIRECT_URI, di default la pagina di callback del gestionale EdoDoc).
 *
 * <p>Finché TikTok non ha approvato l'app (audit), i post escono solo privati (SELF_ONLY): lo dice
 * {@code creator_info}, che il Planner mostra prima di pubblicare. I video si caricano a pezzi dal gestionale
 * (FILE_UPLOAD); le foto TikTok le scarica dall'indirizzo pubblico (PULL_FROM_URL), quindi il dominio dei media va
 * verificato nell'app TikTok.
 */
@Service
public class PlannerTiktokClient {

    private static final Logger logger = LoggerFactory.getLogger(PlannerTiktokClient.class);

    static final String SCOPES = "user.info.basic,video.publish,video.upload";
    static final String CHIAVE_REDIRECT = "PLANNER_TIKTOK_REDIRECT_URI";
    static final String CHIAVE_STATE = "PLANNER_TIKTOK_OAUTH_STATE";
    private static final String DEFAULT_REDIRECT = "https://hq.edodoc.it/oauth/tiktok/callback";
    private static final String AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
    private static final String API = "https://open.tiktokapis.com/v2/";
    private static final long STATE_TTL_SECONDI = 900;
    private static final long CHUNK = 10L * 1024 * 1024;
    private static final long CHUNK_UNICO_MAX = 64L * 1024 * 1024;
    private static final int ATTESA_SECONDI = 600;

    private final ConfigRepository configRepository;
    private final PlannerAccountRepository accountRepository;
    private final ObjectMapper objectMapper;
    private final String clientKey;
    private final String clientSecret;
    private final String redirectDefault;
    private final RestTemplate rest;
    private final RestTemplate restUpload;

    public PlannerTiktokClient(ConfigRepository configRepository, PlannerAccountRepository accountRepository,
                               ObjectMapper objectMapper,
                               @Value("${planner.tiktok.client-key:}") String clientKey,
                               @Value("${planner.tiktok.client-secret:}") String clientSecret,
                               @Value("${planner.tiktok.redirect-uri:" + DEFAULT_REDIRECT + "}") String redirectDefault) {
        this.configRepository = configRepository;
        this.accountRepository = accountRepository;
        this.objectMapper = objectMapper;
        this.clientKey = clientKey == null ? "" : clientKey.trim();
        this.clientSecret = clientSecret == null ? "" : clientSecret.trim();
        this.redirectDefault = redirectDefault == null || redirectDefault.isBlank() ? DEFAULT_REDIRECT : redirectDefault.trim();
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(10_000);
        f.setReadTimeout(30_000);
        this.rest = new RestTemplate(f);
        SimpleClientHttpRequestFactory u = new SimpleClientHttpRequestFactory();
        u.setConnectTimeout(15_000);
        u.setReadTimeout(300_000);
        this.restUpload = new RestTemplate(u);
    }

    public boolean configurato() {
        return !clientKey.isEmpty() && !clientSecret.isEmpty();
    }

    // ── Collegamento ──

    public String urlConsenso(Long brandId) {
        if (!configurato()) {
            throw new IllegalStateException("App TikTok non configurata: servono TIKTOK_CLIENT_KEY e TIKTOK_CLIENT_SECRET.");
        }
        String state = UUID.randomUUID().toString().replace("-", "");
        salvaConfig(CHIAVE_STATE, state + "|" + brandId + "|" + Instant.now().plusSeconds(STATE_TTL_SECONDI).getEpochSecond());
        return UriComponentsBuilder.fromUriString(AUTH_URL)
                .queryParam("client_key", clientKey)
                .queryParam("scope", SCOPES)
                .queryParam("response_type", "code")
                .queryParam("redirect_uri", redirectUri())
                .queryParam("state", state)
                .encode()
                .build()
                .toUriString();
    }

    /** Scambia il code col token, legge il profilo e salva (o sposta) l'account nello spazio del consenso. */
    public PlannerAccount completaConsenso(String code, String state) {
        if (!StringUtils.hasText(code) || !StringUtils.hasText(state)) {
            throw new IllegalArgumentException("Parametri code e state obbligatori.");
        }
        String atteso = config(CHIAVE_STATE);
        salvaConfig(CHIAVE_STATE, "");
        String[] parti = atteso == null ? new String[0] : atteso.split("\\|");
        if (parti.length != 3 || !parti[0].equals(state.trim()) || Instant.now().getEpochSecond() > Long.parseLong(parti[2])) {
            throw new IllegalArgumentException("Collegamento scaduto o non valido: riparti da «Collega TikTok».");
        }
        Long brandId = Long.valueOf(parti[1]);
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("client_key", clientKey);
        form.add("client_secret", clientSecret);
        form.add("code", code.trim());
        form.add("grant_type", "authorization_code");
        form.add("redirect_uri", redirectUri());
        JsonNode t = token(form);
        String scope = t.path("scope").asText("");
        if (!scope.contains("video.publish")) {
            throw new IllegalStateException("Permessi incompleti: nella schermata di TikTok accetta la pubblicazione dei video.");
        }
        String openId = t.path("open_id").asText(null);
        JsonNode u = chiama(HttpMethod.GET, "user/info/?fields=open_id,display_name,avatar_url,username", null,
                t.path("access_token").asText()).path("data").path("user");
        PlannerAccount a = accountRepository.findByCanaleAndTipo(PlannerCanali.TIKTOK, PlannerAccount.TIPO_OAUTH).stream()
                .filter(x -> openId != null && openId.equals(x.getAccount()))
                .findFirst()
                .orElseGet(() -> PlannerAccount.builder()
                        .canale(PlannerCanali.TIKTOK).tipo(PlannerAccount.TIPO_OAUTH).account(openId)
                        .creatoIl(LocalDateTime.now()).build());
        String username = u.path("username").asText(null);
        a.setBrandId(brandId);
        a.setNome(StringUtils.hasText(u.path("display_name").asText(null)) ? u.path("display_name").asText() : "TikTok");
        a.setDettaglio(StringUtils.hasText(username) ? "@" + username : null);
        a.setImmagine(u.path("avatar_url").asText(null));
        a.setUrlProfilo(StringUtils.hasText(username) ? "https://www.tiktok.com/@" + username : null);
        applicaToken(a, t);
        logger.info("[PLANNER] Account TikTok collegato allo spazio {}", brandId);
        return accountRepository.save(a);
    }

    public void revoca(PlannerAccount a) {
        if (!StringUtils.hasText(a.getAccessToken()) || !configurato()) {
            return;
        }
        try {
            MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
            form.add("client_key", clientKey);
            form.add("client_secret", clientSecret);
            form.add("token", a.getAccessToken());
            HttpHeaders h = new HttpHeaders();
            h.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
            rest.postForEntity(API + "oauth/revoke/", new HttpEntity<>(form, h), String.class);
        } catch (Exception e) {
            logger.warn("[PLANNER] Revoca token TikTok non riuscita (lo cancello comunque): {}", e.getMessage());
        }
    }

    public boolean collegato(PlannerAccount a) {
        return a.getRefreshToken() != null && (a.getRefreshScadeIl() == null || a.getRefreshScadeIl().isAfter(LocalDateTime.now()));
    }

    // ── Pubblicazione ──

    public PlannerDto.TiktokCreatore creatore(PlannerAccount a) {
        JsonNode d = chiama(HttpMethod.POST, "post/publish/creator_info/query/", Map.of(), tokenValido(a)).path("data");
        List<String> privacy = new ArrayList<>();
        d.path("privacy_level_options").forEach(p -> privacy.add(p.asText()));
        return new PlannerDto.TiktokCreatore(d.path("creator_nickname").asText(a.getNome()),
                d.path("creator_username").asText(null), d.path("creator_avatar_url").asText(a.getImmagine()), privacy,
                d.hasNonNull("max_video_post_duration_sec") ? d.path("max_video_post_duration_sec").asInt() : null,
                d.path("comment_disabled").asBoolean(false), d.path("duet_disabled").asBoolean(false),
                d.path("stitch_disabled").asBoolean(false));
    }

    /** Video caricato a pezzi; restituisce l'id del post pubblico (null se privato o non ancora visibile). */
    public String pubblicaVideo(PlannerAccount a, byte[] video, String mime, String didascalia, JsonNode opzioni)
            throws InterruptedException {
        String token = tokenValido(a);
        PlannerDto.TiktokCreatore c = creatore(a);
        long size = video.length;
        long chunk = size <= CHUNK_UNICO_MAX ? size : CHUNK;
        long pezzi = size <= CHUNK_UNICO_MAX ? 1 : size / CHUNK;
        Map<String, Object> post = postInfo(c, opzioni);
        post.put("title", didascalia == null ? "" : didascalia);
        Map<String, Object> corpo = Map.of("post_info", post, "source_info", Map.of(
                "source", "FILE_UPLOAD", "video_size", size, "chunk_size", chunk, "total_chunk_count", pezzi));
        JsonNode d = chiama(HttpMethod.POST, "post/publish/video/init/", corpo, token).path("data");
        String publishId = d.path("publish_id").asText(null);
        String uploadUrl = d.path("upload_url").asText(null);
        for (long i = 0; i < pezzi; i++) {
            long inizio = i * chunk;
            long fine = i == pezzi - 1 ? size - 1 : inizio + chunk - 1;
            HttpHeaders h = new HttpHeaders();
            h.setContentType(MediaType.parseMediaType(mime));
            h.set("Content-Range", "bytes " + inizio + "-" + fine + "/" + size);
            byte[] parte = Arrays.copyOfRange(video, (int) inizio, (int) fine + 1);
            try {
                restUpload.exchange(uploadUrl, HttpMethod.PUT, new HttpEntity<>(parte, h), String.class);
            } catch (HttpStatusCodeException e) {
                throw new IllegalStateException("TikTok ha rifiutato il caricamento del video (HTTP " + e.getStatusCode().value() + ").");
            }
        }
        return attendi(publishId, token);
    }

    /** Carosello di foto: TikTok le scarica dagli indirizzi pubblici (dominio da verificare nell'app). */
    public String pubblicaFoto(PlannerAccount a, List<String> url, String titolo, String descrizione, JsonNode opzioni)
            throws InterruptedException {
        String token = tokenValido(a);
        PlannerDto.TiktokCreatore c = creatore(a);
        Map<String, Object> post = postInfo(c, opzioni);
        post.put("title", titolo == null ? "" : SocialAzioniService.tronca(titolo, 90));
        post.put("description", descrizione == null ? "" : descrizione);
        post.put("auto_add_music", opzioni.path("musicaAutomatica").asBoolean(true));
        post.remove("disable_duet");
        post.remove("disable_stitch");
        Map<String, Object> corpo = new LinkedHashMap<>();
        corpo.put("post_info", post);
        corpo.put("source_info", Map.of("source", "PULL_FROM_URL", "photo_cover_index", 0, "photo_images", url));
        corpo.put("post_mode", "DIRECT_POST");
        corpo.put("media_type", "PHOTO");
        String publishId = chiama(HttpMethod.POST, "post/publish/content/init/", corpo, token).path("data").path("publish_id").asText(null);
        return attendi(publishId, token);
    }

    /** Privacy scelta se TikTok la permette all'account, altrimenti la più chiusa disponibile. */
    private Map<String, Object> postInfo(PlannerDto.TiktokCreatore c, JsonNode o) {
        String scelta = o.path("privacy").asText("PUBLIC_TO_EVERYONE");
        String privacy = c.privacy().contains(scelta) ? scelta
                : c.privacy().contains("SELF_ONLY") ? "SELF_ONLY" : c.privacy().isEmpty() ? "SELF_ONLY" : c.privacy().get(0);
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("privacy_level", privacy);
        p.put("disable_comment", c.commentiDisattivati() || o.path("disattivaCommenti").asBoolean(false));
        p.put("disable_duet", c.duetDisattivati() || o.path("disattivaDuet").asBoolean(false));
        p.put("disable_stitch", c.stitchDisattivati() || o.path("disattivaStitch").asBoolean(false));
        p.put("brand_content_toggle", o.path("contenutoSponsorizzato").asBoolean(false));
        p.put("brand_organic_toggle", o.path("promuoveIlMioBrand").asBoolean(false));
        return p;
    }

    private String attendi(String publishId, String token) throws InterruptedException {
        if (!StringUtils.hasText(publishId)) {
            throw new IllegalStateException("TikTok non ha avviato la pubblicazione.");
        }
        long limite = System.currentTimeMillis() + ATTESA_SECONDI * 1000L;
        while (System.currentTimeMillis() < limite) {
            Thread.sleep(5000);
            JsonNode d = chiama(HttpMethod.POST, "post/publish/status/fetch/", Map.of("publish_id", publishId), token).path("data");
            String stato = d.path("status").asText("");
            if ("PUBLISH_COMPLETE".equals(stato)) {
                JsonNode id = d.path("publicaly_available_post_id").path(0);
                return id.isMissingNode() || id.isNull() ? publishId : id.asText();
            }
            if ("FAILED".equals(stato)) {
                throw new IllegalStateException("TikTok non ha pubblicato il post: " + motivo(d.path("fail_reason").asText("")));
            }
        }
        throw new IllegalStateException("TikTok sta ancora elaborando il post: controlla sul profilo fra qualche minuto.");
    }

    private static String motivo(String codice) {
        return switch (codice) {
            case "file_format_check_failed" -> "formato del file non supportato";
            case "duration_check_failed" -> "durata del video fuori dai limiti dell'account";
            case "frame_rate_check_failed" -> "frame rate non supportato";
            case "picture_size_check_failed" -> "dimensioni dell'immagine non supportate";
            case "spam_risk_too_many_posts", "spam_risk_user_banned_from_posting", "spam_risk" -> "TikTok ha limitato le pubblicazioni dell'account";
            case "url_ownership_unverified" -> "il dominio dei media non è verificato nell'app TikTok";
            default -> codice.isEmpty() ? "motivo non indicato" : codice;
        };
    }

    // ── Token ──

    /** Access token valido, rinnovato col refresh token se scade fra meno di 10 minuti. */
    synchronized String tokenValido(PlannerAccount a) {
        if (a.getAccessToken() != null && a.getTokenScadeIl() != null && a.getTokenScadeIl().isAfter(LocalDateTime.now().plusMinutes(10))) {
            return a.getAccessToken();
        }
        if (!collegato(a)) {
            throw new IllegalStateException("L'accesso a TikTok di " + a.getNome() + " è scaduto: ricollega l'account.");
        }
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("client_key", clientKey);
        form.add("client_secret", clientSecret);
        form.add("grant_type", "refresh_token");
        form.add("refresh_token", a.getRefreshToken());
        applicaToken(a, token(form));
        accountRepository.save(a);
        return a.getAccessToken();
    }

    private static void applicaToken(PlannerAccount a, JsonNode t) {
        a.setAccessToken(t.path("access_token").asText(null));
        a.setTokenScadeIl(LocalDateTime.now().plusSeconds(t.path("expires_in").asLong(86_400)));
        if (StringUtils.hasText(t.path("refresh_token").asText(null))) {
            a.setRefreshToken(t.path("refresh_token").asText());
            a.setRefreshScadeIl(LocalDateTime.now().plusSeconds(t.path("refresh_expires_in").asLong(31_536_000)));
        }
    }

    private JsonNode token(MultiValueMap<String, String> form) {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
        try {
            ResponseEntity<String> r = rest.postForEntity(API + "oauth/token/", new HttpEntity<>(form, h), String.class);
            JsonNode n = objectMapper.readTree(r.getBody());
            if (n.hasNonNull("error") && !n.path("error").isObject()) {
                throw new IllegalStateException("TikTok ha rifiutato l'accesso: " + n.path("error_description").asText(n.path("error").asText()));
            }
            return n;
        } catch (HttpStatusCodeException e) {
            throw new IllegalStateException("TikTok ha rifiutato l'accesso: " + e.getResponseBodyAsString(), e);
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("TikTok non risponde: " + e.getMessage(), e);
        }
    }

    private JsonNode chiama(HttpMethod metodo, String percorso, Object corpo, String token) {
        HttpHeaders h = new HttpHeaders();
        h.setBearerAuth(token);
        if (corpo != null) {
            h.setContentType(MediaType.parseMediaType("application/json; charset=UTF-8"));
        }
        try {
            ResponseEntity<String> r = rest.exchange(API + percorso, metodo,
                    new HttpEntity<>(corpo == null ? null : objectMapper.writeValueAsString(corpo), h), String.class);
            JsonNode n = objectMapper.readTree(r.getBody() == null ? "{}" : r.getBody());
            String codice = n.path("error").path("code").asText("ok");
            if (!"ok".equals(codice)) {
                throw new IllegalStateException("TikTok: " + n.path("error").path("message").asText(codice));
            }
            return n;
        } catch (HttpStatusCodeException e) {
            String m = e.getResponseBodyAsString();
            try {
                m = objectMapper.readTree(m).path("error").path("message").asText(m);
            } catch (Exception ignored) {
                // corpo non JSON
            }
            throw new IllegalStateException("TikTok: " + m, e);
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("TikTok non risponde: " + e.getMessage(), e);
        }
    }

    // ── Config ──

    private String redirectUri() {
        String v = config(CHIAVE_REDIRECT);
        return v != null ? v : redirectDefault;
    }

    private String config(String chiave) {
        return configRepository.findByChiave(chiave).map(Config::getValore).map(String::trim).filter(v -> !v.isEmpty()).orElse(null);
    }

    private void salvaConfig(String chiave, String valore) {
        Config c = configRepository.findByChiave(chiave).orElseGet(() -> {
            Config nuova = new Config();
            nuova.setChiave(chiave);
            nuova.setDescrizione("Planner social: state del collegamento TikTok in corso.");
            return nuova;
        });
        c.setValore(valore);
        configRepository.save(c);
    }
}
