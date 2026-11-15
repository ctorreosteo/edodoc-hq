package it.edodoc.hq.repositories;

import it.edodoc.hq.models.MailingMittente;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface MailingMittenteRepository extends JpaRepository<MailingMittente, Long> {

    Optional<MailingMittente> findByEmailIgnoreCase(String email);

    Optional<MailingMittente> findFirstByPredefinitoTrueAndAttivoTrue();

    List<MailingMittente> findByAttivoTrueOrderByEmailAsc();
}
