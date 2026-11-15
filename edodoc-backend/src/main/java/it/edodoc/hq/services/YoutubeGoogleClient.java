package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import it.edodoc.hq.exception.ConflittoException;
import it.edodoc.hq.exception.GoogleRifiutoException;
import it.edodoc.hq.exception.IntegrazioneDisattivataException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Accesso Google per il canale YouTube del dottore: consenso OAuth del proprietario del canale (il refresh token sta in
 * config), access token in memoria e chiamate a YouTube Data API v3 e YouTube Analytics API v2.
 * <p>
 * Il client OAuth è {@code YOUTUBE_OAUTH_CLIENT_ID/SECRET}, variabili d'ambiente del backend. A differenza di Mobilitas
 * non c'è un client di riserva (Google Business): senza le due chiavi il canale risulta «non collegato».
 * Nel progetto Google Cloud vanno abilitate le due API YouTube e autorizzato il redirect URI.
 * Lo state del consenso sta in config ({@code YOUTUBE_OAUTH_STATE}), così il callback funziona su qualsiasi istanza
 * di Cloud Run. Il Service Account di Calendar e Gmail qui non serve: YouTube non accetta la delega di dominio.
 */
@Service
public class YoutubeGoogleClient {

    private static final Logger logger = LoggerFactory.getLogger(YoutubeGoogleClient.class);

    static final String CHIAVE_CLIENT_ID = "YOUTUBE_OAUTH_CLIENT_ID";
    static final String CHIAVE_CLIENT_SECRET = "YOUTUBE_OAUTH_CLIENT_SECRET";
    static final String CHIAVE_REFRESH_TOKEN = "YOUTUBE_OAUTH_REFRESH_TOKEN";
    static final String CHIAVE_REDIRECT_URI = "YOUTUBE_OAUTH_REDIRECT_URI";
    static final String CHIAVE_STATE = "YOUTUBE_OAUTH_STATE";

    private static final String DEFAULT_REDIRECT_URI = "https://hq.edodoc.it/oauth/youtube/callback";
    private static final String AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
    private static final String TOKEN_URL = "https://oauth2.googleapis.com/token";
    private static final String REVOKE_URL = "https://oauth2.googleapis.com/revoke";
    private static final String DATA_API = "https://www.googleapis.com/youtube/v3/";
    private static final String ANALYTICS_API = "https://youtubeanalytics.googleapis.com/v2/reports";
    private static final String UPLOAD_API = "https://www.googleapis.com/upload/youtube/v3/videos";
    /** Gestione completa (commenti, modifica video) + Analytics, anche ricavi se il canale è monetizzato. */
    private static final String SCOPES = String.join(" ",
            "https://www.googleapis.com/auth/youtube.force-ssl",
            "https://www.googleapis.com/auth/yt-analytics.readonly",
            "https://www.googleapis.com/auth/yt-analytics-monetary.readonly");
    private static final long STATE_TTL_SECONDI = 900;

    private final ConfigService configService;
    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate;
    /** Per il caricamento dei video: un file da 100 MB non sta nei 30 secondi delle chiamate normali. */
    private final RestTemplate restTemplateUpload;
    private final String envClientId;
    private final String envClientSecret;
    private final String envRedirectUri;

    private volatile String accessToken;
    private volatile Instant accessTokenScade = Instant.EPOCH;

