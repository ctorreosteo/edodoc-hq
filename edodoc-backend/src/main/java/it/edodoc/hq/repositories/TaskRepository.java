package it.edodoc.hq.repositories;

import it.edodoc.hq.models.Task;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Collection;
import java.util.List;

public interface TaskRepository extends JpaRepository<Task, Long>, JpaSpecificationExecutor<Task> {

    /** Aperti (né completati né annullati), dal più urgente: per l'elenco classico e la dashboard. */
    @Query("""
            select t from Task t join fetch t.lista left join fetch t.paziente
            where t.stato not in (it.edodoc.hq.models.Task.Stato.COMPLETATO, it.edodoc.hq.models.Task.Stato.ANNULLATO)
            order by case when t.scadenza is null then 1 else 0 end, t.scadenza, t.scadenzaOra, t.id
            """)
    List<Task> findAperti();

    @Query("""
            select t from Task t join fetch t.lista left join fetch t.paziente
            where t.stato in (it.edodoc.hq.models.Task.Stato.COMPLETATO, it.edodoc.hq.models.Task.Stato.ANNULLATO)
            order by t.aggiornatoIl desc, t.id desc
            limit 100
            """)
    List<Task> findCompletatiRecenti();

    @Query("""
            select t from Task t join fetch t.lista left join fetch t.paziente
            where t.paziente.id = :pazienteId
            order by case when t.stato in (it.edodoc.hq.models.Task.Stato.COMPLETATO, it.edodoc.hq.models.Task.Stato.ANNULLATO)
                     then 1 else 0 end, t.scadenza
            """)
    List<Task> findDelPaziente(@Param("pazienteId") Long pazienteId);

    boolean existsByChiaveAutomatica(String chiaveAutomatica);

    long countByListaId(Long listaId);

    long countByStatoNotIn(Collection<Task.Stato> stati);

    long countByStatoNotInAndScadenzaBefore(Collection<Task.Stato> stati, LocalDate data);

    /** Posizione più alta occupata in una colonna del kanban (per mettere in cima i nuovi task). */
    @Query("SELECT MIN(t.ordine) FROM Task t WHERE t.lista.id = :listaId AND t.stato = :stato")
    Double findOrdineMinimo(@Param("listaId") Long listaId, @Param("stato") Task.Stato stato);

    /** [id, nome, cognome] dei pazienti collegati. */
    @Query("SELECT p.id, p.nome, p.cognome FROM Paziente p WHERE p.id IN :ids")
    List<Object[]> findNomiPazienti(@Param("ids") Collection<Long> ids);

    /** Sottotask di un task, nell'ordine in cui stanno. */
    List<Task> findByParentIdOrderByOrdineAscIdAsc(Long parentId);

    /** [parentId, sottotask, completati, aperti (né completati né annullati)] per i task dati. */
    @Query("SELECT t.parentId, COUNT(t), SUM(CASE WHEN t.stato = :completato THEN 1 ELSE 0 END), "
            + "SUM(CASE WHEN t.stato = :completato OR t.stato = :annullato THEN 0 ELSE 1 END) "
            + "FROM Task t WHERE t.parentId IN :ids GROUP BY t.parentId")
    List<Object[]> contaSottotask(@Param("ids") Collection<Long> ids, @Param("completato") Task.Stato completato,
                                  @Param("annullato") Task.Stato annullato);

    /** [listaId, task aperti] */
    @Query("SELECT t.lista.id, COUNT(t) FROM Task t WHERE t.stato NOT IN :chiusi GROUP BY t.lista.id")
    List<Object[]> contaApertiPerLista(@Param("chiusi") Collection<Task.Stato> chiusi);

    /**
     * [inRitardo, oggi, prossimi7Giorni, senzaScadenza] sui task aperti della vista «I miei»: assegnati all'utente o senza
     * assegnatari. Un task di oggi con orario già passato è in ritardo.
     */
    @Query(value = """
            SELECT COUNT(*) FILTER (WHERE scadenza < :oggi OR (scadenza = :oggi AND scadenza_ora < :ora)),
                   COUNT(*) FILTER (WHERE scadenza = :oggi AND (scadenza_ora IS NULL OR scadenza_ora >= :ora)),
                   COUNT(*) FILTER (WHERE scadenza > :oggi AND scadenza <= :fra7),
                   COUNT(*) FILTER (WHERE scadenza IS NULL)
            FROM task t
            WHERE stato NOT IN ('COMPLETATO', 'ANNULLATO')
              AND (EXISTS (SELECT 1 FROM task_assegnatari a WHERE a.task_id = t.id AND a.utente_id = :utenteId)
                   OR NOT EXISTS (SELECT 1 FROM task_assegnatari a WHERE a.task_id = t.id))
            """, nativeQuery = true)
    List<Object[]> contatoriMiei(@Param("utenteId") Long utenteId, @Param("oggi") LocalDate oggi, @Param("ora") LocalTime ora,
                                 @Param("fra7") LocalDate fra7);

    /** Elimina tutti i task di una lista: sottotask, commenti, allegati, checklist e dipendenze se ne vanno in cascata. */
    @Modifying
    @Query(value = "DELETE FROM task WHERE lista_id = :listaId", nativeQuery = true)
    int eliminaPerLista(@Param("listaId") Long listaId);
}
