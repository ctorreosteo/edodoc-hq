package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.ApiResponseDto;
import it.edodoc.hq.dto.CheckDto;
import it.edodoc.hq.models.CheckSettimanale;
import it.edodoc.hq.services.CheckService;
import jakarta.validation.Valid;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;

/** Lato dottore: la lista del lunedì e del mercoledì. Il paziente compila da /api/app/check. */
@RestController
@RequestMapping("/api/check")
public class CheckController {

    private final CheckService checkService;

    public CheckController(CheckService checkService) {
        this.checkService = checkService;
    }

    @GetMapping("/settimana")
    public ApiResponseDto<CheckDto.Settimana> settimana(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate data) {
        LocalDate giorno = data != null ? data : LocalDate.now();
        return ApiResponseDto.success(checkService.settimana(CheckService.settimanaDi(giorno)));
    }

    /** Check dettato a voce o ricevuto per messaggio: finché non c'è l'app, si inserisce da qui. */
    @PostMapping("/paziente/{pazienteId}")
    public ApiResponseDto<CheckDto.Dettaglio> inserisci(
            @PathVariable Long pazienteId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate data,
            @Valid @RequestBody CheckDto.Risposte risposte) {
        LocalDate settimana = CheckService.settimanaDi(data != null ? data : LocalDate.now());
        return ApiResponseDto.success("Check salvato",
                checkService.salva(pazienteId, risposte, CheckSettimanale.Fonte.GESTIONALE, settimana));
    }

    @PostMapping("/contatto")
    public ApiResponseDto<Void> contatto(@Valid @RequestBody CheckDto.Contatto richiesta) {
        checkService.registraContatto(richiesta);
        return ApiResponseDto.success(null);
    }

    @PutMapping("/{id}/feedback")
    public ApiResponseDto<CheckDto.Dettaglio> feedback(@PathVariable Long id, @Valid @RequestBody CheckDto.Feedback feedback) {
        CheckService.FeedbackInviato esito = checkService.rispondi(id, feedback);
        return ApiResponseDto.success(esito.messaggio(), esito.check());
    }

    @PostMapping("/{id}/feedback/audio")
    public ApiResponseDto<CheckDto.Dettaglio> feedbackVocale(@PathVariable Long id,
                                                             @RequestParam("file") MultipartFile file,
                                                             @RequestParam int secondi,
                                                             @RequestParam(required = false) String testo,
                                                             @RequestParam(defaultValue = "false") boolean inviaEmail) {
        CheckService.FeedbackInviato esito = checkService.rispondiConVocale(id, file, secondi, testo, inviaEmail);
        return ApiResponseDto.success(esito.messaggio(), esito.check());
    }

    @GetMapping("/{id}/feedback/audio")
    public ResponseEntity<Resource> ascoltaFeedback(@PathVariable Long id) {
        return rispostaAudio(checkService.vocaleDelFeedback(id));
    }

    /** Resource e non byte[]: così Spring gestisce le richieste Range che i lettori audio dei telefoni usano. */
    static ResponseEntity<Resource> rispostaAudio(byte[] dati) {
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("audio/mp4"))
                .cacheControl(CacheControl.noStore())
                .body(new ByteArrayResource(dati));
    }

    @PostMapping("/{id}/letto")
    public ApiResponseDto<Void> letto(@PathVariable Long id) {
        checkService.segnaLetto(id);
        return ApiResponseDto.success(null);
    }
}
