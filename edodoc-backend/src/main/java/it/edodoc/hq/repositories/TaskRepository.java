package it.edodoc.hq.repositories;

import it.edodoc.hq.models.Task;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface TaskRepository extends JpaRepository<Task, Long> {

    @Query("""
            select t from Task t join fetch t.tipo left join fetch t.paziente
            where t.stato = 'DA_FARE'
            order by case when t.scadenza is null then 1 else 0 end, t.scadenza, t.id
            """)
    List<Task> findAperti();

    @Query("""
            select t from Task t join fetch t.tipo left join fetch t.paziente
            where t.stato = 'FATTO' and t.completatoIl is not null
            order by t.completatoIl desc
            limit 100
            """)
    List<Task> findCompletatiRecenti();

    @Query("""
            select t from Task t join fetch t.tipo left join fetch t.paziente
            where t.paziente.id = :pazienteId
            order by t.stato, t.scadenza
            """)
    List<Task> findDelPaziente(@Param("pazienteId") Long pazienteId);

    boolean existsByChiaveAutomatica(String chiaveAutomatica);

    long countByStato(Task.Stato stato);

    long countByStatoAndScadenzaBefore(Task.Stato stato, LocalDate data);
}
