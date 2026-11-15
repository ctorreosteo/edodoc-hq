package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.MailingDto;
import it.edodoc.hq.dto.ApiResponseDto;
import it.edodoc.hq.jobs.MailingRimbalziJob;
import it.edodoc.hq.security.UtenteDetails;
import it.edodoc.hq.services.MailingCampagneService;
import it.edodoc.hq.services.MailingImmaginiService;
import it.edodoc.hq.services.MailingMittentiService;
import it.edodoc.hq.services.MailingPanoramicaService;
import it.edodoc.hq.services.MailingTemplateService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/**
 * Email Marketing (/api/mailing): stato, panoramica, feed, campagne, stima del pubblico, template, immagini, mittenti.
 * Contatti, tag, segmenti e impostazioni stanno in MailingContattiController; automazioni, migrazione e AI in
 * MailingAutomazioniController. Specifica: docs/features/email-marketing.md §8.
 */
@RestController
@RequestMapping("/api/mailing")
public class MailingCampagneController {

    private final MailingPanoramicaService panoramica;
    private final MailingCampagneService campagne;
    private final MailingTemplateService template;
    private final MailingImmaginiService immagini;
    private final MailingMittentiService mittenti;
    private final MailingRimbalziJob rimbalziJob;

    public MailingCampagneController(MailingPanoramicaService panoramica, MailingCampagneService campagne,
                                     MailingTemplateService template, MailingImmaginiService immagini,
                                     MailingMittentiService mittenti, MailingRimbalziJob rimbalziJob) {
        this.panoramica = panoramica;
        this.campagne = campagne;
        this.template = template;
        this.immagini = immagini;
        this.mittenti = mittenti;
        this.rimbalziJob = rimbalziJob;
    }

    private static <T> ResponseEntity<ApiResponseDto<T>> ok(String messaggio, T dati) {
        return ResponseEntity.ok(ApiResponseDto.success(messaggio, dati));
    }

    private static Long id(UtenteDetails u) {
        return u != null ? u.getId() : null;
    }

    // ── Stato, panoramica, feed ──

    @GetMapping("/stato")
    public ResponseEntity<ApiResponseDto<MailingDto.Stato>> stato() {
        return ok("Stato", panoramica.stato());
    }

    @GetMapping("/panoramica")
    public ResponseEntity<ApiResponseDto<MailingDto.Panoramica>> panoramica(@RequestParam(defaultValue = "30") int giorni) {
        return ok("Panoramica", panoramica.panoramica(giorni));
    }

    @GetMapping("/attivita")
    public ResponseEntity<ApiResponseDto<List<MailingDto.Attivita>>> attivita(@RequestParam(defaultValue = "30") int limite) {
        return ok("Attività", panoramica.attivita(limite));
    }

    // ── Campagne ──

    @GetMapping("/campagne")
    public ResponseEntity<ApiResponseDto<List<MailingDto.CampagnaRiga>>> campagne(@RequestParam(required = false) String stato) {
        return ok("Campagne", campagne.lista(stato));
    }

    @GetMapping("/campagne/{id}")
    public ResponseEntity<ApiResponseDto<MailingDto.Campagna>> campagna(@PathVariable long id) {
        return ok("Campagna", campagne.dettaglio(id));
    }

    @PostMapping("/campagne")
    public ResponseEntity<ApiResponseDto<MailingDto.Campagna>> crea(@RequestBody MailingDto.CampagnaInput input,
                                                                    @AuthenticationPrincipal UtenteDetails utente) {
        return ok("Campagna creata", campagne.crea(input, id(utente)));
    }

    @PutMapping("/campagne/{id}")
    public ResponseEntity<ApiResponseDto<MailingDto.Campagna>> aggiorna(@PathVariable long id,
                                                                        @RequestBody MailingDto.CampagnaInput input) {
        return ok("Campagna salvata", campagne.aggiorna(id, input));
    }

