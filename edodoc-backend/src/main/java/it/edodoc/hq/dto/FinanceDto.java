package it.edodoc.hq.dto;

import it.edodoc.hq.models.MovimentoCassa;
import it.edodoc.hq.models.ScadenzaFiscale;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class FinanceDto {

    private FinanceDto() {
    }

    public record Mese(int mese, BigDecimal pazienti, BigDecimal youtube, BigDecimal altro, BigDecimal lordo,
                       BigDecimal impostaSostitutiva, BigDecimal contributoInFattura, BigDecimal cassaPrevidenziale,
                       BigDecimal netto, BigDecimal uscite) {
    }

    /** Scenario di previsione: totale atteso e distanza da obiettivo personale e soglia del forfettario. */
    public record Livello(String nome, String descrizione, BigDecimal totale, BigDecimal margineObiettivo, BigDecimal margineSoglia) {
    }

    public record Riepilogo(
            int anno, List<Mese> mesi, Mese totali, List<Livello> livelli, BigDecimal soglia, BigDecimal obiettivo,
            BigDecimal valoreNuovoCliente, boolean candidatureAperte, BigDecimal saldoCassa) {
    }

    public record SalvaMovimento(
            @NotNull(message = "Indica la data") LocalDate data,
            @NotNull(message = "Indica il tipo") MovimentoCassa.Tipo tipo,
            @NotNull(message = "Indica la categoria") MovimentoCassa.Categoria categoria,
            @NotBlank(message = "La descrizione è obbligatoria") String descrizione,
            @NotNull(message = "Indica l'importo") @DecimalMin(value = "0.01", message = "L'importo deve essere positivo") BigDecimal importo,
            String note) {
    }

    public record Movimento(Long id, LocalDate data, MovimentoCassa.Tipo tipo, MovimentoCassa.Categoria categoria,
                            String descrizione, BigDecimal importo, String note) {
        public static Movimento da(MovimentoCassa m) {
            return new Movimento(m.getId(), m.getData(), m.getTipo(), m.getCategoria(), m.getDescrizione(), m.getImporto(), m.getNote());
        }
    }

    public record SalvaScadenza(
            @NotBlank(message = "Il titolo è obbligatorio") String titolo,
            @NotNull(message = "Indica la categoria") MovimentoCassa.Categoria categoria,
            @NotNull(message = "Indica la data") LocalDate dataScadenza,
            BigDecimal importoStimato,
            String note) {
    }

    public record PagaScadenza(@NotNull(message = "Indica la data") LocalDate data,
                               @NotNull(message = "Indica l'importo") @DecimalMin(value = "0.01", message = "L'importo deve essere positivo") BigDecimal importo) {
    }

    public record Scadenza(Long id, String titolo, MovimentoCassa.Categoria categoria, LocalDate dataScadenza,
                           BigDecimal importoStimato, ScadenzaFiscale.Stato stato, LocalDate pagataIl, String note) {
        public static Scadenza da(ScadenzaFiscale s) {
            return new Scadenza(s.getId(), s.getTitolo(), s.getCategoria(), s.getDataScadenza(), s.getImportoStimato(),
                    s.getStato(), s.getPagataIl(), s.getNote());
        }
    }
}
