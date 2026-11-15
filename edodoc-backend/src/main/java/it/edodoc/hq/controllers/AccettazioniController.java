package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.AccettazioneDto;
import it.edodoc.hq.dto.ApiResponseDto;
import it.edodoc.hq.security.UtenteDetails;
import it.edodoc.hq.services.AccettazioneRegistro;
import it.edodoc.hq.services.AccettazioneService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.List;

/** Accettazione firmata online, dal gestionale del dottore (solo ADMIN, come tutto fuori da /api/app e /api/pubblico). */
@RestController
public class AccettazioniController {

    private final AccettazioneService service;

    public AccettazioniController(AccettazioneService service) {
        this.service = service;
    }

    @GetMapping("/api/pazienti/{pazienteId}/accettazioni")
    public ApiResponseDto<AccettazioneDto.Panoramica> panoramica(@PathVariable Long pazienteId) {
        return ApiResponseDto.success(service.panoramica(pazienteId));
    }

    @PostMapping("/api/pazienti/{pazienteId}/accettazioni")
    public ApiResponseDto<AccettazioneDto.Inviata> crea(@PathVariable Long pazienteId,
                                                        @RequestBody(required = false) AccettazioneDto.CreaRequest req,
                                                        @AuthenticationPrincipal UtenteDetails utente,
                                                        HttpServletRequest request) {
        AccettazioneDto.Inviata inviata = service.crea(pazienteId, req, id(utente), origine(request));
        return ApiResponseDto.success(inviata.avviso() == null ? "Accettazione inviata" : "Accettazione pronta", inviata);
    }

    @PostMapping("/api/pazienti/{pazienteId}/consensi")
    public ApiResponseDto<List<AccettazioneDto.Consenso>> consenso(@PathVariable Long pazienteId,
                                                                   @RequestBody AccettazioneDto.ConsensoRequest req,
                                                                   @AuthenticationPrincipal UtenteDetails utente) {
        return ApiResponseDto.success("Scelta registrata", service.registraConsenso(pazienteId, req, id(utente)));
    }

    @PostMapping("/api/accettazioni/{id}/reinvia")
    public ApiResponseDto<AccettazioneDto.Inviata> reinvia(@PathVariable Long id,
                                                           @RequestBody(required = false) AccettazioneDto.ReinviaRequest req,
                                                           @AuthenticationPrincipal UtenteDetails utente,
                                                           HttpServletRequest request) {
        AccettazioneDto.Inviata inviata = service.reinvia(id, req, id(utente), origine(request));
        return ApiResponseDto.success(inviata.avviso() == null ? "Nuovo link inviato" : "Nuovo link pronto", inviata);
    }

    @PostMapping("/api/accettazioni/{id}/annulla")
    public ApiResponseDto<AccettazioneDto.Riga> annulla(@PathVariable Long id,
                                                        @RequestBody(required = false) AccettazioneDto.AnnullaRequest req,
                                                        @AuthenticationPrincipal UtenteDetails utente,
                                                        HttpServletRequest request) {
        return ApiResponseDto.success("Richiesta annullata",
                service.annulla(id, req == null ? null : req.motivo(), id(utente), origine(request)));
    }

    @DeleteMapping("/api/accettazioni/{id}")
    public ApiResponseDto<Void> elimina(@PathVariable Long id) {
        service.elimina(id);
        return ApiResponseDto.success("Richiesta eliminata", null);
    }

    @GetMapping("/api/accettazioni/{id}/pdf")
    public ResponseEntity<byte[]> pdf(@PathVariable Long id) {
        return pdf(service.pdf(id));
    }

    @GetMapping("/api/accettazioni/{id}/registro")
    public ApiResponseDto<AccettazioneDto.Registro> registro(@PathVariable Long id) {
        return ApiResponseDto.success(service.registro(id));
    }

    static ResponseEntity<byte[]> pdf(AccettazioneService.File f) {
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(f.nome(), StandardCharsets.UTF_8).build().toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(f.contenuto());
    }

    private static Long id(UtenteDetails u) {
        return u == null ? null : u.getId();
    }

    static AccettazioneRegistro.Origine origine(HttpServletRequest request) {
        return new AccettazioneRegistro.Origine(ip(request), request.getHeader(HttpHeaders.USER_AGENT), null);
    }

    /** Su Cloud Run l'indirizzo vero è il primo di X-Forwarded-For. */
    static String ip(HttpServletRequest request) {
        String inoltrato = request.getHeader("X-Forwarded-For");
        return inoltrato != null && !inoltrato.isBlank() ? inoltrato.split(",")[0].trim() : request.getRemoteAddr();
    }
}
