package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.ApiResponseDto;
import it.edodoc.hq.dto.CasellaDto;
import it.edodoc.hq.services.CasellaService;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;

/** Pagina Email del gestionale. Il popup di invio dai menu contestuali sta in EmailController. */
@RestController
@RequestMapping("/api/casella")
public class CasellaController {

    private final CasellaService casellaService;

    public CasellaController(CasellaService casellaService) {
        this.casellaService = casellaService;
    }

    @GetMapping
    public ApiResponseDto<CasellaDto.Casella> casella() {
        return ApiResponseDto.success(casellaService.posta().casella());
    }

    @GetMapping("/stato")
    public ApiResponseDto<CasellaDto.Stato> stato(@RequestParam(required = false) String dal) {
        return ApiResponseDto.success(casellaService.posta().stato(dal));
    }

    @GetMapping("/thread")
    public ApiResponseDto<CasellaDto.PaginaThread> elenco(@RequestParam(defaultValue = "INBOX") String cartella,
                                                          @RequestParam(required = false) String q,
                                                          @RequestParam(required = false) String pagina) {
        return ApiResponseDto.success(casellaService.posta().elenco(cartella, q, pagina));
    }

    @GetMapping("/thread/{id}")
    public ApiResponseDto<CasellaDto.Thread> thread(@PathVariable String id) {
        return ApiResponseDto.success(casellaService.posta().thread(id));
    }

    /** In linea solo immagini e PDF: il resto sempre come download, un HTML allegato non deve girare sul nostro dominio. */
    @GetMapping("/messaggi/{messaggioId}/allegati/{allegatoId}")
    public ResponseEntity<byte[]> allegato(@PathVariable String messaggioId, @PathVariable String allegatoId,
                                           @RequestParam(defaultValue = "allegato") String nome,
                                           @RequestParam(required = false) String tipo,
                                           @RequestParam(defaultValue = "true") boolean download) {
        byte[] dati = casellaService.posta().allegato(messaggioId, allegatoId);
        MediaType mediaType;
        try {
            mediaType = tipo != null && !tipo.isBlank() ? MediaType.parseMediaType(tipo) : MediaType.APPLICATION_OCTET_STREAM;
        } catch (IllegalArgumentException e) {
            mediaType = MediaType.APPLICATION_OCTET_STREAM;
        }
        String tipoNormale = (mediaType.getType() + "/" + mediaType.getSubtype()).toLowerCase(Locale.ROOT);
        boolean anteprimaSicura = (tipoNormale.startsWith("image/") && !tipoNormale.contains("svg")) || tipoNormale.equals("application/pdf");
        if (!anteprimaSicura) {
            mediaType = MediaType.APPLICATION_OCTET_STREAM;
        }
        ContentDisposition disposizione = (download || !anteprimaSicura ? ContentDisposition.attachment() : ContentDisposition.inline())
                .filename(nome, StandardCharsets.UTF_8).build();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, disposizione.toString())
                .header("X-Content-Type-Options", "nosniff")
                .contentType(mediaType)
                .body(dati);
    }

    @PostMapping("/thread/modifica")
    public ApiResponseDto<Void> modifica(@RequestBody CasellaDto.ModificaRequest richiesta) {
        casellaService.modifica(richiesta);
        return ApiResponseDto.success(null);
    }

    @PostMapping("/thread/cestino")
    public ApiResponseDto<Void> cestina(@RequestBody CasellaDto.ThreadIdsRequest richiesta) {
        casellaService.cestina(richiesta);
        return ApiResponseDto.success(null);
    }

    @PostMapping("/thread/ripristina")
    public ApiResponseDto<Void> ripristina(@RequestBody CasellaDto.ThreadIdsRequest richiesta) {
        casellaService.ripristina(richiesta);
        return ApiResponseDto.success(null);
    }

    @PostMapping(value = "/invia", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponseDto<CasellaDto.EsitoInvio> invia(@RequestPart("messaggio") CasellaDto.Composizione messaggio,
                                                       @RequestPart(value = "file", required = false) List<MultipartFile> file) {
        return ApiResponseDto.success("Email inviata", casellaService.invia(messaggio, file));
    }

    @PostMapping(value = "/bozze", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponseDto<CasellaDto.EsitoBozza> salvaBozza(@RequestPart("messaggio") CasellaDto.Composizione messaggio,
                                                            @RequestPart(value = "file", required = false) List<MultipartFile> file) {
        return ApiResponseDto.success(casellaService.salvaBozza(messaggio, file));
    }

    @GetMapping("/bozze/{id}")
    public ApiResponseDto<CasellaDto.Bozza> bozza(@PathVariable String id) {
        return ApiResponseDto.success(casellaService.posta().bozza(id));
    }

    @DeleteMapping("/bozze/{id}")
    public ApiResponseDto<Void> eliminaBozza(@PathVariable String id) {
        casellaService.posta().eliminaBozza(id);
        return ApiResponseDto.success(null);
    }

    @GetMapping("/suggerimenti")
    public ApiResponseDto<List<CasellaDto.Suggerimento>> suggerimenti(@RequestParam String q) {
        return ApiResponseDto.success(casellaService.suggerimenti(q));
    }
}
