package it.edodoc.hq.repositories;

import it.edodoc.hq.models.Copertina;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface CopertinaRepository extends JpaRepository<Copertina, UUID> {
}
