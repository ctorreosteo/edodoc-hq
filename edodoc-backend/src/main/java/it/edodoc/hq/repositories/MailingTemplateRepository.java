package it.edodoc.hq.repositories;

import it.edodoc.hq.models.MailingTemplate;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface MailingTemplateRepository extends JpaRepository<MailingTemplate, Long> {


    List<MailingTemplate> findAllByOrderByNomeAsc();
}
