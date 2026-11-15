package it.edodoc.hq.services;

import it.edodoc.hq.dto.TaskDto;
import it.edodoc.hq.exception.ConflittoException;
import it.edodoc.hq.exception.RisorsaNonTrovataException;
import it.edodoc.hq.models.Task;
import it.edodoc.hq.models.TaskCartella;
import it.edodoc.hq.models.TaskLista;
import it.edodoc.hq.repositories.TaskCartellaRepository;
import it.edodoc.hq.repositories.TaskListaRepository;
import it.edodoc.hq.repositories.TaskRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

/** Cartelle e liste dei task (un solo utente: nessun permesso, si vede e si gestisce tutto). */
@Service
public class TaskStrutturaService {

    private static final Logger logger = LoggerFactory.getLogger(TaskStrutturaService.class);
    private static final int PASSO_ORDINE = 10;
    private static final String COLORE_CARTELLA = "#64748B";
    private static final String COLORE_LISTA = "#6366F1";
    private static final Pattern COLORE = Pattern.compile("^#[0-9A-Fa-f]{6}$");
    static final List<Task.Stato> CHIUSI = List.of(Task.Stato.COMPLETATO, Task.Stato.ANNULLATO);

    private final TaskCartellaRepository cartellaRepository;
    private final TaskListaRepository listaRepository;
    private final TaskRepository taskRepository;

    public TaskStrutturaService(TaskCartellaRepository cartellaRepository, TaskListaRepository listaRepository,
                                TaskRepository taskRepository) {
        this.cartellaRepository = cartellaRepository;
        this.listaRepository = listaRepository;
        this.taskRepository = taskRepository;
    }

    // ---------- Lettura ----------

    @Transactional(readOnly = true)
    public TaskDto.Struttura struttura() {
        return new TaskDto.Struttura(cartelle(), liste());
    }

    @Transactional(readOnly = true)
    public List<TaskDto.Cartella> cartelle() {
        return cartellaRepository.findAll().stream()
                .sorted(Comparator.comparing(TaskCartella::getOrdine).thenComparing(c -> c.getNome().toLowerCase(Locale.ITALIAN)))
                .map(TaskDto.Cartella::da).toList();
    }

    @Transactional(readOnly = true)
    public List<TaskDto.Lista> liste() {
        Map<Long, Long> aperti = apertiPerLista();
        return listaRepository.findAll().stream()
                .sorted(Comparator.comparing(TaskLista::getOrdine).thenComparing(l -> l.getNome().toLowerCase(Locale.ITALIAN)))
                .map(l -> TaskDto.Lista.da(l, aperti.getOrDefault(l.getId(), 0L))).toList();
    }

    /** Le liste dentro la cartella, anche nelle sue sottocartelle. */
    @Transactional(readOnly = true)
    public Set<Long> listeDellaCartella(Long cartellaId) {
        Map<Long, Long> genitori = new HashMap<>();
        cartellaRepository.findAll().forEach(c -> genitori.put(c.getId(), c.getParent() != null ? c.getParent().getId() : null));
        Set<Long> out = new HashSet<>();
        for (TaskLista l : listaRepository.findAll()) {
            for (Long c = l.getCartella() != null ? l.getCartella().getId() : null; c != null; c = genitori.get(c)) {
                if (c.equals(cartellaId)) {
                    out.add(l.getId());
                    break;
                }
            }
        }
        return out;
    }

    // ---------- Liste ----------

    @Transactional
    public TaskDto.Lista creaLista(TaskDto.ListaRequest r) {
        if (r == null) {
            throw new IllegalArgumentException("Dati della lista mancanti");
        }
        TaskLista lista = new TaskLista();
        lista.setCartella(contenitore(r.cartellaId()));
        lista.setOrdine(prossimoOrdine(r.cartellaId()));
        lista.setColore(COLORE_LISTA);
        applica(lista, r.nome(), r.descrizione(), r.colore(), r.icona(), r.ordine(), r.archiviata());
        return listaDto(listaRepository.save(lista));
    }

    @Transactional
    public TaskDto.Lista aggiornaLista(Long id, TaskDto.ListaRequest r) {
        TaskLista lista = trovaLista(id);
        if (r == null) {
            return listaDto(lista);
        }
        if (Boolean.TRUE.equals(r.archiviata()) && lista.getCodice() != null) {
            throw new ConflittoException("Qui arrivano i task automatici: questa lista non si può archiviare");
        }
        applica(lista, r.nome(), r.descrizione(), r.colore(), r.icona(), r.ordine(), r.archiviata());
        return listaDto(lista);
    }

