package it.edodoc.hq.repositories;

import it.edodoc.hq.models.AccettazioneDocumento;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface AccettazioneDocumentoRepository extends JpaRepository<AccettazioneDocumento, Long> {

    Optional<AccettazioneDocumento> findByTipoAndAttivoTrue(AccettazioneDocumento.Tipo tipo);
}
