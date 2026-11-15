package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.MailingDto;
import it.edodoc.hq.dto.ApiResponseDto;
import it.edodoc.hq.services.MailingImmaginiService;
import it.edodoc.hq.services.MailingRateLimiter;
import it.edodoc.hq.services.MailingTracciamentoService;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.concurrent.TimeUnit;

/**
 * Endpoint pubblici dell'Email Marketing (senza login: li chiamano client di posta e destinatari): pixel, click,
 * disiscrizione (pagina e one-click RFC 8058), centro preferenze, versione web, immagini. Limitati per IP.
 * Nessuna risposta contiene un'email completa. I token sono casuali (24–32 caratteri base62).
 */
@RestController
@RequestMapping("/api/pubblico/mailing")
public class MailingPubblicoController {

    private static final Logger logger = LoggerFactory.getLogger(MailingPubblicoController.class);
    private static final byte[] GIF = Base64.getDecoder().decode("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7");

    static final int LIMITE_TRACCIAMENTO = 60;
    static final int LIMITE_PREFERENZE_GET = 60;
    static final int LIMITE_PREFERENZE_POST = 10;
    static final int LIMITE_DISISCRIZIONE_POST = 10;
    static final int LIMITE_WEB = 30;

    private final MailingTracciamentoService tracciamento;
    private final MailingImmaginiService immagini;
    private final MailingRateLimiter limiter;

    public MailingPubblicoController(MailingTracciamentoService tracciamento, MailingImmaginiService immagini,
                                     MailingRateLimiter limiter) {
        this.tracciamento = tracciamento;
        this.immagini = immagini;
        this.limiter = limiter;
    }

