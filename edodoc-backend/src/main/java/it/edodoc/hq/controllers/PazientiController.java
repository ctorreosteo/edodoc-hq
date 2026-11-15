package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.ApiResponseDto;
import it.edodoc.hq.dto.CheckDto;
import it.edodoc.hq.dto.FattureDto;
import it.edodoc.hq.dto.PagamentiDto;
import it.edodoc.hq.dto.PazientiDto;
import it.edodoc.hq.dto.PercorsiDto;
import it.edodoc.hq.dto.TaskDto;
import it.edodoc.hq.dto.VisiteDto;
import it.edodoc.hq.services.AuthService;
import it.edodoc.hq.services.CheckService;
import it.edodoc.hq.services.CorpoEmail;
import it.edodoc.hq.services.FatturaService;
import it.edodoc.hq.services.GmailService;
import it.edodoc.hq.services.PagamentoService;
import it.edodoc.hq.services.PazienteService;
import it.edodoc.hq.services.PercorsoService;
import it.edodoc.hq.services.TaskService;
import it.edodoc.hq.services.VisitaService;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/pazienti")
public class PazientiController {

    private static final Logger logger = LoggerFactory.getLogger(PazientiController.class);

    private final PazienteService pazienteService;
    private final PercorsoService percorsoService;
    private final VisitaService visitaService;
    private final CheckService checkService;
    private final PagamentoService pagamentoService;
    private final FatturaService fatturaService;
    private final TaskService taskService;
    private final AuthService authService;
    private final GmailService gmailService;

    public PazientiController(PazienteService pazienteService, PercorsoService percorsoService, VisitaService visitaService,
                              CheckService checkService, PagamentoService pagamentoService, FatturaService fatturaService,
                              TaskService taskService, AuthService authService, GmailService gmailService) {
        this.pazienteService = pazienteService;
        this.percorsoService = percorsoService;
        this.visitaService = visitaService;
        this.checkService = checkService;
        this.pagamentoService = pagamentoService;
        this.fatturaService = fatturaService;
        this.taskService = taskService;
        this.authService = authService;
        this.gmailService = gmailService;
    }

    @GetMapping
    public ApiResponseDto<List<PazientiDto.Riga>> lista() {
        return ApiResponseDto.success(pazienteService.lista());
    }

    @GetMapping("/archiviati")
    public ApiResponseDto<List<PazientiDto.Archiviato>> archiviati() {
        return ApiResponseDto.success(pazienteService.archiviati());
    }

    @GetMapping("/{id}")
    public ApiResponseDto<PazientiDto.Riga> dettaglio(@PathVariable Long id) {
        return ApiResponseDto.success(pazienteService.dettaglio(id));
    }

    @PostMapping
    public ApiResponseDto<PazientiDto.Riga> crea(@Valid @RequestBody PazientiDto.Salva richiesta) {
        return ApiResponseDto.success("Paziente creato", pazienteService.crea(richiesta));
    }

    @PutMapping("/{id}")
    public ApiResponseDto<PazientiDto.Riga> aggiorna(@PathVariable Long id, @Valid @RequestBody PazientiDto.Salva richiesta) {
        return ApiResponseDto.success("Paziente aggiornato", pazienteService.aggiorna(id, richiesta));
    }

    @DeleteMapping("/{id}")
    public ApiResponseDto<Void> archivia(@PathVariable Long id) {
        pazienteService.archivia(id);
        return ApiResponseDto.success("Paziente archiviato", null);
    }

    /** Una conferma non partita non annulla nulla: l'indirizzo torna al dottore, che può scrivere a mano. */
    @PostMapping("/{id}/anonimizza")
    public ApiResponseDto<PazientiDto.Anonimizzazione> anonimizza(@PathVariable Long id) {
        String email = pazienteService.anonimizza(id);
        boolean inviata = false;
        if (email != null && gmailService.isAttivo()) {
            try {
                gmailService.invia(email, "Il tuo account EdoDoc è stato eliminato",
                        CorpoEmail.da("Ciao,\n\nabbiamo completato l'eliminazione del tuo account EdoDoc: l'accesso è chiuso e i tuoi dati anagrafici sono stati resi anonimi."
                                + "\n\nLe fatture restano conservate per 10 anni, come richiede la legge."), null, null);
                inviata = true;
            } catch (RuntimeException e) {
                logger.warn("Conferma di anonimizzazione non inviata per il paziente {}: {}", id, e.getMessage());
            }
        }
        return ApiResponseDto.success("Paziente anonimizzato", new PazientiDto.Anonimizzazione(email, inviata));
    }

    @GetMapping("/{id}/percorsi")
    public ApiResponseDto<List<PercorsiDto.Sintesi>> percorsi(@PathVariable Long id) {
        return ApiResponseDto.success(percorsoService.delPaziente(id));
    }

    @GetMapping("/{id}/visite")
    public ApiResponseDto<List<VisiteDto.Riga>> visite(@PathVariable Long id) {
        return ApiResponseDto.success(visitaService.delPaziente(id));
    }

    @GetMapping("/{id}/check")
    public ApiResponseDto<List<CheckDto.Dettaglio>> check(@PathVariable Long id) {
        return ApiResponseDto.success(checkService.storico(id));
    }

    @GetMapping("/{id}/pagamenti")
    public ApiResponseDto<PagamentiDto.Lista> pagamenti(@PathVariable Long id) {
        return ApiResponseDto.success(pagamentoService.delPaziente(id));
    }

    @GetMapping("/{id}/fatture")
    public ApiResponseDto<List<FattureDto.Riga>> fatture(@PathVariable Long id) {
        return ApiResponseDto.success(fatturaService.delPaziente(id));
    }

    @GetMapping("/{id}/task")
    public ApiResponseDto<List<TaskDto.RigaLegacy>> task(@PathVariable Long id) {
        return ApiResponseDto.success(taskService.delPaziente(id));
    }

    /** Il link torna sempre al dottore: l'email può essere spenta. I client di posta spesso non rendono cliccabile edodoc:// */
    @PostMapping("/{id}/invito-app")
    public ApiResponseDto<PazientiDto.InvitoApp> invitoApp(@PathVariable Long id) {
        String link = authService.creaInvitoApp(id);
        boolean inviata = false;
        if (gmailService.isAttivo()) {
            PazientiDto.Riga paziente = pazienteService.dettaglio(id);
            gmailService.invia(paziente.email(), "Il tuo accesso all'app EdoDoc",
                    CorpoEmail.da("Ciao " + paziente.nome() + ",\n\nscarica l'app EdoDoc e imposta la tua password da questo link:\n" + link
                            + "\n\nSe il link non si apre, copialo e incollalo nella schermata di primo accesso dell'app."), null, null);
            inviata = true;
        }
        return ApiResponseDto.success(new PazientiDto.InvitoApp(link, inviata));
    }
}
