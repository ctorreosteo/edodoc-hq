package it.edodoc.hq.repositories;

import it.edodoc.hq.models.Percorso;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface PercorsoRepository extends JpaRepository<Percorso, Long> {
    List<Percorso> findByPazienteIdOrderByDataInizioDesc(Long pazienteId);

    Optional<Percorso> findFirstByPazienteIdAndStatoOrderByDataInizioDesc(Long pazienteId, Percorso.Stato stato);

    @Query("""
            select p from Percorso p join fetch p.paziente pz
            where pz.attivo = true
            order by p.dataInizio desc, p.id desc
            """)
    List<Percorso> findDeiPazienti();

    @Query("select p from Percorso p join fetch p.paziente where p.stato = 'ATTIVO'")
    List<Percorso> findAttivi();

    @Query("""
            select p from Percorso p join fetch p.paziente
            where p.stato = 'ATTIVO' and p.dataFine between :da and :a
            order by p.dataFine
            """)
    List<Percorso> findAttiviInScadenza(@Param("da") LocalDate da, @Param("a") LocalDate a);
}