    @PostMapping("/campagne/{id}/duplica")
    public ResponseEntity<ApiResponseDto<MailingDto.Campagna>> duplica(@PathVariable long id,
                                                                       @AuthenticationPrincipal UtenteDetails utente) {
        return ok("Campagna duplicata", campagne.duplica(id, id(utente)));
    }

    @DeleteMapping("/campagne/{id}")
    public ResponseEntity<ApiResponseDto<Void>> elimina(@PathVariable long id) {
        campagne.elimina(id);
        return ok("Campagna eliminata", null);
    }

    @PostMapping("/pubblico/stima")
    public ResponseEntity<ApiResponseDto<MailingDto.StimaPubblico>> stima(@RequestBody MailingDto.StimaPubblicoInput input) {
        return ok("Stima", campagne.stima(input));
    }

    @PostMapping("/campagne/{id}/test")
    public ResponseEntity<ApiResponseDto<Void>> test(@PathVariable long id, @RequestBody MailingDto.InvioTest input) {
        campagne.invioTest(id, input);
        return ok("Email di prova inviata", null);
    }

    @PostMapping("/prova")
    public ResponseEntity<ApiResponseDto<Void>> prova(@RequestBody MailingDto.InvioProva input) {
        campagne.invioProva(input);
        return ok("Email di prova inviata", null);
    }

    @PostMapping("/campagne/{id}/controlli")
    public ResponseEntity<ApiResponseDto<MailingDto.Controlli>> controlli(@PathVariable long id) {
        return ok("Controlli", campagne.controlli(id));
    }

    @PostMapping("/campagne/{id}/invia")
    public ResponseEntity<ApiResponseDto<MailingDto.Campagna>> invia(@PathVariable long id,
                                                                     @RequestBody(required = false) MailingDto.AvvioInvio input,
                                                                     @AuthenticationPrincipal UtenteDetails utente) {
        MailingDto.Campagna c = campagne.invia(id, input, id(utente));
        return ok("PROGRAMMATA".equals(c.stato()) ? "Campagna programmata" : "Invio avviato", c);
    }

    @PostMapping("/campagne/{id}/pausa")
    public ResponseEntity<ApiResponseDto<MailingDto.Campagna>> pausa(@PathVariable long id) {
        return ok("Campagna in pausa", campagne.pausa(id));
    }

    @PostMapping("/campagne/{id}/riprendi")
    public ResponseEntity<ApiResponseDto<MailingDto.Campagna>> riprendi(@PathVariable long id) {
        return ok("Invio ripreso", campagne.riprendi(id));
    }

    @PostMapping("/campagne/{id}/annulla")
    public ResponseEntity<ApiResponseDto<MailingDto.Campagna>> annulla(@PathVariable long id) {
        return ok("Campagna annullata", campagne.annulla(id));
    }

    @GetMapping("/campagne/{id}/report")
    public ResponseEntity<ApiResponseDto<MailingDto.ReportCampagna>> report(@PathVariable long id) {
        return ok("Report", campagne.report(id));
    }

    @GetMapping("/campagne/{id}/destinatari")
    public ResponseEntity<ApiResponseDto<MailingDto.Pagina<MailingDto.DestinatarioRiga>>> destinatari(
            @PathVariable long id, @RequestParam(defaultValue = "TUTTI") String filtro,
            @RequestParam(defaultValue = "0") int pagina, @RequestParam(defaultValue = "50") int dimensione) {
        return ok("Destinatari", campagne.destinatari(id, filtro, pagina, dimensione));
    }

    // ── Template e immagini ──

    @GetMapping("/template")
    public ResponseEntity<ApiResponseDto<List<MailingDto.TemplateRiga>>> templates() {
        return ok("Template", template.lista());
    }

    @GetMapping("/template/{id}")
    public ResponseEntity<ApiResponseDto<MailingDto.Template>> template(@PathVariable long id) {
        return ok("Template", template.dettaglio(id));
    }

