package it.edodoc.hq.dto;

import it.edodoc.hq.models.Prenotazione;
import it.edodoc.hq.models.PrenotazioneEvento;
import it.edodoc.hq.models.Visita;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;
import java.util.List;

public final class PrenotazioniDto {

    private PrenotazioniDto() {
    }

    /**
     * Lo stato che vede il dottore, ricavato dalla visita: IN_PROGRAMMA (futura), DA_CHIUDERE (passata ma ancora
     * programmata), SVOLTA, NON_PRESENTATO, DISDETTA (la persona ha rinunciato), ANNULLATA (l'ha annullata il dottore).
     */
    public enum Stato { IN_PROGRAMMA, DA_CHIUDERE, SVOLTA, NON_PRESENTATO, DISDETTA, ANNULLATA }

    public record Riga(
            Long id, Long visitaId, Long pazienteId, String nome, String cognome, String email, String cellulare,
            String obiettivo, String messaggio, String professione, String conosciutoDa, String percorsiPrecedenti,
            String investimento, String priorita, String percheOra, boolean nuovoContatto, LocalDateTime inizio, LocalDateTime fine,
            Stato stato, Prenotazione.RispostaInvito rispostaInvito, Prenotazione.Esito esito, boolean esitoAutomatico,
            String meetUrl, Visita.GoogleSync googleSyncStato, String googleSyncErrore, LocalDateTime createdAt,
            LocalDateTime disdettaIl, Prenotazione.DisdettaDa disdettaDa, String disdettaMotivo, String noteDottore,
            String statoPaziente) {
    }

    public record Evento(PrenotazioneEvento.Tipo tipo, String testo, LocalDateTime quando) {
        public static Evento da(PrenotazioneEvento e) {
            return new Evento(e.getTipo(), e.getTesto(), e.getCreatedAt());
        }
    }

    public record Dettaglio(Riga riga, List<Evento> cronologia, long altreChiamate) {
    }

    public record Sposta(@NotNull(message = "Scegli giorno e ora") LocalDateTime inizio) {
    }

    public record CambiaStato(@NotNull(message = "Scegli lo stato") Stato stato,
                              @Size(max = 255, message = "Motivo troppo lungo") String motivo) {
    }

    public record Contatto(
            @NotBlank(message = "Il nome è obbligatorio") @Size(max = 80) String nome,
            @NotBlank(message = "Il cognome è obbligatorio") @Size(max = 80) String cognome,
            @NotBlank(message = "L'email serve per l'invito") @Email(message = "Email non valida") @Size(max = 160) String email,
            @Size(max = 30) String cellulare) {
    }

    /** esito null: nessun esito scelto. */
    public record Esito(Prenotazione.Esito esito, @Size(max = 4000, message = "Note troppo lunghe") String noteDottore) {
    }
}
