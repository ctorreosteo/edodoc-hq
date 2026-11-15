package it.edodoc.hq.repositories;

import it.edodoc.hq.models.MailingLink;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface MailingLinkRepository extends JpaRepository<MailingLink, Long> {

    Optional<MailingLink> findByCampagnaIdAndIndice(Long campagnaId, Integer indice);

    Optional<MailingLink> findByAutomazioneEmailIdAndIndice(Long automazioneEmailId, Integer indice);

    List<MailingLink> findByCampagnaIdOrderByIndiceAsc(Long campagnaId);

    List<MailingLink> findByAutomazioneEmailIdOrderByIndiceAsc(Long automazioneEmailId);

    void deleteByCampagnaId(Long campagnaId);

    void deleteByAutomazioneEmailId(Long automazioneEmailId);
}