    @PostMapping("/template")
    public ResponseEntity<ApiResponseDto<MailingDto.Template>> creaTemplate(@RequestBody MailingDto.TemplateInput input,
                                                                            @AuthenticationPrincipal UtenteDetails utente) {
        return ok("Template creato", template.crea(input, id(utente)));
    }

    @PutMapping("/template/{id}")
    public ResponseEntity<ApiResponseDto<MailingDto.Template>> aggiornaTemplate(@PathVariable long id,
                                                                                @RequestBody MailingDto.TemplateInput input) {
        return ok("Template salvato", template.aggiorna(id, input));
    }

    @DeleteMapping("/template/{id}")
    public ResponseEntity<ApiResponseDto<MailingDto.Template>> eliminaTemplate(@PathVariable long id) {
        return ok("Template eliminato", template.elimina(id));
    }

    @PostMapping("/immagini")
    public ResponseEntity<ApiResponseDto<MailingDto.Immagine>> immagine(@RequestParam("file") MultipartFile file,
                                                                        @AuthenticationPrincipal UtenteDetails utente) {
        return ok("Immagine caricata", immagini.carica(file, id(utente)));
    }

    // ── Mittenti ──

    @GetMapping("/mittenti")
    public ResponseEntity<ApiResponseDto<List<MailingDto.Mittente>>> mittenti() {
        return ok("Mittenti", mittenti.lista());
    }

    @PostMapping("/mittenti")
    public ResponseEntity<ApiResponseDto<MailingDto.Mittente>> creaMittente(@RequestBody MailingDto.MittenteInput input,
                                                                            @AuthenticationPrincipal UtenteDetails utente) {
        return ok("Mittente aggiunto", mittenti.crea(input, id(utente)));
    }

    @PutMapping("/mittenti/{id}")
    public ResponseEntity<ApiResponseDto<MailingDto.Mittente>> aggiornaMittente(@PathVariable long id,
                                                                                @RequestBody MailingDto.MittenteInput input) {
        return ok("Mittente salvato", mittenti.aggiorna(id, input));
    }

    @DeleteMapping("/mittenti/{id}")
    public ResponseEntity<ApiResponseDto<MailingDto.Mittente>> eliminaMittente(@PathVariable long id) {
        return ok("Mittente eliminato", mittenti.elimina(id));
    }

    @PostMapping("/mittenti/{id}/verifica")
    public ResponseEntity<ApiResponseDto<MailingDto.EsitoVerifica>> verifica(@PathVariable long id,
                                                                             @RequestBody MailingDto.VerificaMittente input) {
        return ok("Verifica", mittenti.verifica(id, input != null ? input.indirizzoTest() : null));
    }

    // ── Job ──

    /** Lettura immediata di rimbalzi e risposte (anche dal monitor dei job). */
    @PostMapping("/rimbalzi/controlla")
    public ResponseEntity<ApiResponseDto<String>> controllaRimbalzi() {
        return ok("Controllo completato", rimbalziJob.esegui());
    }

    @GetMapping("/rimbalzi/controlla/status")
    public ResponseEntity<ApiResponseDto<java.util.Map<String, Object>>> statoRimbalzi() {
        java.util.Map<String, Object> s = new java.util.LinkedHashMap<>();
        s.put("running", rimbalziJob.isRunning());
        s.put("lastRunStartedAt", rimbalziJob.getLastRunStartedAt() != null ? rimbalziJob.getLastRunStartedAt().toString() : null);
        s.put("lastRunFinishedAt", rimbalziJob.getLastRunFinishedAt() != null ? rimbalziJob.getLastRunFinishedAt().toString() : null);
        s.put("lastMessage", rimbalziJob.getLastMessage());
        s.put("lastError", rimbalziJob.getLastError());
        return ok("Stato", s);
    }
}
