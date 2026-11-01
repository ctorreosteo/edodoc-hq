package it.edodoc.hq.repositories;

import it.edodoc.hq.models.FeedbackAudio;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface FeedbackAudioRepository extends JpaRepository<FeedbackAudio, UUID> {
}
