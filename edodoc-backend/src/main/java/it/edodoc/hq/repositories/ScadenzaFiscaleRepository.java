package it.edodoc.hq.repositories;

import it.edodoc.hq.models.ScadenzaFiscale;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface ScadenzaFiscaleRepository extends JpaRepository<ScadenzaFiscale, Long> {
    List<ScadenzaFiscale> findByDataScadenzaBetweenOrderByDataScadenza(LocalDate da, LocalDate a);

    List<ScadenzaFiscale> findByStatoAndDataScadenzaLessThanEqualOrderByDataScadenza(ScadenzaFiscale.Stato stato, LocalDate limite);
}
