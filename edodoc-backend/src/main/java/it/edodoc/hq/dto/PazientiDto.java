package it.edodoc.hq.dto;

import it.edodoc.hq.models.Paziente;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

public final class PazientiDto {

    private PazientiDto() {
    }

    public record Salva(
            @NotBlank(message = "Il nome è obbligatorio") @Size(max = 100) String nome,
            @NotBlank(message = "Il cognome è obbligatorio") @Size(max = 100) String cognome,
            @Email(message = "Email non valida") String email,
            @Size(max = 30) String cellulare,
            @Pattern(regexp = "^$|^[A-Za-z0-9]{16}$", message = "Il codice fiscale deve avere 16 caratteri") String codiceFiscale,
            LocalDate dataNascita,
            String indirizzo,
            String cap,
            String citta,
            @Size(max = 5) String provincia,
            Paziente.Stato stato,
            Paziente.Fonte fonte,
            String situazione,
            String nota,
            BigDecimal pesoInizialeKg,
            BigDecimal pesoObiettivoKg) {
    }

    /** situazionePagamenti: IN_REGOLA, DA_PAGARE (rate future), SCADUTO (almeno una rata scaduta). */
    public record Riga(
            Long id, String nome, String cognome, String email, String cellulare, String codiceFiscale,
            LocalDate dataNascita, String indirizzo, String cap, String citta, String provincia,
            Paziente.Stato stato, Paziente.Fonte fonte, String situazione, String nota,
            BigDecimal pesoInizialeKg, BigDecimal pesoObiettivoKg, LocalDateTime createdAt,
            PercorsiDto.Sintesi percorso,
            LocalDateTime prossimaVisita,
            String situazionePagamenti,
            BigDecimal residuo,
            boolean checkSettimana,
            boolean accessoApp) {
    }

    public record InvitoApp(String link, boolean emailInviata) {
    }
}
