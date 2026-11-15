package it.edodoc.hq.services;

import it.edodoc.hq.dto.TaskDto;
import it.edodoc.hq.dto.TaskDto.AggiornaRequest;
import it.edodoc.hq.dto.TaskDto.Allegato;
import it.edodoc.hq.dto.TaskDto.BulkEsito;
import it.edodoc.hq.dto.TaskDto.BulkRequest;
import it.edodoc.hq.dto.TaskDto.ChecklistRequest;
import it.edodoc.hq.dto.TaskDto.ChecklistVoce;
import it.edodoc.hq.dto.TaskDto.CreaRequest;
import it.edodoc.hq.dto.TaskDto.Dettaglio;
import it.edodoc.hq.dto.TaskDto.Evento;
import it.edodoc.hq.dto.TaskDto.Riepilogo;
import it.edodoc.hq.dto.TaskDto.Riga;
import it.edodoc.hq.dto.TaskDto.RigaLegacy;
import it.edodoc.hq.exception.RisorsaNonTrovataException;
import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.models.Task;
import it.edodoc.hq.models.Task.Stato;
import it.edodoc.hq.models.TaskAllegato;
import it.edodoc.hq.models.TaskAllegatoFile;
import it.edodoc.hq.models.TaskChecklistVoce;
import it.edodoc.hq.models.TaskDipendenza;
import it.edodoc.hq.models.TaskEtichetta;
import it.edodoc.hq.models.TaskEvento;
import it.edodoc.hq.models.TaskLista;
import it.edodoc.hq.models.Utente;
import it.edodoc.hq.repositories.PazienteRepository;
import it.edodoc.hq.repositories.TaskAllegatoFileRepository;
import it.edodoc.hq.repositories.TaskAllegatoRepository;
import it.edodoc.hq.repositories.TaskChecklistVoceRepository;
import it.edodoc.hq.repositories.TaskDipendenzaRepository;
import it.edodoc.hq.repositories.TaskEtichettaRepository;
import it.edodoc.hq.repositories.TaskEventoRepository;
import it.edodoc.hq.repositories.TaskListaRepository;
import it.edodoc.hq.repositories.TaskRepository;
import it.edodoc.hq.repositories.UtenteRepository;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.URLConnection;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Task del gestionale, come in Mobilitas HQ ma per un solo utente: liste, stati, priorità, orari, stima, sottotask,
 * etichette, checklist, commenti con allegati (nel database), cronologia, dipendenze e pianificazione del Gantt.
 */
@Service
@Transactional(readOnly = true)
public class TaskService {

    private static final DateTimeFormatter GIORNO = DateTimeFormatter.ofPattern("EEE d MMM", Locale.ITALIAN);
    private static final DateTimeFormatter ORA = DateTimeFormatter.ofPattern("HH:mm");
    private static final java.util.regex.Pattern COLORE = java.util.regex.Pattern.compile("^#[0-9A-Fa-f]{6}$");
    private static final int MAX_TITOLO = 255;
    private static final int MAX_TESTO = 20000;
    private static final int MAX_RISULTATI = 2000;
    private static final double PASSO_ORDINE = 1024;
    /** Gli allegati stanno nel database: 20 MB a file bastano per foto, PDF ed esami. */
    static final long MAX_ALLEGATO = 20L * 1024 * 1024;
    private static final Set<String> ESTENSIONI_VIETATE = Set.of(
            "exe", "bat", "cmd", "com", "msi", "scr", "ps1", "vbs", "js", "jar", "sh", "app", "dll");
    private static final Set<String> CAMPI = Set.of("listaId", "titolo", "descrizione", "stato", "priorita",
            "scadenza", "scadenzaOra", "stimaMinuti", "dataInizio", "inizioOra", "assegnatariIds", "etichettaIds", "pazienteId", "ordine");
    /** Stima massima: 1000 ore. */
    private static final int STIMA_MAX_MINUTI = 60_000;
    private static final int CHIUSI_GIORNI_PREDEFINITI = 30;
    private static final List<Stato> CHIUSI = TaskStrutturaService.CHIUSI;

    private final TaskRepository taskRepository;
    private final TaskListaRepository listaRepository;
    private final TaskEtichettaRepository etichettaRepository;
    private final TaskChecklistVoceRepository checklistRepository;
    private final TaskEventoRepository eventoRepository;
    private final TaskAllegatoRepository allegatoRepository;
    private final TaskAllegatoFileRepository allegatoFileRepository;
    private final TaskDipendenzaRepository dipendenzaRepository;
    private final PazienteRepository pazienteRepository;
    private final TaskStrutturaService struttura;
    private final UtenteRepository utenteRepository;

    public TaskService(TaskRepository taskRepository, TaskListaRepository listaRepository,
                       TaskEtichettaRepository etichettaRepository, TaskChecklistVoceRepository checklistRepository,
                       TaskEventoRepository eventoRepository, TaskAllegatoRepository allegatoRepository,
                       TaskAllegatoFileRepository allegatoFileRepository, TaskDipendenzaRepository dipendenzaRepository,
                       PazienteRepository pazienteRepository, TaskStrutturaService struttura,
                       UtenteRepository utenteRepository) {
        this.utenteRepository = utenteRepository;
        this.taskRepository = taskRepository;
        this.listaRepository = listaRepository;
        this.etichettaRepository = etichettaRepository;
        this.checklistRepository = checklistRepository;
        this.eventoRepository = eventoRepository;
        this.allegatoRepository = allegatoRepository;
        this.allegatoFileRepository = allegatoFileRepository;
        this.dipendenzaRepository = dipendenzaRepository;
        this.pazienteRepository = pazienteRepository;
        this.struttura = struttura;
    }

    /**
     * Filtri dell'elenco; tutti facoltativi. {@code chiusiGiorni}: con i chiusi inclusi, solo quelli aggiornati negli
     * ultimi N giorni (null = 30 se includiChiusi, 0 = tutti); gli aperti arrivano sempre tutti.
     */
    public enum Vista { MIEI, TUTTI }

    /**
     * {@code vista=MIEI}: assegnati a {@code utenteId} oppure senza assegnatari (così i promemoria dei job li vedono tutti);
     * {@code assegnatoA}: assegnati a quella persona.
     */
    public record Filtri(Long utenteId, Vista vista, Long assegnatoA, Long listaId, Long cartellaId, List<Stato> stati,
                         Task.Priorita priorita, Long etichettaId, Long pazienteId, String q, LocalDate scadenzaDa,
                         LocalDate scadenzaA, boolean includiChiusi, Integer chiusiGiorni, boolean senzaScadenza) {
    }

    public record FileAllegato(String nomeFile, String contentType, byte[] contenuto) {
    }

    // ---------- Configurazione ----------

    public TaskDto.Config config() {
        return new TaskDto.Config(struttura.cartelle(), struttura.liste(),
                etichettaRepository.findAllByOrderByNomeAsc().stream().map(TaskService::toEtichettaDto).toList(),
                operatori().stream().map(u -> new TaskDto.Operatore(u.getId(), u.getNome(), u.getCognome(), iniziali(u),
                        List.of(u.getRuolo().name()))).toList());
    }

    // ---------- Lettura ----------

    public List<Riga> elenco(Filtri filtri) {
        List<Task> tasks = taskRepository.findAll(specifica(filtri, null),
                PageRequest.of(0, MAX_RISULTATI, Sort.by(Sort.Direction.DESC, "id"))).getContent();
        return toRighe(tasks).stream().sorted(ORDINAMENTO).toList();
    }

    /** Archivio dei chiusi (completati e annullati), senza limiti di tempo: dal più recente, a pagine. */
    public TaskDto.PaginaChiusi elencoChiusi(Filtri filtri, int pagina, int dimensione) {
        List<Stato> stati = filtri.stati() != null && !filtri.stati().isEmpty()
                ? filtri.stati().stream().filter(Stato::isChiuso).toList()
                : CHIUSI;
        if (stati.isEmpty()) {
            return new TaskDto.PaginaChiusi(List.of(), 0, pagina, false);
        }
        Filtri chiusi = new Filtri(filtri.utenteId(), filtri.vista(), filtri.assegnatoA(), filtri.listaId(), filtri.cartellaId(), stati, filtri.priorita(), filtri.etichettaId(),
                filtri.pazienteId(), filtri.q(), filtri.scadenzaDa(), filtri.scadenzaA(), true, 0, filtri.senzaScadenza());
        int dim = Math.max(1, Math.min(dimensione, 100));
        Page<Task> page = taskRepository.findAll(specifica(chiusi, null),
                PageRequest.of(Math.max(0, pagina), dim, Sort.by(Sort.Order.desc("aggiornatoIl"), Sort.Order.desc("id"))));
        return new TaskDto.PaginaChiusi(toRighe(page.getContent()), page.getTotalElements(), page.getNumber(), page.hasNext());
    }

