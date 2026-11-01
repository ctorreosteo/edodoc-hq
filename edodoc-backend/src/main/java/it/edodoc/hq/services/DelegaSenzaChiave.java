package it.edodoc.hq.services;

import com.google.api.client.json.GenericJson;
import com.google.api.client.json.gson.GsonFactory;
import com.google.auth.ServiceAccountSigner;
import com.google.auth.oauth2.AccessToken;
import com.google.auth.oauth2.GoogleCredentials;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Delega di dominio senza chiave privata: l'organizzazione vieta le chiavi dei Service Account, quindi l'asserzione
 * JWT per impersonare l'account del dottore la firma IAM. Serve il ruolo Service Account Token Creator del
 * Service Account su se stesso, e il suo client ID autorizzato in Google Admin.
 */
class DelegaSenzaChiave extends GoogleCredentials {

    private static final String TOKEN_URL = "https://oauth2.googleapis.com/token";
    private static final String GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";
    private static final Duration VALIDITA = Duration.ofHours(1);
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build();

    /** Google o IAM hanno negato il token: la delega va completata, non è un guasto temporaneo. */
    static class DelegaNegataException extends IOException {
        DelegaNegataException(String messaggio) {
            super(messaggio);
        }
    }

    private final ServiceAccountSigner firmatario;
    private final String account;
    private final String scope;

    DelegaSenzaChiave(ServiceAccountSigner firmatario, String account, String scope) {
        this.firmatario = firmatario;
        this.account = account;
        this.scope = scope;
    }

    /** JWT che Google scambia con un token dell'account impersonato ({@code sub}). */
    static String asserzione(ServiceAccountSigner firmatario, String account, String scope, Instant adesso) throws IOException {
        Map<String, Object> intestazione = new LinkedHashMap<>();
        intestazione.put("alg", "RS256");
        intestazione.put("typ", "JWT");
        Map<String, Object> dati = new LinkedHashMap<>();
        dati.put("iss", firmatario.getAccount());
        dati.put("sub", account);
        dati.put("scope", scope);
        dati.put("aud", TOKEN_URL);
        dati.put("iat", adesso.getEpochSecond());
        dati.put("exp", adesso.plus(VALIDITA).getEpochSecond());
        String daFirmare = base64(GsonFactory.getDefaultInstance().toByteArray(intestazione)) + "."
                + base64(GsonFactory.getDefaultInstance().toByteArray(dati));
        return daFirmare + "." + base64(firmatario.sign(daFirmare.getBytes(StandardCharsets.US_ASCII)));
    }

    private static String base64(byte[] dati) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(dati);
    }

    @Override
    public AccessToken refreshAccessToken() throws IOException {
        String jwt;
        try {
            jwt = asserzione(firmatario, account, scope, Instant.now());
        } catch (ServiceAccountSigner.SigningException e) {
            throw new DelegaNegataException("IAM non ha firmato l'asserzione: " + e.getCause());
        }
        String corpo = "grant_type=" + URLEncoder.encode(GRANT, StandardCharsets.UTF_8) + "&assertion=" + jwt;
        HttpResponse<String> risposta;
        try {
            risposta = HTTP.send(HttpRequest.newBuilder(URI.create(TOKEN_URL))
                    .timeout(Duration.ofSeconds(20))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .POST(HttpRequest.BodyPublishers.ofString(corpo))
                    .build(), HttpResponse.BodyHandlers.ofString());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Richiesta del token interrotta", e);
        }
        if (risposta.statusCode() >= 400 && risposta.statusCode() < 500) {
            throw new DelegaNegataException("Google ha negato il token: " + risposta.body());
        }
        if (risposta.statusCode() != 200) {
            throw new IOException("Google non ha dato il token: " + risposta.statusCode());
        }
        GenericJson json = GsonFactory.getDefaultInstance().createJsonParser(risposta.body()).parse(GenericJson.class);
        long secondi = ((BigDecimal) json.get("expires_in")).longValue();
        return new AccessToken((String) json.get("access_token"), Date.from(Instant.now().plusSeconds(secondi)));
    }
}
