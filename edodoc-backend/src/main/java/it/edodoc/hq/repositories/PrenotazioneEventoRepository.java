package it.edodoc.hq.repositories;

import it.edodoc.hq.models.PrenotazioneEvento;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PrenotazioneEventoRepository extends JpaRepository<PrenotazioneEvento, Long> {

    List<PrenotazioneEvento> findByPrenotazioneIdOrderByCreatedAtDescIdDesc(Long prenotazioneId);
}
