package it.edodoc.hq.repositories;

import it.edodoc.hq.models.TaskColonneUtente;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TaskColonneUtenteRepository extends JpaRepository<TaskColonneUtente, TaskColonneUtente.Chiave> {

    List<TaskColonneUtente> findByUtenteId(Long utenteId);

    long countByUtenteId(Long utenteId);
}
