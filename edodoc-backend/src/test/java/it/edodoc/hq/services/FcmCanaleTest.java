package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class FcmCanaleTest {

    private static final Notifica NOTIFICA = new Notifica(7L, "EdoDoc", "Hai un messaggio", Map.of("tipo", "FEEDBACK", "checkId", 3L));

    private final ObjectMapper json = new ObjectMapper();
    private final List<String> url = new ArrayList<>();
    private final List<Map<String, String>> intestazioni = new ArrayList<>();
    private final List<String> corpi = new ArrayList<>();

    private FcmCanale canale(int stato, String risposta) {
        return new FcmCanale(json, "", (u, i, c) -> {
            url.add(u);
            intestazioni.add(i);
            corpi.add(c);
            return new CanalePush.RispostaHttp(stato, risposta);
        }, "edodoc-progetto", () -> "accesso-google");
    }

    @Test
    void invio_v1ConIlTokenDelServiceAccount() throws Exception {
        assertThat(canale(200, "{}").invia("telefono", NOTIFICA)).isEqualTo(CanalePush.Esito.INVIATA);

        assertThat(url.get(0)).isEqualTo("https://fcm.googleapis.com/v1/projects/edodoc-progetto/messages:send");
        assertThat(intestazioni.get(0)).containsEntry("Authorization", "Bearer accesso-google");
        JsonNode messaggio = json.readTree(corpi.get(0)).path("message");
        assertThat(messaggio.path("token").asText()).isEqualTo("telefono");
        assertThat(messaggio.at("/notification/body").asText()).isEqualTo("Hai un messaggio");
        assertThat(messaggio.at("/android/priority").asText()).isEqualTo("high");
    }

    @Test
    void iDatiDiventanoStringhe_fcmNonAccettaAltro() throws Exception {
        canale(200, "{}").invia("telefono", NOTIFICA);

        JsonNode dati = json.readTree(corpi.get(0)).at("/message/data");
        assertThat(dati.path("tipo").isTextual()).isTrue();
        assertThat(dati.path("checkId").isTextual()).isTrue();
        assertThat(dati.path("checkId").asText()).isEqualTo("3");
    }

    @Test
    void disinstallata_404() throws Exception {
        assertThat(canale(404, "{\"error\":{\"status\":\"NOT_FOUND\"}}").invia("telefono", NOTIFICA))
                .isEqualTo(CanalePush.Esito.TOKEN_NON_VALIDO);
    }

    @Test
    void credenzialiSbagliate_nonCancellaIlToken() throws Exception {
        assertThat(canale(403, "{\"error\":{\"status\":\"PERMISSION_DENIED\"}}").invia("telefono", NOTIFICA))
                .isEqualTo(CanalePush.Esito.NON_INVIATA);
    }

    @Test
    void senzaFile_nonEConfigurato() {
        assertThat(new FcmCanale(json, "").isConfigurato()).isFalse();
    }
}
