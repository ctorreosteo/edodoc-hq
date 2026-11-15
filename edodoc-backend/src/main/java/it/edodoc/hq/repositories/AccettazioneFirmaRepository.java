package it.edodoc.hq.repositories;

import it.edodoc.hq.models.AccettazioneFirma;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface AccettazioneFirmaRepository extends JpaRepository<AccettazioneFirma, Long> {

    List<AccettazioneFirma> findByPazienteIdOrderByCreataIlDesc(Long pazienteId);

    Optional<AccettazioneFirma> findByTokenHash(String tokenHash);

    Optional<AccettazioneFirma> findByCodiceVerifica(String codiceVerifica);

    boolean existsByCodiceVerifica(String codiceVerifica);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from AccettazioneFirma a where a.id = :id")
    Optional<AccettazioneFirma> findByIdPerAggiornamento(@Param("id") Long id);
}
