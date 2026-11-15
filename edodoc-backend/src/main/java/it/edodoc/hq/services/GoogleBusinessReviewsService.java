package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.auth.ServiceAccountSigner;
import com.google.auth.oauth2.GoogleCredentials;
import it.edodoc.hq.exception.IntegrazioneDisattivataException;
import it.edodoc.hq.models.Config;
import it.edodoc.hq.repositories.ConfigRepository;
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
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.io.IOException;
import java.io.InputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Google Business Profile per il Planner social: identità, scheda di EdoDoc e post sulla scheda (localPosts).
 * Solo la parte che serve al Planner del GoogleBusinessReviewsService di Mobilitas: niente recensioni.
 *
 * <p>EdoDoc ha una sola scheda: il suo id sta in config {@code GOOGLE_BUSINESS_LOCATION_ID} o nella property
 * {@code google.business.location.id} (env GOOGLE_BUSINESS_LOCATION). L'identità è un OAuth utente (client id,
 * secret e refresh token: config {@code GOOGLE_BUSINESS_OAUTH_*} o env) oppure, se manca, l'account di servizio con
 * delega di dominio di {@link GoogleClients} (stessa chiave o firma IAM su Cloud Run, stesso account del dottore), con
 * lo scope business.manage autorizzato in Google Admin. Senza nessuna delle due il canale resta spento: nessuna
 * chiamata a Google.
 */
@Service
public class GoogleBusinessReviewsService {

    private static final Logger logger = LoggerFactory.getLogger(GoogleBusinessReviewsService.class);
    static final String BUSINESS_MANAGE_SCOPE = "https://www.googleapis.com/auth/business.manage";
    private static final String OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
    private static final String ACCOUNT_LIST_URL = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
    private static final String LOCATION_LIST_URL_TEMPLATE =
            "https://mybusinessbusinessinformation.googleapis.com/v1/accounts/%s/locations"
                    + "?readMask=name,title,storeCode,storefrontAddress,metadata&pageSize=100";
    private static final String LOCAL_POSTS_URL_TEMPLATE = "https://mybusiness.googleapis.com/v4/accounts/%s/locations/%s/localPosts";

    static final String CHIAVE_ACCOUNT = "GOOGLE_BUSINESS_ACCOUNT_ID";
    static final String CHIAVE_LOCATION = "GOOGLE_BUSINESS_LOCATION_ID";
    static final String CHIAVE_LINK = "GOOGLE_BUSINESS_MAPS_LINK";

    /** Una scheda Google Business visibile all'identità. */
    public record Scheda(String locationId, String resourceName, String titolo, String citta, String indirizzo,
                         String linkMaps) {
    }

    private final ConfigRepository configRepository;
    private final GoogleClients googleClients;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final String accountIdProperty;
    private final String locationIdProperty;
    private final String linkMapsProperty;
    private final String oauthClientId;
    private final String oauthClientSecret;
    private final String oauthRefreshToken;
    private final String credentialsPath;
    private final boolean senzaChiave;
    private volatile GoogleCredentials credenzialiDelega;
    private volatile String accountDelega;

    public GoogleBusinessReviewsService(ConfigRepository configRepository, GoogleClients googleClients,
                                        @Value("${google.business.account.id:}") String accountId,
                                        @Value("${google.business.location.id:}") String locationId,
                                        @Value("${google.business.maps-link:}") String linkMaps,
                                        @Value("${google.business.oauth.client.id:}") String oauthClientId,
                                        @Value("${google.business.oauth.client.secret:}") String oauthClientSecret,
                                        @Value("${google.business.oauth.refresh.token:}") String oauthRefreshToken,
                                        @Value("${app.google.credentials-path:}") String credentialsPath,
                                        @Value("${app.google.senza-chiave:false}") boolean senzaChiave) {
        this.configRepository = configRepository;
        this.googleClients = googleClients;
        this.accountIdProperty = accountId;
        this.locationIdProperty = locationId;
        this.linkMapsProperty = linkMaps;
        this.oauthClientId = oauthClientId;
        this.oauthClientSecret = oauthClientSecret;
        this.oauthRefreshToken = oauthRefreshToken;
        this.credentialsPath = credentialsPath == null ? "" : credentialsPath;
        this.senzaChiave = senzaChiave;
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(10_000);
        f.setReadTimeout(60_000);
        this.restTemplate = new RestTemplate(f);
        this.objectMapper = new ObjectMapper();
    }

    // ── Scheda di EdoDoc ──

    /** Id della scheda di EdoDoc (senza prefisso locations/), null se non configurata. */
    public String locationId() {
        String v = firstNonBlank(getConfigValue(CHIAVE_LOCATION), locationIdProperty);
        if (v != null && v.contains("/")) {
            v = v.substring(v.lastIndexOf('/') + 1);
        }
        return v;
    }

