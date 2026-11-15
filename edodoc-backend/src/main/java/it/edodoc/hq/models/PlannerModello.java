package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** Modello di post del Planner social: il contenuto è il JSON di una richiesta di post (testo, canali, rubrica, ...). */
@Entity
@Table(name = "planner_modelli")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PlannerModello {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Null = in tutti gli spazi. */
    @Column(name = "brand_id")
    private Long brandId;

    @Column(nullable = false, length = 120)
    private String nome;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String contenuto;

    @Column(nullable = false)
    private long usi;

    @Column(name = "creato_da_utente_id")
    private Long creatoDaUtenteId;

    @Column(name = "creato_il", nullable = false)
    private LocalDateTime creatoIl;
}
