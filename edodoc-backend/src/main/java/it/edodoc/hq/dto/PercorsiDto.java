package it.edodoc.hq.dto;

import it.edodoc.hq.models.Percorso;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class PercorsiDto {

    private PercorsiDto() {
    }

    public record Crea(
            @NotNull(message = "Scegli il paziente") Long pazienteId,
            @NotNull(message = "Scegli il tipo di percorso") Percorso.Tipo tipo,
            @NotNull(message = "Scegli il piano di pagamento") Percorso.PianoPagamento pianoPagamento,
            @NotNull(message = "Indica la data di inizio") LocalDate dataInizio,
            String note) {
    }

    public record Sintesi(
            Long id, Long pazienteId, Percorso.Tipo tipo, Percorso.PianoPagamento pianoPagamento,
            LocalDate dataInizio, LocalDate dataFine, int visiteTotali, int visiteFissate, int visiteEffettuate,
            BigDecimal importoTotale, Percorso.Stato stato, String note) {
    }

    /** Un acquisto con i suoi pagamenti: chi ha comprato cosa, quanto ha versato e quanto manca. */
    public record Acquisto(Sintesi percorso, String pazienteNome, BigDecimal pagato, BigDecimal daPagare, BigDecimal scaduto,
                           LocalDate prossimaScadenza, List<PagamentiDto.Riga> pagamenti) {
    }

    public record Acquisti(List<Acquisto> percorsi, List<PagamentiDto.Riga> fuoriPercorso) {
    }

    // Vista del paziente: niente note del dottore, importi o piano di pagamento

    public record AppPercorso(Long id, Percorso.Tipo tipo, LocalDate dataInizio, LocalDate dataFine, int visiteTotali,
                              int visiteFissate, int visiteEffettuate, Percorso.Stato stato) {
        public static AppPercorso da(Sintesi s) {
            return new AppPercorso(s.id(), s.tipo(), s.dataInizio(), s.dataFine(), s.visiteTotali(), s.visiteFissate(),
                    s.visiteEffettuate(), s.stato());
        }
    }

    /** percorso: null finché il paziente non ne ha uno. visite: tutte, anche fuori percorso, dalla più vecchia. */
    public record AppRiepilogo(AppPercorso percorso, List<VisiteDto.AppVisita> visite) {
    }

    public record Listino(BigDecimal unico, BigDecimal rataPercorso, BigDecimal acconto,
                          BigDecimal mantenimento, BigDecimal rataMantenimento) {
    }
}
