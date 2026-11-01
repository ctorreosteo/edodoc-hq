package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.AgendaDto;
import it.edodoc.hq.dto.ApiResponseDto;
import it.edodoc.hq.services.AgendaFonte.Ambito;
import it.edodoc.hq.services.AgendaService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Pagina Calendario: il Google Calendar del dottore, in diretta. Il calendario arriva come id di Google ("primary" per il suo). */
@RestController
@RequestMapping("/api/agenda")
public class AgendaController {

    private final AgendaService agenda;

    public AgendaController(AgendaService agenda) {
        this.agenda = agenda;
    }

    @GetMapping("/stato")
    public ApiResponseDto<AgendaDto.Stato> stato() {
        return ApiResponseDto.success(agenda.fonte().stato());
    }

    @GetMapping("/eventi")
    public ApiResponseDto<AgendaDto.Eventi> eventi(@RequestParam(name = "calendario", required = false) List<String> calendari,
                                                   @RequestParam String da, @RequestParam String a) {
        return ApiResponseDto.success(agenda.fonte().eventi(calendari, da, a));
    }

    @GetMapping("/novita")
    public ApiResponseDto<AgendaDto.Novita> novita(@RequestParam(name = "calendario", required = false) List<String> calendari,
                                                   @RequestParam(defaultValue = "0") long dal) {
        return ApiResponseDto.success(agenda.fonte().novita(calendari, dal));
    }

    @GetMapping("/cerca")
    public ApiResponseDto<List<AgendaDto.Evento>> cerca(@RequestParam String q,
                                                        @RequestParam(name = "calendario", required = false) List<String> calendari) {
        return ApiResponseDto.success(agenda.fonte().cerca(q, calendari));
    }

    @GetMapping("/calendari/{calendarioId}/eventi/{eventoId}")
    public ApiResponseDto<AgendaDto.Evento> evento(@PathVariable String calendarioId, @PathVariable String eventoId) {
        return ApiResponseDto.success(agenda.fonte().evento(calendarioId, eventoId));
    }

    @PostMapping("/calendari/{calendarioId}/eventi")
    public ApiResponseDto<AgendaDto.Evento> crea(@PathVariable String calendarioId, @RequestBody AgendaDto.EventoRequest req,
                                                 @RequestParam(defaultValue = "true") boolean notifica) {
        return ApiResponseDto.success("Evento creato", agenda.fonte().crea(calendarioId, req, notifica));
    }

    @PatchMapping("/calendari/{calendarioId}/eventi/{eventoId}")
    public ApiResponseDto<AgendaDto.Evento> modifica(@PathVariable String calendarioId, @PathVariable String eventoId,
                                                     @RequestBody AgendaDto.EventoRequest req,
                                                     @RequestParam(defaultValue = "QUESTO") Ambito ambito,
                                                     @RequestParam(defaultValue = "true") boolean notifica) {
        return ApiResponseDto.success("Evento aggiornato", agenda.fonte().modifica(calendarioId, eventoId, req, ambito, notifica));
    }

    @DeleteMapping("/calendari/{calendarioId}/eventi/{eventoId}")
    public ApiResponseDto<Void> elimina(@PathVariable String calendarioId, @PathVariable String eventoId,
                                        @RequestParam(defaultValue = "QUESTO") Ambito ambito,
                                        @RequestParam(defaultValue = "true") boolean notifica) {
        agenda.fonte().elimina(calendarioId, eventoId, ambito, notifica);
        return ApiResponseDto.success("Evento eliminato", null);
    }

    @PostMapping("/calendari/{calendarioId}/eventi/{eventoId}/sposta")
    public ApiResponseDto<AgendaDto.Evento> sposta(@PathVariable String calendarioId, @PathVariable String eventoId,
                                                   @RequestBody AgendaDto.SpostaRequest req,
                                                   @RequestParam(defaultValue = "false") boolean notifica) {
        return ApiResponseDto.success("Evento spostato", agenda.fonte().sposta(calendarioId, eventoId, req.calendarioDestinazione(), notifica));
    }

    @PostMapping("/calendari/{calendarioId}/eventi/{eventoId}/risposta")
    public ApiResponseDto<AgendaDto.Evento> rispondi(@PathVariable String calendarioId, @PathVariable String eventoId,
                                                     @RequestBody AgendaDto.RispostaRequest req,
                                                     @RequestParam(defaultValue = "QUESTO") Ambito ambito) {
        return ApiResponseDto.success("Risposta inviata", agenda.fonte().rispondi(calendarioId, eventoId, req, ambito));
    }

    @GetMapping("/contatti")
    public ApiResponseDto<List<AgendaDto.Contatto>> contatti() {
        return ApiResponseDto.success(agenda.contatti());
    }

    @PostMapping("/disponibilita")
    public ApiResponseDto<List<AgendaDto.Disponibilita>> disponibilita(@RequestBody AgendaDto.DisponibilitaRequest req) {
        return ApiResponseDto.success(agenda.fonte().disponibilita(req));
    }
}
