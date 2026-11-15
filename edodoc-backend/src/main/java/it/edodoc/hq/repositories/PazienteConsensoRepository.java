package it.edodoc.hq.repositories;

import it.edodoc.hq.models.PazienteConsenso;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PazienteConsensoRepository extends JpaRepository<PazienteConsenso, Long> {

    List<PazienteConsenso> findByPazienteIdOrderByIlDesc(Long pazienteId);
}
