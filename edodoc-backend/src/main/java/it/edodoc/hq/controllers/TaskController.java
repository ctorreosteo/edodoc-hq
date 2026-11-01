package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.ApiResponseDto;
import it.edodoc.hq.dto.TaskDto;
import it.edodoc.hq.services.TaskService;
import it.edodoc.hq.services.TaskStrutturaService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/task")
public class TaskController {

    private final TaskService taskService;
    private final TaskStrutturaService strutturaService;

    public TaskController(TaskService taskService, TaskStrutturaService strutturaService) {
        this.taskService = taskService;
        this.strutturaService = strutturaService;
    }

    @GetMapping
    public ApiResponseDto<List<TaskDto.Riga>> lista(@RequestParam(defaultValue = "false") boolean completati) {
        return ApiResponseDto.success(taskService.lista(completati));
    }

    @PostMapping
    public ApiResponseDto<TaskDto.Riga> crea(@Valid @RequestBody TaskDto.Salva richiesta) {
        return ApiResponseDto.success("Task creato", taskService.crea(richiesta));
    }

    @PutMapping("/{id}")
    public ApiResponseDto<TaskDto.Riga> aggiorna(@PathVariable Long id, @Valid @RequestBody TaskDto.Salva richiesta) {
        return ApiResponseDto.success("Task aggiornato", taskService.aggiorna(id, richiesta));
    }

    @PostMapping("/{id}/stato")
    public ApiResponseDto<TaskDto.Riga> cambiaStato(@PathVariable Long id, @RequestParam boolean fatto) {
        return ApiResponseDto.success(taskService.cambiaStato(id, fatto));
    }

    @DeleteMapping("/{id}")
    public ApiResponseDto<Void> elimina(@PathVariable Long id) {
        taskService.elimina(id);
        return ApiResponseDto.success("Task eliminato", null);
    }

    @GetMapping("/struttura")
    public ApiResponseDto<TaskDto.Struttura> struttura() {
        return ApiResponseDto.success(strutturaService.struttura());
    }

    @PostMapping("/cartelle")
    public ApiResponseDto<TaskDto.Cartella> creaCartella(@Valid @RequestBody TaskDto.SalvaCartella richiesta) {
        return ApiResponseDto.success("Cartella creata", strutturaService.creaCartella(richiesta));
    }

    @PutMapping("/cartelle/{id}")
    public ApiResponseDto<TaskDto.Cartella> modificaCartella(@PathVariable Long id, @Valid @RequestBody TaskDto.ModificaStruttura richiesta) {
        return ApiResponseDto.success(strutturaService.modificaCartella(id, richiesta));
    }

    @PutMapping("/cartelle/{id}/posizione")
    public ApiResponseDto<TaskDto.Cartella> spostaCartella(@PathVariable Long id, @RequestBody TaskDto.Sposta richiesta) {
        return ApiResponseDto.success(strutturaService.spostaCartella(id, richiesta));
    }

    @DeleteMapping("/cartelle/{id}")
    public ApiResponseDto<Void> eliminaCartella(@PathVariable Long id) {
        strutturaService.eliminaCartella(id);
        return ApiResponseDto.success("Cartella eliminata", null);
    }

    @PostMapping("/liste")
    public ApiResponseDto<TaskDto.Lista> creaLista(@Valid @RequestBody TaskDto.SalvaLista richiesta) {
        return ApiResponseDto.success("Lista creata", strutturaService.creaLista(richiesta));
    }

    @PutMapping("/liste/{id}")
    public ApiResponseDto<TaskDto.Lista> modificaLista(@PathVariable Long id, @Valid @RequestBody TaskDto.ModificaStruttura richiesta) {
        return ApiResponseDto.success(strutturaService.modificaLista(id, richiesta));
    }

    @PutMapping("/liste/{id}/posizione")
    public ApiResponseDto<TaskDto.Lista> spostaLista(@PathVariable Long id, @RequestBody TaskDto.Sposta richiesta) {
        return ApiResponseDto.success(strutturaService.spostaLista(id, richiesta));
    }

    @GetMapping("/liste/{id}/conteggio")
    public ApiResponseDto<Long> contaTaskLista(@PathVariable Long id) {
        return ApiResponseDto.success(strutturaService.contaTask(id));
    }

    @DeleteMapping("/liste/{id}")
    public ApiResponseDto<Void> eliminaLista(@PathVariable Long id, @RequestParam(required = false) String conferma) {
        strutturaService.eliminaLista(id, conferma);
        return ApiResponseDto.success("Lista eliminata", null);
    }
}
