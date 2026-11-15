package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** Gruppo di hashtag pronti del Planner (separati da spazio, senza #). */
@Entity
@Table(name = "planner_hashtag")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PlannerHashtag {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 60)
    private String nome;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String hashtag;

    @Column(nullable = false)
    private long usi;

    @Column(name = "creato_il", nullable = false)
    private LocalDateTime creatoIl;
}
