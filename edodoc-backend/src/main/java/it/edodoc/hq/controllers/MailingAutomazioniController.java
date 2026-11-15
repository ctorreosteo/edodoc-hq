package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.MailingDto;
import it.edodoc.hq.dto.ApiResponseDto;
import it.edodoc.hq.jobs.MailingAutomazioniJob;
import it.edodoc.hq.security.UtenteDetails;
import it.edodoc.hq.services.MailingAiService;
import it.edodoc.hq.services.MailingAutomazioniService;
import it.edodoc.hq.services.MailingConfigService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Email Marketing: automazioni (/automazioni/**) e AI (/ai/**).
 * Specifica: docs/features/email-marketing.md §5–§8.
 */
@RestController
@RequestMapping("/api/mailing")
public class MailingAutomazioniController {

    private final MailingAutomazioniService automazioni;
    private final MailingAiService ai;
    private final MailingConfigService config;
    private final MailingAutomazioniJob job;

    public MailingAutomazioniController(MailingAutomazioniService automazioni, MailingAiService ai,
                                        MailingConfigService config, MailingAutomazioniJob job) {
        this.automazioni = automazioni;
        this.ai = ai;
        this.config = config;
        this.job = job;
    }

    private static <T> ResponseEntity<ApiResponseDto<T>> ok(String messaggio, T dati) {
        return ResponseEntity.ok(ApiResponseDto.success(messaggio, dati));
    }

    // ───────────────────────── Automazioni ─────────────────────────

    @GetMapping("/automazioni")
    public ResponseEntity<ApiResponseDto<List<MailingDto.AutomazioneRiga>>> elenco() {
        return ok("Automazioni", automazioni.elenco());
    }

    @GetMapping("/automazioni/modelli")
    public ResponseEntity<ApiResponseDto<List<MailingDto.ModelloAutomazione>>> modelli() {
        return ok("Modelli di automazione", automazioni.modelli());
    }

    @GetMapping("/automazioni/{id}")
    public ResponseEntity<ApiResponseDto<MailingDto.Automazione>> dettaglio(@PathVariable long id) {
        return ok("Automazione", automazioni.dettaglio(id));
    }

    @PostMapping("/automazioni")
    public ResponseEntity<ApiResponseDto<MailingDto.Automazione>> crea(@RequestBody MailingDto.AutomazioneInput in,
                                                                      @AuthenticationPrincipal UtenteDetails utente) {
        MailingDto.Automazione a = automazioni.crea(in, utente == null ? null : utente.getId());
        return ok("Automazione creata", a);
    }

    @PutMapping("/automazioni/{id}")
    public ResponseEntity<ApiResponseDto<MailingDto.Automazione>> aggiorna(@PathVariable long id,
                                                                          @RequestBody MailingDto.AutomazioneInput in) {
        MailingDto.Automazione a = automazioni.aggiorna(id, in);
        return ok("Automazione salvata", a);
    }

    @DeleteMapping("/automazioni/{id}")
    public ResponseEntity<ApiResponseDto<Void>> elimina(@PathVariable long id) {
        automazioni.elimina(id);
        return ok("Automazione eliminata", null);
    }

    @PostMapping("/automazioni/{id}/email")
    public ResponseEntity<ApiResponseDto<MailingDto.AutomazioneEmail>> creaEmail(@PathVariable long id,
                                                                                @RequestBody MailingDto.AutomazioneEmailInput in) {
        return ok("Email creata", automazioni.creaEmail(id, in));
    }

    @PutMapping("/automazioni/{id}/email/{emailId}")
    public ResponseEntity<ApiResponseDto<MailingDto.AutomazioneEmail>> aggiornaEmail(@PathVariable long id,
                                                                                    @PathVariable long emailId,
                                                                                    @RequestBody MailingDto.AutomazioneEmailInput in) {
        return ok("Email salvata", automazioni.aggiornaEmail(id, emailId, in));
    }

    @DeleteMapping("/automazioni/{id}/email/{emailId}")
    public ResponseEntity<ApiResponseDto<Void>> eliminaEmail(@PathVariable long id, @PathVariable long emailId) {
        automazioni.eliminaEmail(id, emailId);
        return ok("Email eliminata", null);
    }

    @PostMapping("/automazioni/{id}/attiva")
    public ResponseEntity<ApiResponseDto<MailingDto.Automazione>> attiva(@PathVariable long id) {
        MailingDto.Automazione a = automazioni.attiva(id);
        return ok("Automazione attivata", a);
    }

    @PostMapping("/automazioni/{id}/pausa")
    public ResponseEntity<ApiResponseDto<MailingDto.Automazione>> pausa(@PathVariable long id) {
        MailingDto.Automazione a = automazioni.pausa(id);
        return ok("Automazione in pausa", a);
    }

    @PostMapping("/automazioni/{id}/iscrivi")
    public ResponseEntity<ApiResponseDto<MailingDto.EsitoIscrizione>> iscrivi(@PathVariable long id,
                                                                             @RequestBody MailingDto.IscrizioneManuale in) {
        MailingDto.EsitoIscrizione esito = automazioni.iscrivi(id, in);
        return ok(esito.iscritti() + " contatti iscritti", esito);
    }

    @GetMapping("/automazioni/{id}/report")
    public ResponseEntity<ApiResponseDto<MailingDto.ReportAutomazione>> report(@PathVariable long id) {
        return ok("Report automazione", automazioni.report(id));
    }

    /** Avvio manuale del job (monitor dei job): trigger giornalieri, segmenti e avanzamento. */
    @PostMapping("/automazioni/job/esegui")
    public ResponseEntity<ApiResponseDto<Map<String, Object>>> eseguiJob() {
        job.runAsync();
        return ok("Job delle automazioni avviato", statoJob());
    }

    @GetMapping("/automazioni/job/stato")
    public ResponseEntity<ApiResponseDto<Map<String, Object>>> statoJobEndpoint() {
        return ok("Stato job automazioni", statoJob());
    }

    private Map<String, Object> statoJob() {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("enabled", job.isEnabled());
        s.put("running", job.isRunning());
        s.put("lastRunStartedAt", job.getLastRunStartedAt() == null ? null : job.getLastRunStartedAt().toString());
        s.put("lastRunFinishedAt", job.getLastRunFinishedAt() == null ? null : job.getLastRunFinishedAt().toString());
        s.put("lastMessage", job.getLastMessage());
        s.put("lastError", job.getLastError());
        return s;
    }

    // ───────────────────────── AI ─────────────────────────

    @PostMapping("/ai/email")
    public ResponseEntity<ApiResponseDto<MailingDto.AiEmail>> aiEmail(@RequestBody MailingDto.AiEmailInput in) {
        return ok("Email generata", ai.email(in));
    }

    @PostMapping("/ai/oggetti")
    public ResponseEntity<ApiResponseDto<List<MailingDto.AiOggetto>>> aiOggetti(@RequestBody MailingDto.AiOggettiInput in) {
        return ok("Oggetti proposti", ai.oggetti(in));
    }

    @PostMapping("/ai/riscrivi")
    public ResponseEntity<ApiResponseDto<MailingDto.AiTesto>> aiRiscrivi(@RequestBody MailingDto.AiRiscriviInput in) {
        return ok("Testo riscritto", ai.riscrivi(in));
    }

    @PostMapping("/ai/segmento")
    public ResponseEntity<ApiResponseDto<MailingDto.AiSegmento>> aiSegmento(@RequestBody MailingDto.AiSegmentoInput in) {
        return ok("Regole proposte", ai.segmento(in));
    }

    @PostMapping("/ai/analisi-campagna/{id}")
    public ResponseEntity<ApiResponseDto<MailingDto.AiAnalisi>> aiAnalisi(@PathVariable long id) {
        return ok("Analisi della campagna", ai.analisiCampagna(id));
    }
}
