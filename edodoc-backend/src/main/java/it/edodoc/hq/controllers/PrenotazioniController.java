package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.ApiResponseDto;
import it.edodoc.hq.dto.PrenotazioniDto;
import it.edodoc.hq.services.PrenotazioneService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** Prenotazioni della chiamata conoscitiva arrivate dal sito, per il dottore. */
@RestController
@RequestMapping("/api/prenotazioni")
public class PrenotazioniController {

    private final PrenotazioneService prenotazioneService;

    public PrenotazioniController(PrenotazioneService prenotazioneService) {
        this.prenotazioneService = prenotazioneService;
    }

    @GetMapping
    public ApiResponseDto<List<PrenotazioniDto.Riga>> tutte() {
        return ApiResponseDto.success(prenotazioneService.tutte());
    }

    @GetMapping("/{id}")
    public ApiResponseDto<PrenotazioniDto.Dettaglio> dettaglio(@PathVariable Long id) {
        return ApiResponseDto.success(prenotazioneService.dettaglio(id));
    }

    @PostMapping("/{id}/sposta")
    public ApiResponseDto<PrenotazioniDto.Dettaglio> sposta(@PathVariable Long id, @Valid @RequestBody PrenotazioniDto.Sposta r) {
        return ApiResponseDto.success("Chiamata spostata", prenotazioneService.sposta(id, r.inizio()));
    }

    @PostMapping("/{id}/stato")
    public ApiResponseDto<PrenotazioniDto.Dettaglio> stato(@PathVariable Long id, @Valid @RequestBody PrenotazioniDto.CambiaStato r) {
        return ApiResponseDto.success(prenotazioneService.cambiaStato(id, r.stato(), r.motivo()));
    }

    @PutMapping("/{id}/contatto")
    public ApiResponseDto<PrenotazioniDto.Dettaglio> contatto(@PathVariable Long id, @Valid @RequestBody PrenotazioniDto.Contatto r) {
        return ApiResponseDto.success("Contatto aggiornato", prenotazioneService.contatto(id, r));
    }

    @PutMapping("/{id}/esito")
    public ApiResponseDto<PrenotazioniDto.Dettaglio> esito(@PathVariable Long id, @Valid @RequestBody PrenotazioniDto.Esito r) {
        return ApiResponseDto.success(prenotazioneService.esito(id, r));
    }
}
