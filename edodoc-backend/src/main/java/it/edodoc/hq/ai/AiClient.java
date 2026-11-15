package it.edodoc.hq.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import it.edodoc.hq.exception.IntegrazioneDisattivataException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * Client minimo verso la Messages API di Anthropic (testo in, testo out). Si spegne da solo senza
 * ANTHROPIC_API_KEY: {@link #isDisponibile()} è falso e ogni chiamata solleva {@link IntegrazioneDisattivataException}.
 * In Mobilitas lo stesso ruolo lo fa Spring AI: qui basta una richiesta HTTP.
 */
@Component
public class AiClient {

    public static final int DEFAULT_MAX_OUTPUT_TOKENS = 4096;
    public static final int LONG_OUTPUT_MAX_TOKENS = 8000;

    private static final String VERSIONE_API = "2023-06-01";

    private final String apiKey;
    private final String modello;
    private final String baseUrl;
    private final ObjectMapper objectMapper;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build();

    public AiClient(@Value("${app.ai.anthropic.api-key:}") String apiKey,
                    @Value("${app.ai.anthropic.model:claude-sonnet-5-5}") String modello,
                    @Value("${app.ai.anthropic.base-url:https://api.anthropic.com}") String baseUrl,
                    ObjectMapper objectMapper) {
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.modello = modello;
        this.baseUrl = baseUrl.replaceAll("/+$", "");
        this.objectMapper = objectMapper;
    }

    public boolean isDisponibile() {
        return !apiKey.isEmpty();
    }

    /** Modello usato, da mostrare accanto ai testi generati (es. "anthropic/claude-sonnet-5-5"). */
    public String getChatModelDescriptor() {
        return "anthropic/" + modello;
    }

    public String generateContent(String systemPrompt, String userContent) {
        return generateContent(systemPrompt, userContent, DEFAULT_MAX_OUTPUT_TOKENS);
    }

    /** Testo della risposta (blocchi di testo concatenati). */
    public String generateContent(String systemPrompt, String userContent, int maxOutputTokens) {
        if (!isDisponibile()) {
            throw new IntegrazioneDisattivataException("Assistente AI non configurato: manca ANTHROPIC_API_KEY");
        }
        ObjectNode corpo = objectMapper.createObjectNode();
        corpo.put("model", modello);
        corpo.put("max_tokens", maxOutputTokens);
        if (systemPrompt != null && !systemPrompt.isBlank()) {
            corpo.put("system", systemPrompt);
        }
        ObjectNode messaggio = corpo.putArray("messages").addObject();
        messaggio.put("role", "user");
        messaggio.put("content", userContent == null ? "" : userContent);
        try {
            HttpRequest richiesta = HttpRequest.newBuilder(URI.create(baseUrl + "/v1/messages"))
                    .timeout(Duration.ofMinutes(3))
                    .header("x-api-key", apiKey)
                    .header("anthropic-version", VERSIONE_API)
                    .header("content-type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(corpo)))
                    .build();
            HttpResponse<String> risposta = http.send(richiesta, HttpResponse.BodyHandlers.ofString());
            JsonNode json = objectMapper.readTree(risposta.body());
            if (risposta.statusCode() / 100 != 2) {
                String dettaglio = json.path("error").path("message").asText("errore " + risposta.statusCode());
                throw new IllegalStateException("L'assistente AI non ha risposto: " + dettaglio);
            }
            StringBuilder testo = new StringBuilder();
            for (JsonNode blocco : json.path("content")) {
                if ("text".equals(blocco.path("type").asText())) {
                    testo.append(blocco.path("text").asText());
                }
            }
            return testo.toString();
        } catch (IOException e) {
            throw new IllegalStateException("L'assistente AI non è raggiungibile: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Richiesta all'assistente AI interrotta", e);
        }
    }
}
