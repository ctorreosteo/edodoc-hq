package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** Evento della cronologia di un post del Planner. */
@Entity
@Table(name = "planner_storico")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PlannerStorico {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "post_id", nullable = false)
    private Long postId;

    @Column(name = "utente_id")
    private Long utenteId;

    @Column(nullable = false, length = 30)
    private String evento;

    @Column(length = 500)
    private String dettaglio;

    @Column(name = "creato_il", nullable = false)
    private LocalDateTime creatoIl;
}
