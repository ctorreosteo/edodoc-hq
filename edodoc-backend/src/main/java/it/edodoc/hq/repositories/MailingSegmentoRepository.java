package it.edodoc.hq.repositories;

import it.edodoc.hq.models.MailingSegmento;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface MailingSegmentoRepository extends JpaRepository<MailingSegmento, Long> {

    List<MailingSegmento> findAllByOrderByNomeAsc();
}
