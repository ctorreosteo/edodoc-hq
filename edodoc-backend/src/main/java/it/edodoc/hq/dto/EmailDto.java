package it.edodoc.hq.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public final class EmailDto {

    private EmailDto() {
    }

    public enum Tipo { SOLLECITO_PAGAMENTO, DATI_FATTURAZIONE, FATTURA }

    /** Basta il riferimento più preciso disponibile: fattura, pagamento o paziente. */
    public record Richiesta(@NotNull(message = "Tipo di email obbligatorio") Tipo tipo,
                            Long pazienteId, Long pagamentoId, Long fatturaId) {
    }

    public record Bozza(Tipo tipo, Long pazienteId, String pazienteNome, Long pagamentoId, Long fatturaId, String mittente,
                        String destinatario, String oggetto, String testo, String allegato, boolean invioAttivo) {
    }

    public record Invia(@NotNull(message = "Tipo di email obbligatorio") Tipo tipo,
                        Long pazienteId, Long pagamentoId, Long fatturaId,
                        @NotBlank(message = "Indica il destinatario") @Email(message = "Email non valida") String destinatario,
                        @NotBlank(message = "L'oggetto è obbligatorio") @Size(max = 200, message = "Oggetto troppo lungo") String oggetto,
                        @NotBlank(message = "Il testo è obbligatorio") String corpo) {
    }
}