    public boolean schedaConfigurata() {
        return locationId() != null;
    }

    /** Link pubblico della scheda (Google Maps), se impostato in config o env. */
    public String linkScheda() {
        return firstNonBlank(getConfigValue(CHIAVE_LINK), linkMapsProperty);
    }

    /** Planner social: c'è un'identità per scrivere sulla scheda (senza chiamare Google). */
    public boolean autenticazioneDisponibile() {
        return isGoogleBusinessUserOauthConfigured() || googleClients.isConfigurato();
    }

    /** Il canale Google Business del Planner si può usare: identità e scheda ci sono. */
    public boolean disponibile() {
        return autenticazioneDisponibile() && schedaConfigurata();
    }

    /** Schede visibili all'identità (per trovare l'id da mettere in GOOGLE_BUSINESS_LOCATION_ID). */
    public List<Scheda> listLocations(String accountId) {
        HttpEntity<String> request = buildAuthorizedRequestEntity();
        String resolvedAccountId = resolveAccountId(accountId, request);
        try {
            return listLocationsForAccount(resolvedAccountId, request);
        } catch (HttpStatusCodeException e) {
            throw new IllegalStateException("Errore elenco schede Google Business (accountId=" + resolvedAccountId
                    + "): " + messaggioGoogle(e.getResponseBodyAsString()), e);
        }
    }

    /** La scheda configurata, letta da Google; null se non configurata o non visibile all'identità. */
    public Scheda scheda() {
        String id = locationId();
        if (id == null || !autenticazioneDisponibile()) {
            return null;
        }
        return listLocations(null).stream().filter(s -> id.equals(s.locationId())).findFirst().orElse(null);
    }

