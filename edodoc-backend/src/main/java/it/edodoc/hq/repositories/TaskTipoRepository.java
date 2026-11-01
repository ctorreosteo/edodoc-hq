package it.edodoc.hq.repositories;

import it.edodoc.hq.models.TaskTipo;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface TaskTipoRepository extends JpaRepository<TaskTipo, Long> {
    List<TaskTipo> findByAttivoTrueOrderByOrdine();

    Optional<TaskTipo> findByCodice(String codice);
}
