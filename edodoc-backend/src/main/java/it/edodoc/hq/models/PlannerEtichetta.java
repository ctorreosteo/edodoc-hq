package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** Rubrica del Planner social (pilastro editoriale): colora il calendario e divide le analisi. */
@Entity
@Table(name = "planner_etichette")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PlannerEtichetta {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 60)
    private String nome;

    /** Esadecimale, es. #3b82f6. */
    @Column(nullable = false, length = 9)
    private String colore;

    @Column(length = 300)
    private String descrizione;

    /** Post a settimana attesi per la rubrica; null = nessun obiettivo. */
    @Column(name = "obiettivo_settimanale")
    private Integer obiettivoSettimanale;

    @Column(nullable = false)
    private int posizione;

    @Column(name = "creato_il", nullable = false)
    private LocalDateTime creatoIl;
}
