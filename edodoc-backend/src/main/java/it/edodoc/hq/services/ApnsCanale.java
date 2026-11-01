package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;

/** Notifiche iOS direttamente con APNs: HTTP/2 e JWT firmato con la chiave .p8 dell'account Apple Developer. */
@Component
public class ApnsCanale implements CanalePush {

    private static final Logger logger = LoggerFactory.getLogger(ApnsCanale.class);

    private static final String PRODUZIONE = "https://api.push.apple.com/3/device/";
    private static final String SANDBOX = "https://api.sandbox.push.apple.com/3/device/";

    /** Apple rifiuta un JWT più vecchio di un'ora e anche chi ne crea troppi: uno solo, rinnovato prima del limite. */
    private static final Duration DURATA_JWT = Duration.ofMinutes(50);

    /** Il token sta nell'URL e arriva dal telefono: fuori da questo formato non si chiama Apple. */
    private static final Pattern TOKEN = Pattern.compile("[0-9a-fA-F]{32,200}");

    private final ObjectMapper objectMapper;
    private final String teamId;
    private final String keyId;
    private final String keyPath;
    private final String topic;
    private final String base;
    private final PostHttp http;
    private final Clock clock;

    private String jwt;
    private Instant jwtCreatoIl;

    @Autowired
    public ApnsCanale(ObjectMapper objectMapper,
                      @Value("${app.push.apns.team-id:}") String teamId,
                      @Value("${app.push.apns.key-id:}") String keyId,
                      @Value("${app.push.apns.key-path:}") String keyPath,
                      @Value("${app.push.apns.topic}") String topic,
                      @Value("${app.push.apns.sandbox:false}") boolean sandbox) {
        this(objectMapper, teamId, keyId, keyPath, topic, sandbox, PostHttp.reale(), Clock.systemUTC());
    }

    ApnsCanale(ObjectMapper objectMapper, String teamId, String keyId, String keyPath, String topic, boolean sandbox,
               PostHttp http, Clock clock) {
        this.objectMapper = objectMapper;
        this.teamId = teamId.trim();
        this.keyId = keyId.trim();
        this.keyPath = keyPath.trim();
        this.topic = topic.trim();
        this.base = sandbox ? SANDBOX : PRODUZIONE;
        this.http = http;
        this.clock = clock;
    }

    @Override
    public boolean isConfigurato() {
        return !teamId.isEmpty() && !keyId.isEmpty() && !keyPath.isEmpty() && Files.isReadable(Path.of(keyPath));
    }

    /**
     * Solo 410 cancella il token. BadDeviceToken è anche quello che risponde Apple quando sandbox e produzione
     * sono scambiate: cancellare lì svuoterebbe tutti gli iPhone per un errore di configurazione.
     */
    @Override
    public Esito invia(String token, Notifica notifica) throws IOException, InterruptedException {
        if (!TOKEN.matcher(token).matches()) {
            return Esito.TOKEN_NON_VALIDO;
        }
        Map<String, String> intestazioni = Map.of(
                "authorization", "bearer " + jwt(),
                "apns-topic", topic,
                "apns-push-type", "alert",
                "apns-priority", "10");
        RispostaHttp risposta = http.post(base + token, intestazioni, objectMapper.writeValueAsString(corpo(notifica)));
        if (risposta.stato() == 200) {
            return Esito.INVIATA;
        }
        if (risposta.stato() == 410) {
            return Esito.TOKEN_NON_VALIDO;
        }
        logger.warn("Notifica rifiutata da Apple: {} {}", risposta.stato(), motivo(risposta.corpo()));
        return Esito.NON_INVIATA;
    }

    static Map<String, Object> corpo(Notifica notifica) {
        Map<String, Object> corpo = new LinkedHashMap<>();
        corpo.put("aps", Map.of("alert", Map.of("title", notifica.titolo(), "body", notifica.testo()), "sound", "default"));
        corpo.put("data", notifica.dati());
        return corpo;
    }

    private String motivo(String corpo) {
        try {
            JsonNode nodo = objectMapper.readTree(corpo);
            return nodo == null ? "" : nodo.path("reason").asText();
        } catch (IOException e) {
            return "";
        }
    }

    private synchronized String jwt() throws IOException {
        Instant ora = clock.instant();
        if (jwt == null || ora.isAfter(jwtCreatoIl.plus(DURATA_JWT))) {
            jwt = Jwts.builder().setHeaderParam("kid", keyId).setIssuer(teamId).setIssuedAt(Date.from(ora))
                    .signWith(chiave(Files.readString(Path.of(keyPath))), SignatureAlgorithm.ES256).compact();
            jwtCreatoIl = ora;
        }
        return jwt;
    }

    /** Il file .p8 di Apple è una chiave EC in PKCS#8, in formato PEM. */
    static PrivateKey chiave(String pem) throws IOException {
        String base64 = pem.replaceAll("-----[A-Z ]+-----", "").replaceAll("\\s", "");
        try {
            return KeyFactory.getInstance("EC").generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(base64)));
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            throw new IOException("Chiave APNs non leggibile", e);
        }
    }
}
