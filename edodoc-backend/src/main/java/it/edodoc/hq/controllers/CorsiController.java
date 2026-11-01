package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.ApiResponseDto;
import it.edodoc.hq.dto.CorsiDto;
import it.edodoc.hq.services.CorsoService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/** Costruzione dei corsi dal gestionale. Il paziente li legge da /api/app. */
@RestController
@RequestMapping("/api")
public class CorsiController {

    private final CorsoService corsoService;

    public CorsiController(CorsoService corsoService) {
        this.corsoService = corsoService;
    }

    @GetMapping("/corsi")
    public ApiResponseDto<List<CorsiDto.RigaCorso>> catalogo() {
        return ApiResponseDto.success(corsoService.catalogo());
    }

    @GetMapping("/corsi/{id}")
    public ApiResponseDto<CorsiDto.Struttura> struttura(@PathVariable Long id) {
        return ApiResponseDto.success(corsoService.struttura(id));
    }

    @PostMapping("/corsi")
    public ApiResponseDto<CorsiDto.Struttura> creaCorso(@Valid @RequestBody CorsiDto.SalvaCorso richiesta) {
        return ApiResponseDto.success("Corso creato", corsoService.struttura(corsoService.creaCorso(richiesta)));
    }

    @PutMapping("/corsi/{id}")
    public ApiResponseDto<CorsiDto.Struttura> aggiornaCorso(@PathVariable Long id, @Valid @RequestBody CorsiDto.SalvaCorso richiesta) {
        corsoService.aggiornaCorso(id, richiesta);
        return ApiResponseDto.success("Corso aggiornato", corsoService.struttura(id));
    }

    @DeleteMapping("/corsi/{id}")
    public ApiResponseDto<Void> eliminaCorso(@PathVariable Long id) {
        corsoService.eliminaCorso(id);
        return ApiResponseDto.success("Corso eliminato", null);
    }

    @PostMapping("/corsi/{id}/pubblicazione")
    public ApiResponseDto<CorsiDto.Struttura> pubblicaCorso(@PathVariable Long id, @RequestParam boolean pubblicato) {
        corsoService.pubblicaCorso(id, pubblicato);
        return ApiResponseDto.success(corsoService.struttura(id));
    }

    @PostMapping("/corsi/{id}/copertina")
    public ApiResponseDto<Void> caricaCopertinaCorso(@PathVariable Long id, @RequestPart("file") MultipartFile file) {
        corsoService.cambiaCopertinaCorso(id, file);
        return ApiResponseDto.success("Copertina caricata", null);
    }

    @DeleteMapping("/corsi/{id}/copertina")
    public ApiResponseDto<Void> togliCopertinaCorso(@PathVariable Long id) {
        corsoService.cambiaCopertinaCorso(id, null);
        return ApiResponseDto.success("Copertina rimossa", null);
    }

    @PostMapping("/corsi/{id}/moduli")
    public ApiResponseDto<CorsiDto.RigaModulo> creaModulo(@PathVariable Long id, @Valid @RequestBody CorsiDto.SalvaModulo richiesta) {
        return ApiResponseDto.success("Modulo creato", corsoService.creaModulo(id, richiesta));
    }

    @PutMapping("/corsi/{id}/moduli/ordine")
    public ApiResponseDto<Void> riordinaModuli(@PathVariable Long id, @Valid @RequestBody CorsiDto.Ordine richiesta) {
        corsoService.riordinaModuli(id, richiesta.ids());
        return ApiResponseDto.success(null);
    }

    @PutMapping("/moduli/{id}")
    public ApiResponseDto<CorsiDto.RigaModulo> aggiornaModulo(@PathVariable Long id, @Valid @RequestBody CorsiDto.SalvaModulo richiesta) {
        return ApiResponseDto.success("Modulo aggiornato", corsoService.aggiornaModulo(id, richiesta));
    }

    @DeleteMapping("/moduli/{id}")
    public ApiResponseDto<Void> eliminaModulo(@PathVariable Long id) {
        corsoService.eliminaModulo(id);
        return ApiResponseDto.success("Modulo eliminato", null);
    }

    @PostMapping("/moduli/{id}/copertina")
    public ApiResponseDto<Void> caricaCopertinaModulo(@PathVariable Long id, @RequestPart("file") MultipartFile file) {
        corsoService.cambiaCopertinaModulo(id, file);
        return ApiResponseDto.success("Copertina caricata", null);
    }

    @DeleteMapping("/moduli/{id}/copertina")
    public ApiResponseDto<Void> togliCopertinaModulo(@PathVariable Long id) {
        corsoService.cambiaCopertinaModulo(id, null);
        return ApiResponseDto.success("Copertina rimossa", null);
    }

    @PostMapping("/moduli/{id}/lezioni")
    public ApiResponseDto<CorsiDto.RigaLezione> creaLezione(@PathVariable Long id, @Valid @RequestBody CorsiDto.SalvaLezione richiesta) {
        return ApiResponseDto.success("Lezione creata", corsoService.creaLezione(id, richiesta));
    }

    @PutMapping("/moduli/{id}/lezioni/ordine")
    public ApiResponseDto<Void> riordinaLezioni(@PathVariable Long id, @Valid @RequestBody CorsiDto.Ordine richiesta) {
        corsoService.riordinaLezioni(id, richiesta.ids());
        return ApiResponseDto.success(null);
    }

    @PutMapping("/lezioni/{id}")
    public ApiResponseDto<CorsiDto.RigaLezione> aggiornaLezione(@PathVariable Long id, @Valid @RequestBody CorsiDto.SalvaLezione richiesta) {
        return ApiResponseDto.success("Lezione aggiornata", corsoService.aggiornaLezione(id, richiesta));
    }

    @DeleteMapping("/lezioni/{id}")
    public ApiResponseDto<Void> eliminaLezione(@PathVariable Long id) {
        corsoService.eliminaLezione(id);
        return ApiResponseDto.success("Lezione eliminata", null);
    }

    @PostMapping("/lezioni/{id}/pubblicazione")
    public ApiResponseDto<CorsiDto.RigaLezione> pubblicaLezione(@PathVariable Long id, @RequestParam boolean pubblicata) {
        return ApiResponseDto.success(corsoService.pubblicaLezione(id, pubblicata));
    }

    @PostMapping("/lezioni/{id}/video/upload")
    public ApiResponseDto<CorsiDto.UploadVideo> avviaUpload(@PathVariable Long id, @Valid @RequestBody CorsiDto.AvviaUpload richiesta) {
        return ApiResponseDto.success(corsoService.avviaUpload(id, richiesta.dimensioneBytes()));
    }

    @PostMapping("/lezioni/{id}/video/sincronizza")
    public ApiResponseDto<CorsiDto.StatoVideo> sincronizzaVideo(@PathVariable Long id) {
        return ApiResponseDto.success(corsoService.sincronizzaVideo(id));
    }

    @GetMapping("/lezioni/{id}/video/riproduzione")
    public ApiResponseDto<CorsiDto.Riproduzione> riproduzione(@PathVariable Long id) {
        return ApiResponseDto.success(corsoService.riproduzioneGestionale(id));
    }
}
