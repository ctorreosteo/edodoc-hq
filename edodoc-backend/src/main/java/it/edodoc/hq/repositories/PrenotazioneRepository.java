package it.edodoc.hq.repositories;

import it.edodoc.hq.models.Prenotazione;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface PrenotazioneRepository extends JpaRepository<Prenotazione, Long> {

    @Query("""
            select p from Prenotazione p join fetch p.visita v join fetch p.paziente
            order by v.inizio desc
            """)
    List<Prenotazione> findTutte();

    @Query("select p from Prenotazione p join fetch p.visita join fetch p.paziente where p.id = :id")
    Optional<Prenotazione> findConDettagli(@Param("id") Long id);

    Optional<Prenotazione> findByVisitaId(Long visitaId);
}
