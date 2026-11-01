package it.edodoc.hq.repositories;

import it.edodoc.hq.models.Lezione;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface LezioneRepository extends JpaRepository<Lezione, Long> {

    List<Lezione> findByModuloIdOrderByOrdineAscIdAsc(Long moduloId);

    @Query("select l from Lezione l where l.modulo.corso.id = :corsoId order by l.ordine, l.id")
    List<Lezione> findDelCorso(Long corsoId);

    @Query("select l from Lezione l join fetch l.modulo m join fetch m.corso")
    List<Lezione> findTutte();

    @Query("select coalesce(max(l.ordine), 0) from Lezione l where l.modulo.id = :moduloId")
    int findMaxOrdine(Long moduloId);

    /** Ciò che il paziente può vedere: unico punto in cui vive questa regola, con findVisibile. */
    @Query("""
            select l from Lezione l join fetch l.modulo m join fetch m.corso c
            where c.pubblicato = true and l.pubblicata = true
              and ((l.tipo = 'VIDEO' and l.videoStato = 'PRONTO')
                   or (l.tipo = 'TESTO' and l.contenuto is not null and trim(l.contenuto) <> ''))
            order by m.ordine, m.id, l.ordine, l.id
            """)
    List<Lezione> findVisibili();

    default Optional<Lezione> findVisibile(Long id) {
        return findVisibili().stream().filter(l -> l.getId().equals(id)).findFirst();
    }
}
