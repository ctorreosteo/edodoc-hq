package it.edodoc.hq.dto;

import it.edodoc.hq.models.Fattura;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

public final class FattureDto {

    private FattureDto() {
    }

    /** Da un pagamento già incassato (pagamentoId) oppure libera (pazienteId e importo). */
    public record Emetti(
            Long pagamentoId,
            Long pazienteId,
            @DecimalMin(value = "0.01", message = "L'importo deve essere positivo") BigDecimal importo,
            LocalDate data,
            String descrizione,
            Boolean tsOpposizione) {
    }

    public record Anteprima(
            int numero, LocalDate data, String intestatario, String indirizzo, String codiceFiscale, String descrizione,
            BigDecimal imponibile, BigDecimal contributo, BigDecimal bollo, BigDecimal importoTotale) {
    }

    public record Annulla(@NotBlank(message = "Indica il motivo") String motivo) {
    }

    public record Riga(
            Long id, int numero, LocalDate dataEmissione, Fattura.Stato stato, Long pazienteId, Long pagamentoId, String pagamentoDescrizione,
            String intestatario, String indirizzo, String codiceFiscale, String descrizione, BigDecimal imponibile,
            BigDecimal contributo, BigDecimal bollo, BigDecimal importoTotale, String motivoAnnullamento,
            String emailPaziente, String emailDestinatario, LocalDateTime emailInviataIl,
            Fattura.TesseraSanitaria tsStato, LocalDateTime tsInseritaIl, boolean tsOpposizione, String nomeFile) {

        public static Riga da(Fattura f) {
            return new Riga(f.getId(), f.getNumero(), f.getDataEmissione(), f.getStato(), f.getPaziente().getId(),
                    f.getPagamento() != null ? f.getPagamento().getId() : null,
                    f.getPagamento() != null ? f.getPagamento().getDescrizione() : null, f.getIntestatario(), f.getIndirizzo(),
                    f.getCodiceFiscale(), f.getDescrizione(), f.getImponibile(), f.getContributo(), f.getBollo(),
                    f.getImportoTotale(), f.getMotivoAnnullamento(), f.getPaziente().getEmail(),
                    f.getEmailDestinatario(), f.getEmailInviataIl(), f.getTsStato(), f.getTsInseritaIl(),
                    f.getTsOpposizione(), f.getNomeFile());
        }
    }

    /** Vista del paziente: niente Tessera Sanitaria né dati di annullamento. */
    public record AppFattura(Long id, int numero, LocalDate dataEmissione, String descrizione, BigDecimal importoTotale,
                             String nomeFile) {
        public static AppFattura da(Fattura f) {
            return new AppFattura(f.getId(), f.getNumero(), f.getDataEmissione(), f.getDescrizione(), f.getImportoTotale(),
                    f.getNomeFile());
        }
    }

    /** I quattro campi che cambiano nell'inserimento manuale sul Sistema TS. */
    public record RigaTessera(Long fatturaId, int numero, LocalDate data, String codiceFiscale, BigDecimal importo) {
    }
}
