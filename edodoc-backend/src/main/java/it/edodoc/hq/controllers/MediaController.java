package it.edodoc.hq.controllers;

import it.edodoc.hq.models.Copertina;
import it.edodoc.hq.services.CorsoService;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.UUID;

/** Copertine dei corsi, senza login: un tag img e l'app non possono passare il token. */
@RestController
@RequestMapping("/api/media")
public class MediaController {

    private final CorsoService corsoService;

    public MediaController(CorsoService corsoService) {
        this.corsoService = corsoService;
    }

    /** Ogni immagine ha un id nuovo, quindi la cache può durare a lungo. */
    @GetMapping("/copertine/{id}")
    public ResponseEntity<byte[]> copertina(@PathVariable UUID id) {
        Copertina copertina = corsoService.copertina(id);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(copertina.getTipo()))
                .cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
                .body(copertina.getDati());
    }
}
