package it.edodoc.hq.repositories;

import it.edodoc.hq.models.Corso;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface CorsoRepository extends JpaRepository<Corso, Long> {

    @Query("select c from Corso c order by lower(c.titolo)")
    List<Corso> findCatalogo();
}
