package it.edodoc.hq.dto;

import it.edodoc.hq.models.CheckSettimanale;
import it.edodoc.hq.models.Paziente;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public final class CheckDto {

    private CheckDto() {
    }

    /** Le otto domande del Google Form, senza il nome: nell'app il paziente è già autenticato. */
    public record Risposte(
            @NotNull(message = "Indica i pasti eseguiti") @Min(0) @Max(21) Integer pastiOttimali,
            String pastiLiberi,
            @NotNull(message = "Indica l'energia") @Min(1) @Max(5) Integer energia,
            String allenamento,
            @DecimalMin(value = "20", message = "Peso non valido") @DecimalMax(value = "400", message = "Peso non valido") BigDecimal pesoKg,
            String andamentoPeso,
            String percezione,
            Boolean percezioneMigliorata,
            @NotNull(message = "Indica l'impegno") @Min(1) @Max(5) Integer impegno) {
    }

    public record Dettaglio(
            Long id, Long pazienteId, String pazienteNome, LocalDate settimana, LocalDateTime compilatoIl,
            CheckSettimanale.Fonte fonte, Integer pastiOttimali, String pastiLiberi, Integer energia,
            String allenamento, BigDecimal pesoKg, String andamentoPeso, String percezione,
            Boolean percezioneMigliorata, Integer impegno, boolean pesoFermo, boolean percezioneNegativa,
            boolean energiaBassa, LocalDateTime lettoIl, String feedback, LocalDateTime feedbackIl,
            LocalDateTime feedbackLettoIl, UUID feedbackAudioId, Integer feedbackAudioSecondi,
            LocalDateTime feedbackEmailIl) {

        public static Dettaglio da(CheckSettimanale c) {
            return new Dettaglio(c.getId(), c.getPaziente().getId(), c.getPaziente().getNomeCompleto(),
                    c.getSettimana(), c.getCompilatoIl(), c.getFonte(), c.getPastiOttimali(), c.getPastiLiberi(),
                    c.getEnergia(), c.getAllenamento(), c.getPesoKg(), c.getAndamentoPeso(), c.getPercezione(),
                    c.getPercezioneMigliorata(), c.getImpegno(), c.getPesoFermo(), c.getPercezioneNegativa(),
                    c.getEnergiaBassa(), c.getLettoIl(), c.getFeedback(), c.getFeedbackIl(), c.getFeedbackLettoIl(),
                    c.getFeedbackAudioId(), c.getFeedbackAudioSecondi(), c.getFeedbackEmailIl());
        }
    }

    /** inviaEmail: facoltativo. Senza, il paziente vede il feedback solo nell'app. */
    public record Feedback(@NotBlank(message = "Scrivi il feedback") @Size(max = 4000, message = "Feedback troppo lungo") String testo,
                           Boolean inviaEmail) {
    }

    public enum Azione { SOLLECITO, MESSAGGIO_DEDICATO, MESSAGGIO_STANDARD }

    public record RigaSettimana(
            Long pazienteId, String pazienteNome, String cellulare, Paziente.Stato statoPaziente, String situazione,
            String nota, Azione azione, Dettaglio check, LocalDateTime lunediFattoIl, LocalDateTime mercolediFattoIl) {
    }

    public record Settimana(
            LocalDate settimana, int attesi, int compilati, int conSegnali,
            int daContattareLunedi, int daContattareMercoledi, List<RigaSettimana> righe) {
    }

    public record Contatto(
            @NotNull(message = "Paziente obbligatorio") Long pazienteId,
            @NotNull(message = "Settimana obbligatoria") LocalDate settimana,
            @NotNull(message = "Giorno obbligatorio") Giorno giorno,
            boolean fatto) {
    }

    public enum Giorno { LUNEDI, MERCOLEDI }

    public record StatoApp(LocalDate settimana, boolean compilato, Dettaglio check) {
    }
}
