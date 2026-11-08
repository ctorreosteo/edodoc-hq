package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.ApiResponseDto;
import it.edodoc.hq.dto.DietaDto;
import it.edodoc.hq.services.DietaService;
import jakarta.validation.Valid;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

@RestController
@RequestMapping("/api/diete")
public class DieteController {

    private final DietaService dietaService;

    public DieteController(DietaService dietaService) {
        this.dietaService = dietaService;
    }

    /** Senza paziente: tutte, modelli compresi. Con paziente: il suo storico, dalla più recente. */
    @GetMapping
    public ApiResponseDto<List<DietaDto.Riga>> elenco(@RequestParam(required = false) Long pazienteId) {
        return ApiResponseDto.success(pazienteId == null ? dietaService.tutte() : dietaService.delPaziente(pazienteId));
    }

    @GetMapping("/{id}")
    public ApiResponseDto<DietaDto.Dettaglio> dettaglio(@PathVariable Long id) {
        return ApiResponseDto.success(dietaService.dettaglio(id));
    }

    @PostMapping
    public ApiResponseDto<DietaDto.Dettaglio> crea(@Valid @RequestBody DietaDto.Crea richiesta) {
        return ApiResponseDto.success("Dieta creata", dietaService.crea(richiesta));
    }

    @PutMapping("/{id}")
    public ApiResponseDto<DietaDto.Dettaglio> salva(@PathVariable Long id, @Valid @RequestBody DietaDto.Salva richiesta) {
        return ApiResponseDto.success("Dieta salvata", dietaService.salva(id, richiesta));
    }

    @PostMapping("/{id}/versioni/{numero}/ripristina")
    public ApiResponseDto<DietaDto.Dettaglio> ripristina(@PathVariable Long id, @PathVariable Integer numero) {
        return ApiResponseDto.success("Versione ripristinata", dietaService.ripristina(id, numero));
    }

    @PostMapping("/{id}/consegna")
    public ApiResponseDto<DietaDto.Dettaglio> consegna(@PathVariable Long id, @RequestParam boolean consegnata) {
        return ApiResponseDto.success(dietaService.segnaConsegnata(id, consegnata));
    }

    @DeleteMapping("/{id}")
    public ApiResponseDto<Void> elimina(@PathVariable Long id) {
        dietaService.elimina(id);
        return ApiResponseDto.success("Dieta eliminata", null);
    }

    @GetMapping("/{id}/pdf")
    public ResponseEntity<byte[]> pdf(@PathVariable Long id) throws IOException {
        return pdf(dietaService.pdf(id));
    }

    @GetMapping("/{id}/versioni/{numero}/pdf")
    public ResponseEntity<byte[]> pdfVersione(@PathVariable Long id, @PathVariable Integer numero) throws IOException {
        return pdf(dietaService.pdfVersione(id, numero));
    }

    private static ResponseEntity<byte[]> pdf(DietaService.PdfDieta pdf) {
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline()
                        .filename(pdf.nomeFile(), StandardCharsets.UTF_8).build().toString())
                .body(pdf.contenuto());
    }
}
