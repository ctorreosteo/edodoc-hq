package it.edodoc.hq.services;

import it.edodoc.hq.dto.TaskDto;
import it.edodoc.hq.exception.ConflittoException;
import it.edodoc.hq.exception.RisorsaNonTrovataException;
import it.edodoc.hq.models.TaskCartella;
import it.edodoc.hq.models.TaskLista;
import it.edodoc.hq.repositories.TaskCartellaRepository;
import it.edodoc.hq.repositories.TaskListaRepository;
import it.edodoc.hq.repositories.TaskRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Objects;

/** Cartelle e liste dei task. */
@Service
public class TaskStrutturaService {

    private static final int PASSO_ORDINE = 10;
    private static final String COLORE_CARTELLA = "#64748B";
    private static final String COLORE_LISTA = "#6366F1";

    private final TaskCartellaRepository cartellaRepository;
    private final TaskListaRepository listaRepository;
    private final TaskRepository taskRepository;

    public TaskStrutturaService(TaskCartellaRepository cartellaRepository, TaskListaRepository listaRepository,
                                TaskRepository taskRepository) {
        this.cartellaRepository = cartellaRepository;
        this.listaRepository = listaRepository;
        this.taskRepository = taskRepository;
    }

    @Transactional(readOnly = true)
    public TaskDto.Struttura struttura() {
        return new TaskDto.Struttura(
                cartellaRepository.findAll().stream().map(TaskDto.Cartella::da).toList(),
                listaRepository.findAll().stream().map(TaskDto.Lista::da).toList());
    }

    @Transactional
    public TaskDto.Cartella creaCartella(TaskDto.SalvaCartella r) {
        TaskCartella cartella = new TaskCartella();
        cartella.setNome(r.nome().trim());
        cartella.setParent(contenitore(r.parentId()));
        cartella.setColore(r.colore() != null ? r.colore() : COLORE_CARTELLA);
        cartella.setOrdine(prossimoOrdine(r.parentId()));
        return TaskDto.Cartella.da(cartellaRepository.save(cartella));
    }

    @Transactional
    public TaskDto.Lista creaLista(TaskDto.SalvaLista r) {
        TaskLista lista = new TaskLista();
        lista.setNome(r.nome().trim());
        lista.setCartella(contenitore(r.cartellaId()));
        lista.setColore(r.colore() != null ? r.colore() : COLORE_LISTA);
        if (r.icona() != null) {
            lista.setIcona(r.icona());
        }
        lista.setOrdine(prossimoOrdine(r.cartellaId()));
        return TaskDto.Lista.da(listaRepository.save(lista));
    }

    @Transactional
    public TaskDto.Cartella modificaCartella(Long id, TaskDto.ModificaStruttura r) {
        TaskCartella cartella = trovaCartella(id);
        if (Boolean.TRUE.equals(r.archiviata()) && contieneListaDiSistema(cartella)) {
            throw new ConflittoException("Questa cartella contiene una lista dei task automatici: spostala prima di archiviare");
        }
        if (r.nome() != null) {
            cartella.setNome(r.nome().trim());
        }
        if (r.colore() != null) {
            cartella.setColore(r.colore());
        }
        if (r.archiviata() != null) {
            cartella.setArchiviata(r.archiviata());
        }
        return TaskDto.Cartella.da(cartella);
    }

    @Transactional
    public TaskDto.Lista modificaLista(Long id, TaskDto.ModificaStruttura r) {
        TaskLista lista = trovaLista(id);
        if (Boolean.TRUE.equals(r.archiviata()) && lista.getCodice() != null) {
            throw new ConflittoException("Qui arrivano i task automatici: questa lista non si può archiviare");
        }
        if (r.nome() != null) {
            lista.setNome(r.nome().trim());
        }
        if (r.colore() != null) {
            lista.setColore(r.colore());
        }
        if (r.icona() != null) {
            lista.setIcona(r.icona());
        }
        if (r.archiviata() != null) {
            lista.setArchiviata(r.archiviata());
        }
        return TaskDto.Lista.da(lista);
    }

    @Transactional
    public TaskDto.Cartella spostaCartella(Long id, TaskDto.Sposta r) {
        TaskCartella cartella = trovaCartella(id);
        TaskCartella destinazione = contenitore(r.contenitoreId());
        for (TaskCartella c = destinazione; c != null; c = c.getParent()) {
            if (c.getId().equals(id)) {
                throw new IllegalArgumentException("Una cartella non può stare dentro sé stessa");
            }
        }
        cartella.setOrdine(r.ordine() != null ? r.ordine() : prossimoOrdine(r.contenitoreId()));
        cartella.setParent(destinazione);
        return TaskDto.Cartella.da(cartella);
    }

    @Transactional
    public TaskDto.Lista spostaLista(Long id, TaskDto.Sposta r) {
        TaskLista lista = trovaLista(id);
        lista.setOrdine(r.ordine() != null ? r.ordine() : prossimoOrdine(r.contenitoreId()));
        lista.setCartella(contenitore(r.contenitoreId()));
        return TaskDto.Lista.da(lista);
    }

    @Transactional
    public void eliminaCartella(Long id) {
        TaskCartella cartella = trovaCartella(id);
        if (cartellaRepository.existsByParentId(id) || listaRepository.existsByCartellaId(id)) {
            throw new ConflittoException("Si possono eliminare solo le cartelle vuote");
        }
        cartellaRepository.delete(cartella);
    }

    @Transactional(readOnly = true)
    public long contaTask(Long listaId) {
        return taskRepository.countByListaId(trovaLista(listaId).getId());
    }

    /** I task della lista spariscono con lei: se ce ne sono, serve il suo nome come conferma. */
    @Transactional
    public void eliminaLista(Long id, String conferma) {
        TaskLista lista = trovaLista(id);
        if (lista.getCodice() != null) {
            throw new ConflittoException("Qui arrivano i task automatici: questa lista non si può eliminare");
        }
        if (taskRepository.countByListaId(id) > 0 && !lista.getNome().equals(conferma)) {
            throw new IllegalArgumentException("Scrivi il nome della lista per confermare");
        }
        listaRepository.delete(lista);
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
}
