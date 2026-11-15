package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.ApiResponseDto;
import it.edodoc.hq.dto.TaskDto;
import it.edodoc.hq.models.Task;
import it.edodoc.hq.security.UtenteDetails;
import it.edodoc.hq.services.TaskColonneService;
import it.edodoc.hq.services.TaskService;
import it.edodoc.hq.services.TaskStrutturaService;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;

/**
 * Task. Gli endpoint della pagina sono quelli di Mobilitas HQ (elenco su /elenco e creazione su /crea);
 * GET e POST /api/task, PUT /{id}, POST /{id}/stato e /struttura restano nella forma di prima per l'app.
 */
@RestController
@RequestMapping("/api/task")
public class TaskController {

    private final TaskService service;
    private final TaskStrutturaService struttura;
    private final TaskColonneService colonne;

    public TaskController(TaskService service, TaskStrutturaService struttura, TaskColonneService colonne) {
        this.service = service;
        this.struttura = struttura;
        this.colonne = colonne;
    }

    // ---------- Forma di prima (app iOS/Android) ----------

    @GetMapping
    public ApiResponseDto<List<TaskDto.RigaLegacy>> lista(@RequestParam(defaultValue = "false") boolean completati) {
        return ApiResponseDto.success(service.listaLegacy(completati));
    }

    @PostMapping
    public ApiResponseDto<TaskDto.RigaLegacy> creaLegacy(@Valid @RequestBody TaskDto.Salva richiesta,
                                                       @AuthenticationPrincipal UtenteDetails utente) {
        return ApiResponseDto.success("Task creato", service.creaLegacy(richiesta, utente.getId()));
    }

    @PutMapping("/{id}")
    public ApiResponseDto<TaskDto.RigaLegacy> aggiornaLegacy(@PathVariable Long id, @Valid @RequestBody TaskDto.Salva richiesta) {
        return ApiResponseDto.success("Task aggiornato", service.aggiornaLegacy(id, richiesta));
    }

    @PostMapping("/{id}/stato")
    public ApiResponseDto<TaskDto.RigaLegacy> cambiaStato(@PathVariable Long id, @RequestParam boolean fatto) {
        return ApiResponseDto.success(service.cambiaStatoLegacy(id, fatto));
    }

    @GetMapping("/struttura")
    public ApiResponseDto<TaskDto.Struttura> struttura() {
        return ApiResponseDto.success(struttura.struttura());
    }

    // ---------- Configurazione e colonne ----------

    @GetMapping("/config")
    public ApiResponseDto<TaskDto.Config> config() {
        return ApiResponseDto.success(service.config());
    }

    @GetMapping("/colonne")
    public ApiResponseDto<List<TaskDto.DisposizioneColonne>> colonne(@AuthenticationPrincipal UtenteDetails utente) {
        return ApiResponseDto.success(colonne.elenco(utente.getId()));
    }

    /** {@code contesto}: "predefinita" o "lista:<id>". */
    @PutMapping("/colonne/{contesto}")
    public ApiResponseDto<TaskDto.DisposizioneColonne> salvaColonne(@PathVariable String contesto,
                                                                   @RequestBody TaskDto.SalvaColonneRequest body,
                                                                   @AuthenticationPrincipal UtenteDetails utente) {
        return ApiResponseDto.success("Colonne salvate", colonne.salva(contesto, body == null ? null : body.colonne(), utente.getId()));
    }

    @DeleteMapping("/colonne/{contesto}")
    public ApiResponseDto<String> ripristinaColonne(@PathVariable String contesto, @AuthenticationPrincipal UtenteDetails utente) {
        colonne.ripristina(contesto, utente.getId());
        return ApiResponseDto.success("Colonne ripristinate", "OK");
    }

    // ---------- Elenco ----------

