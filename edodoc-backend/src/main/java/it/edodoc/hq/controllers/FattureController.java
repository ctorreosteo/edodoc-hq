package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.ApiResponseDto;
import it.edodoc.hq.dto.FattureDto;
import it.edodoc.hq.services.FatturaService;
import it.edodoc.hq.services.TesseraSanitariaService;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;

@RestController
@RequestMapping("/api/fatture")
public class FattureController {

    private final FatturaService fatturaService;
    private final TesseraSanitariaService tesseraService;

    public FattureController(FatturaService fatturaService, TesseraSanitariaService tesseraService) {
        this.fatturaService = fatturaService;
        this.tesseraService = tesseraService;
    }

    @GetMapping
    public ApiResponseDto<List<FattureDto.Riga>> nelPeriodo(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate da,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate a) {
        return ApiResponseDto.success(fatturaService.nelPeriodo(da, a));
    }

    @PostMapping("/anteprima")
    public ApiResponseDto<FattureDto.Anteprima> anteprima(@Valid @RequestBody FattureDto.Emetti richiesta) {
        return ApiResponseDto.success(fatturaService.anteprima(richiesta));
    }

    @PostMapping
    public ApiResponseDto<FattureDto.Riga> emetti(@Valid @RequestBody FattureDto.Emetti richiesta) {
        return ApiResponseDto.success("Fattura emessa", fatturaService.emetti(richiesta));
    }

    @PostMapping("/{id}/annulla")
    public ApiResponseDto<FattureDto.Riga> annulla(@PathVariable Long id, @Valid @RequestBody FattureDto.Annulla richiesta) {
        return ApiResponseDto.success("Fattura annullata", fatturaService.annulla(id, richiesta.motivo()));
    }

    @GetMapping("/{id}/pdf")
    public ResponseEntity<byte[]> pdf(@PathVariable Long id) throws IOException {
        FatturaService.PdfFattura pdf = fatturaService.pdf(id);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline()
                        .filename(pdf.nomeFile(), StandardCharsets.UTF_8).build().toString())
                .body(pdf.contenuto());
    }

    @GetMapping("/tessera-sanitaria")
    public ApiResponseDto<List<FattureDto.RigaTessera>> daInserire(@RequestParam YearMonth mese) {
        return ApiResponseDto.success(tesseraService.daInserire(mese));
    }

    @PostMapping("/{id}/tessera-sanitaria/inserita")
    public ApiResponseDto<Void> segnaInserita(@PathVariable Long id, @RequestParam boolean inserita) {
        tesseraService.segnaInserita(id, inserita);
        return ApiResponseDto.success(null);
    }

    @PostMapping("/{id}/tessera-sanitaria/trasmetti")
    public ApiResponseDto<Void> trasmetti(@PathVariable Long id) {
        tesseraService.trasmetti(id);
        return ApiResponseDto.success(null);
    }
}
