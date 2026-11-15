package it.edodoc.hq.repositories;

import it.edodoc.hq.models.MailingCampagna;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface MailingCampagnaRepository extends JpaRepository<MailingCampagna, Long> {


    List<MailingCampagna> findByStato(MailingCampagna.Stato stato);

    List<MailingCampagna> findByStatoAndProgrammataIlLessThanEqual(MailingCampagna.Stato stato, LocalDateTime limite);
}