    @GetMapping("/elenco")
    public ApiResponseDto<List<TaskDto.Riga>> elenco(
            @RequestParam(required = false) TaskService.Vista vista,
            @RequestParam(required = false) Long assegnatoA,
            @RequestParam(required = false) Long listaId,
            @RequestParam(required = false) Long cartellaId,
            @RequestParam(required = false) List<Task.Stato> stati,
            @RequestParam(required = false) Task.Priorita priorita,
            @RequestParam(required = false) Long etichettaId,
            @RequestParam(required = false) Long pazienteId,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate scadenzaDa,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate scadenzaA,
            @RequestParam(defaultValue = "false") boolean includiChiusi,
            @RequestParam(required = false) Integer chiusiGiorni,
            @RequestParam(defaultValue = "false") boolean senzaScadenza,
            @AuthenticationPrincipal UtenteDetails utente) {
        return ApiResponseDto.success(service.elenco(new TaskService.Filtri(utente.getId(), vista, assegnatoA, listaId, cartellaId, stati, priorita, etichettaId,
                pazienteId, q, scadenzaDa, scadenzaA, includiChiusi, chiusiGiorni, senzaScadenza)));
    }

    /** Archivio di completati e annullati, a pagine e con gli stessi filtri dell'elenco. */
    @GetMapping("/chiusi")
    public ApiResponseDto<TaskDto.PaginaChiusi> chiusi(
            @RequestParam(required = false) TaskService.Vista vista,
            @RequestParam(required = false) Long assegnatoA,
            @RequestParam(required = false) Long listaId,
            @RequestParam(required = false) Long cartellaId,
            @RequestParam(required = false) List<Task.Stato> stati,
            @RequestParam(required = false) Task.Priorita priorita,
            @RequestParam(required = false) Long etichettaId,
            @RequestParam(required = false) Long pazienteId,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int pagina,
            @RequestParam(defaultValue = "20") int dimensione,
            @AuthenticationPrincipal UtenteDetails utente) {
        TaskService.Filtri filtri = new TaskService.Filtri(utente.getId(), vista, assegnatoA, listaId, cartellaId, stati, priorita, etichettaId, pazienteId, q,
                null, null, true, 0, false);
        return ApiResponseDto.success(service.elencoChiusi(filtri, pagina, dimensione));
    }

    @GetMapping("/riepilogo")
    public ApiResponseDto<TaskDto.Riepilogo> riepilogo(@AuthenticationPrincipal UtenteDetails utente) {
        return ApiResponseDto.success(service.riepilogo(utente.getId()));
    }

    // ---------- Task ----------

    @PostMapping("/crea")
    public ApiResponseDto<TaskDto.Riga> crea(@RequestBody TaskDto.CreaRequest body, @AuthenticationPrincipal UtenteDetails utente) {
        return ApiResponseDto.success("Task creato", service.creaRiga(body, utente.getId()));
    }

    @GetMapping("/{id}")
    public ApiResponseDto<TaskDto.Dettaglio> dettaglio(@PathVariable Long id) {
        return ApiResponseDto.success(service.dettaglio(id));
    }

    @PatchMapping("/{id}")
    public ApiResponseDto<TaskDto.Dettaglio> aggiorna(@PathVariable Long id, @RequestBody TaskDto.AggiornaRequest body) {
        return ApiResponseDto.success("Task aggiornato", service.aggiorna(id, body));
    }

    @DeleteMapping("/{id}")
    public ApiResponseDto<String> elimina(@PathVariable Long id) {
        service.elimina(id);
        return ApiResponseDto.success("Task eliminato", "OK");
    }

    @PostMapping("/bulk")
    public ApiResponseDto<TaskDto.BulkEsito> bulk(@RequestBody TaskDto.BulkRequest body) {
        return ApiResponseDto.success("Task aggiornati", service.bulk(body));
    }

    // ---------- Gantt: date e dipendenze ----------

    @PostMapping("/dipendenze")
    public ApiResponseDto<List<TaskDto.Dipendenza>> dipendenze(@RequestBody TaskDto.DipendenzeRequest body) {
        return ApiResponseDto.success(service.dipendenze(body));
    }

    @PostMapping("/{id}/dipendenze")
    public ApiResponseDto<TaskDto.Dettaglio> aggiungiDipendenza(@PathVariable Long id, @RequestBody TaskDto.DipendenzaRequest body) {
        return ApiResponseDto.success("Dipendenza aggiunta", service.aggiungiDipendenza(id, body != null ? body.predecessoreId() : null));
    }

    @DeleteMapping("/{id}/dipendenze/{predecessoreId}")
    public ApiResponseDto<TaskDto.Dettaglio> rimuoviDipendenza(@PathVariable Long id, @PathVariable Long predecessoreId) {
        return ApiResponseDto.success("Dipendenza tolta", service.rimuoviDipendenza(id, predecessoreId));
    }

