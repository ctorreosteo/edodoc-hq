package it.edodoc.hq.repositories;

import it.edodoc.hq.models.SessioneApp;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.Optional;

public interface SessioneAppRepository extends JpaRepository<SessioneApp, Long> {
    Optional<SessioneApp> findByRefreshHash(String refreshHash);

    void deleteByUtenteId(Long utenteId);

    void deleteByUtenteIdAndScadenzaBefore(Long utenteId, LocalDateTime scadenza);
}
