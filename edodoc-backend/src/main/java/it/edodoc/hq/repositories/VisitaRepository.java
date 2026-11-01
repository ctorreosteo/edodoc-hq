package it.edodoc.hq.repositories;

import it.edodoc.hq.models.Visita;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface VisitaRepository extends JpaRepository<Visita, Long> {

    @Query("""
            select v from Visita v join fetch v.paziente left join fetch v.percorso
            where v.inizio >= :da and v.inizio < :a
            order by v.inizio
            """)
    List<Visita> findNelPeriodo(@Param("da") LocalDateTime da, @Param("a") LocalDateTime a);

    @Query("""
            select v from Visita v join fetch v.paziente left join fetch v.percorso
            where v.paziente.id = :pazienteId
            order by v.inizio desc
            """)
    List<Visita> findDelPaziente(@Param("pazienteId") Long pazienteId);

    @Query("""
            select v from Visita v join fetch v.paziente left join fetch v.percorso
            where v.id = :id
            """)
    Optional<Visita> findConDettagli(@Param("id") Long id);

    @Query("""
            select v from Visita v
            where v.percorso.id = :percorsoId and v.stato <> 'ANNULLATA'
            order by v.inizio, v.id
            """)
    List<Visita> findValideDelPercorso(@Param("percorsoId") Long percorsoId);

    @Query("select v from Visita v join fetch v.percorso where v.stato <> 'ANNULLATA'")
    List<Visita> findValideConPercorso();

    @Query("""
            select v from Visita v join fetch v.paziente left join fetch v.percorso
            where v.googleSyncStato <> 'SINCRONIZZATA' and (v.inizio >= :da or v.googleEventId is not null)
            order by v.inizio
            """)
    List<Visita> findDaSincronizzare(@Param("da") LocalDateTime da);

    Optional<Visita> findByGoogleEventId(String googleEventId);

    @Query("select v from Visita v join fetch v.paziente where v.googleEventId in :ids")
    List<Visita> findByGoogleEventIdIn(@Param("ids") Collection<String> ids);

    @Query("""
            select v.paziente.id as pazienteId, min(v.inizio) as inizio from Visita v
            where v.stato = 'PROGRAMMATA' and v.inizio >= :da
            group by v.paziente.id
            """)
    List<ProssimaVisita> findProssimeVisite(@Param("da") LocalDateTime da);

    /** Altre visite valide che si accavallano con l'orario richiesto. */
    @Query("""
            select v from Visita v join fetch v.paziente
            where v.stato <> 'ANNULLATA' and v.inizio < :fine and v.fine > :inizio
              and (:escludiId is null or v.id <> :escludiId)
            order by v.inizio
            """)
    List<Visita> findSovrapposte(@Param("inizio") LocalDateTime inizio, @Param("fine") LocalDateTime fine,
                                 @Param("escludiId") Long escludiId);

    long countByStatoInAndInizioBetween(Collection<Visita.Stato> stati, LocalDateTime da, LocalDateTime a);

    interface ProssimaVisita {
        Long getPazienteId();

        LocalDateTime getInizio();
    }
}
