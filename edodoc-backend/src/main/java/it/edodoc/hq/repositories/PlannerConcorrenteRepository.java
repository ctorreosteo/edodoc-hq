package it.edodoc.hq.repositories;

import it.edodoc.hq.models.PlannerConcorrente;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PlannerConcorrenteRepository extends JpaRepository<PlannerConcorrente, Long> {

    List<PlannerConcorrente> findByBrandIdOrderByUsernameAsc(Long brandId);

    boolean existsByBrandIdAndUsername(Long brandId, String username);
}
