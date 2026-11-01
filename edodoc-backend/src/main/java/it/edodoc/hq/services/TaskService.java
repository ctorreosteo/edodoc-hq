package it.edodoc.hq.services;

import it.edodoc.hq.dto.TaskDto;
import it.edodoc.hq.exception.RisorsaNonTrovataException;
import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.models.Task;
import it.edodoc.hq.models.TaskLista;
import it.edodoc.hq.repositories.PazienteRepository;
import it.edodoc.hq.repositories.TaskListaRepository;
import it.edodoc.hq.repositories.TaskRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Service
public class TaskService {

    private final TaskRepository taskRepository;
    private final TaskListaRepository taskListaRepository;
    private final PazienteRepository pazienteRepository;

    public TaskService(TaskRepository taskRepository, TaskListaRepository taskListaRepository,
                       PazienteRepository pazienteRepository) {
        this.taskRepository = taskRepository;
        this.taskListaRepository = taskListaRepository;
        this.pazienteRepository = pazienteRepository;
    }

    @Transactional(readOnly = true)
    public List<TaskDto.Riga> lista(boolean ancheCompletati) {
        LocalDate oggi = LocalDate.now();
        List<Task> task = new ArrayList<>(taskRepository.findAperti());
        if (ancheCompletati) {
            task.addAll(taskRepository.findCompletatiRecenti());
        }
        return task.stream().map(t -> TaskDto.Riga.da(t, oggi)).toList();
    }

    @Transactional(readOnly = true)
    public List<TaskDto.Riga> delPaziente(Long pazienteId) {
        LocalDate oggi = LocalDate.now();
        return taskRepository.findDelPaziente(pazienteId).stream().map(t -> TaskDto.Riga.da(t, oggi)).toList();
    }

    /** L'id di una lista di sistema, per chi crea task da codice. */
    @Transactional(readOnly = true)
    public Long idListaDiSistema(String codice) {
        return listaDiSistema(codice).getId();
    }

    @Transactional
    public TaskDto.Riga crea(TaskDto.Salva richiesta) {
        Task task = new Task();
        applica(task, richiesta);
        return TaskDto.Riga.da(taskRepository.save(task), LocalDate.now());
    }

    @Transactional
    public TaskDto.Riga aggiorna(Long id, TaskDto.Salva richiesta) {
        Task task = trova(id);
        applica(task, richiesta);
        return TaskDto.Riga.da(task, LocalDate.now());
    }

    @Transactional
    public TaskDto.Riga cambiaStato(Long id, boolean fatto) {
        Task task = trova(id);
        task.setStato(fatto ? Task.Stato.FATTO : Task.Stato.DA_FARE);
        task.setCompletatoIl(fatto ? LocalDateTime.now() : null);
        return TaskDto.Riga.da(task, LocalDate.now());
    }

    @Transactional
    public void elimina(Long id) {
        taskRepository.delete(trova(id));
    }

    /** Per job e flussi di dominio: la chiave impedisce di ricreare un promemoria già esistito. */
    @Transactional
    public void creaAutomatico(String chiave, String listaCodice, String titolo, Task.Priorita priorita,
                               LocalDate scadenza, Paziente paziente) {
        if (taskRepository.existsByChiaveAutomatica(chiave)) {
            return;
        }
        Task task = new Task();
        task.setChiaveAutomatica(chiave);
        task.setLista(listaDiSistema(listaCodice));
        task.setTitolo(titolo);
        task.setPriorita(priorita);
        task.setScadenza(scadenza);
        task.setPaziente(paziente);
        taskRepository.save(task);
    }

    private void applica(Task task, TaskDto.Salva r) {
        TaskLista lista = taskListaRepository.findById(r.listaId())
                .orElseThrow(() -> new RisorsaNonTrovataException("Lista non trovata"));
        if (lista.getArchiviata() && lista != task.getLista()) {
            throw new IllegalArgumentException("La lista " + lista.getNome() + " è archiviata");
        }
        task.setLista(lista);
        task.setTitolo(r.titolo().trim());
        task.setDescrizione(r.descrizione());
        task.setPriorita(r.priorita() != null ? r.priorita() : Task.Priorita.MEDIA);
        task.setScadenza(r.scadenza());
        task.setPaziente(r.pazienteId() == null ? null : pazienteRepository.findByIdAndAttivoTrue(r.pazienteId())
                .orElseThrow(() -> new RisorsaNonTrovataException("Paziente non trovato")));
    }

    private TaskLista listaDiSistema(String codice) {
        return taskListaRepository.findByCodice(codice)
                .orElseThrow(() -> new IllegalArgumentException("Lista di sistema sconosciuta: " + codice));
    }

    private Task trova(Long id) {
        return taskRepository.findById(id).orElseThrow(() -> new RisorsaNonTrovataException("Task non trovato"));
    }
}
