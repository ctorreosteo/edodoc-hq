package it.edodoc.hq.repositories;

import it.edodoc.hq.models.YoutubeIdea;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface YoutubeIdeaRepository extends JpaRepository<YoutubeIdea, Long> {

    List<YoutubeIdea> findAllByOrderByPosizioneAscIdAsc();
}
