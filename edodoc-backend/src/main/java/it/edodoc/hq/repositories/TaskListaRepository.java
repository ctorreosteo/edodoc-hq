package it.edodoc.hq.repositories;

import it.edodoc.hq.models.TaskLista;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface TaskListaRepository extends JpaRepository<TaskLista, Long> {
    Optional<TaskLista> findByCodice(String codice);

    List<TaskLista> findByCodiceIsNotNull();

    boolean existsByCartellaId(Long cartellaId);
}
