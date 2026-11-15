package it.edodoc.hq.repositories;

import it.edodoc.hq.models.YoutubeSnapshot;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface YoutubeSnapshotRepository extends JpaRepository<YoutubeSnapshot, Long> {

    Optional<YoutubeSnapshot> findFirstByCanaleIdOrderByRilevatoIlDesc(String canaleId);

    List<YoutubeSnapshot> findByCanaleIdAndRilevatoIlAfterOrderByRilevatoIlAsc(String canaleId, LocalDateTime dopo);
}
