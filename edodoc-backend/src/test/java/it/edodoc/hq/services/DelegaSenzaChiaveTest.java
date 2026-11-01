package it.edodoc.hq.services;

import com.google.api.client.json.GenericJson;
import com.google.api.client.json.gson.GsonFactory;
import com.google.auth.ServiceAccountSigner;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;

class DelegaSenzaChiaveTest {

    private static final ServiceAccountSigner FIRMATARIO = new ServiceAccountSigner() {
        @Override
        public String getAccount() {
            return "backend@progetto.iam.gserviceaccount.com";
        }

        @Override
        public byte[] sign(byte[] dati) {
            return "firma".getBytes(StandardCharsets.UTF_8);
        }
    };

    private static GenericJson decodifica(String parte) throws IOException {
        String json = new String(Base64.getUrlDecoder().decode(parte), StandardCharsets.UTF_8);
        return GsonFactory.getDefaultInstance().createJsonParser(json).parse(GenericJson.class);
    }

    @Test
    void asserzione_impersonaLAccountConLoScopeRichiesto() throws IOException {
        Instant adesso = Instant.ofEpochSecond(1_800_000_000L);
        String[] parti = DelegaSenzaChiave.asserzione(FIRMATARIO, "supporto@edodoc.it", "scope-calendar", adesso).split("\\.");

        assertThat(parti).hasSize(3);
        assertThat(decodifica(parti[0]).get("alg")).isEqualTo("RS256");
        GenericJson dati = decodifica(parti[1]);
        assertThat(dati.get("iss")).isEqualTo(FIRMATARIO.getAccount());
        assertThat(dati.get("sub")).isEqualTo("supporto@edodoc.it");
        assertThat(dati.get("scope")).isEqualTo("scope-calendar");
        assertThat(dati.get("aud")).isEqualTo("https://oauth2.googleapis.com/token");
        assertThat(((BigDecimal) dati.get("exp")).longValue()).isEqualTo(adesso.getEpochSecond() + 3600);
        assertThat(Base64.getUrlDecoder().decode(parti[2])).isEqualTo("firma".getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void delegaNegata_riconosceIlRifiutoDiGoogleMaNonIGuastiDiRete() {
        assertThat(GoogleClients.delegaNegata(new DelegaSenzaChiave.DelegaNegataException("negato"))).isTrue();
        assertThat(GoogleClients.delegaNegata(new IOException("Error getting access token for service account: 401 unauthorized_client"))).isTrue();
        assertThat(GoogleClients.delegaNegata(new IOException("Connection reset"))).isFalse();
    }
}
