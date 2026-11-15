package it.edodoc.hq.repositories;

import it.edodoc.hq.models.PlannerPostMedia;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface PlannerPostMediaRepository extends JpaRepository<PlannerPostMedia, Long> {

    List<PlannerPostMedia> findByPostIdOrderByPosizioneAsc(Long postId);

    List<PlannerPostMedia> findByPostIdInOrderByPosizioneAsc(Collection<Long> postIds);

    @Modifying
    @Query("DELETE FROM PlannerPostMedia m WHERE m.postId = :postId")
    void eliminaDelPost(@Param("postId") Long postId);

    long countByMediaId(Long mediaId);

    /** mediaId → in quanti post è usato. */
    @Query("SELECT m.mediaId, COUNT(DISTINCT m.postId) FROM PlannerPostMedia m WHERE m.mediaId IN :ids GROUP BY m.mediaId")
    List<Object[]> usi(@Param("ids") Collection<Long> mediaIds);
}
