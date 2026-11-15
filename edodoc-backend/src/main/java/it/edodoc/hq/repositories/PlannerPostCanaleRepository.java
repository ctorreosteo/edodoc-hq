package it.edodoc.hq.repositories;

import it.edodoc.hq.models.PlannerPostCanale;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

public interface PlannerPostCanaleRepository extends JpaRepository<PlannerPostCanale, Long> {

    List<PlannerPostCanale> findByPostIdOrderByIdAsc(Long postId);

    List<PlannerPostCanale> findByPostIdInOrderByIdAsc(Collection<Long> postIds);

    @Modifying
    @Query("DELETE FROM PlannerPostCanale c WHERE c.postId = :postId")
    void eliminaDelPost(@Param("postId") Long postId);

    /** Canali pubblicati di recente da rileggere (metriche). */
    @Query("SELECT c FROM PlannerPostCanale c WHERE c.stato = 'PUBBLICATO' AND c.idEsterno IS NOT NULL "
            + "AND c.modalita = 'AUTOMATICA' AND c.pubblicatoIl >= :dal ORDER BY c.pubblicatoIl DESC")
    List<PlannerPostCanale> pubblicatiAutomaticiDal(@Param("dal") LocalDateTime dal);

    @Query("SELECT c FROM PlannerPostCanale c, PlannerPost p WHERE c.postId = p.id AND p.brandId = :brandId "
            + "AND c.stato = 'PUBBLICATO' AND c.pubblicatoIl >= :dal AND c.pubblicatoIl < :al")
    List<PlannerPostCanale> pubblicatiNelPeriodo(@Param("brandId") Long brandId, @Param("dal") LocalDateTime dal,
                                                 @Param("al") LocalDateTime al);
}
