package it.edodoc.hq.services;

import it.edodoc.hq.models.Config;
import it.edodoc.hq.repositories.ConfigRepository;
import org.bouncycastle.cert.X509CertificateHolder;
import org.bouncycastle.cms.SignerInformationVerifier;
import org.bouncycastle.cms.jcajce.JcaSimpleSignerInfoVerifierBuilder;
import org.bouncycastle.tsp.TSPAlgorithms;
import org.bouncycastle.tsp.TimeStampRequest;
import org.bouncycastle.tsp.TimeStampRequestGenerator;
import org.bouncycastle.tsp.TimeStampResponse;
import org.bouncycastle.tsp.TimeStampToken;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigInteger;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Collection;
import java.util.List;

/**
 * Marca temporale RFC 3161: invia alla TSA solo l'impronta SHA-256 e riceve un token firmato che prova che quei byte
 * esistevano in quel momento. Prova le TSA configurate in ordine ({@code ACCETTAZIONE_TSA_URLS}).
 */
@Service
public class MarcaTemporaleService {

    private static final Logger logger = LoggerFactory.getLogger(MarcaTemporaleService.class);
    static final String CONFIG_URLS = "ACCETTAZIONE_TSA_URLS";
    private static final String DEFAULT_URLS = "http://timestamp.digicert.com,http://timestamp.sectigo.com";

    private final ConfigRepository configRepository;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8))
            .followRedirects(HttpClient.Redirect.NORMAL).build();
    private final SecureRandom random = new SecureRandom();

    public MarcaTemporaleService(ConfigRepository configRepository) {
        this.configRepository = configRepository;
    }

    public record Marca(byte[] token, String url, LocalDateTime ora) {
    }

    /** Marca sull'impronta SHA-256 già calcolata. */
    public Marca marcaImpronta(byte[] sha256) {
        List<String> errori = new ArrayList<>();
        for (String url : urls()) {
            try {
                return richiedi(url, sha256);
            } catch (Exception e) {
                logger.warn("[FIRMA] TSA {} non disponibile: {}", url, e.getMessage());
                errori.add(url + ": " + e.getMessage());
            }
        }
        throw new IllegalStateException("Nessuna TSA ha risposto: " + String.join("; ", errori));
    }

    public Marca marcaDati(byte[] dati) {
        try {
            return marcaImpronta(MessageDigest.getInstance("SHA-256").digest(dati));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private Marca richiedi(String url, byte[] sha256) throws Exception {
        TimeStampRequestGenerator gen = new TimeStampRequestGenerator();
        gen.setCertReq(true);
        TimeStampRequest req = gen.generate(TSPAlgorithms.SHA256, sha256, new BigInteger(64, random));

        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(15))
                .header("Content-Type", "application/timestamp-query")
                .POST(HttpRequest.BodyPublishers.ofByteArray(req.getEncoded()));
        String utente = config("ACCETTAZIONE_TSA_UTENTE");
        if (!utente.isEmpty()) {
            String cred = utente + ":" + config("ACCETTAZIONE_TSA_PASSWORD");
            b.header("Authorization", "Basic " + Base64.getEncoder().encodeToString(cred.getBytes(StandardCharsets.UTF_8)));
        }
        HttpResponse<byte[]> res = http.send(b.build(), HttpResponse.BodyHandlers.ofByteArray());
        if (res.statusCode() / 100 != 2) {
            throw new IllegalStateException("HTTP " + res.statusCode());
        }
        TimeStampResponse resp = new TimeStampResponse(res.body());
        resp.validate(req);
        TimeStampToken token = resp.getTimeStampToken();
        if (token == null) {
            throw new IllegalStateException("risposta senza token (stato " + resp.getStatus() + ": "
                    + resp.getStatusString() + ")");
        }
        verificaFirmaToken(token);
        LocalDateTime ora = LocalDateTime.ofInstant(token.getTimeStampInfo().getGenTime().toInstant(),
                ZoneId.of("Europe/Rome"));
        return new Marca(token.getEncoded(), url, ora);
    }

    /** Controlla che il token sia firmato dal certificato che contiene (la catena della TSA si verifica a parte). */
    static void verificaFirmaToken(TimeStampToken token) throws Exception {
        @SuppressWarnings("unchecked")
        Collection<X509CertificateHolder> certs = token.getCertificates().getMatches(token.getSID());
        if (certs.isEmpty()) {
            throw new IllegalStateException("token senza certificato della TSA");
        }
        SignerInformationVerifier verifier = new JcaSimpleSignerInfoVerifierBuilder().build(certs.iterator().next());
        token.validate(verifier);
    }

    private List<String> urls() {
        String v = config(CONFIG_URLS);
        return Arrays.stream((v.isEmpty() ? DEFAULT_URLS : v).split(","))
                .map(String::strip).filter(s -> !s.isEmpty()).toList();
    }

    private String config(String chiave) {
        return configRepository.findByChiave(chiave).map(Config::getValore).map(String::strip).orElse("");
    }
}