    /**
     * Planner social: pubblica un post (aggiornamento, evento, offerta) sulla scheda. {@code corpo} è il LocalPost di
     * Google (summary, topicType, callToAction, media con sourceUrl pubblico, event, offer). Restituisce il post creato
     * (name, searchUrl).
     */
    public JsonNode creaPostLocale(String locationId, Map<String, Object> corpo) {
        if (locationId == null || locationId.isBlank()) {
            throw new IllegalArgumentException("La scheda Google di EdoDoc non è collegata (GOOGLE_BUSINESS_LOCATION).");
        }
        String id = locationId.trim();
        if (id.contains("/")) {
            id = id.substring(id.lastIndexOf('/') + 1);
        }
        HttpEntity<String> authRequest = buildAuthorizedRequestEntity();
        String resolvedAccountId = resolveAccountId(null, authRequest);
        String url = String.format(Locale.ROOT, LOCAL_POSTS_URL_TEMPLATE, resolvedAccountId, id);
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.putAll(authRequest.getHeaders());
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setAccept(Collections.singletonList(MediaType.APPLICATION_JSON));
            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.POST,
                    new HttpEntity<>(objectMapper.writeValueAsString(corpo), headers), String.class);
            return readJson(response.getBody());
        } catch (HttpStatusCodeException e) {
            throw new IllegalStateException("Google ha rifiutato il post: " + messaggioGoogle(e.getResponseBodyAsString()), e);
        } catch (Exception e) {
            throw new IllegalStateException("Pubblicazione su Google non riuscita: " + e.getMessage(), e);
        }
    }

    // ── Autenticazione ──

    private HttpEntity<String> buildAuthorizedRequestEntity() {
        if (isGoogleBusinessUserOauthConfigured()) {
            return buildAuthorizedRequestEntityFromUserOAuth(
                    firstNonBlank(getConfigValue("GOOGLE_BUSINESS_OAUTH_CLIENT_ID"), oauthClientId),
                    firstNonBlank(getConfigValue("GOOGLE_BUSINESS_OAUTH_CLIENT_SECRET"), oauthClientSecret),
                    firstNonBlank(getConfigValue("GOOGLE_BUSINESS_OAUTH_REFRESH_TOKEN"), oauthRefreshToken));
        }
        if (!googleClients.isConfigurato()) {
            throw new IntegrazioneDisattivataException(
                    "Google Business non collegato: mancano l'OAuth della scheda o l'account di servizio Google.");
        }
        try {
            GoogleCredentials credentials = credenzialiDelega();
            credentials.refreshIfExpired();
            String token = credentials.getAccessToken() == null ? null : credentials.getAccessToken().getTokenValue();
            if (token == null || token.isBlank()) {
                throw new IllegalStateException("Token Google non disponibile per l'account di servizio.");
            }
            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(token);
            headers.setAccept(Collections.singletonList(MediaType.APPLICATION_JSON));
            return new HttpEntity<>(headers);
        } catch (IOException e) {
            if (GoogleClients.delegaNegata(e)) {
                throw new IntegrazioneDisattivataException("Google ha negato la delega: autorizza lo scope "
                        + BUSINESS_MANAGE_SCOPE + " per l'account di servizio in Google Admin.");
            }
            throw new IllegalStateException("Errore autenticazione Google Business: " + e.getMessage(), e);
        }
    }

    /** Stesse credenziali di {@link GoogleClients} (chiave o firma IAM), con lo scope business.manage. */
    private synchronized GoogleCredentials credenzialiDelega() throws IOException {
        String account = googleClients.account();
        if (credenzialiDelega != null && account.equals(accountDelega)) {
            return credenzialiDelega;
        }
        GoogleCredentials nuove;
        if (senzaChiave) {
            GoogleCredentials ambiente = GoogleCredentials.getApplicationDefault();
            if (!(ambiente instanceof ServiceAccountSigner firmatario)) {
                throw new IOException("Le credenziali dell'ambiente non possono firmare: GOOGLE_SENZA_CHIAVE vale solo su Cloud Run");
            }
            nuove = new DelegaSenzaChiave(firmatario, account, BUSINESS_MANAGE_SCOPE);
        } else {
            try (InputStream file = Files.newInputStream(Path.of(credentialsPath))) {
                nuove = GoogleCredentials.fromStream(file).createScoped(List.of(BUSINESS_MANAGE_SCOPE)).createDelegated(account);
            }
        }
        credenzialiDelega = nuove;
        accountDelega = account;
        return nuove;
    }

    private boolean isGoogleBusinessUserOauthConfigured() {
        return firstNonBlank(getConfigValue("GOOGLE_BUSINESS_OAUTH_CLIENT_ID"), oauthClientId) != null
                && firstNonBlank(getConfigValue("GOOGLE_BUSINESS_OAUTH_CLIENT_SECRET"), oauthClientSecret) != null
                && firstNonBlank(getConfigValue("GOOGLE_BUSINESS_OAUTH_REFRESH_TOKEN"), oauthRefreshToken) != null;
    }

    private HttpEntity<String> buildAuthorizedRequestEntityFromUserOAuth(String clientId, String clientSecret,
                                                                       String refreshToken) {
        try {
            HttpHeaders tokenHeaders = new HttpHeaders();
            tokenHeaders.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
            tokenHeaders.setAccept(Collections.singletonList(MediaType.APPLICATION_JSON));
            MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
            form.add("client_id", clientId);
            form.add("client_secret", clientSecret);
            form.add("refresh_token", refreshToken);
            form.add("grant_type", "refresh_token");
            ResponseEntity<String> tokenResponse = restTemplate.exchange(OAUTH_TOKEN_URL, HttpMethod.POST,
                    new HttpEntity<>(form, tokenHeaders), String.class);
            String accessToken = textOrNull(readJson(tokenResponse.getBody()).path("access_token"));
            if (accessToken == null) {
                throw new IllegalStateException("Risposta OAuth senza access_token.");
            }
            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(accessToken);
            headers.setAccept(Collections.singletonList(MediaType.APPLICATION_JSON));
            return new HttpEntity<>(headers);
        } catch (HttpStatusCodeException e) {
            throw new IllegalStateException("Errore OAuth Google Business (refresh token): "
                    + messaggioGoogle(e.getResponseBodyAsString()), e);
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("Errore OAuth Google Business (refresh token): " + e.getMessage(), e);
        }
    }

    // ── Account e schede ──

    /** Account configurato se visibile, altrimenti il primo visibile che ha schede (e lo si ricorda in config). */
    private String resolveAccountId(String accountId, HttpEntity<String> request) {
        String preferred = firstNonBlank(accountId, getConfigValue(CHIAVE_ACCOUNT), accountIdProperty);
        if (preferred != null && preferred.startsWith("accounts/")) {
            preferred = preferred.substring("accounts/".length());
        }
        List<String> visibleIds = listVisibleAccountIds(request);
        if (preferred != null && visibleIds.contains(preferred)) {
            return preferred;
        }
        Set<String> candidates = new LinkedHashSet<>();
        if (preferred != null) {
            candidates.add(preferred);
        }
        candidates.addAll(visibleIds);
        for (String candidate : candidates) {
            try {
                if (!listLocationsForAccount(candidate, request).isEmpty()) {
                    persistAccountIdIfChanged(candidate);
                    return candidate;
                }
            } catch (HttpStatusCodeException e) {
                if (e.getStatusCode().value() == 404 || e.getStatusCode().value() == 403) {
                    continue;
                }
                throw new IllegalStateException("Errore ricerca schede Google Business (accountId=" + candidate + "): "
                        + messaggioGoogle(e.getResponseBodyAsString()), e);
            }
        }
        throw new IllegalStateException("Nessun account Google Business con schede per questa identità. Account visibili: "
                + visibleIds + ". Se l'invito a gestire la scheda di EdoDoc non è ancora accettato, accettalo da Google.");
    }

    private List<Scheda> listLocationsForAccount(String accountId, HttpEntity<String> request) {
        List<Scheda> locations = new ArrayList<>();
        String nextPageToken = null;
        do {
            String url = String.format(Locale.ROOT, LOCATION_LIST_URL_TEMPLATE, accountId);
            if (nextPageToken != null) {
                url += "&pageToken=" + URLEncoder.encode(nextPageToken, StandardCharsets.UTF_8);
            }
            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.GET, request, String.class);
            JsonNode root = readJson(response.getBody());
            for (JsonNode node : root.path("locations")) {
                locations.add(toScheda(node));
            }
            String token = root.path("nextPageToken").asText("");
            nextPageToken = token.isBlank() ? null : token;
        } while (nextPageToken != null);
        return locations;
    }

    private List<String> listVisibleAccountIds(HttpEntity<String> request) {
        List<String> ids = new ArrayList<>();
        try {
            ResponseEntity<String> response = restTemplate.exchange(ACCOUNT_LIST_URL, HttpMethod.GET, request, String.class);
            for (JsonNode node : readJson(response.getBody()).path("accounts")) {
                String name = textOrNull(node.path("name"));
                if (name != null && name.startsWith("accounts/") && name.length() > "accounts/".length()) {
                    ids.add(name.substring("accounts/".length()).trim());
                }
            }
        } catch (HttpStatusCodeException e) {
            if (e.getStatusCode().value() == 429) {
                logger.warn("[GOOGLE BUSINESS] Quota esaurita sull'elenco account (429)");
            } else {
                throw new IllegalStateException("Errore elenco account Google Business: "
                        + messaggioGoogle(e.getResponseBodyAsString()), e);
            }
        }
        return ids;
    }

    private void persistAccountIdIfChanged(String accountId) {
        String current = getConfigValue(CHIAVE_ACCOUNT);
        if (accountId.equals(current)) {
            return;
        }
        Config config = configRepository.findByChiave(CHIAVE_ACCOUNT).orElseGet(Config::new);
        config.setChiave(CHIAVE_ACCOUNT);
        config.setValore(accountId);
        config.setDescrizione("ID account Google Business Profile visibile all'identità (senza prefisso accounts/).");
        configRepository.save(config);
        logger.info("[GOOGLE BUSINESS] Aggiornato {} {} → {}", CHIAVE_ACCOUNT, current, accountId);
    }

    private Scheda toScheda(JsonNode node) {
        String resourceName = textOrNull(node.path("name"));
        String locationId = null;
        if (resourceName != null) {
            int idx = resourceName.lastIndexOf('/');
            if (idx >= 0 && idx < resourceName.length() - 1) {
                locationId = resourceName.substring(idx + 1);
            }
        }
        JsonNode address = node.path("storefrontAddress");
        List<String> righe = new ArrayList<>();
        for (JsonNode line : address.path("addressLines")) {
            String value = textOrNull(line);
            if (value != null) {
                righe.add(value);
            }
        }
        return new Scheda(locationId, resourceName, textOrNull(node.path("title")), textOrNull(address.path("locality")),
                righe.isEmpty() ? null : String.join(", ", righe), textOrNull(node.path("metadata").path("mapsUri")));
    }

    // ── Supporto ──

    private String messaggioGoogle(String corpo) {
        try {
            return objectMapper.readTree(corpo).path("error").path("message").asText(corpo);
        } catch (Exception ignored) {
            return corpo;
        }
    }

    private JsonNode readJson(String body) {
        try {
            return objectMapper.readTree(body == null ? "{}" : body);
        } catch (IOException e) {
            throw new IllegalStateException("Risposta Google non valida (JSON): " + e.getMessage(), e);
        }
    }

    private static String textOrNull(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return null;
        }
        String value = node.asText();
        return value != null && !value.isBlank() ? value : null;
    }

    private String getConfigValue(String key) {
        return configRepository.findByChiave(key)
                .map(c -> c.getValore() != null ? c.getValore().trim() : null)
                .filter(v -> !v.isEmpty())
                .orElse(null);
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.trim().isEmpty()) {
                return value.trim();
            }
        }
        return null;
    }
}
