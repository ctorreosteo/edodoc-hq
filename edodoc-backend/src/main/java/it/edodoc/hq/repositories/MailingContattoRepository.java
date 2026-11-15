package it.edodoc.hq.repositories;

import it.edodoc.hq.models.MailingContatto;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface MailingContattoRepository extends JpaRepository<MailingContatto, Long> {

    Optional<MailingContatto> findByEmailIgnoreCase(String email);

    Optional<MailingContatto> findByToken(String token);

    List<MailingContatto> findByPazienteId(Long pazienteId);



    long countByStato(MailingContatto.Stato stato);
}
