package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.ApiResponseDto;
import it.edodoc.hq.dto.PercorsiDto;
import it.edodoc.hq.services.PercorsoService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/percorsi")
public class PercorsiController {

    private final PercorsoService percorsoService;

    public PercorsiController(PercorsoService percorsoService) {
        this.percorsoService = percorsoService;
    }

    @GetMapping
    public ApiResponseDto<PercorsiDto.Acquisti> acquisti() {
        return ApiResponseDto.success(percorsoService.acquisti());
    }

    @GetMapping("/listino")
    public ApiResponseDto<PercorsiDto.Listino> listino() {
        return ApiResponseDto.success(percorsoService.listino());
    }

    @PostMapping
    public ApiResponseDto<PercorsiDto.Sintesi> crea(@Valid @RequestBody PercorsiDto.Crea richiesta) {
        return ApiResponseDto.success("Percorso creato", percorsoService.crea(richiesta));
    }

    @DeleteMapping("/{id}")
    public ApiResponseDto<Void> annulla(@PathVariable Long id) {
        percorsoService.annulla(id);
        return ApiResponseDto.success("Percorso annullato", null);
    }
}
