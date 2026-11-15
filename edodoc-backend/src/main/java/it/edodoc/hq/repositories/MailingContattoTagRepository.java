package it.edodoc.hq.repositories;

import it.edodoc.hq.models.MailingContattoTag;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface MailingContattoTagRepository extends JpaRepository<MailingContattoTag, MailingContattoTag.Chiave> {

    List<MailingContattoTag> findByContattoId(Long contattoId);

    boolean existsByContattoIdAndTagId(Long contattoId, Long tagId);

    long countByTagId(Long tagId);

    void deleteByContattoIdAndTagId(Long contattoId, Long tagId);
}
