package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.ApiResponseDto;
import it.edodoc.hq.dto.ObiettiviDto;
import it.edodoc.hq.services.ObiettivoService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/obiettivi")
public class ObiettiviController {

    private final ObiettivoService obiettivoService;

    public ObiettiviController(ObiettivoService obiettivoService) {
        this.obiettivoService = obiettivoService;
    }

    @GetMapping
    public ApiResponseDto<ObiettiviDto.Obiettivo> obiettivo() {
        return ApiResponseDto.success(obiettivoService.obiettivo());
    }
}
