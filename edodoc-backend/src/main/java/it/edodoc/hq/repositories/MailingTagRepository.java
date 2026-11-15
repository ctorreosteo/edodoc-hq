package it.edodoc.hq.repositories;

import it.edodoc.hq.models.MailingTag;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface MailingTagRepository extends JpaRepository<MailingTag, Long> {

    Optional<MailingTag> findByNomeIgnoreCase(String nome);

    List<MailingTag> findAllByOrderByNomeAsc();
}
