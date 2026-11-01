package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import it.edodoc.hq.exception.ConflittoException;
import it.edodoc.hq.exception.IntegrazioneDisattivataException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * Video dei corsi su Cloudflare Stream. Il browser carica il file direttamente su Cloudflare con il protocollo tus:
 * qui si crea soltanto l'upload monouso. A differenza di Mobilitas i video sono privati (requiresignedurls):
 * si guardano solo con un token temporaneo, così chi trova l'id di un video non lo vede.
 * Credenziali: CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_STREAM_API_TOKEN (permesso Stream:Edit).
 */
@Service
public class CloudflareStreamService {

    private static final Logger logger = LoggerFactory.getLogger(CloudflareStreamService.class);

    /** Riserva i minuti di quota finché l'upload non è completo. */
    private static final int DURATA_MASSIMA_SECONDI = 4 * 60 * 60;
    private static final long DIMENSIONE_MASSIMA = 30L * 1024 * 1024 * 1024;

    private final ConfigService configService;
    private final RestClient client;
    private final String accountId;
    private final String apiToken;

    @Autowired
    public CloudflareStreamService(ConfigService configService,
                                   @Value("${app.cloudflare.account-id:}") String accountId,
                                   @Value("${app.cloudflare.stream-api-token:}") String apiToken,
                                   @Value("${app.cloudflare.base-url}") String baseUrl) {
        this(configService, accountId, apiToken, RestClient.builder().baseUrl(baseUrl).requestFactory(fabbrica()));
    }

