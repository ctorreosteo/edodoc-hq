package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.PlannerDto;
import it.edodoc.hq.models.PlannerMedia;
import it.edodoc.hq.services.PlannerBioService;
import it.edodoc.hq.services.PlannerMediaService;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

/**
 * Media del Planner social per token, senza login: Meta, Google e TikTok scaricano da qui i file da pubblicare, e il
 * gestionale li mostra nelle anteprime. Il token è casuale e cambia a ogni caricamento: la risposta è immutabile.
 * Il corpo è una {@link Resource}, così Spring risponde anche alle richieste Range (i video nel browser).
 */
@RestController
@RequestMapping("/api/pubblico/planner")
public class PlannerPubblicoController {

    private final PlannerMediaService media;
    private final PlannerBioService bio;

    public PlannerPubblicoController(PlannerMediaService media, PlannerBioService bio) {
        this.media = media;
        this.bio = bio;
    }

    /** Link in bio di uno spazio (pagina pubblica del gestionale /bio/{slug}); conta la visita. */
    @GetMapping("/bio/{slug}")
    public ResponseEntity<PlannerDto.BioPubblica> bio(@PathVariable String slug) {
        return bio.pubblica(slug)
                .map(b -> ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("X-Robots-Tag", "noindex").body(b))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /** Clic su un pulsante o un post della pagina: lo conta e reindirizza. */
    @GetMapping("/bio/{slug}/vai")
    public ResponseEntity<Void> vai(@PathVariable String slug, @RequestParam("k") String chiave) {
        return bio.vai(slug, chiave)
                .map(url -> ResponseEntity.status(302).location(URI.create(url)).cacheControl(CacheControl.noStore()).<Void>build())
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/media/{token}")
    public ResponseEntity<Resource> file(@PathVariable String token) {
        return media.perToken(token)
                .map(m -> risposta(m, media.contenuto(m.getId()), m.getMimeType()))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/media/{token}/anteprima")
    public ResponseEntity<Resource> anteprima(@PathVariable String token) {
        return media.perToken(token)
                .flatMap(m -> media.anteprima(m.getId()).map(a -> risposta(m, a, MediaType.IMAGE_JPEG_VALUE)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    private static ResponseEntity<Resource> risposta(PlannerMedia m, byte[] dati, String tipo) {
        HttpHeaders h = new HttpHeaders();
        if (m.getNomeFile() != null) {
            h.setContentDisposition(ContentDisposition.inline().filename(m.getNomeFile(), StandardCharsets.UTF_8).build());
        }
        return ResponseEntity.ok()
                .headers(h)
                .contentType(MediaType.parseMediaType(tipo))
                .cacheControl(CacheControl.maxAge(365, TimeUnit.DAYS).cachePublic().immutable())
                .header("X-Content-Type-Options", "nosniff")
                .header("X-Robots-Tag", "noindex, nofollow")
                .body(new ByteArrayResource(dati));
    }
}
