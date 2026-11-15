package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import it.edodoc.hq.dto.SocialDto;
import it.edodoc.hq.exception.SocialIntegrazioneException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Le pagine Facebook (e i profili Instagram collegati) che il token configurato puo gestire.
 *
 * <p>Con un token System User si leggono da {@code /me/accounts}, ognuna col suo token di pagina; se il token
 * configurato e gia un token di pagina, {@code /me} e la pagina stessa. I token di pagina restano qui:
 * verso il frontend esce solo {@link SocialDto.Account}.
 */
@Service
public class SocialAccountService {

    private static final Logger logger = LoggerFactory.getLogger(SocialAccountService.class);
    private static final Duration TTL = Duration.ofMinutes(10);
    private static final String CHIAVE_CACHE = "__account__";

    static final String CAMPI_IG = "instagram_business_account{id,username,profile_picture_url,followers_count,media_count}";
    static final String CAMPI_PAGINA = "id,name,category,link,picture{url},followers_count,fan_count," + CAMPI_IG;

    /** Pagina con il suo token. Non serializzare mai. */
    public record AccountInterno(
            String pageId,
            String nome,
            String token,
            String immagine,
            String categoria,
            String linkFacebook,
            Long followerFacebook,
            String instagramId,
            String instagramUsername,
            String instagramImmagine,
            Long followerInstagram,
            Long postInstagram) {

        public boolean haInstagram() {
            return StringUtils.hasText(instagramId);
        }

        public SocialDto.Account dto() {
            return new SocialDto.Account(pageId, nome, immagine, categoria, linkFacebook, followerFacebook,
                    instagramId, instagramUsername, instagramImmagine,
                    StringUtils.hasText(instagramUsername) ? "https://www.instagram.com/" + instagramUsername : null,
                    followerInstagram, postInstagram);
        }
    }

    private final SocialConfigService configService;
    private final SocialGraphClient graph;
    private final SocialCache cache;

    public SocialAccountService(SocialConfigService configService, SocialGraphClient graph, SocialCache cache) {
        this.configService = configService;
        this.graph = graph;
        this.cache = cache;
    }

    public List<AccountInterno> account() {
        return cache.ottieni(CHIAVE_CACHE, "elenco", TTL, this::scopri);
    }

    /** Account richiesto dal client, verificato contro quelli scoperti; null/vuoto = il primo. */
    public AccountInterno risolvi(String pageId) {
        List<AccountInterno> elenco = account();
        if (elenco.isEmpty()) {
            throw new SocialIntegrazioneException(
                    "Il token Meta non gestisce nessuna pagina Facebook: assegna le pagine al System User nel Business Manager.");
        }
        if (!StringUtils.hasText(pageId)) {
            return elenco.get(0);
        }
        return elenco.stream()
                .filter(a -> a.pageId().equals(pageId.trim()))
                .findFirst()
                .orElseThrow(() -> new SocialIntegrazioneException("Pagina non collegata al gestionale."));
    }

    /** Pagina a cui appartiene un id arrivato dal webhook (page id o id del profilo Instagram). */
    public AccountInterno perIdWebhook(String id) {
        if (!StringUtils.hasText(id)) {
            return null;
        }
        try {
            return account().stream()
                    .filter(a -> id.equals(a.pageId()) || id.equals(a.instagramId()))
                    .findFirst()
                    .orElse(null);
        } catch (SocialIntegrazioneException e) {
            return null;
        }
    }

    public void invalida() {
        cache.invalida(CHIAVE_CACHE, null);
    }

    private List<AccountInterno> scopri() {
        String token = configService.getAccessToken();
        Set<String> ammessi = configService.pageIdAmmessi();
        List<AccountInterno> out = new ArrayList<>();
        SocialIntegrazioneException erroreAccounts = null;
        try {
            List<JsonNode> pagine = graph.getTutti("me/accounts",
                    Map.of("fields", CAMPI_PAGINA + ",access_token", "limit", "50"), token, 200);
            for (JsonNode p : pagine) {
                AccountInterno a = daNodo(p, p.path("access_token").asText(null));
                if (a != null && (ammessi.isEmpty() || ammessi.contains(a.pageId()))) {
                    out.add(a);
                }
            }
        } catch (SocialIntegrazioneException e) {
            erroreAccounts = e;
        }
        if (out.isEmpty()) {
            // Il token potrebbe essere gia un token di pagina: /me e la pagina.
            try {
                JsonNode me = graph.get("me", Map.of("fields", CAMPI_PAGINA), token);
                if (me.hasNonNull("category")) {
                    AccountInterno a = daNodo(me, token);
                    if (a != null && (ammessi.isEmpty() || ammessi.contains(a.pageId()))) {
                        out.add(a);
                    }
                }
            } catch (SocialIntegrazioneException e) {
                throw erroreAccounts != null ? erroreAccounts : e;
            }
        }
        logger.info("Social: {} pagine collegate", out.size());
        return List.copyOf(out);
    }

    static AccountInterno daNodo(JsonNode p, String token) {
        String id = p.path("id").asText(null);
        if (!StringUtils.hasText(id)) {
            return null;
        }
        JsonNode ig = p.path("instagram_business_account");
        Long followerFb = p.hasNonNull("followers_count") ? Long.valueOf(p.path("followers_count").asLong())
                : p.hasNonNull("fan_count") ? Long.valueOf(p.path("fan_count").asLong()) : null;
        String link = p.path("link").asText(null);
        return new AccountInterno(
                id,
                p.path("name").asText(null),
                token,
                p.path("picture").path("data").path("url").asText(null),
                p.path("category").asText(null),
                StringUtils.hasText(link) ? link : "https://www.facebook.com/" + id,
                followerFb,
                ig.path("id").asText(null),
                ig.path("username").asText(null),
                ig.path("profile_picture_url").asText(null),
                ig.hasNonNull("followers_count") ? ig.path("followers_count").asLong() : null,
                ig.hasNonNull("media_count") ? ig.path("media_count").asLong() : null);
    }
}
