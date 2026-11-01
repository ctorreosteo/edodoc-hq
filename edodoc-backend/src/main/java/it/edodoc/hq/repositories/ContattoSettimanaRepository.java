package it.edodoc.hq.repositories;

import it.edodoc.hq.models.ContattoSettimana;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface ContattoSettimanaRepository extends JpaRepository<ContattoSettimana, Long> {
    Optional<ContattoSettimana> findByPazienteIdAndSettimana(Long pazienteId, LocalDate settimana);

    List<ContattoSettimana> findBySettimana(LocalDate settimana);
}
