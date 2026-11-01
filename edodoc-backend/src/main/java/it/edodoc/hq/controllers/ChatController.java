package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.ApiResponseDto;
import it.edodoc.hq.dto.ChatDto;
import it.edodoc.hq.models.Messaggio;
import it.edodoc.hq.services.ChatService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Lato dottore. Il paziente scrive da /api/app/messaggi. */
@RestController
@RequestMapping("/api/chat")
public class ChatController {

    private final ChatService chatService;

    public ChatController(ChatService chatService) {
        this.chatService = chatService;
    }

    @GetMapping("/conversazioni")
    public ApiResponseDto<List<ChatDto.Conversazione>> conversazioni() {
        return ApiResponseDto.success(chatService.conversazioni());
    }

    @GetMapping("/{pazienteId}/messaggi")
    public ApiResponseDto<List<ChatDto.RigaMessaggio>> messaggi(@PathVariable Long pazienteId,
                                                                @RequestParam(required = false) Long dopoId,
                                                                @RequestParam(required = false) Long primaDiId,
                                                                @RequestParam(required = false) Integer limite) {
        return ApiResponseDto.success(chatService.messaggi(pazienteId, dopoId, primaDiId, limite));
    }

    @PostMapping("/{pazienteId}/messaggi")
    public ApiResponseDto<ChatDto.RigaMessaggio> scrivi(@PathVariable Long pazienteId, @Valid @RequestBody ChatDto.Invio invio) {
        return ApiResponseDto.success(chatService.scrivi(pazienteId, Messaggio.Mittente.DOTTORE, invio));
    }

    @PostMapping("/{pazienteId}/letti")
    public ApiResponseDto<Void> letti(@PathVariable Long pazienteId) {
        chatService.segnaLetti(pazienteId, Messaggio.Mittente.DOTTORE);
        return ApiResponseDto.success(null);
    }
}
