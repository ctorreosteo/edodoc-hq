package it.edodoc.hq.repositories;

import it.edodoc.hq.models.PlannerStorico;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PlannerStoricoRepository extends JpaRepository<PlannerStorico, Long> {

    List<PlannerStorico> findByPostIdOrderByCreatoIlDescIdDesc(Long postId);
}
