package it.edodoc.hq.repositories;

import it.edodoc.hq.models.Config;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface ConfigRepository extends JpaRepository<Config, Long> {
    Optional<Config> findByChiave(String chiave);

    /** Blocca la riga fino al commit: serve al numero fattura, che non deve avere buchi né doppioni. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from Config c where c.chiave = :chiave")
    Optional<Config> findByChiavePerAggiornare(@Param("chiave") String chiave);
}
