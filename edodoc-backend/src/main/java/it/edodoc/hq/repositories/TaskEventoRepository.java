package it.edodoc.hq.repositories;

import it.edodoc.hq.models.TaskEvento;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface TaskEventoRepository extends JpaRepository<TaskEvento, Long> {

    List<TaskEvento> findByTaskIdOrderByIdAsc(Long taskId);

    /** [taskId, numero commenti] */
    @Query("SELECT e.taskId, COUNT(e) FROM TaskEvento e "
            + "WHERE e.taskId IN :taskIds AND e.tipo = it.edodoc.hq.models.TaskEvento.Tipo.COMMENTO GROUP BY e.taskId")
    List<Object[]> contaCommentiPerTask(@Param("taskIds") Collection<Long> taskIds);

    @org.springframework.data.jpa.repository.Modifying
    @Query("DELETE FROM TaskEvento x WHERE x.taskId IN :taskIds")
    int eliminaPerTask(@Param("taskIds") Collection<Long> taskIds);
}
