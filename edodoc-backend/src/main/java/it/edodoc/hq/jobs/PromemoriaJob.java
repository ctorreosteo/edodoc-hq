package it.edodoc.hq.jobs;

import it.edodoc.hq.models.ScadenzaFiscale;
import it.edodoc.hq.models.Task;
import it.edodoc.hq.repositories.ScadenzaFiscaleRepository;
import it.edodoc.hq.services.TaskService;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.YearMonth;

/** I promemoria che oggi stanno nella testa del dottore. La chiave rende ogni esecuzione ripetibile. */
@Component
public class PromemoriaJob {

    private static final int GIORNI_ANTICIPO_SCADENZE = 14;

    private final ScadenzaFiscaleRepository scadenzaRepository;
    private final TaskService taskService;

    public PromemoriaJob(ScadenzaFiscaleRepository scadenzaRepository, TaskService taskService) {
        this.scadenzaRepository = scadenzaRepository;
        this.taskService = taskService;
    }

    @Scheduled(cron = "0 0 7 * * *", zone = "Europe/Rome")
    @Transactional
    public void giornaliero() {
        LocalDate oggi = LocalDate.now();
        for (ScadenzaFiscale s : scadenzaRepository.findByStatoAndDataScadenzaLessThanEqualOrderByDataScadenza(
                ScadenzaFiscale.Stato.DA_PAGARE, oggi.plusDays(GIORNI_ANTICIPO_SCADENZE))) {
            taskService.creaAutomatico("scadenza-" + s.getId(), "FISCO", s.getTitolo(), Task.Priorita.ALTA, s.getDataScadenza(), null);
        }
        YearMonth meseScorso = YearMonth.from(oggi).minusMonths(1);
        taskService.creaAutomatico("tessera-" + meseScorso, "FISCO",
                "Inserire nel Sistema TS le fatture di " + meseScorso, Task.Priorita.MEDIA, oggi.withDayOfMonth(1).plusDays(9), null);
    }
}
