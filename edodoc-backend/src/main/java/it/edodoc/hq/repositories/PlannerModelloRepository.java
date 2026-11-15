package it.edodoc.hq.repositories;

import it.edodoc.hq.models.PlannerModello;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface PlannerModelloRepository extends JpaRepository<PlannerModello, Long> {

    /** I modelli dello spazio e quelli di tutti gli spazi, più usati prima. */
    @Query("SELECT m FROM PlannerModello m WHERE m.brandId IS NULL OR m.brandId = :brandId ORDER BY m.usi DESC, m.nome ASC")
    List<PlannerModello> perSpazio(@Param("brandId") Long brandId);
}
