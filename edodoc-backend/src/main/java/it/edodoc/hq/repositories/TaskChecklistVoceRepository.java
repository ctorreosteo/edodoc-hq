package it.edodoc.hq.repositories;

import it.edodoc.hq.models.TaskChecklistVoce;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface TaskChecklistVoceRepository extends JpaRepository<TaskChecklistVoce, Long> {

    List<TaskChecklistVoce> findByTaskIdOrderByOrdineAscIdAsc(Long taskId);

    @Query("SELECT COALESCE(MAX(c.ordine), 0) FROM TaskChecklistVoce c WHERE c.taskId = :taskId")
    int findOrdineMassimo(@Param("taskId") Long taskId);

    /** [taskId, totale, completati] */
    @Query("SELECT c.taskId, COUNT(c), SUM(CASE WHEN c.completato = true THEN 1 ELSE 0 END) "
            + "FROM TaskChecklistVoce c WHERE c.taskId IN :taskIds GROUP BY c.taskId")
    List<Object[]> contaPerTask(@Param("taskIds") Collection<Long> taskIds);

    @org.springframework.data.jpa.repository.Modifying
    @Query("DELETE FROM TaskChecklistVoce x WHERE x.taskId IN :taskIds")
    int eliminaPerTask(@Param("taskIds") Collection<Long> taskIds);
}
