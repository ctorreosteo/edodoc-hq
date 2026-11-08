package it.edodoc.hq.repositories;

import it.edodoc.hq.models.DietaVersione;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface DietaVersioneRepository extends JpaRepository<DietaVersione, Long> {

    List<DietaVersione> findByDietaIdOrderByNumeroDesc(Long dietaId);

    Optional<DietaVersione> findFirstByDietaIdOrderByNumeroDesc(Long dietaId);

    Optional<DietaVersione> findByDietaIdAndNumero(Long dietaId, Integer numero);

    long countByDietaId(Long dietaId);

    @Query("select v.dieta.id, count(v) from DietaVersione v group by v.dieta.id")
    List<Object[]> contaPerDieta();
}
