package it.edodoc.hq.repositories;

import it.edodoc.hq.models.MailingInvio;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface MailingInvioRepository extends JpaRepository<MailingInvio, Long> {

    Optional<MailingInvio> findByToken(String token);

    Optional<MailingInvio> findFirstByMessageId(String messageId);

    Optional<MailingInvio> findByCampagnaIdAndContattoId(Long campagnaId, Long contattoId);

    boolean existsByCampagnaIdAndContattoId(Long campagnaId, Long contattoId);

    long countByCampagnaIdAndStato(Long campagnaId, MailingInvio.Stato stato);

    List<MailingInvio> findByIscrizioneId(Long iscrizioneId);
}
