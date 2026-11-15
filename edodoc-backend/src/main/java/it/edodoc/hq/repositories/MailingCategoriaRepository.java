package it.edodoc.hq.repositories;

import it.edodoc.hq.models.MailingCategoria;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface MailingCategoriaRepository extends JpaRepository<MailingCategoria, Long> {

    List<MailingCategoria> findAllByOrderByOrdineAsc();

    List<MailingCategoria> findByAttivaTrueOrderByOrdineAsc();
}
