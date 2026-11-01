package it.edodoc.hq.repositories;

import it.edodoc.hq.models.Modulo;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface ModuloRepository extends JpaRepository<Modulo, Long> {

    List<Modulo> findByCorsoIdOrderByOrdineAscIdAsc(Long corsoId);

    @Query("select coalesce(max(m.ordine), 0) from Modulo m where m.corso.id = :corsoId")
    int findMaxOrdine(Long corsoId);

    @Query("select m.corso.id, count(m) from Modulo m group by m.corso.id")
    List<Object[]> contaPerCorso();
}