    CloudflareStreamService(ConfigService configService, String accountId, String apiToken, RestClient.Builder builder) {
        this.configService = configService;
        this.accountId = accountId.trim();
        this.apiToken = apiToken.trim();
        this.client = builder.defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + this.apiToken).build();
    }

    private static SimpleClientHttpRequestFactory fabbrica() {
        SimpleClientHttpRequestFactory fabbrica = new SimpleClientHttpRequestFactory();
        fabbrica.setConnectTimeout(10_000);
        fabbrica.setReadTimeout(30_000);
        return fabbrica;
    }

    public boolean isConfigurato() {
        return !accountId.isBlank() && !apiToken.isBlank();
    }

    public boolean isAttivo() {
        return configService.isAttivo(ConfigService.CLOUDFLARE_STREAM_ENABLED) && isConfigurato();
    }

    /** nome finisce nei metadati su Cloudflare: è il titolo della lezione, mai un dato del paziente. */
    public UploadTus creaUpload(long dimensioneBytes, String nome) {
        richiediAttivo();
        if (dimensioneBytes > DIMENSIONE_MASSIMA) {
            throw new IllegalArgumentException("Il video è troppo grande (massimo 30 GB)");
        }
        try {
            var risposta = client.post().uri("/accounts/{account}/stream?direct_user=true", accountId)
                    .header("Tus-Resumable", "1.0.0")
                    .header("Upload-Length", Long.toString(dimensioneBytes))
                    .header("Upload-Metadata", metadati(nome))
                    .retrieve().toBodilessEntity();
            String url = risposta.getHeaders().getFirst(HttpHeaders.LOCATION);
            String uid = risposta.getHeaders().getFirst("stream-media-id");
            if (url == null || url.isBlank() || uid == null || uid.isBlank()) {
                throw new ConflittoException("Cloudflare non ha restituito l'indirizzo di caricamento");
            }
            return new UploadTus(uid.trim(), url.trim());
        } catch (RestClientException e) {
            throw guasto("creazione upload", e);
        }
    }

    public InfoVideo leggi(String uid) {
        richiediAttivo();
        JsonNode risultato = video(uid);
        JsonNode stato = risultato.path("status");
        double durata = risultato.path("duration").asDouble(-1);
        return new InfoVideo(risultato.path("readyToStream").asBoolean(false), stato.path("state").asText(""),
                avanzamento(stato.path("pctComplete").asText("")), testo(stato.path("errorReasonText")),
                durata > 0 ? (int) Math.round(durata) : null);
    }

    /** Il token prende il posto dell'id del video negli indirizzi di Cloudflare e dura un'ora. */
    public Riproduzione riproduzione(String uid) {
        richiediAttivo();
        try {
            String hls = testo(video(uid).path("playback").path("hls"));
            if (hls == null) {
                throw new ConflittoException("Cloudflare non ha restituito l'indirizzo del video");
            }
            JsonNode token = client.post().uri("/accounts/{account}/stream/{uid}/token", accountId, uid)
                    .retrieve().body(JsonNode.class);
            String firmato = token.path("result").path("token").asText("");
            if (firmato.isBlank()) {
                throw new ConflittoException("Cloudflare non ha restituito il token del video");
            }
            return new Riproduzione("https://" + URI.create(hls).getHost() + "/" + firmato + "/iframe", hls.replace(uid, firmato));
        } catch (RestClientException e) {
            throw guasto("firma video", e);
        }
    }

    /** Un video rimasto su Cloudflare occupa solo quota: un errore qui non deve bloccare il dottore. */
    public void elimina(String uid) {
        if (uid == null || !isConfigurato()) {
            return;
        }
        try {
            client.delete().uri("/accounts/{account}/stream/{uid}", accountId, uid).retrieve().toBodilessEntity();
        } catch (RestClientResponseException e) {
            if (e.getStatusCode().value() != 404) {
                logger.warn("Video {} non eliminato da Cloudflare: {}", uid, e.getStatusCode());
            }
        } catch (RestClientException e) {
            logger.warn("Video {} non eliminato da Cloudflare: {}", uid, e.getMessage());
        }
    }

    private JsonNode video(String uid) {
        try {
            JsonNode corpo = client.get().uri("/accounts/{account}/stream/{uid}", accountId, uid).retrieve().body(JsonNode.class);
            return corpo.path("result");
        } catch (RestClientResponseException e) {
            if (e.getStatusCode().value() == 404) {
                throw new IllegalArgumentException("Il video non esiste su Cloudflare");
            }
            throw guasto("lettura video", e);
        } catch (RestClientException e) {
            throw guasto("lettura video", e);
        }
    }

    private void richiediAttivo() {
        if (!isAttivo()) {
            throw new IntegrazioneDisattivataException(isConfigurato()
                    ? "I video non sono attivi: abilita Cloudflare Stream in Impostazioni"
                    : "I video non sono ancora attivi: mancano le credenziali di Cloudflare");
        }
    }

    private static ConflittoException guasto(String operazione, RestClientException e) {
        logger.error("Errore Cloudflare Stream ({}): {}", operazione, e.getMessage());
        return new ConflittoException("Cloudflare Stream non risponde. Riprova tra poco.");
    }

    /** Formato tus: chiave, spazio, valore in base64. requiresignedurls non ha valore. */
    private static String metadati(String nome) {
        return "maxDurationSeconds " + base64(Integer.toString(DURATA_MASSIMA_SECONDI))
                + ",requiresignedurls"
                + (nome != null && !nome.isBlank() ? ",name " + base64(nome.trim()) : "");
    }

    private static String base64(String valore) {
        return Base64.getEncoder().encodeToString(valore.getBytes(StandardCharsets.UTF_8));
    }

    /** Cloudflare manda la percentuale come stringa. */
    private static Integer avanzamento(String valore) {
        try {
            return valore.isBlank() ? null : (int) Math.round(Double.parseDouble(valore));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String testo(JsonNode nodo) {
        String testo = nodo.asText("");
        return testo.isBlank() ? null : testo;
    }

    public record UploadTus(String uid, String uploadUrl) {
    }

    /** stato: pendingupload, downloading, queued, inprogress, ready, error. */
    public record InfoVideo(boolean pronto, String stato, Integer avanzamento, String errore, Integer durataSecondi) {
    }

    public record Riproduzione(String iframeUrl, String hlsUrl) {
    }
}
