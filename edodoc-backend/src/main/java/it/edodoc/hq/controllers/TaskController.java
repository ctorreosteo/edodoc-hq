package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.ApiResponseDto;
import it.edodoc.hq.dto.TaskDto;
import it.edodoc.hq.services.TaskService;
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

    public TaskController(TaskService taskService) {
        this.taskService = taskService;
    }

    @GetMapping
    public ApiResponseDto<List<TaskDto.Riga>> lista(@RequestParam(defaultValue = "false") boolean completati) {
        return ApiResponseDto.success(taskService.lista(completati));
    }

    @GetMapping("/tipi")
    public ApiResponseDto<List<TaskDto.Tipo>> tipi() {
        return ApiResponseDto.success(taskService.tipi());
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
}
