package it.edodoc.hq.repositories;

import it.edodoc.hq.models.MailingAutomazione;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface MailingAutomazioneRepository extends JpaRepository<MailingAutomazione, Long> {

    List<MailingAutomazione> findByStato(MailingAutomazione.Stato stato);

}
