package it.edodoc.hq.repositories;

import it.edodoc.hq.models.MovimentoCassa;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface MovimentoCassaRepository extends JpaRepository<MovimentoCassa, Long> {
    List<MovimentoCassa> findByDataBetweenOrderByDataDescIdDesc(LocalDate da, LocalDate a);
}
