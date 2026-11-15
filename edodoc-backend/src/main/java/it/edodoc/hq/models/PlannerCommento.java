package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** Commento del team su un post del Planner. */
@Entity
@Table(name = "planner_commenti")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PlannerCommento {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "post_id", nullable = false)
    private Long postId;

    @Column(name = "utente_id")
    private Long utenteId;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String testo;

    @Column(name = "creato_il", nullable = false)
    private LocalDateTime creatoIl;
}
