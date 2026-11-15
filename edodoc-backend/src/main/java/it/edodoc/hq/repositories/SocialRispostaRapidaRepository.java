package it.edodoc.hq.repositories;

import it.edodoc.hq.models.SocialRispostaRapida;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface SocialRispostaRapidaRepository extends JpaRepository<SocialRispostaRapida, Long> {

    List<SocialRispostaRapida> findAllByOrderByUsiDescTitoloAsc();

    @Modifying
    @Query("UPDATE SocialRispostaRapida r SET r.usi = r.usi + 1 WHERE r.id = :id")
    int incrementaUsi(@Param("id") Long id);
}
