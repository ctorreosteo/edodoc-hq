package it.edodoc.hq.repositories;

import it.edodoc.hq.models.TaskAllegato;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface TaskAllegatoRepository extends JpaRepository<TaskAllegato, Long> {

    List<TaskAllegato> findByTaskIdOrderByIdAsc(Long taskId);

    List<TaskAllegato> findByEventoId(Long eventoId);

    /** [taskId, numero allegati] */
    @Query("SELECT a.taskId, COUNT(a) FROM TaskAllegato a WHERE a.taskId IN :taskIds GROUP BY a.taskId")
    List<Object[]> contaPerTask(@Param("taskIds") Collection<Long> taskIds);

    @org.springframework.data.jpa.repository.Modifying
    @Query("DELETE FROM TaskAllegato x WHERE x.taskId IN :taskIds")
    int eliminaPerTask(@Param("taskIds") Collection<Long> taskIds);
}
