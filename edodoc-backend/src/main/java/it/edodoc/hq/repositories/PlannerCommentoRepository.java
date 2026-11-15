package it.edodoc.hq.repositories;

import it.edodoc.hq.models.PlannerCommento;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface PlannerCommentoRepository extends JpaRepository<PlannerCommento, Long> {

    List<PlannerCommento> findByPostIdOrderByCreatoIlAscIdAsc(Long postId);

    @Query("SELECT c.postId, COUNT(c) FROM PlannerCommento c WHERE c.postId IN :ids GROUP BY c.postId")
    List<Object[]> contaPerPost(@Param("ids") Collection<Long> postIds);
}
