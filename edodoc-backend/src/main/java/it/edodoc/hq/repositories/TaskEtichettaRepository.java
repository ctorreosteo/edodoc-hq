package it.edodoc.hq.repositories;

import it.edodoc.hq.models.TaskEtichetta;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface TaskEtichettaRepository extends JpaRepository<TaskEtichetta, Long> {

    List<TaskEtichetta> findAllByOrderByNomeAsc();

    Optional<TaskEtichetta> findByNomeIgnoreCase(String nome);
}
