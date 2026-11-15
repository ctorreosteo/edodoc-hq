package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** Contatori pubblici del canale YouTube in un istante (iscritti, visualizzazioni totali, video). */
@Entity
@Table(name = "youtube_snapshot")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class YoutubeSnapshot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "canale_id", nullable = false, length = 64)
    private String canaleId;

    @Column(name = "rilevato_il", nullable = false)
    private LocalDateTime rilevatoIl;

    @Column(nullable = false)
    private long iscritti;

    @Column(nullable = false)
    private long visualizzazioni;

    @Column(nullable = false)
    private int video;
}
