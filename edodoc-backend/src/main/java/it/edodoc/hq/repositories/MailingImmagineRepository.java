package it.edodoc.hq.repositories;

import it.edodoc.hq.models.MailingImmagine;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface MailingImmagineRepository extends JpaRepository<MailingImmagine, Long> {

    Optional<MailingImmagine> findByToken(String token);
}
