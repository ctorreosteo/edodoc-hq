package it.edodoc.hq.services;

import it.edodoc.hq.dto.CheckDto;
import it.edodoc.hq.dto.DashboardDto;
import it.edodoc.hq.dto.FinanceDto;
import it.edodoc.hq.dto.PagamentiDto;
import it.edodoc.hq.dto.TaskDto;
import it.edodoc.hq.dto.VisiteDto;
import it.edodoc.hq.models.CheckSettimanale;
import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.models.Percorso;
import it.edodoc.hq.models.ScadenzaFiscale;
import it.edodoc.hq.models.Task;
import it.edodoc.hq.models.Visita;
import it.edodoc.hq.repositories.CheckSettimanaleRepository;
import it.edodoc.hq.repositories.PazienteRepository;
import it.edodoc.hq.repositories.PercorsoRepository;
import it.edodoc.hq.repositories.ScadenzaFiscaleRepository;
import it.edodoc.hq.repositories.TaskRepository;
import it.edodoc.hq.repositories.VisitaRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.OptionalDouble;
import java.util.TreeMap;
import java.util.stream.Collectors;

@Service
public class DashboardService {

    private static final int GIORNI_RINNOVI = 60;
    private static final int SETTIMANE_ANDAMENTO = 8;

    private final PazienteRepository pazienteRepository;
    private final CheckService checkService;
    private final VisitaService visitaService;
    private final VisitaRepository visitaRepository;
    private final TaskRepository taskRepository;
    private final PagamentoService pagamentoService;
    private final FinanceService financeService;
    private final PercorsoRepository percorsoRepository;
    private final CheckSettimanaleRepository checkRepository;
    private final ScadenzaFiscaleRepository scadenzaRepository;

    public DashboardService(PazienteRepository pazienteRepository, CheckService checkService, VisitaService visitaService,
                            VisitaRepository visitaRepository, TaskRepository taskRepository,
                            PagamentoService pagamentoService, FinanceService financeService,
                            PercorsoRepository percorsoRepository, CheckSettimanaleRepository checkRepository,
                            ScadenzaFiscaleRepository scadenzaRepository) {
        this.pazienteRepository = pazienteRepository;
        this.checkService = checkService;
        this.visitaService = visitaService;
        this.visitaRepository = visitaRepository;
        this.taskRepository = taskRepository;
        this.pagamentoService = pagamentoService;
        this.financeService = financeService;
        this.percorsoRepository = percorsoRepository;
        this.checkRepository = checkRepository;
        this.scadenzaRepository = scadenzaRepository;
    }

    @Transactional(readOnly = true)
    public DashboardDto dashboard() {
        LocalDate oggi = LocalDate.now();
        LocalDate settimana = CheckService.settimanaDi(oggi);
        CheckDto.Settimana check = checkService.settimana(settimana);
        int daContattare = oggi.getDayOfWeek() == DayOfWeek.WEDNESDAY ? check.daContattareMercoledi() : check.daContattareLunedi();

        LocalDate lunedi = oggi.with(DayOfWeek.MONDAY);
        long visiteSettimana = visitaRepository.countByStatoInAndInizioBetween(
                List.of(Visita.Stato.PROGRAMMATA, Visita.Stato.EFFETTUATA), lunedi.atStartOfDay(), lunedi.plusDays(7).atStartOfDay());
        List<VisiteDto.Riga> visiteOggi = visitaService.nelPeriodo(oggi, oggi).stream()
                .filter(v -> v.stato() != Visita.Stato.ANNULLATA).toList();

        List<TaskDto.Riga> taskUrgenti = taskRepository.findAperti().stream().limit(6)
                .map(t -> TaskDto.Riga.da(t, oggi)).toList();

        FinanceDto.Riepilogo finance = financeService.riepilogo(oggi.getYear(), oggi);
        BigDecimal incassatoAnno = finance.totali().lordo();
        BigDecimal incassatoMese = finance.mesi().get(oggi.getMonthValue() - 1).lordo();
        PagamentiDto.Lista tutti = pagamentoService.nelPeriodo(oggi.minusYears(2), oggi.plusYears(2));

        List<DashboardDto.Rinnovo> rinnovi = new ArrayList<>();
        for (Percorso p : percorsoRepository.findAttiviInScadenza(oggi.minusDays(30), oggi.plusDays(GIORNI_RINNOVI))) {
            int fissate = visitaRepository.findValideDelPercorso(p.getId()).size();
            rinnovi.add(new DashboardDto.Rinnovo(p.getPaziente().getId(), p.getPaziente().getNomeCompleto(), p.getId(),
                    fissate, p.getVisiteTotali(), p.getDataFine()));
        }

        List<DashboardDto.IncassoMese> incassi = finance.mesi().stream()
                .map(m -> new DashboardDto.IncassoMese(m.mese(), m.lordo())).toList();

        List<FinanceDto.Scadenza> scadenze = scadenzaRepository
                .findByStatoAndDataScadenzaLessThanEqualOrderByDataScadenza(ScadenzaFiscale.Stato.DA_PAGARE, oggi.plusDays(90))
                .stream().limit(5).map(FinanceDto.Scadenza::da).toList();

        return new DashboardDto(
                pazienteRepository.countByAttivoTrueAndStato(Paziente.Stato.ATTIVO),
                pazienteRepository.countByAttivoTrueAndStato(Paziente.Stato.MANTENIMENTO),
                pazienteRepository.countByAttivoTrueAndStato(Paziente.Stato.LEAD),
                pazienteRepository.countByAttivoTrueAndStato(Paziente.Stato.LISTA_ATTESA),
                settimana, check.attesi(), check.compilati(), check.conSegnali(), daContattare,
                visiteSettimana, visiteOggi,
                taskRepository.countByStato(Task.Stato.DA_FARE),
                taskRepository.countByStatoAndScadenzaBefore(Task.Stato.DA_FARE, oggi),
                taskUrgenti,
                incassatoMese, incassatoAnno,
                tutti.riepilogo().daPagare().add(tutti.riepilogo().scaduto()), tutti.riepilogo().scaduto(),
                finance.livelli().get(0).margineSoglia(), finance.candidatureAperte(),
                rinnovi, incassi, andamento(settimana), scadenze);
    }

    private List<DashboardDto.AndamentoCheck> andamento(LocalDate settimana) {
        Map<LocalDate, List<CheckSettimanale>> perSettimana = new TreeMap<>(
                checkRepository.findDalla(settimana.minusWeeks(SETTIMANE_ANDAMENTO - 1)).stream()
                        .collect(Collectors.groupingBy(CheckSettimanale::getSettimana)));
        List<DashboardDto.AndamentoCheck> andamento = new ArrayList<>();
        for (int i = SETTIMANE_ANDAMENTO - 1; i >= 0; i--) {
            LocalDate lunedi = settimana.minusWeeks(i);
            List<CheckSettimanale> check = perSettimana.getOrDefault(lunedi, List.of());
            andamento.add(new DashboardDto.AndamentoCheck(lunedi, check.size(),
                    (int) check.stream().filter(CheckSettimanale::haSegnali).count(),
                    media(check.stream().filter(c -> c.getEnergia() != null).mapToInt(CheckSettimanale::getEnergia).average()),
                    media(check.stream().filter(c -> c.getImpegno() != null).mapToInt(CheckSettimanale::getImpegno).average())));
        }
        return andamento;
    }

    private static Double media(OptionalDouble valore) {
        return valore.isPresent() ? Math.round(valore.getAsDouble() * 10) / 10.0 : null;
    }
}
