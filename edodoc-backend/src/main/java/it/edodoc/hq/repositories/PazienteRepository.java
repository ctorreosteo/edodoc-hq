package it.edodoc.hq.repositories;

import it.edodoc.hq.models.Paziente;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface PazienteRepository extends JpaRepository<Paziente, Long> {
    List<Paziente> findByAttivoTrueOrderByCognomeAscNomeAsc();

    List<Paziente> findByAttivoTrueAndStatoInOrderByCognomeAscNomeAsc(Collection<Paziente.Stato> stati);

    Optional<Paziente> findByIdAndAttivoTrue(Long id);

    long countByAttivoTrueAndStato(Paziente.Stato stato);
}
