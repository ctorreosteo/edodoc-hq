package it.edodoc.hq.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record DashboardDto(
        long pazientiAttivi, long pazientiMantenimento, long lead, long listaAttesa,
        LocalDate settimana, int checkAttesi, int checkCompilati, int checkConSegnali, int daContattareOggi,
        long visiteSettimana, List<VisiteDto.Riga> visiteOggi,
        long taskAperti, long taskInRitardo, List<TaskDto.Riga> taskUrgenti,
        BigDecimal incassatoMese, BigDecimal incassatoAnno, BigDecimal daIncassare, BigDecimal scaduto,
        BigDecimal margineSoglia, boolean candidatureAperte,
        List<Rinnovo> rinnovi, List<IncassoMese> incassiMensili, List<AndamentoCheck> andamentoCheck,
        List<FinanceDto.Scadenza> prossimeScadenze) {

    public record Rinnovo(Long pazienteId, String pazienteNome, Long percorsoId, int visiteFissate, int visiteTotali, LocalDate dataFine) {
    }

    public record IncassoMese(int mese, BigDecimal importo) {
    }

    public record AndamentoCheck(LocalDate settimana, int compilati, int segnali, Double energiaMedia, Double impegnoMedio) {
    }
}