    /** Contatori della vista MIEI dell'utente: assegnati a lui o senza assegnatari. */
    public Riepilogo riepilogo(Long utenteId) {
        LocalDate oggi = LocalDate.now();
        Object[] c = taskRepository.contatoriMiei(utenteId, oggi, LocalTime.now(), oggi.plusDays(7)).get(0);
        return new Riepilogo(numero(c[0]), numero(c[1]), numero(c[2]), numero(c[3]));
    }

    public Dettaglio dettaglio(Long id) {
        return toDettaglio(trova(id));
    }

    public FileAllegato scaricaAllegato(Long id, Long allegatoId) {
        Task t = trova(id);
        TaskAllegato a = trovaAllegato(t, allegatoId);
        byte[] contenuto = allegatoFileRepository.findById(a.getId()).map(TaskAllegatoFile::getContenuto)
                .orElseThrow(() -> new RisorsaNonTrovataException("File non disponibile"));
        return new FileAllegato(a.getNomeFile(), a.getContentType(), contenuto);
    }

    // ---------- Forma di prima: app, dashboard, scheda paziente ----------

    public List<RigaLegacy> listaLegacy(boolean ancheCompletati) {
        LocalDate oggi = LocalDate.now();
        List<Task> task = new ArrayList<>(taskRepository.findAperti());
        if (ancheCompletati) {
            task.addAll(taskRepository.findCompletatiRecenti());
        }
        return task.stream().map(t -> RigaLegacy.da(t, oggi)).toList();
    }

    public List<RigaLegacy> delPaziente(Long pazienteId) {
        LocalDate oggi = LocalDate.now();
        return taskRepository.findDelPaziente(pazienteId).stream().map(t -> RigaLegacy.da(t, oggi)).toList();
    }

    /** L'id di una lista di sistema, per chi crea task da codice. */
    public Long idListaDiSistema(String codice) {
        return listaDiSistema(codice).getId();
    }

    @Transactional
    public RigaLegacy creaLegacy(TaskDto.Salva r) {
        return creaLegacy(r, null);
    }

    @Transactional
    public RigaLegacy creaLegacy(TaskDto.Salva r, Long utenteId) {
        Task t = crea(new CreaRequest(r.listaId(), r.titolo(), r.descrizione(), Stato.DA_FARE, prioritaLegacy(r.priorita(), null),
                r.scadenza(), null, null, null, null, null, null, r.pazienteId(), null, null), utenteId);
        return RigaLegacy.da(t, LocalDate.now());
    }

    /** Tocca solo i campi del form di prima: ora, inizio, stima, etichette e il resto restano come sono. */
    @Transactional
    public RigaLegacy aggiornaLegacy(Long id, TaskDto.Salva r) {
        Task t = trova(id);
        Set<String> campi = new HashSet<>(Set.of("titolo", "descrizione", "priorita", "scadenza", "pazienteId"));
        if (!Objects.equals(r.listaId(), t.getLista().getId())) {
            campi.add("listaId");
        }
        applica(t, new AggiornaRequest(campi, r.listaId(), r.titolo(), r.descrizione(), null,
                prioritaLegacy(r.priorita(), t.getPriorita()), r.scadenza(), null, null, null, null, null, null,
                r.pazienteId(), null, null));
        return RigaLegacy.da(t, LocalDate.now());
    }

    /** fatto: completa (i sottotask restano come sono); altrimenti riapre in "Da fare" se era chiuso. */
    @Transactional
    public RigaLegacy cambiaStatoLegacy(Long id, boolean fatto) {
        Task t = trova(id);
        if (fatto && t.getStato() != Stato.COMPLETATO) {
            applica(t, statoRequest(Stato.COMPLETATO));
        } else if (!fatto && t.getStato().isChiuso()) {
            applica(t, statoRequest(Stato.DA_FARE));
        }
        return RigaLegacy.da(t, LocalDate.now());
    }

    /**
     * Il form di prima conosce solo ALTA, MEDIA e BASSA: MEDIA (o niente) tiene la priorità se è normale o assente,
     * ALTA tiene l'urgente. URGENTE e NORMALE arrivano anche da client nuovi.
     */
    static Task.Priorita prioritaLegacy(String valore, Task.Priorita attuale) {
        String v = valore == null ? "MEDIA" : valore.trim().toUpperCase(Locale.ROOT);
        // ALTA su un task urgente è la stessa priorità vista dal client di prima: resta urgente
        if ("ALTA".equals(v) && attuale == Task.Priorita.URGENTE) {
            return attuale;
        }
        return switch (v) {
            case "URGENTE" -> Task.Priorita.URGENTE;
            case "ALTA" -> Task.Priorita.ALTA;
            case "BASSA" -> Task.Priorita.BASSA;
            case "NORMALE" -> Task.Priorita.NORMALE;
            case "MEDIA", "" -> attuale == null || attuale == Task.Priorita.NORMALE ? attuale : Task.Priorita.NORMALE;
            default -> throw new IllegalArgumentException("Priorità non valida: " + valore);
        };
    }

    // ---------- Scrittura task ----------

    /** {@code utenteId}: chi crea il task (l'utente autenticato). */
    @Transactional
    public Riga creaRiga(CreaRequest req, Long utenteId) {
        return toRighe(List.of(crea(req, utenteId))).get(0);
    }

    private Task crea(CreaRequest req, Long utenteId) {
        if (req == null) {
            throw new IllegalArgumentException("Dati del task mancanti");
        }
        // Sottotask: sta nella lista del task principale
        Task principale = req.parentId() == null ? null : trova(req.parentId());
        if (principale != null && principale.getParentId() != null) {
            throw new IllegalArgumentException("Un sottotask non può avere a sua volta sottotask");
        }
        TaskLista lista = trovaListaAttiva(principale != null ? principale.getLista().getId() : req.listaId());
        Task t = new Task();
        t.setLista(lista);
        t.setTitolo(titolo(req.titolo()));
        t.setDescrizione(testo(req.descrizione()));
        t.setStato(req.stato() != null ? req.stato() : Stato.DA_FARE);
        t.setPriorita(req.priorita());
        t.setScadenza(req.scadenza());
        t.setScadenzaOra(req.scadenza() != null ? req.scadenzaOra() : null);
        t.setStimaMinuti(stima(req.stimaMinuti()));
        t.setDataInizio(req.dataInizio());
        t.setInizioOra(req.dataInizio() != null ? req.inizioOra() : null);
        t.setParentId(principale != null ? principale.getId() : null);
        t.setPaziente(paziente(req.pazienteId()));
        t.setEtichettaIds(new HashSet<>(etichetteValide(req.etichettaIds())));
        t.setAssegnatariIds(new HashSet<>(operatoriValidi(req.assegnatariIds(), Set.of())));
        t.setCreatoDaUtenteId(utenteId);
        periodo(t);
        // Un sottotask nuovo va in fondo ai fratelli; un task in cima alla sua colonna
        t.setOrdine(principale != null
                ? taskRepository.findByParentIdOrderByOrdineAscIdAsc(principale.getId()).stream()
                        .mapToDouble(Task::getOrdine).max().orElse(0) + PASSO_ORDINE
                : ordineInCima(lista.getId(), t.getStato()));
        if (t.getStato() == Stato.COMPLETATO) {
            t.setCompletatoIl(LocalDateTime.now());
        }
        t = taskRepository.save(t);

        if (req.checklist() != null) {
            int ordine = 0;
            for (String voce : req.checklist()) {
                if (!isBlank(voce)) {
                    checklistRepository.save(new TaskChecklistVoce(t.getId(), voceChecklist(voce), ++ordine));
                }
            }
        }
        evento(t, TaskEvento.Tipo.CREATO, principale != null
                ? "ha creato il sottotask di «" + abbrevia(principale.getTitolo(), 80) + "»" : "ha creato il task", null, null);
        if (principale != null) {
            evento(principale, TaskEvento.Tipo.SOTTOTASK, "ha aggiunto il sottotask «" + abbrevia(t.getTitolo(), 80) + "»",
                    null, String.valueOf(t.getId()));
            principale.setAggiornatoIl(LocalDateTime.now());
        }
        return t;
    }