    /** Pixel di apertura: sempre 200 con la GIF, anche se il token non esiste o il limite è superato. */
    @GetMapping("/o/{token}.gif")
    public ResponseEntity<byte[]> pixel(@PathVariable String token, HttpServletRequest req,
                                        @RequestHeader(value = HttpHeaders.USER_AGENT, required = false) String ua) {
        if (!"HEAD".equalsIgnoreCase(req.getMethod()) && limiter.consenti("pixel", ip(req), LIMITE_TRACCIAMENTO)) {
            try {
                tracciamento.apertura(token, ua, ip(req));
            } catch (RuntimeException e) {
                logger.debug("[MAILING] Apertura non registrata: {}", e.getMessage());
            }
        }
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_GIF)
                .cacheControl(CacheControl.noStore())
                .header("Pragma", "no-cache")
                .header("X-Robots-Tag", "noindex")
                .body(GIF);
    }

    /** Click tracciato: 302 all'URL registrato per quel messaggio; mai verso URL non registrati. */
    @GetMapping("/c/{token}/{indice}")
    public ResponseEntity<Void> click(@PathVariable String token, @PathVariable String indice, HttpServletRequest req,
                                      @RequestHeader(value = HttpHeaders.USER_AGENT, required = false) String ua) {
        int i;
        try {
            i = Integer.parseInt(indice);
        } catch (NumberFormatException e) {
            i = -1;
        }
        boolean registra = !"HEAD".equalsIgnoreCase(req.getMethod()) && limiter.consenti("click", ip(req), LIMITE_TRACCIAMENTO);
        String destinazione;
        try {
            destinazione = i >= 0 ? tracciamento.click(token, i, ua, ip(req), registra)
                    : it.edodoc.hq.services.MailingComposizioneService.HOME_SITO;
        } catch (RuntimeException e) {
            logger.debug("[MAILING] Click non registrato: {}", e.getMessage());
            destinazione = it.edodoc.hq.services.MailingComposizioneService.HOME_SITO;
        }
        return redirect(destinazione);
    }

    /** Link "Disiscriviti" dell'email: porta alla pagina delle preferenze del contatto. */
    @GetMapping("/u/{token}")
    public ResponseEntity<Void> disiscrizione(@PathVariable String token) {
        return redirect(tracciamento.urlPaginaDisiscrizione(token));
    }

    /** One-click unsubscribe (RFC 8058): il client di posta manda "List-Unsubscribe=One-Click". Sempre 200 vuoto. */
    @PostMapping("/u/{token}")
    public ResponseEntity<Void> disiscrizioneOneClick(@PathVariable String token, HttpServletRequest req) {
        if (limiter.consenti("unsub", ip(req), LIMITE_DISISCRIZIONE_POST)) {
            try {
                tracciamento.disiscriviOneClick(token);
            } catch (RuntimeException e) {
                logger.warn("[MAILING] Disiscrizione one-click non registrata: {}", e.getMessage());
            }
        }
        return ResponseEntity.ok().build();
    }

    @GetMapping("/preferenze/{tokenContatto}")
    public ResponseEntity<ApiResponseDto<MailingDto.Preferenze>> preferenze(@PathVariable String tokenContatto,
                                                                           HttpServletRequest req) {
        limita("pref-get", req, LIMITE_PREFERENZE_GET);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ApiResponseDto.success("Preferenze", tracciamento.preferenze(tokenContatto)));
    }

    @PostMapping("/preferenze/{tokenContatto}")
    public ResponseEntity<ApiResponseDto<MailingDto.Preferenze>> aggiornaPreferenze(@PathVariable String tokenContatto,
                                                                                   @RequestBody MailingDto.AggiornaPreferenze input,
                                                                                   HttpServletRequest req) {
        limita("pref-post", req, LIMITE_PREFERENZE_POST);
        MailingDto.Preferenze p = tracciamento.aggiornaPreferenze(tokenContatto, input);
        String messaggio = input != null && input.disiscrivi() ? "Disiscrizione registrata"
                : input != null && input.reiscrivi() ? "Iscrizione riattivata" : "Preferenze salvate";
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponseDto.success(messaggio, p));
    }

    /** Versione web dell'email (senza pixel). */
    @GetMapping("/web/{token}")
    public ResponseEntity<String> web(@PathVariable String token, HttpServletRequest req) {
        limita("web", req, LIMITE_WEB);
        String html = tracciamento.versioneWeb(token).orElse(null);
        if (html == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).contentType(new MediaType("text", "html", StandardCharsets.UTF_8))
                    .body("<!doctype html><meta charset=\"utf-8\"><title>Email non trovata</title>"
                            + "<p style=\"font-family:sans-serif\">Questa email non è più disponibile.</p>");
        }
        return ResponseEntity.ok()
                .contentType(new MediaType("text", "html", StandardCharsets.UTF_8))
                .cacheControl(CacheControl.noStore())
                .header("X-Content-Type-Options", "nosniff")
                .header("X-Robots-Tag", "noindex, nofollow")
                .header("Referrer-Policy", "no-referrer")
                .header("Content-Security-Policy", "script-src 'none'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'")
                .body(html);
    }

    /** Immagine caricata dall'editor: il token cambia a ogni caricamento, quindi la risposta è immutabile. */
    @GetMapping("/immagini/{token}")
    public ResponseEntity<byte[]> immagine(@PathVariable String token) {
        return immagini.perToken(token)
                .map(img -> ResponseEntity.ok()
                        .contentType(MediaType.parseMediaType(img.getMimeType()))
                        .cacheControl(CacheControl.maxAge(365, TimeUnit.DAYS).cachePublic().immutable())
                        .header("X-Content-Type-Options", "nosniff")
                        .body(img.getContenuto()))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    // ── Supporto ──

    private void limita(String gruppo, HttpServletRequest req, int massimo) {
        if (!limiter.consenti(gruppo, ip(req), massimo)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Troppe richieste: riprova tra un minuto.");
        }
    }

    private static ResponseEntity<Void> redirect(String url) {
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.LOCATION, url.replaceAll("[\\r\\n]", "").replace(" ", "%20"))
                .cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer-when-downgrade")
                .build();
    }

    /** IP del client: primo indirizzo di X-Forwarded-For (Cloud Run), altrimenti quello della connessione. */
    static String ip(HttpServletRequest req) {
        String xff = req.getHeader("X-Forwarded-For");
        if (StringUtils.hasText(xff)) {
            String primo = xff.split(",")[0].trim();
            if (!primo.isEmpty() && primo.length() <= 45) {
                return primo;
            }
        }
        return req.getRemoteAddr();
    }
}
