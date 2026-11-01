package it.edodoc.hq.repositories;

import it.edodoc.hq.models.Paziente;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface PazienteRepository extends JpaRepository<Paziente, Long> {
    List<Paziente> findByAttivoTrueOrderByCognomeAscNomeAsc();

    List<Paziente> findByAttivoTrueAndStatoInOrderByCognomeAscNomeAsc(Collection<Paziente.Stato> stati);

    Optional<Paziente> findByIdAndAttivoTrue(Long id);

    long countByAttivoTrueAndStato(Paziente.Stato stato);

    @Query("select p from Paziente p where p.attivo = true and lower(trim(p.email)) in :indirizzi")
    List<Paziente> findConEmailIn(@Param("indirizzi") Collection<String> indirizzi);
}