    /** Per job e flussi di dominio: la chiave impedisce di ricreare un promemoria già esistito. */
    @Transactional
    public void creaAutomatico(String chiave, String listaCodice, String titolo, Task.Priorita priorita,
                               LocalDate scadenza, Paziente paziente) {
        if (taskRepository.existsByChiaveAutomatica(chiave)) {
            return;
        }
        Task t = new Task();
        t.setChiaveAutomatica(chiave);
        t.setLista(listaDiSistema(listaCodice));
        t.setTitolo(titolo(titolo));
        t.setPriorita(priorita);
        t.setScadenza(scadenza);
        t.setPaziente(paziente);
        t.setOrdine(ordineInCima(t.getLista().getId(), Stato.DA_FARE));
        t = taskRepository.save(t);
        evento(t, TaskEvento.Tipo.CREATO, "ha creato il task in automatico", null, null);
    }

    @Transactional
    public Dettaglio aggiorna(Long id, AggiornaRequest req) {
        Task t = trova(id);
        applica(t, req);
        return toDettaglio(t);
    }

    @Transactional
    public BulkEsito bulk(BulkRequest req) {
        if (req == null || req.ids() == null || req.ids().isEmpty()) {
            throw new IllegalArgumentException("Nessun task selezionato");
        }
        if (req.ids().size() > 500) {
            throw new IllegalArgumentException("Puoi modificare al massimo 500 task alla volta");
        }
        boolean elimina = Boolean.TRUE.equals(req.elimina());
        if (!elimina && (req.modifica() == null || req.modifica().campi() == null || req.modifica().campi().isEmpty())) {
            throw new IllegalArgumentException("Nessuna modifica indicata");
        }
        Set<Long> richiesti = new LinkedHashSet<>(req.ids());
        richiesti.remove(null);
        List<Task> trovati = taskRepository.findAllById(richiesti);
        int aggiornati = 0;
        // Eliminando un principale spariscono anche i suoi sottotask: non vanno toccati dopo
        Set<Long> eliminati = new HashSet<>();
        for (Task t : trovati) {
            if (eliminati.contains(t.getId())) {
                aggiornati++;
                continue;
            }
            if (elimina) {
                taskRepository.findByParentIdOrderByOrdineAscIdAsc(t.getId()).forEach(s -> eliminati.add(s.getId()));
                taskRepository.delete(t);
                eliminati.add(t.getId());
            } else {
                applica(t, req.modifica());
            }
            aggiornati++;
        }
        return new BulkEsito(aggiornati, Math.max(req.ids().size() - aggiornati, 0));
    }

    @Transactional
    public void elimina(Long id) {
        // Sottotask, commenti, allegati, checklist, etichette e dipendenze se ne vanno in cascata nel database
        taskRepository.delete(trova(id));
    }

    // ---------- Gantt: date e dipendenze ----------

    /** Le dipendenze fra i task indicati: solo quelle con entrambi i capi fra questi. */
    public List<TaskDto.Dipendenza> dipendenze(TaskDto.DipendenzeRequest req) {
        if (req == null || req.ids() == null || req.ids().isEmpty()) {
            return List.of();
        }
        if (req.ids().size() > 2000) {
            throw new IllegalArgumentException("Troppi task: restringi la vista");
        }
        Set<Long> ids = new HashSet<>(req.ids());
        ids.remove(null);
        return dipendenzaRepository.findPerTask(ids).stream()
                .filter(d -> ids.contains(d.getPredecessoreId()) && ids.contains(d.getSuccessoreId()))
                .map(d -> new TaskDto.Dipendenza(d.getPredecessoreId(), d.getSuccessoreId()))
                .toList();
    }

    /** Il task {@code id} aspetta {@code predecessoreId}. Niente giri. */
    @Transactional
    public Dettaglio aggiungiDipendenza(Long id, Long predecessoreId) {
        Task t = trova(id);
        if (predecessoreId == null) {
            throw new IllegalArgumentException("Scegli il task da aspettare");
        }
        if (predecessoreId.equals(t.getId())) {
            throw new IllegalArgumentException("Un task non può aspettare se stesso");
        }
        Task p = trova(predecessoreId);
        if (dipendenzaRepository.findByPredecessoreIdAndSuccessoreId(p.getId(), t.getId()).isPresent()) {
            return toDettaglio(t);
        }
        if (raggiunge(t.getId(), p.getId())) {
            throw new IllegalArgumentException("«" + abbrevia(p.getTitolo(), 60)
                    + "» aspetta già questo task (anche passando da altri): si creerebbe un giro senza fine");
        }
        dipendenzaRepository.save(new TaskDipendenza(p.getId(), t.getId()));
        evento(t, TaskEvento.Tipo.DIPENDENZA, "ha indicato che il task aspetta «" + abbrevia(p.getTitolo(), 80) + "»",
                null, String.valueOf(p.getId()));
        t.setAggiornatoIl(LocalDateTime.now());
        return toDettaglio(t);
    }

    @Transactional
    public Dettaglio rimuoviDipendenza(Long id, Long predecessoreId) {
        Task t = trova(id);
        TaskDipendenza d = dipendenzaRepository.findByPredecessoreIdAndSuccessoreId(predecessoreId, t.getId()).orElse(null);
        if (d == null) {
            return toDettaglio(t);
        }
        dipendenzaRepository.delete(d);
        Task p = taskRepository.findById(predecessoreId).orElse(null);
        evento(t, TaskEvento.Tipo.DIPENDENZA, p != null
                ? "ha indicato che il task non aspetta più «" + abbrevia(p.getTitolo(), 80) + "»"
                : "ha tolto una dipendenza", String.valueOf(predecessoreId), null);
        t.setAggiornatoIl(LocalDateTime.now());
        return toDettaglio(t);
    }

    /** Nuove date di più task insieme (Gantt: il task trascinato e quelli che lo aspettano). Tutto o niente. */
    @Transactional
    public List<Riga> pianifica(TaskDto.PianificaRequest req) {
        if (req == null || req.voci() == null || req.voci().isEmpty()) {
            return List.of();
        }
        if (req.voci().size() > 500) {
            throw new IllegalArgumentException("Puoi ripianificare al massimo 500 task alla volta");
        }
        List<Task> cambiati = new ArrayList<>();
        Set<String> campi = Set.of("dataInizio", "scadenza");
        for (TaskDto.PianificaVoce v : req.voci()) {
            Task t = trova(v.id());
            applica(t, new AggiornaRequest(campi, null, null, null, null, null, v.scadenza(), null, null,
                    v.dataInizio(), null, null, null, null, null, null));
            cambiati.add(t);
        }
        return toRighe(cambiati);
    }

    /** Partendo da {@code da} e seguendo chi aspetta chi si arriva ad {@code a}? */
    private boolean raggiunge(Long da, Long a) {
        Set<Long> visti = new HashSet<>(Set.of(da));
        Set<Long> fronte = Set.of(da);
        while (!fronte.isEmpty()) {
            Set<Long> prossimi = new HashSet<>();
            for (Long s : dipendenzaRepository.findSuccessori(fronte)) {
                if (s.equals(a)) {
                    return true;
                }
                if (visti.add(s)) {
                    prossimi.add(s);
                }
            }
            fronte = prossimi;
        }
        return false;
    }

    // ---------- Commenti ----------

    @Transactional
    public Dettaglio commenta(Long id, String testo, Integer allegati) {
        Task t = trova(id);
        int file = allegati != null ? Math.max(allegati, 0) : 0;
        // Con foto o file al seguito il testo è facoltativo
        String commento = file > 0 ? testo(testo) : testoObbligatorio(testo, "Scrivi un commento");
        evento(t, TaskEvento.Tipo.COMMENTO, commento, null, null);
        t.setAggiornatoIl(LocalDateTime.now());
        return toDettaglio(t);
    }

