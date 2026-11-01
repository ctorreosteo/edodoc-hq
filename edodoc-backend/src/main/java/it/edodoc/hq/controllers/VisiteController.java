package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.ApiResponseDto;
import it.edodoc.hq.dto.VisiteDto;
import it.edodoc.hq.services.VisitaService;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/visite")
public class VisiteController {

    private final VisitaService visitaService;

    public VisiteController(VisitaService visitaService) {
        this.visitaService = visitaService;
    }

    @GetMapping
    public ApiResponseDto<List<VisiteDto.Riga>> nelPeriodo(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate da,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate a) {
        return ApiResponseDto.success(visitaService.nelPeriodo(da, a));
    }

    @PostMapping
    public ApiResponseDto<VisiteDto.Riga> crea(@Valid @RequestBody VisiteDto.Salva richiesta) {
        return ApiResponseDto.success("Visita fissata", visitaService.crea(richiesta));
    }

    @PutMapping("/{id}")
    public ApiResponseDto<VisiteDto.Riga> aggiorna(@PathVariable Long id, @Valid @RequestBody VisiteDto.Salva richiesta) {
        return ApiResponseDto.success("Visita aggiornata", visitaService.aggiorna(id, richiesta));
    }

    @PostMapping("/{id}/stato")
    public ApiResponseDto<VisiteDto.Riga> cambiaStato(@PathVariable Long id, @Valid @RequestBody VisiteDto.CambiaStato richiesta) {
        return ApiResponseDto.success(visitaService.cambiaStato(id, richiesta.stato()));
    }
}
