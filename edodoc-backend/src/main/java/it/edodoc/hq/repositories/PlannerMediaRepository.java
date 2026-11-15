package it.edodoc.hq.repositories;

import it.edodoc.hq.models.PlannerMedia;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface PlannerMediaRepository extends JpaRepository<PlannerMedia, Long> {

    Optional<PlannerMedia> findByToken(String token);

    /** Libreria: più recenti prima; {@code q} in forma LIKE minuscola su nome e tag, null = tutti. */
    @Query("SELECT m FROM PlannerMedia m WHERE (:tipo IS NULL OR m.tipo = :tipo) AND (:q IS NULL "
            + "OR LOWER(COALESCE(m.nomeFile, '')) LIKE :q OR LOWER(COALESCE(m.tag, '')) LIKE :q) ORDER BY m.creatoIl DESC, m.id DESC")
    List<PlannerMedia> cerca(@Param("tipo") String tipo, @Param("q") String q, Pageable pageable);
}
