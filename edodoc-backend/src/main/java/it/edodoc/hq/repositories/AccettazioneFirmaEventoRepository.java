package it.edodoc.hq.repositories;

import it.edodoc.hq.models.AccettazioneFirmaEvento;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AccettazioneFirmaEventoRepository extends JpaRepository<AccettazioneFirmaEvento, Long> {

    List<AccettazioneFirmaEvento> findByAccettazioneIdOrderBySeqAsc(Long accettazioneId);

    Optional<AccettazioneFirmaEvento> findFirstByAccettazioneIdOrderBySeqDesc(Long accettazioneId);
}
