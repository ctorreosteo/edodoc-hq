package it.edodoc.hq.repositories;

import it.edodoc.hq.models.MailingEvento;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface MailingEventoRepository extends JpaRepository<MailingEvento, Long> {

    List<MailingEvento> findByInvioIdOrderByAvvenutoIlAsc(Long invioId);

    List<MailingEvento> findTop100ByContattoIdOrderByAvvenutoIlDesc(Long contattoId);
}
