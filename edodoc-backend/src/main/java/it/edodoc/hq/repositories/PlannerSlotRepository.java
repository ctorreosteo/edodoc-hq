package it.edodoc.hq.repositories;

import it.edodoc.hq.models.PlannerSlot;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PlannerSlotRepository extends JpaRepository<PlannerSlot, Long> {

    List<PlannerSlot> findAllByOrderByGiornoAscOraAsc();
}