    public YoutubeGoogleClient(
            ConfigService configService,
            ObjectMapper objectMapper,
            // Lette direttamente dall'ambiente (o da .env): non serve una riga in application.properties
            @Value("${YOUTUBE_OAUTH_CLIENT_ID:}") String envClientId,
            @Value("${YOUTUBE_OAUTH_CLIENT_SECRET:}") String envClientSecret,
            @Value("${YOUTUBE_OAUTH_REDIRECT_URI:}") String envRedirectUri) {
        this.configService = configService;
        this.objectMapper = objectMapper;
        this.envClientId = envClientId;
        this.envClientSecret = envClientSecret;
        this.envRedirectUri = envRedirectUri;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10_000);
        factory.setReadTimeout(30_000);
        this.restTemplate = new RestTemplate(factory);
        SimpleClientHttpRequestFactory upload = new SimpleClientHttpRequestFactory();
        upload.setConnectTimeout(15_000);
        upload.setReadTimeout(600_000);
        this.restTemplateUpload = new RestTemplate(upload);
    }

    // ───────────────────────── Consenso OAuth ─────────────────────────

    public boolean clientConfigurato() {
        return clientId() != null && clientSecret() != null;
    }

    public boolean collegato() {
        return clientConfigurato() && config(CHIAVE_REFRESH_TOKEN) != null;
    }

    public String redirectUri() {
        String v = primoValore(config(CHIAVE_REDIRECT_URI), envRedirectUri);
        return v != null ? v : DEFAULT_REDIRECT_URI;
    }

    public String urlConsenso() {
        if (!clientConfigurato()) {
            throw new IntegrazioneDisattivataException("Client OAuth Google non configurato: impostare YOUTUBE_OAUTH_CLIENT_ID e "
                    + "YOUTUBE_OAUTH_CLIENT_SECRET nelle variabili d'ambiente del backend.");
        }
        String state = UUID.randomUUID().toString();
        salvaConfig(CHIAVE_STATE, state + "|" + Instant.now().plusSeconds(STATE_TTL_SECONDI).getEpochSecond(),
                "YouTube: state del consenso OAuth in corso.");
        return UriComponentsBuilder.fromUriString(AUTH_URL)
                .queryParam("client_id", clientId())
                .queryParam("redirect_uri", redirectUri())
                .queryParam("response_type", "code")
                .queryParam("scope", SCOPES)
                .queryParam("access_type", "offline")
                // Senza prompt=consent Google non ridà il refresh token a chi aveva già acconsentito
                .queryParam("prompt", "consent select_account")
                .queryParam("include_granted_scopes", "true")
                .queryParam("state", state)
                .encode()
                .build()
                .toUriString();
    }

    public void completaConsenso(String code, String state) {
        if (code == null || code.isBlank() || state == null || state.isBlank()) {
            throw new IllegalArgumentException("Parametri code e state obbligatori");
        }
        String atteso = config(CHIAVE_STATE);
        salvaConfig(CHIAVE_STATE, "", null);
        if (atteso == null || !atteso.contains("|")) {
            throw new IllegalArgumentException("Collegamento scaduto: riparti da «Collega canale».");
        }
        String[] parti = atteso.split("\\|", 2);
        if (!parti[0].equals(state.trim()) || Instant.now().getEpochSecond() > Long.parseLong(parti[1])) {
            throw new IllegalArgumentException("Collegamento non valido o scaduto: riparti da «Collega canale».");
        }

        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "authorization_code");
        form.add("code", code.trim());
        form.add("redirect_uri", redirectUri());
        form.add("client_id", clientId());
        form.add("client_secret", clientSecret());
        JsonNode token = postToken(form);
        String refresh = token.path("refresh_token").asText("");
        if (refresh.isBlank()) {
            throw new ConflittoException("Google non ha restituito il refresh token: rimuovi l'accesso dell'app "
                    + "dall'account Google e ricollega il canale.");
        }
        String scope = token.path("scope").asText("");
        if (!scope.contains("yt-analytics.readonly") || !scope.contains("youtube")) {
            throw new ConflittoException("Permessi incompleti: nella schermata di Google spunta tutte le autorizzazioni richieste.");
        }
        salvaConfig(CHIAVE_REFRESH_TOKEN, refresh, null);
        accessToken = token.path("access_token").asText(null);
        accessTokenScade = Instant.now().plusSeconds(token.path("expires_in").asLong(3600) - 60);
        logger.info("[YOUTUBE] Canale collegato (scope: {})", scope);
    }

    public void scollega() {
        String refresh = config(CHIAVE_REFRESH_TOKEN);
        if (refresh != null) {
            try {
                MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
                form.add("token", refresh);
                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
                restTemplate.postForEntity(REVOKE_URL, new HttpEntity<>(form, headers), String.class);
            } catch (Exception e) {
                logger.warn("[YOUTUBE] Revoca token non riuscita (lo cancello comunque): {}", e.getMessage());
            }
        }
        salvaConfig(CHIAVE_REFRESH_TOKEN, "", null);
        accessToken = null;
        accessTokenScade = Instant.EPOCH;
    }

    // ───────────────────────── Chiamate API ─────────────────────────

    /** GET su Data API v3 ({@code risorsa} es. "channels"), parametri in coppie nome/valore. */
    public JsonNode data(String risorsa, Map<String, ?> parametri) {
        return esegui(HttpMethod.GET, url(DATA_API + risorsa, parametri), null);
    }

    public JsonNode dataScrivi(HttpMethod metodo, String risorsa, Map<String, ?> parametri, Object body) {
        return esegui(metodo, url(DATA_API + risorsa, parametri), body);
    }

    /**
     * Carica un video sul canale (Planner social): upload ripristinabile in due passi, metadati {@code snippet} e
     * {@code status}, poi i byte. Restituisce la risorsa video creata (id, snippet, status).
     */
    public JsonNode caricaVideo(Object metadati, byte[] video, String mimeType) {
        URI avvio = url(UPLOAD_API, Map.of("uploadType", "resumable", "part", "snippet,status"));
        for (int tentativo = 0; tentativo < 2; tentativo++) {
            String token = accessToken(tentativo > 0);
            try {
                HttpHeaders headers = new HttpHeaders();
                headers.setBearerAuth(token);
                headers.setContentType(MediaType.APPLICATION_JSON);
                headers.set("X-Upload-Content-Type", mimeType);
                headers.set("X-Upload-Content-Length", String.valueOf(video.length));
                ResponseEntity<String> r = restTemplate.exchange(avvio, HttpMethod.POST,
                        new HttpEntity<>(objectMapper.writeValueAsString(metadati), headers), String.class);
                URI sessione = r.getHeaders().getLocation();
                if (sessione == null) {
                    throw new GoogleRifiutoException(HttpStatus.BAD_GATEWAY, "YouTube non ha aperto il caricamento del video", null);
                }
                HttpHeaders put = new HttpHeaders();
                put.setBearerAuth(token);
                put.setContentType(MediaType.parseMediaType(mimeType));
                ResponseEntity<String> fine = restTemplateUpload.exchange(sessione, HttpMethod.PUT, new HttpEntity<>(video, put), String.class);
                return objectMapper.readTree(fine.getBody() == null ? "{}" : fine.getBody());
            } catch (HttpStatusCodeException e) {
                if (e.getStatusCode().value() == 401 && tentativo == 0) {
                    continue;
                }
                throw erroreGoogle(e);
            } catch (GoogleRifiutoException | ConflittoException e) {
                throw e;
            } catch (Exception e) {
                throw new GoogleRifiutoException(HttpStatus.BAD_GATEWAY, "Caricamento su YouTube non riuscito: " + e.getMessage(), e);
            }
        }
        throw new GoogleRifiutoException(HttpStatus.BAD_GATEWAY, "YouTube ha rifiutato l'accesso", null);
    }

    /** Report Analytics sul canale collegato. */
    public Report report(String dal, String al, String metriche, String dimensioni, String filtri, String ordine, Integer max) {
        Map<String, Object> p = new java.util.LinkedHashMap<>();
        p.put("ids", "channel==MINE");
        p.put("startDate", dal);
        p.put("endDate", al);
        p.put("metrics", metriche);
        p.put("dimensions", dimensioni);
        p.put("filters", filtri);
        p.put("sort", ordine);
        p.put("maxResults", max);
        // Senza questo i ricavi arrivano in dollari, mentre Studio e la pagina li mostrano in euro
        if (metriche.contains("Revenue")) {
            p.put("currency", "EUR");
        }
        JsonNode n = esegui(HttpMethod.GET, url(ANALYTICS_API, p), null);
        List<String> colonne = new ArrayList<>();
        n.path("columnHeaders").forEach(h -> colonne.add(h.path("name").asText()));
        List<JsonNode> righe = new ArrayList<>();
        n.path("rows").forEach(righe::add);
        return new Report(colonne, righe);
    }

    /** Righe di un report Analytics con accesso per nome di colonna. */
    public record Report(List<String> colonne, List<JsonNode> righe) {

        public JsonNode cella(JsonNode riga, String colonna) {
            int i = colonne.indexOf(colonna);
            return i < 0 ? com.fasterxml.jackson.databind.node.MissingNode.getInstance() : riga.path(i);
        }

        public long l(JsonNode riga, String colonna) {
            return cella(riga, colonna).asLong(0);
        }

        public double d(JsonNode riga, String colonna) {
            return cella(riga, colonna).asDouble(0);
        }

        public String s(JsonNode riga, String colonna) {
            return cella(riga, colonna).asText("");
        }
    }

    private URI url(String base, Map<String, ?> parametri) {
        UriComponentsBuilder b = UriComponentsBuilder.fromUriString(base);
        if (parametri != null) {
            parametri.forEach((k, v) -> {
                if (v != null && !String.valueOf(v).isBlank()) {
                    b.queryParam(k, v);
                }
            });
        }
        return b.encode().build().toUri();
    }

    private JsonNode esegui(HttpMethod metodo, URI uri, Object body) {
        for (int tentativo = 0; tentativo < 2; tentativo++) {
            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(accessToken(tentativo > 0));
            headers.setAccept(List.of(MediaType.APPLICATION_JSON));
            if (body != null) {
                headers.setContentType(MediaType.APPLICATION_JSON);
            }
            try {
                ResponseEntity<String> r = restTemplate.exchange(uri, metodo, new HttpEntity<>(body, headers), String.class);
                String testo = r.getBody();
                return testo == null || testo.isBlank() ? objectMapper.createObjectNode() : objectMapper.readTree(testo);
            } catch (HttpStatusCodeException e) {
                if (e.getStatusCode().value() == 401 && tentativo == 0) {
                    continue;
                }
                throw erroreGoogle(e);
            } catch (GoogleRifiutoException | ConflittoException e) {
                throw e;
            } catch (Exception e) {
                throw new GoogleRifiutoException(HttpStatus.BAD_GATEWAY, "YouTube non risponde: " + e.getMessage(), e);
            }
        }
        throw new GoogleRifiutoException(HttpStatus.BAD_GATEWAY, "YouTube ha rifiutato l'accesso", null);
    }

    private GoogleRifiutoException erroreGoogle(HttpStatusCodeException e) {
        String motivo = "";
        String messaggio = e.getStatusText();
        try {
            JsonNode err = objectMapper.readTree(e.getResponseBodyAsString()).path("error");
            messaggio = err.path("message").asText(messaggio);
            motivo = err.path("errors").path(0).path("reason").asText("");
        } catch (Exception ignored) {
            // corpo non JSON: resta lo status
        }
        logger.warn("[YOUTUBE] {} {}: {}", e.getStatusCode().value(), motivo, messaggio);
        String testo = switch (motivo) {
            case "quotaExceeded", "dailyLimitExceeded" ->
                    "Quota giornaliera delle API YouTube esaurita: i dati tornano domattina (ore 9).";
            case "accessNotConfigured" -> "API YouTube non abilitata nel progetto Google Cloud: " + messaggio;
            case "forbidden", "insufficientPermissions" -> "Permesso negato da YouTube: " + messaggio;
            default -> "YouTube: " + messaggio;
        };
        HttpStatus status = e.getStatusCode().value() == 404 ? HttpStatus.NOT_FOUND : HttpStatus.BAD_GATEWAY;
        return new GoogleRifiutoException(status, testo, e);
    }

    private synchronized String accessToken(boolean forzaRinnovo) {
        if (!forzaRinnovo && accessToken != null && Instant.now().isBefore(accessTokenScade)) {
            return accessToken;
        }
        String refresh = config(CHIAVE_REFRESH_TOKEN);
        if (refresh == null || !clientConfigurato()) {
            throw new ConflittoException("Canale YouTube non collegato");
        }
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "refresh_token");
        form.add("refresh_token", refresh);
        form.add("client_id", clientId());
        form.add("client_secret", clientSecret());
        JsonNode token = postToken(form);
        accessToken = token.path("access_token").asText(null);
        accessTokenScade = Instant.now().plusSeconds(token.path("expires_in").asLong(3600) - 60);
        return accessToken;
    }

    private JsonNode postToken(MultiValueMap<String, String> form) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
        headers.setAccept(List.of(MediaType.APPLICATION_JSON));
        try {
            ResponseEntity<String> r = restTemplate.postForEntity(TOKEN_URL, new HttpEntity<>(form, headers), String.class);
            return objectMapper.readTree(r.getBody());
        } catch (HttpStatusCodeException e) {
            String body = e.getResponseBodyAsString();
            logger.warn("[YOUTUBE] Token OAuth rifiutato: {} {}", e.getStatusCode().value(), body);
            if (body.contains("invalid_grant")) {
                throw new GoogleRifiutoException(HttpStatus.CONFLICT,
                        "Accesso al canale revocato o scaduto: ricollega il canale YouTube.", e);
            }
            throw new GoogleRifiutoException(HttpStatus.BAD_GATEWAY, "OAuth Google ha rifiutato la richiesta", e);
        } catch (Exception e) {
            throw new GoogleRifiutoException(HttpStatus.BAD_GATEWAY, "OAuth Google non raggiungibile", e);
        }
    }

    // ───────────────────────── Config ─────────────────────────

    /** Valore della tabella config, null se vuoto. */
    String config(String chiave) {
        String v = configService.get(chiave);
        return v == null || v.isBlank() ? null : v.trim();
    }

    /**
     * Scrive una chiave di sistema. La riga deve esistere (V21__youtube_studio.sql): {@link ConfigService#salvaDiSistema}
     * non crea chiavi nuove. {@code descrizione} resta per compatibilità con Mobilitas.
     */
    void salvaConfig(String chiave, String valore, String descrizione) {
        configService.salvaDiSistema(chiave, valore);
    }

    /** Solo variabili d'ambiente: niente client di Google Business come in Mobilitas. */
    private String clientId() {
        return primoValore(envClientId);
    }

    private String clientSecret() {
        return primoValore(envClientSecret);
    }

    private static String primoValore(String... valori) {
        for (String v : valori) {
            if (v != null && !v.isBlank()) {
                return v.trim();
            }
        }
        return null;
    }
}
