package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** Spazio di lavoro del Planner social («EdoDoc», ...): i suoi account e i suoi post. */
@Entity
@Table(name = "planner_brand")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PlannerBrand {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 80)
    private String nome;

    @Column(nullable = false, length = 9)
    private String colore;

    @Column(length = 300)
    private String descrizione;

    /** Raccoglie gli account integrati non assegnati a nessuno spazio. */
    @Column(nullable = false)
    private boolean predefinito;

    @Column(nullable = false)
    private int posizione;

    @Column(name = "creato_il", nullable = false)
    private LocalDateTime creatoIl;
}
