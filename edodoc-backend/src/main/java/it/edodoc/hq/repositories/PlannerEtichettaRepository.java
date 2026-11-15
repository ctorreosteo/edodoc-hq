package it.edodoc.hq.repositories;

import it.edodoc.hq.models.PlannerEtichetta;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PlannerEtichettaRepository extends JpaRepository<PlannerEtichetta, Long> {

    List<PlannerEtichetta> findAllByOrderByPosizioneAscIdAsc();
}
