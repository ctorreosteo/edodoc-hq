package it.edodoc.hq.repositories;

import it.edodoc.hq.models.MailingContattoCategoriaEsclusa;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface MailingContattoCategoriaEsclusaRepository extends JpaRepository<MailingContattoCategoriaEsclusa, MailingContattoCategoriaEsclusa.Chiave> {

    List<MailingContattoCategoriaEsclusa> findByContattoId(Long contattoId);

    boolean existsByContattoIdAndCategoriaId(Long contattoId, Long categoriaId);

    void deleteByContattoId(Long contattoId);
}
