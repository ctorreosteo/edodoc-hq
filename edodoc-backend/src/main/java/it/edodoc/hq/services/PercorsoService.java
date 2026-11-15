package it.edodoc.hq.services;

import it.edodoc.hq.dto.PagamentiDto;
import it.edodoc.hq.dto.PercorsiDto;
import it.edodoc.hq.dto.VisiteDto;
import it.edodoc.hq.exception.ConflittoException;
import it.edodoc.hq.exception.RisorsaNonTrovataException;
import it.edodoc.hq.models.Pagamento;
import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.models.Percorso;
import it.edodoc.hq.models.Task;
import it.edodoc.hq.models.Visita;
import it.edodoc.hq.repositories.FatturaRepository;
import it.edodoc.hq.repositories.PagamentoRepository;
import it.edodoc.hq.repositories.PazienteRepository;
import it.edodoc.hq.repositories.PercorsoRepository;
import it.edodoc.hq.repositories.VisitaRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class PercorsoService {

    /** Una rata del piano: tipo, descrizione, importo e scadenza. */
    public record Rata(Pagamento.Tipo tipo, String descrizione, BigDecimal importo, LocalDate scadenza) {
    }

    private final PercorsoRepository percorsoRepository;
    private final PazienteRepository pazienteRepository;
    private final PagamentoRepository pagamentoRepository;
    private final VisitaRepository visitaRepository;
    private final ConfigService configService;
    private final TaskService taskService;
    private final FatturaRepository fatturaRepository;
    private final MailingEventiGestionaleService mailing;

    public PercorsoService(PercorsoRepository percorsoRepository, PazienteRepository pazienteRepository,
                           PagamentoRepository pagamentoRepository, VisitaRepository visitaRepository,
                           ConfigService configService, TaskService taskService,
                           FatturaRepository fatturaRepository, MailingEventiGestionaleService mailing) {
        this.mailing = mailing;
        this.percorsoRepository = percorsoRepository;
        this.pazienteRepository = pazienteRepository;
        this.pagamentoRepository = pagamentoRepository;
        this.visitaRepository = visitaRepository;
        this.configService = configService;
        this.taskService = taskService;
        this.fatturaRepository = fatturaRepository;
    }

    public PercorsiDto.Listino listino() {
        return new PercorsiDto.Listino(
                configService.getDecimale("LISTINO_PAGAMENTO_UNICO"), configService.getDecimale("LISTINO_RATA_PERCORSO"),
                configService.getDecimale("LISTINO_ACCONTO_ATTESA"), configService.getDecimale("LISTINO_MANTENIMENTO"),
                configService.getDecimale("LISTINO_RATA_MANTENIMENTO"));
    }

    /**
     * Rate del percorso. Percorso 6 mesi: 3 rate ogni due mesi. Mantenimento: 2 rate semestrali.
     * L'acconto già incassato si scala dal pagamento in anticipo e si somma alle rate.
     */
    public static List<Rata> calcolaRate(Percorso.Tipo tipo, Percorso.PianoPagamento piano, LocalDate inizio,
                                         PercorsiDto.Listino listino, BigDecimal accontoVersato) {
        boolean mantenimento = tipo == Percorso.Tipo.MANTENIMENTO;
        String nome = mantenimento ? "Mantenimento" : tipo == Percorso.Tipo.RINNOVO ? "Rinnovo 6 mesi" : "Percorso 6 mesi";
        if (piano == Percorso.PianoPagamento.UNICO) {
            BigDecimal prezzo = mantenimento ? listino.mantenimento() : listino.unico();
            return List.of(new Rata(mantenimento ? Pagamento.Tipo.MANTENIMENTO : Pagamento.Tipo.UNICO,
                    nome + ", pagamento in anticipo", prezzo.subtract(accontoVersato), inizio));
        }
        int numero = mantenimento ? 2 : 3;
        int mesiTraRate = mantenimento ? 6 : 2;
        BigDecimal importo = mantenimento ? listino.rataMantenimento() : listino.rataPercorso();
        List<Rata> rate = new ArrayList<>();
        for (int i = 0; i < numero; i++) {
            rate.add(new Rata(Pagamento.Tipo.RATA, nome + ", rata " + (i + 1) + " di " + numero, importo,
                    inizio.plusMonths((long) i * mesiTraRate)));
        }
        return rate;
    }

    @Transactional
    public PercorsiDto.Sintesi crea(PercorsiDto.Crea richiesta) {
        Paziente paziente = pazienteRepository.findByIdAndAttivoTrue(richiesta.pazienteId())
                .orElseThrow(() -> new RisorsaNonTrovataException("Paziente non trovato"));
        Percorso.Tipo tipo = richiesta.tipo();

        percorsoRepository.findFirstByPazienteIdAndStatoOrderByDataInizioDesc(paziente.getId(), Percorso.Stato.ATTIVO)
                .ifPresent(attivo -> {
                    if (tipo == Percorso.Tipo.METODO_BUSSOLA) {
                        throw new ConflittoException("Il paziente ha già un percorso attivo: usa rinnovo o mantenimento");
                    }
                    attivo.setStato(Percorso.Stato.CONCLUSO);
                });

        Percorso.PianoPagamento piano = richiesta.pianoPagamento();
        List<Pagamento> acconti = pagamentoRepository.findDelPaziente(paziente.getId()).stream()
                .filter(p -> p.getTipo() == Pagamento.Tipo.ACCONTO && p.getStato() == Pagamento.Stato.PAGATO && p.getPercorso() == null)
                .toList();
        BigDecimal accontoVersato = acconti.stream().map(Pagamento::getImporto).reduce(BigDecimal.ZERO, BigDecimal::add);

        List<Rata> rate = calcolaRate(tipo, piano, richiesta.dataInizio(), listino(), accontoVersato);
        BigDecimal totale = rate.stream().map(Rata::importo).reduce(accontoVersato, BigDecimal::add);

        Percorso percorso = new Percorso();
        percorso.setPaziente(paziente);
        percorso.setTipo(tipo);
        percorso.setPianoPagamento(piano);
        percorso.setDataInizio(richiesta.dataInizio());
        percorso.setDataFine(richiesta.dataInizio().plusMonths(tipo.mesi));
        percorso.setVisiteTotali(tipo.visite);
        percorso.setImportoTotale(totale);
        percorso.setNote(richiesta.note());
        percorsoRepository.save(percorso);
        mailing.percorsoCreato(percorso.getId());

        acconti.forEach(a -> a.setPercorso(percorso));
        for (Rata rata : rate) {
            Pagamento pagamento = new Pagamento();
            pagamento.setPaziente(paziente);
            pagamento.setPercorso(percorso);
            pagamento.setTipo(rata.tipo());
            pagamento.setDescrizione(rata.descrizione());
            pagamento.setImporto(rata.importo());
            pagamento.setScadenza(rata.scadenza());
            pagamentoRepository.save(pagamento);
        }

        paziente.setStato(tipo == Percorso.Tipo.MANTENIMENTO ? Paziente.Stato.MANTENIMENTO : Paziente.Stato.ATTIVO);
        if (tipo == Percorso.Tipo.METODO_BUSSOLA) {
            taskService.creaAutomatico("esami-percorso-" + percorso.getId(), "PIANI", "Chiedere gli esami del sangue",
                    Task.Priorita.NORMALE, LocalDate.now().plusDays(1), paziente);
        }
        return sintesi(percorso, List.of());
    }

    @Transactional
    public void annulla(Long id) {
        Percorso percorso = percorsoRepository.findById(id)
                .orElseThrow(() -> new RisorsaNonTrovataException("Percorso non trovato"));
        percorso.setStato(Percorso.Stato.ANNULLATO);
        pagamentoRepository.findDelPaziente(percorso.getPaziente().getId()).stream()
                .filter(p -> percorso.equals(p.getPercorso()) && p.getStato() == Pagamento.Stato.DA_PAGARE)
                .forEach(p -> p.setStato(Pagamento.Stato.ANNULLATO));
    }

    @Transactional(readOnly = true)
    public List<PercorsiDto.Sintesi> delPaziente(Long pazienteId) {
        List<PercorsiDto.Sintesi> risultato = new ArrayList<>();
        for (Percorso percorso : percorsoRepository.findByPazienteIdOrderByDataInizioDesc(pazienteId)) {
            risultato.add(sintesi(percorso, visitaRepository.findValideDelPercorso(percorso.getId())));
        }
        return risultato;
    }

    /** Il percorso in corso, altrimenti il più recente. */
    @Transactional(readOnly = true)
    public PercorsiDto.AppRiepilogo delPazienteApp(Long pazienteId) {
        PercorsiDto.AppPercorso percorso = percorsoRepository
                .findFirstByPazienteIdAndStatoOrderByDataInizioDesc(pazienteId, Percorso.Stato.ATTIVO)
                .or(() -> percorsoRepository.findByPazienteIdOrderByDataInizioDesc(pazienteId).stream().findFirst())
                .map(p -> PercorsiDto.AppPercorso.da(sintesi(p, visitaRepository.findValideDelPercorso(p.getId()))))
                .orElse(null);
        List<VisiteDto.AppVisita> visite = new ArrayList<>(visitaRepository.findDelPaziente(pazienteId).stream()
                .map(VisiteDto.AppVisita::da).toList());
        Collections.reverse(visite);
        return new PercorsiDto.AppRiepilogo(percorso, visite);
    }

    /** Una query per ambito, poi tutto si raggruppa per percorso: niente N+1 sull'intero elenco. */
    @Transactional(readOnly = true)
    public PercorsiDto.Acquisti acquisti() {
        LocalDate oggi = LocalDate.now();
        List<Pagamento> pagamenti = pagamentoRepository.findDeiPazienti();
        Set<Long> fatturati = pagamenti.isEmpty() ? Set.of()
                : new HashSet<>(fatturaRepository.findPagamentiFatturati(pagamenti.stream().map(Pagamento::getId).toList()));
        Map<Long, List<Pagamento>> perPercorso = pagamenti.stream().filter(p -> p.getPercorso() != null)
                .collect(Collectors.groupingBy(p -> p.getPercorso().getId()));
        Map<Long, List<Visita>> visite = visitaRepository.findValideConPercorso().stream()
                .collect(Collectors.groupingBy(v -> v.getPercorso().getId()));

        List<PercorsiDto.Acquisto> acquisti = percorsoRepository.findDeiPazienti().stream().map(percorso -> {
            List<Pagamento> delPercorso = perPercorso.getOrDefault(percorso.getId(), List.of());
            return acquisto(percorso, sintesi(percorso, visite.getOrDefault(percorso.getId(), List.of())), delPercorso, fatturati, oggi);
        }).toList();
        List<PagamentiDto.Riga> fuoriPercorso = pagamenti.stream().filter(p -> p.getPercorso() == null)
                .map(p -> PagamentiDto.Riga.da(p, oggi, fatturati.contains(p.getId()))).toList();
        return new PercorsiDto.Acquisti(acquisti, fuoriPercorso);
    }

    static PercorsiDto.Acquisto acquisto(Percorso percorso, PercorsiDto.Sintesi sintesi, List<Pagamento> pagamenti,
                                         Set<Long> fatturati, LocalDate oggi) {
        BigDecimal pagato = BigDecimal.ZERO, daPagare = BigDecimal.ZERO, scaduto = BigDecimal.ZERO;
        LocalDate prossima = null;
        for (Pagamento p : pagamenti) {
            if (p.getStato() == Pagamento.Stato.PAGATO) {
                pagato = pagato.add(p.getImporto());
                continue;
            }
            if (p.isScaduto(oggi)) {
                scaduto = scaduto.add(p.getImporto());
            } else {
                daPagare = daPagare.add(p.getImporto());
            }
            if (prossima == null || p.getScadenza().isBefore(prossima)) {
                prossima = p.getScadenza();
            }
        }
        return new PercorsiDto.Acquisto(sintesi, percorso.getPaziente().getNomeCompleto(), pagato, daPagare, scaduto, prossima,
                pagamenti.stream().map(p -> PagamentiDto.Riga.da(p, oggi, fatturati.contains(p.getId()))).toList());
    }

    public static PercorsiDto.Sintesi sintesi(Percorso p, List<Visita> visite) {
        int effettuate = (int) visite.stream().filter(v -> v.getStato() == Visita.Stato.EFFETTUATA).count();
        return new PercorsiDto.Sintesi(p.getId(), p.getPaziente().getId(), p.getTipo(), p.getPianoPagamento(),
                p.getDataInizio(), p.getDataFine(), p.getVisiteTotali(), visite.size(), effettuate,
                p.getImportoTotale(), p.getStato(), p.getNote());
    }
}
