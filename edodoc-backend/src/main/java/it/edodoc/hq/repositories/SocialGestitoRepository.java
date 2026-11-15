package it.edodoc.hq.repositories;

import it.edodoc.hq.models.SocialGestito;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface SocialGestitoRepository extends JpaRepository<SocialGestito, Long> {

    Optional<SocialGestito> findByOggettoId(String oggettoId);

    List<SocialGestito> findByOggettoIdIn(Collection<String> oggettoIds);
}
