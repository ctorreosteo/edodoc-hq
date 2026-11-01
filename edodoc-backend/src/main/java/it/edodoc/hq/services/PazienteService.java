package it.edodoc.hq.services;

import it.edodoc.hq.dto.PazientiDto;
import it.edodoc.hq.dto.PercorsiDto;
import it.edodoc.hq.exception.ConflittoException;
import it.edodoc.hq.exception.RisorsaNonTrovataException;
import it.edodoc.hq.models.Fattura;
import it.edodoc.hq.models.Pagamento;
import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.models.Percorso;
import it.edodoc.hq.models.Task;
import it.edodoc.hq.models.Utente;
import it.edodoc.hq.models.Visita;
import it.edodoc.hq.repositories.CheckSettimanaleRepository;
import it.edodoc.hq.repositories.DispositivoRepository;
import it.edodoc.hq.repositories.FatturaRepository;
import it.edodoc.hq.repositories.PagamentoRepository;
import it.edodoc.hq.repositories.PazienteRepository;
import it.edodoc.hq.repositories.PercorsoRepository;
import it.edodoc.hq.repositories.SessioneAppRepository;
import it.edodoc.hq.repositories.TaskRepository;
import it.edodoc.hq.repositories.UtenteRepository;
import it.edodoc.hq.repositories.VisitaRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class PazienteService {

    /** La pagina di eliminazione promette un mese: il task scade prima, per lasciare margine. */
    private static final int GIORNI_PER_ANONIMIZZARE = 21;

    private final PazienteRepository pazienteRepository;
    private final PercorsoRepository percorsoRepository;
    private final VisitaRepository visitaRepository;
    private final PagamentoRepository pagamentoRepository;
    private final CheckSettimanaleRepository checkRepository;
    private final UtenteRepository utenteRepository;
    private final SessioneAppRepository sessioneRepository;
    private final DispositivoRepository dispositivoRepository;
    private final FatturaRepository fatturaRepository;
    private final TaskRepository taskRepository;
    private final TaskService taskService;

    public PazienteService(PazienteRepository pazienteRepository, PercorsoRepository percorsoRepository,
                           VisitaRepository visitaRepository, PagamentoRepository pagamentoRepository,
                           CheckSettimanaleRepository checkRepository, UtenteRepository utenteRepository,
                           SessioneAppRepository sessioneRepository, DispositivoRepository dispositivoRepository,
                           FatturaRepository fatturaRepository, TaskRepository taskRepository, TaskService taskService) {
        this.pazienteRepository = pazienteRepository;
        this.percorsoRepository = percorsoRepository;
        this.visitaRepository = visitaRepository;
        this.pagamentoRepository = pagamentoRepository;
        this.checkRepository = checkRepository;
        this.utenteRepository = utenteRepository;
        this.sessioneRepository = sessioneRepository;
        this.dispositivoRepository = dispositivoRepository;
        this.fatturaRepository = fatturaRepository;
        this.taskRepository = taskRepository;
        this.taskService = taskService;
    }

    /** Pochi pazienti e sempre tutti in memoria nel frontend: una query per ambito, nessun N+1. */
    @Transactional(readOnly = true)
    public List<PazientiDto.Riga> lista() {
        List<Paziente> pazienti = pazienteRepository.findByAttivoTrueOrderByCognomeAscNomeAsc();
        LocalDate oggi = LocalDate.now();

        Map<Long, Percorso> percorsi = percorsoRepository.findAttivi().stream()
                .collect(Collectors.toMap(p -> p.getPaziente().getId(), p -> p, (a, b) -> a));
        Map<Long, LocalDateTime> prossime = visitaRepository.findProssimeVisite(LocalDateTime.now()).stream()
                .collect(Collectors.toMap(VisitaRepository.ProssimaVisita::getPazienteId, VisitaRepository.ProssimaVisita::getInizio));
        Map<Long, List<Pagamento>> daPagare = pagamentoRepository.findDaPagare().stream()
                .collect(Collectors.groupingBy(p -> p.getPaziente().getId()));
        Set<Long> conCheck = checkRepository.findDellaSettimana(CheckService.settimanaDi(oggi)).stream()
                .map(c -> c.getPaziente().getId()).collect(Collectors.toSet());
        Set<Long> conApp = utenteRepository.findAll().stream()
                .filter(u -> u.getRuolo() == Utente.Ruolo.PAZIENTE && u.getPasswordHash() != null)
                .map(u -> u.getPaziente().getId()).collect(Collectors.toSet());

        Map<Long, int[]> visite = new HashMap<>();
        for (Percorso percorso : percorsi.values()) {
            List<Visita> valide = visitaRepository.findValideDelPercorso(percorso.getId());
            int effettuate = (int) valide.stream().filter(v -> v.getStato() == Visita.Stato.EFFETTUATA).count();
            visite.put(percorso.getId(), new int[]{valide.size(), effettuate});
        }

        return pazienti.stream().map(p -> {
            Percorso percorso = percorsi.get(p.getId());
            PercorsiDto.Sintesi sintesi = null;
            if (percorso != null) {
                int[] conteggi = visite.get(percorso.getId());
                sintesi = new PercorsiDto.Sintesi(percorso.getId(), p.getId(), percorso.getTipo(), percorso.getPianoPagamento(),
                        percorso.getDataInizio(), percorso.getDataFine(), percorso.getVisiteTotali(), conteggi[0], conteggi[1],
                        percorso.getImportoTotale(), percorso.getStato(), percorso.getNote());
            }
            return riga(p, sintesi, prossime.get(p.getId()), daPagare.getOrDefault(p.getId(), List.of()),
                    conCheck.contains(p.getId()), conApp.contains(p.getId()), oggi);
        }).toList();
    }

    private static PazientiDto.Riga riga(Paziente p, PercorsiDto.Sintesi percorso, LocalDateTime prossimaVisita,
                                         List<Pagamento> daPagare, boolean checkSettimana, boolean app, LocalDate oggi) {
        BigDecimal residuo = daPagare.stream().map(Pagamento::getImporto).reduce(BigDecimal.ZERO, BigDecimal::add);
        String situazione = daPagare.isEmpty() ? "IN_REGOLA"
                : daPagare.stream().anyMatch(x -> x.isScaduto(oggi)) ? "SCADUTO" : "DA_PAGARE";
        return new PazientiDto.Riga(p.getId(), p.getNome(), p.getCognome(), p.getEmail(), p.getCellulare(),
                p.getCodiceFiscale(), p.getDataNascita(), p.getIndirizzo(), p.getCap(), p.getCitta(), p.getProvincia(),
                p.getStato(), p.getFonte(), p.getSituazione(), p.getNota(), p.getPesoInizialeKg(), p.getPesoObiettivoKg(),
                p.getCreatedAt(), percorso, prossimaVisita, situazione, residuo, checkSettimana, app);
    }

    @Transactional(readOnly = true)
    public PazientiDto.Riga dettaglio(Long id) {
        return lista().stream().filter(p -> p.id().equals(id)).findFirst()
                .orElseThrow(() -> new RisorsaNonTrovataException("Paziente non trovato"));
    }

    @Transactional
    public PazientiDto.Riga crea(PazientiDto.Salva richiesta) {
        Paziente paziente = new Paziente();
        applica(paziente, richiesta);
        Paziente salvato = pazienteRepository.save(paziente);
        return riga(salvato, null, null, List.of(), false, false, LocalDate.now());
    }

    @Transactional
    public PazientiDto.Riga aggiorna(Long id, PazientiDto.Salva richiesta) {
        Paziente paziente = trova(id);
        applica(paziente, richiesta);
        pazienteRepository.flush();
        return dettaglio(id);
    }

    /** Soft delete: visite, pagamenti e fatture del paziente devono restare. */
    @Transactional
    public void archivia(Long id) {
        Paziente paziente = trova(id);
        paziente.setAttivo(false);
        paziente.setArchiviatoIl(LocalDateTime.now());
        utenteRepository.findByPazienteId(id).ifPresent(u -> {
            u.setAttivo(false);
            u.setInvitoTokenHash(null);
            u.setInvitoScadenza(null);
            revocaTelefoni(u.getId());
        });
    }

    /** Il paziente chiude l'account dall'app: l'accesso si chiude subito, l'anonimizzazione la conferma il dottore. */
    @Transactional
    public void chiudiAccount(Long id) {
        Paziente paziente = trova(id);
        archivia(id);
        taskService.creaAutomatico("anonimizza-" + id, "FISCO", "Anonimizzare l'account chiuso dall'app", Task.Priorita.ALTA,
                LocalDate.now().plusDays(GIORNI_PER_ANONIMIZZARE), paziente);
    }

    @Transactional(readOnly = true)
    public List<PazientiDto.Archiviato> archiviati() {
        return pazienteRepository.findByAttivoFalseOrderByArchiviatoIlDesc().stream().map(PazientiDto.Archiviato::da).toList();
    }

    /**
     * Non si torna indietro. Nessuna riga viene eliminata: le fatture hanno la propria copia di intestatario,
     * indirizzo e codice fiscale, e visite, check e chat restano senza un nome collegato.
     * Restituisce l'email che il paziente aveva, per la conferma: dopo non esiste più.
     */
    @Transactional
    public String anonimizza(Long id) {
        Paziente paziente = pazienteRepository.findById(id)
                .filter(p -> !Boolean.TRUE.equals(p.getAttivo()))
                .orElseThrow(() -> new RisorsaNonTrovataException("Paziente archiviato non trovato"));
        if (paziente.getAnonimizzatoIl() != null) {
            throw new ConflittoException("Questo paziente è già stato anonimizzato");
        }
        LocalDateTime adesso = LocalDateTime.now();
        if (visitaRepository.findDelPaziente(id).stream()
                .anyMatch(v -> v.getStato() == Visita.Stato.PROGRAMMATA && v.getInizio().isAfter(adesso))) {
            throw new ConflittoException("Annulla prima le visite ancora in programma: l'evento su Calendar porta il suo nome");
        }
        // Senza anagrafica una fattura emessa dopo uscirebbe senza intestatario valido
        if (pagamentoRepository.findDelPaziente(id).stream().anyMatch(p -> p.getStato() == Pagamento.Stato.PAGATO
                && !fatturaRepository.existsByPagamentoIdAndStato(p.getId(), Fattura.Stato.EMESSA))) {
            throw new ConflittoException("Emetti prima la fattura dei pagamenti ricevuti");
        }

        String email = paziente.getEmail();
        paziente.setNome("Paziente");
        paziente.setCognome("Anonimizzato " + id);
        paziente.setEmail(null);
        paziente.setCellulare(null);
        paziente.setCodiceFiscale(null);
        paziente.setDataNascita(null);
        paziente.setIndirizzo(null);
        paziente.setCap(null);
        paziente.setCitta(null);
        paziente.setProvincia(null);
        paziente.setFonte(null);
        paziente.setSituazione(null);
        paziente.setNota(null);
        paziente.setPesoInizialeKg(null);
        paziente.setPesoObiettivoKg(null);
        paziente.setAnonimizzatoIl(adesso);

        // L'username è unico: con l'email libera la stessa persona può tornare come nuovo paziente
        utenteRepository.findByPazienteId(id).ifPresent(u -> {
            u.setUsername("anonimizzato-" + id);
            u.setPasswordHash(null);
            u.setNome(paziente.getNome());
            u.setCognome(paziente.getCognome());
            revocaTelefoni(u.getId());
        });
        for (Task task : taskRepository.findDelPaziente(id)) {
            task.setTitolo("Task di un paziente anonimizzato");
            task.setDescrizione(null);
            if (task.getStato() == Task.Stato.DA_FARE) {
                task.setStato(Task.Stato.FATTO);
                task.setCompletatoIl(adesso);
            }
        }
        return email;
    }

    private void revocaTelefoni(Long utenteId) {
        sessioneRepository.deleteByUtenteId(utenteId);
        dispositivoRepository.deleteByUtenteId(utenteId);
    }

    private void applica(Paziente p, PazientiDto.Salva r) {
        p.setNome(r.nome().trim());
        p.setCognome(r.cognome().trim());
        p.setEmail(vuotoNull(r.email()) == null ? null : r.email().trim().toLowerCase(Locale.ROOT));
        p.setCellulare(vuotoNull(r.cellulare()));
        p.setCodiceFiscale(vuotoNull(r.codiceFiscale()) == null ? null : r.codiceFiscale().trim().toUpperCase(Locale.ROOT));
        p.setDataNascita(r.dataNascita());
        p.setIndirizzo(vuotoNull(r.indirizzo()));
        p.setCap(vuotoNull(r.cap()));
        p.setCitta(vuotoNull(r.citta()));
        p.setProvincia(vuotoNull(r.provincia()) == null ? null : r.provincia().trim().toUpperCase(Locale.ROOT));
        if (r.stato() != null) {
            p.setStato(r.stato());
        }
        p.setFonte(r.fonte());
        p.setSituazione(vuotoNull(r.situazione()));
        p.setNota(vuotoNull(r.nota()));
        p.setPesoInizialeKg(r.pesoInizialeKg());
        p.setPesoObiettivoKg(r.pesoObiettivoKg());
    }

    private static String vuotoNull(String valore) {
        return valore == null || valore.isBlank() ? null : valore.trim();
    }

    private Paziente trova(Long id) {
        return pazienteRepository.findByIdAndAttivoTrue(id)
                .orElseThrow(() -> new RisorsaNonTrovataException("Paziente non trovato"));
    }
}
