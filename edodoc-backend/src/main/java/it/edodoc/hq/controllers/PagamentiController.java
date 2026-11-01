package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.ApiResponseDto;
import it.edodoc.hq.dto.PagamentiDto;
import it.edodoc.hq.services.PagamentoService;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/pagamenti")
public class PagamentiController {

    private final PagamentoService pagamentoService;

    public PagamentiController(PagamentoService pagamentoService) {
        this.pagamentoService = pagamentoService;
    }

    @GetMapping
    public ApiResponseDto<PagamentiDto.Lista> nelPeriodo(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate da,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate a) {
        return ApiResponseDto.success(pagamentoService.nelPeriodo(da, a));
    }

    @PostMapping
    public ApiResponseDto<PagamentiDto.Riga> crea(@Valid @RequestBody PagamentiDto.Salva richiesta) {
        return ApiResponseDto.success("Pagamento creato", pagamentoService.crea(richiesta));
    }

    @PutMapping("/{id}")
    public ApiResponseDto<PagamentiDto.Riga> aggiorna(@PathVariable Long id, @Valid @RequestBody PagamentiDto.Salva richiesta) {
        return ApiResponseDto.success("Pagamento aggiornato", pagamentoService.aggiorna(id, richiesta));
    }

    @PostMapping("/{id}/registra")
    public ApiResponseDto<PagamentiDto.Riga> registra(@PathVariable Long id, @Valid @RequestBody PagamentiDto.Registra richiesta) {
        return ApiResponseDto.success("Pagamento registrato", pagamentoService.registra(id, richiesta));
    }

    @PostMapping("/{id}/annulla-registrazione")
    public ApiResponseDto<PagamentiDto.Riga> annullaRegistrazione(@PathVariable Long id) {
        return ApiResponseDto.success("Registrazione annullata", pagamentoService.annullaRegistrazione(id));
    }

    @DeleteMapping("/{id}")
    public ApiResponseDto<Void> annulla(@PathVariable Long id) {
        pagamentoService.annulla(id);
        return ApiResponseDto.success("Pagamento annullato", null);
    }
}
