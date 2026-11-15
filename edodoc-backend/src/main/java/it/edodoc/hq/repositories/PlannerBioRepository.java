package it.edodoc.hq.repositories;

import it.edodoc.hq.models.PlannerBio;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface PlannerBioRepository extends JpaRepository<PlannerBio, Long> {

    Optional<PlannerBio> findByBrandId(Long brandId);

    Optional<PlannerBio> findBySlug(String slug);

    boolean existsBySlugAndIdNot(String slug, Long id);

    boolean existsBySlug(String slug);

    @Modifying
    @Query(value = "INSERT INTO planner_bio_clic (bio_id, chiave, giorno, clic) VALUES (:bioId, :chiave, :giorno, 1) "
            + "ON CONFLICT (bio_id, chiave, giorno) DO UPDATE SET clic = planner_bio_clic.clic + 1", nativeQuery = true)
    void contaClic(@Param("bioId") Long bioId, @Param("chiave") String chiave, @Param("giorno") LocalDate giorno);

    @Modifying
    @Query(value = "INSERT INTO planner_bio_visite (bio_id, giorno, visite) VALUES (:bioId, :giorno, 1) "
            + "ON CONFLICT (bio_id, giorno) DO UPDATE SET visite = planner_bio_visite.visite + 1", nativeQuery = true)
    void contaVisita(@Param("bioId") Long bioId, @Param("giorno") LocalDate giorno);

    /** chiave → clic dal giorno indicato. */
    @Query(value = "SELECT chiave, SUM(clic) FROM planner_bio_clic WHERE bio_id = :bioId AND giorno >= :dal GROUP BY chiave",
            nativeQuery = true)
    List<Object[]> clicDal(@Param("bioId") Long bioId, @Param("dal") LocalDate dal);

    @Query(value = "SELECT COALESCE(SUM(visite), 0) FROM planner_bio_visite WHERE bio_id = :bioId AND giorno >= :dal",
            nativeQuery = true)
    long visiteDal(@Param("bioId") Long bioId, @Param("dal") LocalDate dal);
}
