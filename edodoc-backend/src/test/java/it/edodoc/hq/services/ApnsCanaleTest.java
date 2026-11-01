package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jws;
import io.jsonwebtoken.Jwts;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.spec.ECGenParameterSpec;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ApnsCanaleTest {

    private static final String TOKEN = "a1b2c3d4e5f60718a1b2c3d4e5f60718a1b2c3d4e5f60718a1b2c3d4e5f60718";
    private static final Notifica NOTIFICA = new Notifica(7L, "EdoDoc", "Hai un messaggio", Map.of("tipo", "FEEDBACK", "checkId", 3L));

    private static KeyPair chiavi;

    @TempDir
    Path cartella;

    private record Chiamata(String url, Map<String, String> intestazioni, String corpo) {
    }

    private final List<Chiamata> chiamate = new ArrayList<>();
    private final ObjectMapper json = new ObjectMapper();

    @BeforeAll
    static void creaChiavi() throws Exception {
        KeyPairGenerator generatore = KeyPairGenerator.getInstance("EC");
        generatore.initialize(new ECGenParameterSpec("secp256r1"));
        chiavi = generatore.generateKeyPair();
    }

    private ApnsCanale canale(int stato, String risposta, boolean sandbox, Clock clock) throws Exception {
        Path p8 = cartella.resolve("AuthKey.p8");
        Files.writeString(p8, "-----BEGIN PRIVATE KEY-----\n"
                + Base64.getMimeEncoder().encodeToString(chiavi.getPrivate().getEncoded())
                + "\n-----END PRIVATE KEY-----\n");
        return new ApnsCanale(json, "TEAM123", "KEY456", p8.toString(), "it.edodoc.app", sandbox, (url, intestazioni, corpo) -> {
            chiamate.add(new Chiamata(url, intestazioni, corpo));
            return new CanalePush.RispostaHttp(stato, risposta);
        }, clock);
    }

    private Clock adesso() {
        return Clock.fixed(Instant.now(), ZoneId.of("UTC"));
    }

    private String jwt(int indice) {
        return chiamate.get(indice).intestazioni().get("authorization").substring("bearer ".length());
    }

    @Test
    void invio_firmaIlJwtConLaChiaveP8() throws Exception {
        assertThat(canale(200, "", false, adesso()).invia(TOKEN, NOTIFICA)).isEqualTo(CanalePush.Esito.INVIATA);

        Chiamata chiamata = chiamate.get(0);
        assertThat(chiamata.url()).isEqualTo("https://api.push.apple.com/3/device/" + TOKEN);
        assertThat(chiamata.intestazioni()).containsEntry("apns-topic", "it.edodoc.app")
                .containsEntry("apns-push-type", "alert").containsEntry("apns-priority", "10");
        Jws<Claims> firmato = Jwts.parserBuilder().setSigningKey(chiavi.getPublic()).build().parseClaimsJws(jwt(0));
        assertThat(firmato.getHeader().getAlgorithm()).isEqualTo("ES256");
        assertThat(firmato.getHeader().getKeyId()).isEqualTo("KEY456");
        assertThat(firmato.getBody().getIssuer()).isEqualTo("TEAM123");
    }

    @Test
    void corpo_alertGenericoEDatiPerLApp() throws Exception {
        canale(200, "", false, adesso()).invia(TOKEN, NOTIFICA);

        JsonNode corpo = json.readTree(chiamate.get(0).corpo());
        assertThat(corpo.at("/aps/alert/body").asText()).isEqualTo("Hai un messaggio");
        assertThat(corpo.at("/data/tipo").asText()).isEqualTo("FEEDBACK");
        assertThat(corpo.at("/data/checkId").asLong()).isEqualTo(3L);
    }

    @Test
    void sandbox_cambiaHost() throws Exception {
        canale(200, "", true, adesso()).invia(TOKEN, NOTIFICA);
        assertThat(chiamate.get(0).url()).startsWith("https://api.sandbox.push.apple.com/");
    }

    @Test
    void ilJwtSiRiusaESiRinnovaPrimaDellOra() throws Exception {
        Instant inizio = Instant.now();
        Clock[] clock = {Clock.fixed(inizio, ZoneId.of("UTC"))};
        ApnsCanale canale = canale(200, "", false, new Clock() {
            @Override public ZoneId getZone() { return ZoneId.of("UTC"); }
            @Override public Clock withZone(ZoneId zona) { return this; }
            @Override public Instant instant() { return clock[0].instant(); }
        });

        canale.invia(TOKEN, NOTIFICA);
        clock[0] = Clock.offset(clock[0], Duration.ofMinutes(10));
        canale.invia(TOKEN, NOTIFICA);
        clock[0] = Clock.offset(clock[0], Duration.ofMinutes(45));
        canale.invia(TOKEN, NOTIFICA);

        assertThat(jwt(1)).isEqualTo(jwt(0));
        assertThat(jwt(2)).isNotEqualTo(jwt(0));
    }

    @Test
    void disinstallata_410() throws Exception {
        assertThat(canale(410, "{\"reason\":\"Unregistered\"}", false, adesso()).invia(TOKEN, NOTIFICA))
                .isEqualTo(CanalePush.Esito.TOKEN_NON_VALIDO);
    }

    @Test
    void badDeviceToken_nonCancella_puoEssereSandboxScambiata() throws Exception {
        assertThat(canale(400, "{\"reason\":\"BadDeviceToken\"}", false, adesso()).invia(TOKEN, NOTIFICA))
                .isEqualTo(CanalePush.Esito.NON_INVIATA);
    }

    @Test
    void tokenFuoriFormato_nonArrivaNellUrlDiApple() throws Exception {
        assertThat(canale(200, "", false, adesso()).invia("../../altro?x=1", NOTIFICA)).isEqualTo(CanalePush.Esito.TOKEN_NON_VALIDO);
        assertThat(chiamate).isEmpty();
    }

    @Test
    void senzaCredenziali_nonEConfigurato() {
        ApnsCanale canale = new ApnsCanale(json, "", "", "", "it.edodoc.app", false, null, Clock.systemUTC());
        assertThat(canale.isConfigurato()).isFalse();
    }
}
