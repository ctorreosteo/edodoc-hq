package it.edodoc.hq.repositories;

import it.edodoc.hq.models.Task;
import it.edodoc.hq.models.TaskDipendenza;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface TaskDipendenzaRepository extends JpaRepository<TaskDipendenza, Long> {

    Optional<TaskDipendenza> findByPredecessoreIdAndSuccessoreId(Long predecessoreId, Long successoreId);

    List<TaskDipendenza> findBySuccessoreIdOrderByIdAsc(Long successoreId);

    List<TaskDipendenza> findByPredecessoreIdOrderByIdAsc(Long predecessoreId);

    /** Quelle che toccano almeno uno dei task. */
    @Query("SELECT d FROM TaskDipendenza d WHERE d.predecessoreId IN :ids OR d.successoreId IN :ids ORDER BY d.id")
    List<TaskDipendenza> findPerTask(@Param("ids") Collection<Long> ids);

    /** Successori diretti: serve a rifiutare i cicli. */
    @Query("SELECT d.successoreId FROM TaskDipendenza d WHERE d.predecessoreId IN :ids")
    List<Long> findSuccessori(@Param("ids") Collection<Long> ids);

    /** [successoreId, predecessori ancora aperti] */
    @Query("SELECT d.successoreId, COUNT(d) FROM TaskDipendenza d, Task p WHERE p.id = d.predecessoreId "
            + "AND d.successoreId IN :ids AND p.stato <> :completato AND p.stato <> :annullato GROUP BY d.successoreId")
    List<Object[]> contaAttesePerTask(@Param("ids") Collection<Long> ids, @Param("completato") Task.Stato completato,
                                      @Param("annullato") Task.Stato annullato);
}
