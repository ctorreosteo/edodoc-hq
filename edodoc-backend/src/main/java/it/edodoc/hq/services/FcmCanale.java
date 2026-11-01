package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.auth.oauth2.ServiceAccountCredentials;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Notifiche Android con FCM HTTP v1. Il Service Account è quello del progetto Firebase, non quello di Google
 * Workspace: qui non c'è nessun account da impersonare. Il progetto si legge dal file delle credenziali.
 */
@Component
public class FcmCanale implements CanalePush {

    private static final Logger logger = LoggerFactory.getLogger(FcmCanale.class);

    private static final String SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

    @FunctionalInterface
    interface Accesso {
        String tokenAttuale() throws IOException;
    }

    private final ObjectMapper objectMapper;
    private final String credentialsPath;
    private final PostHttp http;

    private String progetto;
    private Accesso accesso;

    @Autowired
    public FcmCanale(ObjectMapper objectMapper, @Value("${app.push.fcm.credentials-path:}") String credentialsPath) {
        this(objectMapper, credentialsPath.trim(), PostHttp.reale(), null, null);
    }

    FcmCanale(ObjectMapper objectMapper, String credentialsPath, PostHttp http, String progetto, Accesso accesso) {
        this.objectMapper = objectMapper;
        this.credentialsPath = credentialsPath;
        this.http = http;
        this.progetto = progetto;
        this.accesso = accesso;
    }

    @Override
    public boolean isConfigurato() {
        return accesso != null || (!credentialsPath.isEmpty() && Files.isReadable(Path.of(credentialsPath)));
    }

    /** Solo 404 (UNREGISTERED) cancella il token: un 400 può dipendere dal messaggio, un 403 dalle credenziali. */
    @Override
    public Esito invia(String token, Notifica notifica) throws IOException, InterruptedException {
        caricaCredenziali();
        RispostaHttp risposta = http.post("https://fcm.googleapis.com/v1/projects/" + progetto + "/messages:send",
                Map.of("Authorization", "Bearer " + accesso.tokenAttuale()),
                objectMapper.writeValueAsString(corpo(token, notifica)));
        if (risposta.stato() == 200) {
            return Esito.INVIATA;
        }
        if (risposta.stato() == 404) {
            return Esito.TOKEN_NON_VALIDO;
        }
        logger.warn("Notifica rifiutata da Google: {} {}", risposta.stato(), motivo(risposta.corpo()));
        return Esito.NON_INVIATA;
    }

    /** In data FCM accetta solo stringhe: checkId e pazienteId arrivano all'app come testo. */
    static Map<String, Object> corpo(String token, Notifica notifica) {
        Map<String, String> dati = new LinkedHashMap<>();
        notifica.dati().forEach((chiave, valore) -> dati.put(chiave, String.valueOf(valore)));
        Map<String, Object> messaggio = new LinkedHashMap<>();
        messaggio.put("token", token);
        messaggio.put("notification", Map.of("title", notifica.titolo(), "body", notifica.testo()));
        messaggio.put("data", dati);
        messaggio.put("android", Map.of("priority", "high", "notification", Map.of("sound", "default")));
        return Map.of("message", messaggio);
    }

    private String motivo(String corpo) {
        try {
            JsonNode nodo = objectMapper.readTree(corpo);
            return nodo == null ? "" : nodo.path("error").path("status").asText();
        } catch (IOException e) {
            return "";
        }
    }

    private synchronized void caricaCredenziali() throws IOException {
        if (accesso != null) {
            return;
        }
        try (InputStream file = Files.newInputStream(Path.of(credentialsPath))) {
            ServiceAccountCredentials account = ServiceAccountCredentials.fromStream(file);
            GoogleCredentials credenziali = account.createScoped(List.of(SCOPE));
            progetto = account.getProjectId();
            accesso = () -> {
                credenziali.refreshIfExpired();
                return credenziali.getAccessToken().getTokenValue();
            };
        }
    }
}
