package it.edodoc.hq.repositories;

import it.edodoc.hq.models.MailingAutomazioneEmail;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface MailingAutomazioneEmailRepository extends JpaRepository<MailingAutomazioneEmail, Long> {

    List<MailingAutomazioneEmail> findByAutomazioneId(Long automazioneId);

}