    @Transactional
    public Dettaglio modificaCommento(Long id, Long commentoId, String testo) {
        Task t = trova(id);
        TaskEvento e = trovaCommento(t, commentoId);
        // Un commento con allegati può restare senza testo
        String nuovo = allegatoRepository.findByEventoId(e.getId()).isEmpty()
                ? testoObbligatorio(testo, "Il commento non può essere vuoto")
                : testo(testo);
        e.setTesto(nuovo);
        e.setModificatoIl(LocalDateTime.now());
        return toDettaglio(t);
    }

    @Transactional
    public Dettaglio eliminaCommento(Long id, Long commentoId) {
        Task t = trova(id);
        TaskEvento e = trovaCommento(t, commentoId);
        allegatoRepository.deleteAll(allegatoRepository.findByEventoId(e.getId()));
        eventoRepository.delete(e);
        return toDettaglio(t);
    }

    // ---------- Allegati ----------

    @Transactional
    public Allegato caricaAllegato(Long id, MultipartFile file, Long commentoId) {
        Task t = trova(id);
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("File mancante o vuoto");
        }
        if (file.getSize() > MAX_ALLEGATO) {
            throw new IllegalArgumentException("Il file supera i 20 MB");
        }
        TaskEvento commento = commentoId != null ? trovaCommento(t, commentoId) : null;
        String nomeFile = nomeFile(file.getOriginalFilename());
        String estensione = estensione(nomeFile);
        if (estensione != null && ESTENSIONI_VIETATE.contains(estensione)) {
            throw new IllegalArgumentException("Tipo di file non consentito: ." + estensione);
        }
        String contentType = file.getContentType();
        if (isBlank(contentType) || "application/octet-stream".equals(contentType)) {
            String indovinato = URLConnection.guessContentTypeFromName(nomeFile);
            contentType = indovinato != null ? indovinato : "application/octet-stream";
        }
        byte[] contenuto;
        try {
            contenuto = file.getBytes();
        } catch (IOException e) {
            throw new IllegalStateException("Lettura del file non riuscita", e);
        }
        TaskAllegato a = new TaskAllegato();
        a.setTaskId(t.getId());
        a.setEventoId(commento != null ? commento.getId() : null);
        a.setNomeFile(nomeFile);
        a.setContentType(abbrevia(contentType, 150));
        a.setEstensione(estensione);
        a.setDimensione(contenuto.length);
        a = allegatoRepository.save(a);
        allegatoFileRepository.save(new TaskAllegatoFile(a.getId(), contenuto));
        if (commento == null) {
            evento(t, TaskEvento.Tipo.ALLEGATO, "ha allegato " + nomeFile, null, nomeFile);
        }
        t.setAggiornatoIl(LocalDateTime.now());
        return toAllegatoDto(a);
    }

    @Transactional
    public Dettaglio eliminaAllegato(Long id, Long allegatoId) {
        Task t = trova(id);
        TaskAllegato a = trovaAllegato(t, allegatoId);
        allegatoRepository.delete(a);
        if (a.getEventoId() == null) {
            evento(t, TaskEvento.Tipo.ALLEGATO_RIMOSSO, "ha rimosso l'allegato " + a.getNomeFile(), a.getNomeFile(), null);
        }
        return toDettaglio(t);
    }

    // ---------- Checklist ----------

    @Transactional
    public Dettaglio aggiungiChecklist(Long id, ChecklistRequest req) {
        Task t = trova(id);
        String testo = voceChecklist(req != null ? req.testo() : null);
        checklistRepository.save(new TaskChecklistVoce(t.getId(), testo, checklistRepository.findOrdineMassimo(t.getId()) + 1));
        evento(t, TaskEvento.Tipo.CHECKLIST, "ha aggiunto «" + abbrevia(testo, 80) + "» alla checklist", null, testo);
        return toDettaglio(t);
    }

    @Transactional
    public Dettaglio aggiornaChecklist(Long id, Long voceId, ChecklistRequest req) {
        Task t = trova(id);
        TaskChecklistVoce v = trovaVoce(t, voceId);
        if (req == null) {
            return toDettaglio(t);
        }
        if (req.testo() != null) {
            v.setTesto(voceChecklist(req.testo()));
        }
        if (req.ordine() != null) {
            v.setOrdine(req.ordine());
        }
        if (req.completato() != null && req.completato() != v.isCompletato()) {
            v.setCompletato(req.completato());
            v.setCompletatoIl(req.completato() ? LocalDateTime.now() : null);
            evento(t, TaskEvento.Tipo.CHECKLIST,
                    (req.completato() ? "ha completato «" : "ha riaperto «") + abbrevia(v.getTesto(), 80) + "»",
                    null, v.getTesto());
        }
        return toDettaglio(t);
    }

    @Transactional
    public Dettaglio eliminaChecklist(Long id, Long voceId) {
        Task t = trova(id);
        checklistRepository.delete(trovaVoce(t, voceId));
        return toDettaglio(t);
    }

    /** Anonimizzazione: via cronologia, commenti, allegati e checklist dei task (titolo e descrizione li pulisce chi chiama). */
    @Transactional
    public void dimenticaContenuti(Collection<Long> taskIds) {
        if (taskIds == null || taskIds.isEmpty()) {
            return;
        }
        allegatoRepository.eliminaPerTask(taskIds);
        eventoRepository.eliminaPerTask(taskIds);
        checklistRepository.eliminaPerTask(taskIds);
    }

    // ---------- Etichette ----------

    @Transactional
    public TaskDto.Etichetta creaEtichetta(TaskDto.EtichettaRequest req) {
        String nome = req != null && req.nome() != null ? req.nome().replaceAll("\\s+", " ").trim() : "";
        if (nome.isEmpty() || nome.length() > 50) {
            throw new IllegalArgumentException("Il nome dell'etichetta deve avere da 1 a 50 caratteri");
        }
        return etichettaRepository.findByNomeIgnoreCase(nome)
                .map(TaskService::toEtichettaDto)
                .orElseGet(() -> {
                    TaskEtichetta e = new TaskEtichetta();
                    e.setNome(nome);
                    e.setColore(colore(req.colore(), "#64748B"));
                    return toEtichettaDto(etichettaRepository.save(e));
                });
    }

    @Transactional
    public void eliminaEtichetta(Long id) {
        etichettaRepository.deleteById(id);
    }

    // ---------- Modifica dei campi ----------

    private void applica(Task t, AggiornaRequest req) {
        if (req == null || req.campi() == null || req.campi().isEmpty()) {
            return;
        }
        Set<String> campi = req.campi();
        for (String c : campi) {
            if (!CAMPI.contains(c)) {
                throw new IllegalArgumentException("Campo non modificabile: " + c);
            }
        }
        boolean soloOrdine = campi.equals(Set.of("ordine"));

        if (campi.contains("listaId") && !Objects.equals(req.listaId(), t.getLista().getId())) {
            TaskLista nuova = trovaListaAttiva(req.listaId());
            if (t.getParentId() != null) {
                throw new IllegalArgumentException("Un sottotask sta nella lista del suo task principale: sposta quello");
            }
            String prima = t.getLista().getNome();
            t.setLista(nuova);
            // I sottotask seguono il task principale
            for (Task sotto : taskRepository.findByParentIdOrderByOrdineAscIdAsc(t.getId())) {
                sotto.setLista(nuova);
            }
            evento(t, TaskEvento.Tipo.LISTA, "ha spostato il task in " + nuova.getNome(), prima, nuova.getNome());
        }
        if (campi.contains("titolo")) {
            String nuovo = titolo(req.titolo());
            if (!nuovo.equals(t.getTitolo())) {
                evento(t, TaskEvento.Tipo.TITOLO, "ha rinominato il task in «" + nuovo + "»", t.getTitolo(), nuovo);
                t.setTitolo(nuovo);
            }
        }
        if (campi.contains("descrizione")) {
            String nuova = testo(req.descrizione());
            if (!Objects.equals(nuova, t.getDescrizione())) {
                t.setDescrizione(nuova);
                evento(t, TaskEvento.Tipo.DESCRIZIONE,
                        nuova == null ? "ha rimosso la descrizione" : "ha modificato la descrizione", null, null);
            }
        }
        if (campi.contains("stato") && req.stato() != null && req.stato() != t.getStato()) {
            Stato prima = t.getStato();
            t.setStato(req.stato());
            if (req.stato() == Stato.COMPLETATO) {
                t.setCompletatoIl(LocalDateTime.now());
            } else if (prima == Stato.COMPLETATO) {
                t.setCompletatoIl(null);
            }
            if (!campi.contains("ordine")) {
                t.setOrdine(ordineInCima(t.getLista().getId(), t.getStato()));
            }
            if (req.stato() == Stato.COMPLETATO && Boolean.TRUE.equals(req.completaSottotask()) && t.getParentId() == null) {
                for (Task sotto : taskRepository.findByParentIdOrderByOrdineAscIdAsc(t.getId())) {
                    if (!sotto.getStato().isChiuso()) {
                        applica(sotto, statoRequest(Stato.COMPLETATO));
                    }
                }
            }
            evento(t, TaskEvento.Tipo.STATO,
                    "ha cambiato lo stato da " + etichetta(prima) + " a " + etichetta(req.stato()), prima.name(), req.stato().name());
        }
        if (campi.contains("priorita") && req.priorita() != t.getPriorita()) {
            String prima = t.getPriorita() != null ? t.getPriorita().name() : null;
            t.setPriorita(req.priorita());
            evento(t, TaskEvento.Tipo.PRIORITA, req.priorita() == null
                            ? "ha rimosso la priorità"
                            : "ha impostato la priorità " + etichetta(req.priorita()),
                    prima, req.priorita() != null ? req.priorita().name() : null);
        }
        if (campi.contains("stimaMinuti")) {
            Integer nuova = stima(req.stimaMinuti());
            if (!Objects.equals(nuova, t.getStimaMinuti())) {
                Integer prima = t.getStimaMinuti();
                t.setStimaMinuti(nuova);
                evento(t, TaskEvento.Tipo.STIMA, nuova == null ? "ha rimosso la stima" : "ha stimato " + durata(nuova),
                        prima != null ? String.valueOf(prima) : null, nuova != null ? String.valueOf(nuova) : null);
            }
        }
        LocalDate scadenzaPrima = t.getScadenza();
        if (campi.contains("scadenza") || campi.contains("scadenzaOra")) {
            LocalDate data = campi.contains("scadenza") ? req.scadenza() : t.getScadenza();
            LocalTime ora = data == null ? null : (campi.contains("scadenzaOra") ? req.scadenzaOra() : t.getScadenzaOra());
            if (!Objects.equals(data, t.getScadenza()) || !Objects.equals(ora, t.getScadenzaOra())) {
                String prima = scadenza(t.getScadenza(), t.getScadenzaOra());
                t.setScadenza(data);
                t.setScadenzaOra(ora);
                evento(t, TaskEvento.Tipo.SCADENZA, data == null
                        ? "ha rimosso la scadenza"
                        : "ha impostato la scadenza a " + scadenza(data, ora), prima, scadenza(data, ora));
            }
        }
        if (campi.contains("dataInizio") || campi.contains("inizioOra")) {
            LocalDate data = campi.contains("dataInizio") ? req.dataInizio() : t.getDataInizio();
            LocalTime ora = data == null ? null : (campi.contains("inizioOra") ? req.inizioOra() : t.getInizioOra());
            if (!Objects.equals(data, t.getDataInizio()) || !Objects.equals(ora, t.getInizioOra())) {
                String prima = scadenza(t.getDataInizio(), t.getInizioOra());
                t.setDataInizio(data);
                t.setInizioOra(ora);
                evento(t, TaskEvento.Tipo.INIZIO, data == null
                        ? "ha rimosso la data d'inizio"
                        : "ha fissato l'inizio al " + scadenza(data, ora), prima, scadenza(data, ora));
            }
        }
        // Scadenza spostata su un task con l'ora d'inizio (posticipa, calendario): l'orario si sposta tutto insieme
        if (!campi.contains("dataInizio") && scadenzaPrima != null && t.getScadenza() != null && t.getDataInizio() != null
                && t.getInizioOra() != null && !scadenzaPrima.equals(t.getScadenza())) {
            String prima = scadenza(t.getDataInizio(), t.getInizioOra());
            t.setDataInizio(t.getDataInizio().plusDays(ChronoUnit.DAYS.between(scadenzaPrima, t.getScadenza())));
            evento(t, TaskEvento.Tipo.INIZIO, "ha spostato l'inizio al " + scadenza(t.getDataInizio(), t.getInizioOra()),
                    prima, scadenza(t.getDataInizio(), t.getInizioOra()));
        }
        // Scadenza anticipata prima dell'inizio: l'inizio si sposta indietro con lei, la durata resta
        if (!campi.contains("dataInizio") && scadenzaPrima != null && t.getDataInizio() != null && t.getScadenza() != null
                && t.getDataInizio().isAfter(t.getScadenza())) {
            long giorni = ChronoUnit.DAYS.between(t.getDataInizio(), scadenzaPrima);
            String prima = scadenza(t.getDataInizio(), t.getInizioOra());
            t.setDataInizio(t.getScadenza().minusDays(Math.max(giorni, 0)));
            evento(t, TaskEvento.Tipo.INIZIO, "ha spostato l'inizio al " + scadenza(t.getDataInizio(), t.getInizioOra()),
                    prima, scadenza(t.getDataInizio(), t.getInizioOra()));
        }
        if (campi.contains("dataInizio") || campi.contains("inizioOra") || campi.contains("scadenza") || campi.contains("scadenzaOra")) {
            periodo(t);
        }
        if (campi.contains("assegnatariIds")) {
            Set<Long> nuovi = new LinkedHashSet<>(operatoriValidi(req.assegnatariIds(), t.getAssegnatariIds()));
            Set<Long> aggiunti = new LinkedHashSet<>(nuovi);
            aggiunti.removeAll(t.getAssegnatariIds());
            Set<Long> rimossi = new LinkedHashSet<>(t.getAssegnatariIds());
            rimossi.removeAll(nuovi);
            if (!aggiunti.isEmpty() || !rimossi.isEmpty()) {
                Map<Long, Utente> u = utenti(Stream.concat(aggiunti.stream(), rimossi.stream()).collect(Collectors.toSet()));
                List<String> frasi = new ArrayList<>();
                if (!aggiunti.isEmpty()) {
                    frasi.add("ha assegnato il task a " + elencoNomi(aggiunti, u));
                }
                if (!rimossi.isEmpty()) {
                    frasi.add((frasi.isEmpty() ? "ha rimosso " : "e ha rimosso ") + elencoNomi(rimossi, u) + " dagli assegnatari");
                }
                t.getAssegnatariIds().clear();
                t.getAssegnatariIds().addAll(nuovi);
                evento(t, TaskEvento.Tipo.ASSEGNATARI, String.join(" ", frasi),
                        null, nuovi.stream().map(String::valueOf).collect(Collectors.joining(",")));
            }
        }
        if (campi.contains("etichettaIds")) {
            Set<Long> nuove = new LinkedHashSet<>(etichetteValide(req.etichettaIds()));
            if (!nuove.equals(t.getEtichettaIds())) {
                Map<Long, String> nomi = etichettaRepository.findAll().stream()
                        .collect(Collectors.toMap(TaskEtichetta::getId, TaskEtichetta::getNome));
                Set<Long> aggiunte = new LinkedHashSet<>(nuove);
                aggiunte.removeAll(t.getEtichettaIds());
                Set<Long> tolte = new LinkedHashSet<>(t.getEtichettaIds());
                tolte.removeAll(nuove);
                List<String> frasi = new ArrayList<>();
                if (!aggiunte.isEmpty()) {
                    frasi.add("ha aggiunto " + (aggiunte.size() == 1 ? "l'etichetta " : "le etichette ")
                            + aggiunte.stream().map(nomi::get).filter(Objects::nonNull).collect(Collectors.joining(", ")));
                }
                if (!tolte.isEmpty()) {
                    frasi.add((frasi.isEmpty() ? "ha rimosso " : "e rimosso ")
                            + (tolte.size() == 1 ? "l'etichetta " : "le etichette ")
                            + tolte.stream().map(nomi::get).filter(Objects::nonNull).collect(Collectors.joining(", ")));
                }
                t.getEtichettaIds().clear();
                t.getEtichettaIds().addAll(nuove);
                evento(t, TaskEvento.Tipo.ETICHETTE, String.join(" ", frasi), null, null);
            }
        }
        Long pazientePrima = t.getPaziente() != null ? t.getPaziente().getId() : null;
        if (campi.contains("pazienteId") && !Objects.equals(req.pazienteId(), pazientePrima)) {
            Paziente p = paziente(req.pazienteId());
            t.setPaziente(p);
            evento(t, TaskEvento.Tipo.PAZIENTE, p == null ? "ha scollegato il paziente" : "ha collegato il paziente " + p.getNomeCompleto(),
                    pazientePrima != null ? String.valueOf(pazientePrima) : null, p != null ? String.valueOf(p.getId()) : null);
        }
        if (campi.contains("ordine") && req.ordine() != null) {
            t.setOrdine(req.ordine());
        }
        if (!soloOrdine) {
            t.setAggiornatoIl(LocalDateTime.now());
        }
    }

    private static AggiornaRequest statoRequest(Stato stato) {
        return new AggiornaRequest(Set.of("stato"), null, null, null, stato, null, null, null, null, null, null, null,
                null, null, null, null);
    }

    // ---------- Ricerca ----------

    private Specification<Task> specifica(Filtri f, Set<Long> soloIds) {
        Set<Long> listeCartella = f.cartellaId() == null ? null : struttura.listeDellaCartella(f.cartellaId());
        return (root, query, cb) -> {
            List<Predicate> and = new ArrayList<>();
            if (f.vista() == Vista.MIEI && f.utenteId() != null) {
                Expression<Collection<Long>> assegnatari = root.get("assegnatariIds");
                and.add(cb.or(cb.isMember(f.utenteId(), assegnatari), cb.isEmpty(assegnatari)));
            }
            if (f.assegnatoA() != null) {
                and.add(cb.isMember(f.assegnatoA(), root.<Collection<Long>>get("assegnatariIds")));
            }
            if (f.listaId() != null) {
                and.add(cb.equal(root.get("lista").get("id"), f.listaId()));
            }
            if (listeCartella != null) {
                and.add(listeCartella.isEmpty() ? cb.disjunction() : root.get("lista").get("id").in(listeCartella));
            }
            if (soloIds != null) {
                and.add(root.get("id").in(soloIds));
            }
            Predicate aperto = cb.not(root.get("stato").in(CHIUSI));
            boolean chiusiAmmessi;
            if (f.stati() != null && !f.stati().isEmpty()) {
                and.add(root.get("stato").in(f.stati()));
                chiusiAmmessi = f.stati().stream().anyMatch(Stato::isChiuso);
            } else if (!f.includiChiusi()) {
                and.add(aperto);
                chiusiAmmessi = false;
            } else {
                chiusiAmmessi = true;
            }
            int giorni = f.chiusiGiorni() != null ? f.chiusiGiorni() : (f.includiChiusi() ? CHIUSI_GIORNI_PREDEFINITI : 0);
            if (chiusiAmmessi && giorni > 0) {
                and.add(cb.or(aperto, cb.greaterThanOrEqualTo(root.get("aggiornatoIl"), LocalDateTime.now().minusDays(giorni))));
            }
            if (f.senzaScadenza()) {
                and.add(cb.isNull(root.get("scadenza")));
            }
            if (f.priorita() != null) {
                and.add(cb.equal(root.get("priorita"), f.priorita()));
            }
            if (f.etichettaId() != null) {
                and.add(cb.isMember(f.etichettaId(), root.<Collection<Long>>get("etichettaIds")));
            }
            if (f.pazienteId() != null) {
                and.add(cb.equal(root.get("paziente").get("id"), f.pazienteId()));
            }
            if (!isBlank(f.q())) {
                String q = f.q().trim();
                String numero = q.startsWith("#") ? q.substring(1) : q;
                // Ogni parola deve comparire nel titolo, nella descrizione o nel nome del paziente collegato
                List<Predicate> parole = new ArrayList<>();
                Join<Task, Paziente> p = root.join("paziente", JoinType.LEFT);
                for (String parola : q.toLowerCase(Locale.ROOT).split("\\s+")) {
                    String like = "%" + parola.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
                    parole.add(cb.or(
                            cb.like(cb.lower(root.get("titolo")), like, '\\'),
                            cb.like(cb.lower(root.get("descrizione")), like, '\\'),
                            cb.like(cb.lower(p.get("nome")), like, '\\'),
                            cb.like(cb.lower(p.get("cognome")), like, '\\')));
                }
                Predicate testo = cb.and(parole.toArray(Predicate[]::new));
                and.add(numero.matches("\\d{1,18}") ? cb.or(testo, cb.equal(root.get("id"), Long.parseLong(numero))) : testo);
            }
            if (f.scadenzaDa() != null) {
                and.add(cb.greaterThanOrEqualTo(root.get("scadenza"), f.scadenzaDa()));
            }
            if (f.scadenzaA() != null) {
                and.add(cb.lessThanOrEqualTo(root.get("scadenza"), f.scadenzaA()));
            }
            return cb.and(and.toArray(Predicate[]::new));
        };
    }

    // ---------- Mapping ----------

    private static final Comparator<Riga> ORDINAMENTO = Comparator
            .comparing(Riga::scadenza, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(Riga::scadenzaOra, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(Riga::priorita, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(Riga::id, Comparator.reverseOrder());

    private List<Riga> toRighe(List<Task> tasks) {
        if (tasks.isEmpty()) {
            return List.of();
        }
        List<Long> ids = tasks.stream().map(Task::getId).toList();
        // L'id di un proxy pigro non lo carica: i nomi arrivano con una query sola
        Set<Long> pazienteIds = tasks.stream().map(Task::getPaziente).filter(Objects::nonNull).map(Paziente::getId)
                .collect(Collectors.toSet());
        Map<Long, TaskDto.Etichetta> etichette = etichettaRepository.findAll().stream()
                .collect(Collectors.toMap(TaskEtichetta::getId, TaskService::toEtichettaDto));
        Map<Long, TaskDto.Paziente> pazienti = nomiPazienti(pazienteIds);
        Set<Long> utenteIds = new HashSet<>();
        tasks.forEach(t -> {
            utenteIds.addAll(t.getAssegnatariIds());
            if (t.getCreatoDaUtenteId() != null) {
                utenteIds.add(t.getCreatoDaUtenteId());
            }
        });
        Map<Long, Utente> utenti = utenti(utenteIds);
        Map<Long, Integer> commenti = conteggi(eventoRepository.contaCommentiPerTask(ids));
        Map<Long, Integer> allegati = conteggi(allegatoRepository.contaPerTask(ids));
        Map<Long, int[]> checklist = new HashMap<>();
        for (Object[] r : checklistRepository.contaPerTask(ids)) {
            checklist.put(((Number) r[0]).longValue(),
                    new int[]{((Number) r[1]).intValue(), r[2] == null ? 0 : ((Number) r[2]).intValue()});
        }
        Map<Long, int[]> sotto = new HashMap<>();
        for (Object[] r : taskRepository.contaSottotask(ids, Stato.COMPLETATO, Stato.ANNULLATO)) {
            sotto.put(((Number) r[0]).longValue(), new int[]{((Number) r[1]).intValue(),
                    r[2] == null ? 0 : ((Number) r[2]).intValue(), r[3] == null ? 0 : ((Number) r[3]).intValue()});
        }
        Map<Long, Integer> attese = conteggi(dipendenzaRepository.contaAttesePerTask(ids, Stato.COMPLETATO, Stato.ANNULLATO));
        Set<Long> principaliIds = tasks.stream().map(Task::getParentId).filter(Objects::nonNull).collect(Collectors.toSet());
        Map<Long, String> titoliPrincipali = new HashMap<>();
        if (!principaliIds.isEmpty()) {
            taskRepository.findAllById(principaliIds).forEach(p -> titoliPrincipali.put(p.getId(), p.getTitolo()));
        }

        List<Riga> out = new ArrayList<>(tasks.size());
        for (Task t : tasks) {
            int[] cl = checklist.getOrDefault(t.getId(), new int[]{0, 0});
            int[] st = sotto.getOrDefault(t.getId(), new int[]{0, 0, 0});
            out.add(new Riga(
                    t.getId(),
                    t.getLista().getId(),
                    t.getTitolo(),
                    t.getStato(),
                    t.getPriorita(),
                    t.getScadenza(),
                    t.getScadenzaOra(),
                    t.getStimaMinuti(),
                    t.getDataInizio(),
                    t.getInizioOra(),
                    t.getAssegnatariIds().stream().map(utenti::get).filter(Objects::nonNull).map(TaskService::persona)
                            .sorted(Comparator.comparing((TaskDto.Persona p) -> nvl(p.cognome()).toLowerCase(Locale.ITALIAN))
                                    .thenComparing(p -> nvl(p.nome()).toLowerCase(Locale.ITALIAN))).toList(),
                    t.getEtichettaIds().stream().map(etichette::get).filter(Objects::nonNull)
                            .sorted(Comparator.comparing(TaskDto.Etichetta::nome)).toList(),
                    t.getPaziente() != null ? pazienti.get(t.getPaziente().getId()) : null,
                    t.getChiaveAutomatica() != null,
                    t.getOrdine(),
                    persona(utenti.get(t.getCreatoDaUtenteId())),
                    t.getCreatedAt(),
                    t.getAggiornatoIl(),
                    t.getCompletatoIl(),
                    commenti.getOrDefault(t.getId(), 0),
                    allegati.getOrDefault(t.getId(), 0),
                    cl[0],
                    cl[1],
                    t.getParentId(),
                    t.getParentId() != null ? titoliPrincipali.get(t.getParentId()) : null,
                    st[0],
                    st[1],
                    st[2],
                    attese.getOrDefault(t.getId(), 0)));
        }
        return out;
    }

    private Dettaglio toDettaglio(Task t) {
        // Le modifiche della transazione vanno nel database prima delle query di conteggio
        taskRepository.flush();
        Riga riga = toRighe(List.of(t)).get(0);
        List<TaskEvento> eventi = eventoRepository.findByTaskIdOrderByIdAsc(t.getId());
        List<TaskAllegato> allegati = allegatoRepository.findByTaskIdOrderByIdAsc(t.getId());
        List<TaskChecklistVoce> checklist = checklistRepository.findByTaskIdOrderByOrdineAscIdAsc(t.getId());
        Map<Long, List<Allegato>> allegatiPerEvento = allegati.stream()
                .filter(a -> a.getEventoId() != null)
                .collect(Collectors.groupingBy(TaskAllegato::getEventoId, LinkedHashMap::new,
                        Collectors.mapping(TaskService::toAllegatoDto, Collectors.toList())));
        return new Dettaglio(
                riga,
                t.getDescrizione(),
                checklist.stream().map(c -> new ChecklistVoce(c.getId(), c.getTesto(), c.isCompletato(), c.getOrdine(),
                        c.getCompletatoIl())).toList(),
                allegati.stream().map(TaskService::toAllegatoDto).toList(),
                eventi.stream().map(e -> new Evento(e.getId(), e.getTipo(), e.getTesto(), e.getValorePrecedente(),
                        e.getValoreNuovo(), e.getCreatoIl(), e.getModificatoIl(),
                        allegatiPerEvento.getOrDefault(e.getId(), List.of()))).toList(),
                t.getParentId() == null ? toRighe(taskRepository.findByParentIdOrderByOrdineAscIdAsc(t.getId())) : List.of(),
                dipendenzeDi(t));
    }

    /** I task che {@code t} aspetta e quelli che blocca. */
    private TaskDto.Dipendenze dipendenzeDi(Task t) {
        List<TaskDipendenza> attende = dipendenzaRepository.findBySuccessoreIdOrderByIdAsc(t.getId());
        List<TaskDipendenza> blocca = dipendenzaRepository.findByPredecessoreIdOrderByIdAsc(t.getId());
        if (attende.isEmpty() && blocca.isEmpty()) {
            return new TaskDto.Dipendenze(List.of(), List.of());
        }
        Set<Long> ids = new LinkedHashSet<>();
        attende.forEach(d -> ids.add(d.getPredecessoreId()));
        blocca.forEach(d -> ids.add(d.getSuccessoreId()));
        Map<Long, Task> task = taskRepository.findAllById(ids).stream().collect(Collectors.toMap(Task::getId, x -> x));
        Function<Long, TaskDto.DipendenzaVoce> voce = id -> {
            Task x = task.get(id);
            return x == null ? null : new TaskDto.DipendenzaVoce(x.getId(), x.getTitolo(), x.getStato(), x.getDataInizio(),
                    x.getScadenza(), x.getLista().getId());
        };
        return new TaskDto.Dipendenze(
                attende.stream().map(d -> voce.apply(d.getPredecessoreId())).filter(Objects::nonNull).toList(),
                blocca.stream().map(d -> voce.apply(d.getSuccessoreId())).filter(Objects::nonNull).toList());
    }

    private static Allegato toAllegatoDto(TaskAllegato a) {
        return new Allegato(a.getId(), a.getNomeFile(), a.getContentType(), a.getEstensione(), a.getDimensione(),
                a.getEventoId(), a.getCreatoIl());
    }

    private static TaskDto.Etichetta toEtichettaDto(TaskEtichetta e) {
        return new TaskDto.Etichetta(e.getId(), e.getNome(), e.getColore());
    }

    private Map<Long, TaskDto.Paziente> nomiPazienti(Collection<Long> ids) {
        Map<Long, TaskDto.Paziente> out = new HashMap<>();
        if (ids.isEmpty()) {
            return out;
        }
        for (Object[] r : taskRepository.findNomiPazienti(ids)) {
            Long id = ((Number) r[0]).longValue();
            out.put(id, new TaskDto.Paziente(id, (String) r[1], (String) r[2]));
        }
        return out;
    }

    private static Map<Long, Integer> conteggi(List<Object[]> righe) {
        Map<Long, Integer> out = new HashMap<>();
        for (Object[] r : righe) {
            out.put(((Number) r[0]).longValue(), ((Number) r[1]).intValue());
        }
        return out;
    }

    private static long numero(Object o) {
        return o == null ? 0 : ((Number) o).longValue();
    }

    private void evento(Task t, TaskEvento.Tipo tipo, String testo, String prima, String dopo) {
        TaskEvento e = new TaskEvento();
        e.setTaskId(t.getId());
        e.setTipo(tipo);
        e.setTesto(testo);
        e.setValorePrecedente(prima != null ? abbrevia(prima, 500) : null);
        e.setValoreNuovo(dopo != null ? abbrevia(dopo, 500) : null);
        eventoRepository.save(e);
    }

    // ---------- Ricerca entità ----------

    private Task trova(Long id) {
        if (id == null) {
            throw new IllegalArgumentException("Task mancante");
        }
        return taskRepository.findById(id).orElseThrow(() -> new RisorsaNonTrovataException("Task non trovato"));
    }

    private TaskLista trovaListaAttiva(Long listaId) {
        if (listaId == null) {
            throw new IllegalArgumentException("Scegli una lista");
        }
        TaskLista l = listaRepository.findById(listaId).orElseThrow(() -> new RisorsaNonTrovataException("Lista non trovata"));
        if (l.getArchiviata()) {
            throw new IllegalArgumentException("La lista " + l.getNome() + " è archiviata");
        }
        return l;
    }

    private TaskLista listaDiSistema(String codice) {
        return listaRepository.findByCodice(codice)
                .orElseThrow(() -> new IllegalArgumentException("Lista di sistema sconosciuta: " + codice));
    }

    private Paziente paziente(Long id) {
        return id == null ? null : pazienteRepository.findByIdAndAttivoTrue(id)
                .orElseThrow(() -> new RisorsaNonTrovataException("Paziente non trovato"));
    }

    private TaskEvento trovaCommento(Task t, Long commentoId) {
        return eventoRepository.findById(commentoId)
                .filter(e -> e.getTaskId().equals(t.getId()) && e.getTipo() == TaskEvento.Tipo.COMMENTO)
                .orElseThrow(() -> new RisorsaNonTrovataException("Commento non trovato"));
    }

    private TaskAllegato trovaAllegato(Task t, Long allegatoId) {
        return allegatoRepository.findById(allegatoId)
                .filter(a -> a.getTaskId().equals(t.getId()))
                .orElseThrow(() -> new RisorsaNonTrovataException("Allegato non trovato"));
    }

    private TaskChecklistVoce trovaVoce(Task t, Long voceId) {
        return checklistRepository.findById(voceId)
                .filter(v -> v.getTaskId().equals(t.getId()))
                .orElseThrow(() -> new RisorsaNonTrovataException("Voce della checklist non trovata"));
    }

    // ---------- Persone ----------

    /** Operatori: gli utenti attivi del gestionale (ADMIN). */
    private List<Utente> operatori() {
        return utenteRepository.findByRuoloAndAttivoTrueOrderByCognomeAscNomeAsc(Utente.Ruolo.ADMIN);
    }

    /** Assegnatari: solo operatori attivi (chi c'era già resta valido anche se disattivato). */
    private List<Long> operatoriValidi(List<Long> ids, Collection<Long> giaPresenti) {
        if (ids == null || ids.isEmpty()) {
            return List.of();
        }
        Set<Long> richiesti = new LinkedHashSet<>(ids);
        richiesti.remove(null);
        Set<Long> attivi = operatori().stream().map(Utente::getId).collect(Collectors.toSet());
        for (Long id : richiesti) {
            if (!attivi.contains(id) && !giaPresenti.contains(id)) {
                throw new IllegalArgumentException("Puoi assegnare i task solo agli utenti attivi del gestionale");
            }
        }
        return new ArrayList<>(richiesti);
    }

    private Map<Long, Utente> utenti(Collection<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return new HashMap<>();
        }
        return utenteRepository.findAllById(ids).stream().collect(Collectors.toMap(Utente::getId, Function.identity()));
    }

    private static TaskDto.Persona persona(Utente u) {
        return u == null ? null : new TaskDto.Persona(u.getId(), u.getNome(), u.getCognome(), iniziali(u));
    }

    private static String nome(Utente u) {
        String n = (nvl(u.getNome()) + " " + nvl(u.getCognome())).trim();
        return n.isEmpty() ? nvl(u.getUsername()) : n;
    }

    private static String elencoNomi(Collection<Long> ids, Map<Long, Utente> utenti) {
        List<String> nomi = ids.stream().map(utenti::get).filter(Objects::nonNull).map(TaskService::nome).toList();
        if (nomi.size() <= 1) {
            return String.join("", nomi);
        }
        return String.join(", ", nomi.subList(0, nomi.size() - 1)) + " e " + nomi.get(nomi.size() - 1);
    }

    private static String iniziali(Utente u) {
        String n = nvl(u.getNome()).trim();
        String c = nvl(u.getCognome()).trim();
        String i = (n.isEmpty() ? "" : n.substring(0, 1)) + (c.isEmpty() ? "" : c.substring(0, 1));
        if (i.isEmpty() && u.getUsername() != null && !u.getUsername().isBlank()) {
            i = u.getUsername().substring(0, 1);
        }
        return i.toUpperCase(Locale.ITALIAN);
    }

    private static String nvl(String s) {
        return s == null ? "" : s;
    }

    // ---------- Validazione e testi ----------

    private List<Long> etichetteValide(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return List.of();
        }
        Set<Long> richieste = new LinkedHashSet<>(ids);
        richieste.remove(null);
        Set<Long> esistenti = etichettaRepository.findAllById(richieste).stream().map(TaskEtichetta::getId)
                .collect(Collectors.toSet());
        if (!esistenti.containsAll(richieste)) {
            throw new IllegalArgumentException("Etichetta non trovata");
        }
        return new ArrayList<>(richieste);
    }

    private double ordineInCima(Long listaId, Stato stato) {
        Double min = taskRepository.findOrdineMinimo(listaId, stato);
        return min == null ? 0 : min - PASSO_ORDINE;
    }

    /** Stima in minuti: vuota o fra 1 minuto e 1000 ore. */
    static Integer stima(Integer minuti) {
        if (minuti == null) {
            return null;
        }
        if (minuti <= 0 || minuti > STIMA_MAX_MINUTI) {
            throw new IllegalArgumentException("La stima va da 1 minuto a 1000 ore");
        }
        return minuti;
    }

    /** L'inizio viene prima della scadenza: lo stesso giorno al più, e con entrambe le ore, prima dell'ora di scadenza. */
    static void periodo(Task t) {
        LocalDate inizio = t.getDataInizio();
        LocalDate scadenza = t.getScadenza();
        if (inizio == null || scadenza == null) {
            return;
        }
        if (inizio.isAfter(scadenza)) {
            throw new IllegalArgumentException("L'inizio non può essere dopo la scadenza");
        }
        if (inizio.equals(scadenza) && t.getInizioOra() != null && t.getScadenzaOra() != null
                && !t.getInizioOra().isBefore(t.getScadenzaOra())) {
            throw new IllegalArgumentException("L'ora d'inizio deve venire prima dell'ora di scadenza");
        }
    }

    /** «45 min», «2 h», «1 h 30 min» */
    static String durata(int minuti) {
        int h = minuti / 60;
        int m = minuti % 60;
        if (h == 0) {
            return m + " min";
        }
        return m == 0 ? h + " h" : h + " h " + m + " min";
    }

    private static String titolo(String s) {
        if (isBlank(s)) {
            throw new IllegalArgumentException("Il titolo è obbligatorio");
        }
        String t = s.replaceAll("\\s+", " ").trim();
        if (t.length() > MAX_TITOLO) {
            throw new IllegalArgumentException("Il titolo può avere al massimo " + MAX_TITOLO + " caratteri");
        }
        return t;
    }

    private static String testo(String s) {
        if (isBlank(s)) {
            return null;
        }
        String t = s.strip();
        if (t.length() > MAX_TESTO) {
            throw new IllegalArgumentException("Testo troppo lungo (massimo " + MAX_TESTO + " caratteri)");
        }
        return t;
    }

    private static String testoObbligatorio(String s, String messaggio) {
        String t = testo(s);
        if (t == null) {
            throw new IllegalArgumentException(messaggio);
        }
        return t;
    }

    private static String voceChecklist(String s) {
        if (isBlank(s)) {
            throw new IllegalArgumentException("Scrivi il testo della voce");
        }
        String t = s.replaceAll("\\s+", " ").trim();
        return t.length() > 500 ? t.substring(0, 500) : t;
    }

    private static String colore(String c, String predefinito) {
        if (isBlank(c)) {
            return predefinito;
        }
        if (!COLORE.matcher(c.trim()).matches()) {
            throw new IllegalArgumentException("Colore non valido: usa il formato #RRGGBB");
        }
        return c.trim().toUpperCase(Locale.ROOT);
    }

    private static String nomeFile(String originale) {
        String n = originale == null ? "" : originale.replace('\\', '/');
        n = n.substring(n.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}]", "").trim();
        if (n.isEmpty()) {
            n = "file";
        }
        return n.length() > 255 ? n.substring(n.length() - 255) : n;
    }

    private static String estensione(String nomeFile) {
        int punto = nomeFile.lastIndexOf('.');
        if (punto < 0 || punto == nomeFile.length() - 1) {
            return null;
        }
        String e = nomeFile.substring(punto + 1).toLowerCase(Locale.ROOT);
        return e.length() > 20 ? null : e;
    }

    private static String scadenza(LocalDate data, LocalTime ora) {
        if (data == null) {
            return null;
        }
        String g = data.format(GIORNO);
        return ora == null ? g : g + " alle " + ora.format(ORA);
    }

    private static String etichetta(Stato s) {
        return switch (s) {
            case DA_FARE -> "Da fare";
            case IN_CORSO -> "In corso";
            case IN_ATTESA -> "In attesa";
            case COMPLETATO -> "Completato";
            case ANNULLATO -> "Annullato";
        };
    }

    private static String etichetta(Task.Priorita p) {
        return switch (p) {
            case URGENTE -> "Urgente";
            case ALTA -> "Alta";
            case NORMALE -> "Normale";
            case BASSA -> "Bassa";
        };
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static String abbrevia(String s, int max) {
        if (s == null) {
            return "";
        }
        String t = s.replaceAll("\\s+", " ").trim();
        return t.length() > max ? t.substring(0, max - 1) + "…" : t;
    }
}
