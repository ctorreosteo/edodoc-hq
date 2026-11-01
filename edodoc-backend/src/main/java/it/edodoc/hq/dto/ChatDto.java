package it.edodoc.hq.dto;

import it.edodoc.hq.models.Messaggio;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

public final class ChatDto {

    private ChatDto() {
    }

    public record Invio(@NotBlank(message = "Scrivi il messaggio") @Size(max = 4000, message = "Messaggio troppo lungo") String testo,
                        UUID clientId) {
    }

    public record RigaMessaggio(Long id, Messaggio.Mittente mittente, String testo, UUID clientId,
                                LocalDateTime inviatoIl, LocalDateTime lettoIl) {
        public static RigaMessaggio da(Messaggio m) {
            return new RigaMessaggio(m.getId(), m.getMittente(), m.getTesto(), m.getClientId(), m.getInviatoIl(), m.getLettoIl());
        }
    }

    public record Conversazione(Long pazienteId, String pazienteNome, RigaMessaggio ultimoMessaggio, long nonLetti) {
    }

    /** Numeri della schermata iniziale e del badge dell'app. */
    public record RiepilogoApp(LocalDate settimana, boolean checkCompilato, long feedbackDaLeggere, long messaggiDaLeggere) {
    }
}
