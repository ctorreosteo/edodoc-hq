package it.edodoc.hq.repositories;

import it.edodoc.hq.models.PlannerBrand;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PlannerBrandRepository extends JpaRepository<PlannerBrand, Long> {

    List<PlannerBrand> findAllByOrderByPosizioneAscIdAsc();
}
