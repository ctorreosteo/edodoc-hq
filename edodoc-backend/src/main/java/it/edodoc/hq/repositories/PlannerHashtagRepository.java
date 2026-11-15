package it.edodoc.hq.repositories;

import it.edodoc.hq.models.PlannerHashtag;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PlannerHashtagRepository extends JpaRepository<PlannerHashtag, Long> {

    List<PlannerHashtag> findAllByOrderByUsiDescNomeAsc();
}
