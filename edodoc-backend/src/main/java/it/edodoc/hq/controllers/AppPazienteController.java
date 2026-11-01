package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.ApiResponseDto;
import it.edodoc.hq.dto.ChatDto;
import it.edodoc.hq.dto.CheckDto;
import it.edodoc.hq.dto.CorsiDto;
import it.edodoc.hq.dto.FattureDto;
import it.edodoc.hq.dto.PagamentiDto;
import it.edodoc.hq.dto.PercorsiDto;
import it.edodoc.hq.models.CheckSettimanale;
import it.edodoc.hq.models.Messaggio;
import it.edodoc.hq.security.UtenteDetails;
import it.edodoc.hq.services.ChatService;
import it.edodoc.hq.services.CheckService;
import it.edodoc.hq.services.CorsoService;
import it.edodoc.hq.services.FatturaService;
import it.edodoc.hq.services.PagamentoService;
import it.edodoc.hq.services.PercorsoService;
import jakarta.validation.Valid;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
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
import java.util.List;

/** API dell'app mobile. Il paziente è sempre quello del token: nessun id arriva dal client. */
@RestController
@RequestMapping("/api/app")
public class AppPazienteController {

    private final CheckService checkService;
    private final CorsoService corsoService;
    private final ChatService chatService;
    private final PagamentoService pagamentoService;
    private final FatturaService fatturaService;
    private final PercorsoService percorsoService;

    public AppPazienteController(CheckService checkService, CorsoService corsoService, ChatService chatService,
                                 PagamentoService pagamentoService, FatturaService fatturaService,
                                 PercorsoService percorsoService) {
        this.checkService = checkService;
        this.corsoService = corsoService;
        this.chatService = chatService;
        this.pagamentoService = pagamentoService;
        this.fatturaService = fatturaService;
        this.percorsoService = percorsoService;
    }

    @GetMapping("/riepilogo")
    public ApiResponseDto<ChatDto.RiepilogoApp> riepilogo(@AuthenticationPrincipal UtenteDetails utente) {
        Long pazienteId = utente.getPazienteId();
        CheckDto.StatoApp check = checkService.statoApp(pazienteId);
        return ApiResponseDto.success(new ChatDto.RiepilogoApp(check.settimana(), check.compilato(),
                checkService.feedbackDaLeggere(pazienteId), chatService.nonLetti(pazienteId, Messaggio.Mittente.PAZIENTE)));
    }

    @GetMapping("/percorso")
    public ApiResponseDto<PercorsiDto.AppRiepilogo> percorso(@AuthenticationPrincipal UtenteDetails utente) {
        return ApiResponseDto.success(percorsoService.delPazienteApp(utente.getPazienteId()));
    }

    @GetMapping("/check/corrente")
    public ApiResponseDto<CheckDto.StatoApp> corrente(@AuthenticationPrincipal UtenteDetails utente) {
        return ApiResponseDto.success(checkService.statoApp(utente.getPazienteId()));
    }

    @GetMapping("/check")
    public ApiResponseDto<List<CheckDto.Dettaglio>> storico(@AuthenticationPrincipal UtenteDetails utente) {
        return ApiResponseDto.success(checkService.storico(utente.getPazienteId()));
    }

    @PostMapping("/check")
    public ApiResponseDto<CheckDto.Dettaglio> compila(@AuthenticationPrincipal UtenteDetails utente,
                                                      @Valid @RequestBody CheckDto.Risposte risposte) {
        LocalDate settimana = CheckService.settimanaDi(LocalDate.now());
        return ApiResponseDto.success("Check inviato",
                checkService.salva(utente.getPazienteId(), risposte, CheckSettimanale.Fonte.APP, settimana));
    }

    @PostMapping("/check/{id}/feedback-letto")
    public ApiResponseDto<Void> feedbackLetto(@AuthenticationPrincipal UtenteDetails utente, @PathVariable Long id) {
        checkService.segnaFeedbackLetto(utente.getPazienteId(), id);
        return ApiResponseDto.success(null);
    }

    @GetMapping("/check/{id}/feedback/audio")
    public ResponseEntity<Resource> ascoltaFeedback(@AuthenticationPrincipal UtenteDetails utente, @PathVariable Long id) {
        return CheckController.rispostaAudio(checkService.vocaleDelFeedback(utente.getPazienteId(), id));
    }

    @GetMapping("/messaggi")
    public ApiResponseDto<List<ChatDto.RigaMessaggio>> messaggi(@AuthenticationPrincipal UtenteDetails utente,
                                                                @RequestParam(required = false) Long dopoId,
                                                                @RequestParam(required = false) Long primaDiId,
                                                                @RequestParam(required = false) Integer limite) {
        return ApiResponseDto.success(chatService.messaggi(utente.getPazienteId(), dopoId, primaDiId, limite));
    }

    @PostMapping("/messaggi")
    public ApiResponseDto<ChatDto.RigaMessaggio> scrivi(@AuthenticationPrincipal UtenteDetails utente,
                                                        @Valid @RequestBody ChatDto.Invio invio) {
        return ApiResponseDto.success(chatService.scrivi(utente.getPazienteId(), Messaggio.Mittente.PAZIENTE, invio));
    }

    @PostMapping("/messaggi/letti")
    public ApiResponseDto<Void> messaggiLetti(@AuthenticationPrincipal UtenteDetails utente) {
        chatService.segnaLetti(utente.getPazienteId(), Messaggio.Mittente.PAZIENTE);
        return ApiResponseDto.success(null);
    }

    @GetMapping("/pagamenti")
    public ApiResponseDto<PagamentiDto.AppLista> pagamenti(@AuthenticationPrincipal UtenteDetails utente) {
        return ApiResponseDto.success(pagamentoService.delPazienteApp(utente.getPazienteId()));
    }

    @GetMapping("/fatture")
    public ApiResponseDto<List<FattureDto.AppFattura>> fatture(@AuthenticationPrincipal UtenteDetails utente) {
        return ApiResponseDto.success(fatturaService.delPazienteApp(utente.getPazienteId()));
    }

    @GetMapping("/fatture/{id}/pdf")
    public ResponseEntity<byte[]> fatturaPdf(@AuthenticationPrincipal UtenteDetails utente, @PathVariable Long id) throws IOException {
        FatturaService.PdfFattura pdf = fatturaService.pdfApp(utente.getPazienteId(), id);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(pdf.nomeFile(), StandardCharsets.UTF_8).build().toString())
                .body(pdf.contenuto());
    }

    @GetMapping("/corsi")
    public ApiResponseDto<List<CorsiDto.AppCorso>> corsi() {
        return ApiResponseDto.success(corsoService.corsiApp());
    }

    @GetMapping("/corsi/{id}")
    public ApiResponseDto<CorsiDto.AppCorsoDettaglio> corso(@PathVariable Long id) {
        return ApiResponseDto.success(corsoService.corsoApp(id));
    }

    @GetMapping("/lezioni/{id}")
    public ApiResponseDto<CorsiDto.AppLezione> lezione(@PathVariable Long id) {
        return ApiResponseDto.success(corsoService.lezioneApp(id));
    }
}