    @PostMapping("/pianifica")
    public ApiResponseDto<List<TaskDto.Riga>> pianifica(@RequestBody TaskDto.PianificaRequest body) {
        return ApiResponseDto.success("Task ripianificati", service.pianifica(body));
    }

    // ---------- Commenti ----------

    @PostMapping("/{id}/commenti")
    public ApiResponseDto<TaskDto.Dettaglio> commenta(@PathVariable Long id, @RequestBody TaskDto.CommentoRequest body) {
        return ApiResponseDto.success("Commento aggiunto",
                service.commenta(id, body != null ? body.testo() : null, body != null ? body.allegati() : null));
    }

    @PutMapping("/{id}/commenti/{commentoId}")
    public ApiResponseDto<TaskDto.Dettaglio> modificaCommento(@PathVariable Long id, @PathVariable Long commentoId,
                                                             @RequestBody TaskDto.CommentoRequest body) {
        return ApiResponseDto.success("Commento modificato", service.modificaCommento(id, commentoId, body != null ? body.testo() : null));
    }

    @DeleteMapping("/{id}/commenti/{commentoId}")
    public ApiResponseDto<TaskDto.Dettaglio> eliminaCommento(@PathVariable Long id, @PathVariable Long commentoId) {
        return ApiResponseDto.success("Commento eliminato", service.eliminaCommento(id, commentoId));
    }

    // ---------- Allegati ----------

