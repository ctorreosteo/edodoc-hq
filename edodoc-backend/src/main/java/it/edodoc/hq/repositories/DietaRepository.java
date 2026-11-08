package it.edodoc.hq.repositories;

import it.edodoc.hq.models.Dieta;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface DietaRepository extends JpaRepository<Dieta, Long> {

    @Query("select d from Dieta d left join fetch d.paziente order by d.updatedAt desc")
    List<Dieta> findTutte();

    @Query("select d from Dieta d left join fetch d.paziente where d.paziente.id = :pazienteId order by d.createdAt desc")
    List<Dieta> findDelPaziente(Long pazienteId);
}