    @Transactional
    public TaskDto.Lista spostaLista(Long id, TaskDto.SpostaRequest r) {
        TaskLista lista = trovaLista(id);
        Long destinazione = r != null ? r.destinazioneId() : null;
        Long attuale = lista.getCartella() != null ? lista.getCartella().getId() : null;
        if (!Objects.equals(destinazione, attuale)) {
            lista.setCartella(contenitore(destinazione));
            if (r == null || r.ordine() == null) {
                lista.setOrdine(prossimoOrdine(destinazione));
            }
        }
        if (r != null && r.ordine() != null) {
            lista.setOrdine(r.ordine());
        }
        return listaDto(lista);
    }

    @Transactional(readOnly = true)
    public long contaTask(Long listaId) {
        return taskRepository.countByListaId(trovaLista(listaId).getId());
    }

    /** I task della lista spariscono con lei: se ce ne sono, serve il suo nome come conferma. */
    @Transactional
    public TaskDto.ListaEliminata eliminaLista(Long id, String conferma) {
        TaskLista lista = trovaLista(id);
        if (lista.getCodice() != null) {
            throw new ConflittoException("Qui arrivano i task automatici: questa lista non si può eliminare");
        }
        long quanti = taskRepository.countByListaId(id);
        if (quanti > 0 && (conferma == null || !conferma.trim().equalsIgnoreCase(lista.getNome().trim()))) {
            throw new IllegalArgumentException("Per eliminare una lista con " + quanti + " task scrivi il suo nome per conferma");
        }
        int eliminati = taskRepository.eliminaPerLista(id);
        listaRepository.delete(lista);
        logger.info("Lista task {} «{}» eliminata con {} task", id, lista.getNome(), eliminati);
        return new TaskDto.ListaEliminata(id, lista.getNome(), eliminati);
    }

    // ---------- Cartelle ----------

    @Transactional
    public TaskDto.Cartella creaCartella(TaskDto.CartellaRequest r) {
        if (r == null) {
            throw new IllegalArgumentException("Dati della cartella mancanti");
        }
        TaskCartella cartella = new TaskCartella();
        cartella.setParent(contenitore(r.parentId()));
        cartella.setOrdine(prossimoOrdine(r.parentId()));
        cartella.setColore(COLORE_CARTELLA);
        applica(cartella, r.nome(), r.descrizione(), r.colore(), r.icona(), r.ordine(), r.archiviata());
        return TaskDto.Cartella.da(cartellaRepository.save(cartella));
    }

    @Transactional
    public TaskDto.Cartella aggiornaCartella(Long id, TaskDto.CartellaRequest r) {
        TaskCartella cartella = trovaCartella(id);
        if (r == null) {
            return TaskDto.Cartella.da(cartella);
        }
        if (Boolean.TRUE.equals(r.archiviata()) && contieneListaDiSistema(cartella)) {
            throw new ConflittoException("Questa cartella contiene una lista dei task automatici: spostala prima di archiviare");
        }
        applica(cartella, r.nome(), r.descrizione(), r.colore(), r.icona(), r.ordine(), r.archiviata());
        return TaskDto.Cartella.da(cartella);
    }

    @Transactional
    public TaskDto.Cartella spostaCartella(Long id, TaskDto.SpostaRequest r) {
        TaskCartella cartella = trovaCartella(id);
        Long destinazione = r != null ? r.destinazioneId() : null;
        Long attuale = cartella.getParent() != null ? cartella.getParent().getId() : null;
        if (!Objects.equals(destinazione, attuale)) {
            TaskCartella nuova = contenitore(destinazione);
            for (TaskCartella c = nuova; c != null; c = c.getParent()) {
                if (c.getId().equals(id)) {
                    throw new IllegalArgumentException("Non puoi spostare una cartella dentro sé stessa o dentro una sua sottocartella");
                }
            }
            cartella.setParent(nuova);
            if (r == null || r.ordine() == null) {
                cartella.setOrdine(prossimoOrdine(destinazione));
            }
        }
        if (r != null && r.ordine() != null) {
            cartella.setOrdine(r.ordine());
        }
        return TaskDto.Cartella.da(cartella);
    }

    /** Si elimina solo una cartella vuota. */
    @Transactional
    public void eliminaCartella(Long id) {
        TaskCartella cartella = trovaCartella(id);
        if (cartellaRepository.existsByParentId(id) || listaRepository.existsByCartellaId(id)) {
            throw new ConflittoException("La cartella non è vuota: sposta o elimina prima liste e sottocartelle");
        }
        cartellaRepository.delete(cartella);
    }

