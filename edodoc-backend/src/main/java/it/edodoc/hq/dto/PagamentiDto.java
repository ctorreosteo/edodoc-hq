package it.edodoc.hq.dto;

import it.edodoc.hq.models.Pagamento;
import it.edodoc.hq.models.Percorso;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class PagamentiDto {

    private PagamentiDto() {
    }

    public record Salva(
            @NotNull(message = "Scegli il paziente") Long pazienteId,
            Pagamento.Tipo tipo,
            @NotBlank(message = "La descrizione è obbligatoria") String descrizione,
            @NotNull(message = "Indica l'importo") @DecimalMin(value = "0.01", message = "L'importo deve essere positivo") BigDecimal importo,
            @NotNull(message = "Indica la scadenza") LocalDate scadenza,
            String note) {
    }

    public record Registra(
            @NotNull(message = "Indica la data del pagamento") LocalDate dataPagamento,
            @NotNull(message = "Indica il metodo") Pagamento.Metodo metodo,
            Boolean contabile,
            String note) {
    }

    public record Riga(
            Long id, Long pazienteId, String pazienteNome, Long percorsoId, Percorso.Tipo percorsoTipo, Pagamento.Tipo tipo, String descrizione,
            BigDecimal importo, LocalDate scadenza, Pagamento.Stato stato, boolean scaduto, LocalDate dataPagamento,
            Pagamento.Metodo metodo, boolean contabile, String note, boolean fatturato) {

        public static Riga da(Pagamento p, LocalDate oggi, boolean fatturato) {
            return new Riga(p.getId(), p.getPaziente().getId(), p.getPaziente().getNomeCompleto(),
                    p.getPercorso() != null ? p.getPercorso().getId() : null,
                    p.getPercorso() != null ? p.getPercorso().getTipo() : null, p.getTipo(), p.getDescrizione(),
                    p.getImporto(), p.getScadenza(), p.getStato(), p.isScaduto(oggi), p.getDataPagamento(),
                    p.getMetodo(), Boolean.TRUE.equals(p.getContabile()), p.getNote(), fatturato);
        }
    }

    public record Riepilogo(BigDecimal pagato, BigDecimal daPagare, BigDecimal scaduto) {
    }

    public record Lista(Riepilogo riepilogo, List<Riga> righe) {
    }

    // Vista del paziente: niente note del dottore. fatturaId: la fattura da scaricare, se c'è

    public record AppPagamento(Long id, String descrizione, Pagamento.Tipo tipo, BigDecimal importo, LocalDate scadenza,
                               Pagamento.Stato stato, boolean scaduto, LocalDate dataPagamento, Pagamento.Metodo metodo,
                               Long fatturaId) {
        public static AppPagamento da(Riga r, Long fatturaId) {
            return new AppPagamento(r.id(), r.descrizione(), r.tipo(), r.importo(), r.scadenza(), r.stato(), r.scaduto(),
                    r.dataPagamento(), r.metodo(), fatturaId);
        }
    }

    public record AppLista(Riepilogo riepilogo, List<AppPagamento> righe) {
    }
}
