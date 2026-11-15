package it.edodoc.hq.repositories;

import it.edodoc.hq.models.Utente;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UtenteRepository extends JpaRepository<Utente, Long> {
    Optional<Utente> findByUsernameIgnoreCase(String username);

    Optional<Utente> findByPazienteId(Long pazienteId);

    /** Operatori del gestionale: chi può essere assegnatario di un task. */
    java.util.List<Utente> findByRuoloAndAttivoTrueOrderByCognomeAscNomeAsc(Utente.Ruolo ruolo);

    Optional<Utente> findByInvitoTokenHash(String invitoTokenHash);
}
