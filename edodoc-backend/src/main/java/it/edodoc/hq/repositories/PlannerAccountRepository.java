package it.edodoc.hq.repositories;

import it.edodoc.hq.models.PlannerAccount;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PlannerAccountRepository extends JpaRepository<PlannerAccount, Long> {

    List<PlannerAccount> findAllByOrderByIdAsc();

    List<PlannerAccount> findByBrandIdOrderByIdAsc(Long brandId);

    List<PlannerAccount> findByCanaleAndTipo(String canale, String tipo);
}
