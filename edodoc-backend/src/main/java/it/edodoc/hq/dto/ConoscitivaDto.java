package it.edodoc.hq.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/** Prenotazione pubblica della chiamata conoscitiva dal sito. Orari sempre nel fuso di Roma. */
public final class ConoscitivaDto {

    private ConoscitivaDto() {
    }

    /** attiva false: calendario non collegato, il sito mostra il link di riserva. */
    public record Disponibilita(boolean attiva, int durataMinuti, String fuso, List<Giorno> giorni) {
    }

    public record Giorno(LocalDate data, List<String> orari) {
    }

    /**
     * sito: campo esca, nascosto alle persone. Se arriva compilato è un bot.
     * Le risposte del questionario sono obbligatorie sul sito ma facoltative qui: il backend accetta anche il modulo
     * precedente (obiettivo breve e messaggio), così sito e backend si possono pubblicare in qualsiasi ordine.
     */
    public record Prenota(
            @NotNull(message = "Scegli giorno e orario") LocalDateTime inizio,
            @NotBlank(message = "Scrivi il tuo nome") @Size(max = 80, message = "Nome troppo lungo") String nome,
            @Size(max = 80, message = "Cognome troppo lungo") String cognome,
            @NotBlank(message = "Scrivi la tua email") @Email(message = "Questa email non sembra valida") @Size(max = 160) String email,
            @Size(max = 30, message = "Numero troppo lungo") String telefono,
            @Size(max = 2000, message = "Obiettivo troppo lungo: bastano poche righe") String obiettivo,
            @Size(max = 800, message = "Messaggio troppo lungo: bastano poche righe") String messaggio,
            @Size(max = 120, message = "Professione troppo lunga") String professione,
            @Size(max = 40) String conosciutoDa,
            @Size(max = 2000, message = "Risposta sui percorsi precedenti troppo lunga") String percorsiPrecedenti,
            @Size(max = 40) String investimento,
            @Size(max = 80) String priorita,
            @Size(max = 2000, message = "Risposta troppo lunga: bastano poche righe") String percheOra,
            @AssertTrue(message = "Serve il consenso al trattamento dei dati per fissare la chiamata") boolean consenso,
            String sito) {
    }

    public record Conferma(LocalDateTime inizio, LocalDateTime fine, String email, String nome, boolean invitoGoogle) {
    }
}
