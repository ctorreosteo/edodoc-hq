package it.edodoc.hq.dto;

import it.edodoc.hq.models.Dispositivo;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public final class AuthDto {

    private AuthDto() {
    }

    public record Login(@NotBlank(message = "Inserisci l'email") String username,
                        @NotBlank(message = "Inserisci la password") String password,
                        Boolean mobile) {
    }

    public record Utente(Long id, String username, String nome, String cognome, String ruolo, Long pazienteId) {
    }

    /** refreshToken: solo per i telefoni, il gestionale web riceve null. */
    public record Sessione(String token, String refreshToken, Utente utente) {
    }

    public record Rinnova(@NotBlank(message = "Sessione scaduta") String refreshToken) {
    }

    public record Logout(@NotBlank(message = "Sessione scaduta") String refreshToken, String pushToken) {
    }

    public record RegistraDispositivo(
            @NotBlank(message = "Token mancante") @Size(max = 255, message = "Token non valido") String pushToken,
            @NotNull(message = "Piattaforma mancante") Dispositivo.Piattaforma piattaforma) {
    }

    public record CambiaPassword(@NotBlank(message = "Inserisci la password attuale") String attuale,
                                 @NotBlank @Size(min = 10, message = "La password deve avere almeno 10 caratteri") String nuova) {
    }

    public record ImpostaPassword(@NotBlank(message = "Link non valido") String token,
                                  @NotBlank @Size(min = 10, message = "La password deve avere almeno 10 caratteri") String password) {
    }
}