    @PostMapping(value = "/{id}/allegati", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponseDto<TaskDto.Allegato> caricaAllegato(@PathVariable Long id, @RequestParam("file") MultipartFile file,
                                                          @RequestParam(value = "commentoId", required = false) Long commentoId) {
        return ApiResponseDto.success("Allegato caricato", service.caricaAllegato(id, file, commentoId));
    }

    /** Il file passa dal backend: con {@code download=true} il browser lo salva invece di mostrarlo. */
    @GetMapping("/{id}/allegati/{allegatoId}/file")
    public ResponseEntity<byte[]> scaricaAllegato(@PathVariable Long id, @PathVariable Long allegatoId,
                                                  @RequestParam(defaultValue = "false") boolean download) {
        TaskService.FileAllegato file = service.scaricaAllegato(id, allegatoId);
        ContentDisposition disposition = (download ? ContentDisposition.attachment() : ContentDisposition.inline())
                .filename(file.nomeFile(), StandardCharsets.UTF_8)
                .build();
        MediaType tipo;
        try {
            tipo = file.contentType() != null ? MediaType.parseMediaType(file.contentType()) : MediaType.APPLICATION_OCTET_STREAM;
        } catch (Exception e) {
            tipo = MediaType.APPLICATION_OCTET_STREAM;
        }
        return ResponseEntity.ok()
                .contentType(tipo)
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .header(HttpHeaders.ACCESS_CONTROL_EXPOSE_HEADERS, HttpHeaders.CONTENT_DISPOSITION)
                .header("X-Content-Type-Options", "nosniff")
                .body(file.contenuto());
    }

    @DeleteMapping("/{id}/allegati/{allegatoId}")
    public ApiResponseDto<TaskDto.Dettaglio> eliminaAllegato(@PathVariable Long id, @PathVariable Long allegatoId) {
        return ApiResponseDto.success("Allegato eliminato", service.eliminaAllegato(id, allegatoId));
    }

    // ---------- Checklist ----------

    @PostMapping("/{id}/checklist")
    public ApiResponseDto<TaskDto.Dettaglio> aggiungiChecklist(@PathVariable Long id, @RequestBody TaskDto.ChecklistRequest body) {
        return ApiResponseDto.success("Voce aggiunta", service.aggiungiChecklist(id, body));
    }

    @PatchMapping("/{id}/checklist/{voceId}")
    public ApiResponseDto<TaskDto.Dettaglio> aggiornaChecklist(@PathVariable Long id, @PathVariable Long voceId,
                                                              @RequestBody TaskDto.ChecklistRequest body) {
        return ApiResponseDto.success("Voce aggiornata", service.aggiornaChecklist(id, voceId, body));
    }

    @DeleteMapping("/{id}/checklist/{voceId}")
    public ApiResponseDto<TaskDto.Dettaglio> eliminaChecklist(@PathVariable Long id, @PathVariable Long voceId) {
        return ApiResponseDto.success("Voce eliminata", service.eliminaChecklist(id, voceId));
    }

    // ---------- Etichette ----------

    @PostMapping("/etichette")
    public ApiResponseDto<TaskDto.Etichetta> creaEtichetta(@RequestBody TaskDto.EtichettaRequest body) {
        return ApiResponseDto.success("Etichetta creata", service.creaEtichetta(body));
    }

    @DeleteMapping("/etichette/{etichettaId}")
    public ApiResponseDto<String> eliminaEtichetta(@PathVariable Long etichettaId) {
        service.eliminaEtichetta(etichettaId);
        return ApiResponseDto.success("Etichetta eliminata", "OK");
    }

    // ---------- Liste e cartelle ----------

    @PostMapping("/liste")
    public ApiResponseDto<TaskDto.Lista> creaLista(@RequestBody TaskDto.ListaRequest body) {
        return ApiResponseDto.success("Lista creata", struttura.creaLista(body));
    }

    @PutMapping("/liste/{id}")
    public ApiResponseDto<TaskDto.Lista> aggiornaLista(@PathVariable Long id, @RequestBody TaskDto.ListaRequest body) {
        return ApiResponseDto.success("Lista aggiornata", struttura.aggiornaLista(id, body));
    }

    @PostMapping("/liste/{id}/sposta")
    public ApiResponseDto<TaskDto.Lista> spostaLista(@PathVariable Long id, @RequestBody TaskDto.SpostaRequest body) {
        return ApiResponseDto.success("Lista spostata", struttura.spostaLista(id, body));
    }

    /** Forma di prima di /sposta. */
    @PutMapping("/liste/{id}/posizione")
    public ApiResponseDto<TaskDto.Lista> posizioneLista(@PathVariable Long id, @RequestBody TaskDto.Sposta body) {
        return ApiResponseDto.success(struttura.spostaLista(id, new TaskDto.SpostaRequest(body.contenitoreId(), body.ordine())));
    }

    @GetMapping("/liste/{id}/conteggio")
    public ApiResponseDto<Long> contaTaskLista(@PathVariable Long id) {
        return ApiResponseDto.success(struttura.contaTask(id));
    }

    /** Elimina la lista con tutti i suoi task. Se contiene task, {@code conferma} deve essere il nome della lista. */
    @DeleteMapping("/liste/{id}")
    public ApiResponseDto<TaskDto.ListaEliminata> eliminaLista(@PathVariable Long id, @RequestParam(required = false) String conferma) {
        TaskDto.ListaEliminata esito = struttura.eliminaLista(id, conferma);
        return ApiResponseDto.success("Lista eliminata con " + esito.taskEliminati() + " task", esito);
    }

    @PostMapping("/cartelle")
    public ApiResponseDto<TaskDto.Cartella> creaCartella(@RequestBody TaskDto.CartellaRequest body) {
        return ApiResponseDto.success("Cartella creata", struttura.creaCartella(body));
    }

    @PutMapping("/cartelle/{id}")
    public ApiResponseDto<TaskDto.Cartella> aggiornaCartella(@PathVariable Long id, @RequestBody TaskDto.CartellaRequest body) {
        return ApiResponseDto.success("Cartella aggiornata", struttura.aggiornaCartella(id, body));
    }

    @PostMapping("/cartelle/{id}/sposta")
    public ApiResponseDto<TaskDto.Cartella> spostaCartella(@PathVariable Long id, @RequestBody TaskDto.SpostaRequest body) {
        return ApiResponseDto.success("Cartella spostata", struttura.spostaCartella(id, body));
    }

    /** Forma di prima di /sposta. */
    @PutMapping("/cartelle/{id}/posizione")
    public ApiResponseDto<TaskDto.Cartella> posizioneCartella(@PathVariable Long id, @RequestBody TaskDto.Sposta body) {
        return ApiResponseDto.success(struttura.spostaCartella(id, new TaskDto.SpostaRequest(body.contenitoreId(), body.ordine())));
    }

    @DeleteMapping("/cartelle/{id}")
    public ApiResponseDto<String> eliminaCartella(@PathVariable Long id) {
        struttura.eliminaCartella(id);
        return ApiResponseDto.success("Cartella eliminata", "OK");
    }
}