    // ---------- Supporto ----------

    private Map<Long, Long> apertiPerLista() {
        Map<Long, Long> out = new HashMap<>();
        for (Object[] r : taskRepository.contaApertiPerLista(CHIUSI)) {
            out.put(((Number) r[0]).longValue(), ((Number) r[1]).longValue());
        }
        return out;
    }

    private TaskDto.Lista listaDto(TaskLista l) {
        return TaskDto.Lista.da(l, apertiPerLista().getOrDefault(l.getId(), 0L));
    }

    private static void applica(TaskLista l, String nome, String descrizione, String colore, String icona, Integer ordine,
                                Boolean archiviata) {
        if (nome != null || l.getNome() == null) {
            l.setNome(nome(nome, "lista"));
        }
        if (descrizione != null) {
            l.setDescrizione(descrizione.isBlank() ? null : abbrevia(descrizione.trim(), 500));
        }
        l.setColore(colore(colore, l.getColore()));
        if (icona != null) {
            l.setIcona(icona.isBlank() ? "list" : abbrevia(icona.trim(), 40));
        }
        if (ordine != null) {
            l.setOrdine(ordine);
        }
        if (archiviata != null) {
            l.setArchiviata(archiviata);
        }
    }

    private static void applica(TaskCartella c, String nome, String descrizione, String colore, String icona, Integer ordine,
                                Boolean archiviata) {
        if (nome != null || c.getNome() == null) {
            c.setNome(nome(nome, "cartella"));
        }
        if (descrizione != null) {
            c.setDescrizione(descrizione.isBlank() ? null : abbrevia(descrizione.trim(), 500));
        }
        c.setColore(colore(colore, c.getColore()));
        if (icona != null) {
            c.setIcona(icona.isBlank() ? null : abbrevia(icona.trim(), 40));
        }
        if (ordine != null) {
            c.setOrdine(ordine);
        }
        if (archiviata != null) {
            c.setArchiviata(archiviata);
        }
    }

    private boolean contieneListaDiSistema(TaskCartella cartella) {
        for (TaskLista lista : listaRepository.findByCodiceIsNotNull()) {
            for (TaskCartella c = lista.getCartella(); c != null; c = c.getParent()) {
                if (c.getId().equals(cartella.getId())) {
                    return true;
                }
            }
        }
        return false;
    }

    /** In coda al contenitore: cartelle e liste hanno ognuna il proprio ordine, ma il passo basta per entrambe. */
    private int prossimoOrdine(Long contenitoreId) {
        int cartelle = cartellaRepository.findAll().stream()
                .filter(c -> Objects.equals(idDi(c.getParent()), contenitoreId))
                .mapToInt(TaskCartella::getOrdine).max().orElse(0);
        int liste = listaRepository.findAll().stream()
                .filter(l -> Objects.equals(idDi(l.getCartella()), contenitoreId))
                .mapToInt(TaskLista::getOrdine).max().orElse(0);
        return Math.max(cartelle, liste) + PASSO_ORDINE;
    }

    private static Long idDi(TaskCartella cartella) {
        return cartella != null ? cartella.getId() : null;
    }

    private TaskCartella contenitore(Long id) {
        return id != null ? trovaCartella(id) : null;
    }

    private TaskCartella trovaCartella(Long id) {
        return cartellaRepository.findById(id).orElseThrow(() -> new RisorsaNonTrovataException("Cartella non trovata"));
    }

    private TaskLista trovaLista(Long id) {
        return listaRepository.findById(id).orElseThrow(() -> new RisorsaNonTrovataException("Lista non trovata"));
    }

    private static String nome(String s, String cosa) {
        if (s == null || s.isBlank()) {
            throw new IllegalArgumentException("Dai un nome alla " + cosa);
        }
        String t = s.replaceAll("\\s+", " ").trim();
        if (t.length() > 100) {
            throw new IllegalArgumentException("Il nome può avere al massimo 100 caratteri");
        }
        return t;
    }

    private static String colore(String c, String predefinito) {
        if (c == null || c.isBlank()) {
            return predefinito;
        }
        if (!COLORE.matcher(c.trim()).matches()) {
            throw new IllegalArgumentException("Colore non valido: usa il formato #RRGGBB");
        }
        return c.trim().toUpperCase(Locale.ROOT);
    }

    private static String abbrevia(String s, int max) {
        return s.length() > max ? s.substring(0, max - 1) + "…" : s;
    }
}
