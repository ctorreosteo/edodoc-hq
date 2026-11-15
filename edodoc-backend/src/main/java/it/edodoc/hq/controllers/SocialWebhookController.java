package it.edodoc.hq.controllers;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import it.edodoc.hq.services.SocialConfigService;
import it.edodoc.hq.services.SocialWebhookService;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.concurrent.ExecutorService;

/**
 * Webhook Meta della pagina Meta (commenti e messaggi di pagine Facebook e profili Instagram).
 * Unico endpoint pubblico della feature: si difende con la firma HMAC del payload.
 *
 * <p>Su Meta (App → Webhook) vanno iscritti: {@code Page} con i campi {@code feed} e {@code messages},
 * {@code Instagram} con {@code comments}, {@code mentions} e {@code messages}. URL: {@code /api/social/webhook}.
 * Se l'integrazione e spenta risponde 404.
 */
@RestController
@RequestMapping("/api/social/webhook")
public class SocialWebhookController {

    private static final Logger logger = LoggerFactory.getLogger(SocialWebhookController.class);
    private static final String HEADER_FIRMA = "X-Hub-Signature-256";
    private static final String PREFISSO_FIRMA = "sha256=";
    private static final String ALGORITMO = "HmacSHA256";

    private final SocialConfigService configService;
    private final SocialWebhookService webhookService;
    private final ObjectMapper objectMapper;
    private final ExecutorService executor;

    public SocialWebhookController(SocialConfigService configService, SocialWebhookService webhookService,
                                   ObjectMapper objectMapper,
                                   @Qualifier("socialWebhookExecutor") ExecutorService executor) {
        this.configService = configService;
        this.webhookService = webhookService;
        this.objectMapper = objectMapper;
        this.executor = executor;
    }

    @GetMapping(produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<String> verifica(
            @RequestParam(name = "hub.mode", required = false) String mode,
            @RequestParam(name = "hub.verify_token", required = false) String verifyToken,
            @RequestParam(name = "hub.challenge", required = false) String challenge) {
        if (!configService.isAbilitata()) {
            return ResponseEntity.notFound().build();
        }
        String atteso = configService.getVerifyToken();
        if (atteso == null || atteso.isBlank() || !"subscribe".equals(mode) || !confrontoCostante(atteso, verifyToken)) {
            logger.warn("Social: verifica webhook rifiutata");
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return ResponseEntity.ok(challenge == null ? "" : challenge);
    }

    @PostMapping
    public ResponseEntity<Void> ricevi(@RequestBody(required = false) byte[] corpo, HttpServletRequest request) {
        if (!configService.isAbilitata()) {
            return ResponseEntity.notFound().build();
        }
        if (corpo == null || corpo.length == 0) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        if (configService.isFirmaObbligatoria()) {
            String appSecret = configService.getAppSecret();
            if (appSecret == null || appSecret.isBlank()) {
                logger.error("Social: webhook ricevuto ma META_SOCIAL_APP_SECRET non configurato, payload scartato");
                return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
            }
            if (!firmaValida(corpo, request.getHeader(HEADER_FIRMA), appSecret)) {
                logger.warn("Social: webhook con firma non valida, payload scartato");
                return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
            }
        }
        final JsonNode payload;
        try {
            payload = objectMapper.readTree(corpo);
        } catch (Exception e) {
            logger.error("Social: payload webhook non interpretabile: {}", e.getMessage());
            return ResponseEntity.ok().build();
        }
        executor.submit(() -> {
            try {
                webhookService.processa(payload);
            } catch (Exception e) {
                logger.error("Social: elaborazione webhook fallita", e);
            }
        });
        return ResponseEntity.ok().build();
    }

    static boolean firmaValida(byte[] corpo, String headerFirma, String appSecret) {
        if (headerFirma == null || !headerFirma.startsWith(PREFISSO_FIRMA)) {
            return false;
        }
        try {
            Mac mac = Mac.getInstance(ALGORITMO);
            mac.init(new SecretKeySpec(appSecret.getBytes(StandardCharsets.UTF_8), ALGORITMO));
            String calcolata = HexFormat.of().formatHex(mac.doFinal(corpo));
            return confrontoCostante(calcolata, headerFirma.substring(PREFISSO_FIRMA.length()));
        } catch (Exception e) {
            logger.error("Social: verifica firma webhook fallita: {}", e.getMessage());
            return false;
        }
    }

    private static boolean confrontoCostante(String atteso, String ricevuto) {
        if (atteso == null || ricevuto == null) {
            return false;
        }
        return MessageDigest.isEqual(atteso.getBytes(StandardCharsets.UTF_8), ricevuto.getBytes(StandardCharsets.UTF_8));
    }
}
