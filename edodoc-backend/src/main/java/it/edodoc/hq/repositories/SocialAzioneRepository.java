package it.edodoc.hq.repositories;

import it.edodoc.hq.models.SocialAzione;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface SocialAzioneRepository extends JpaRepository<SocialAzione, Long> {

    List<SocialAzione> findByPageIdOrderByCreatoIlDesc(String pageId, Pageable pageable);

    List<SocialAzione> findByTipoInAndOggettoIdIn(Collection<String> tipi, Collection<String> oggettoIds);

    List<SocialAzione> findByTipoAndRisultatoIdIn(String tipo, Collection<String> risultatoIds);
}
