package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/** Etichetta condivisa tra tutte le liste dei task. */
@Entity
@Table(name = "task_etichette")
@Getter @Setter @NoArgsConstructor
public class TaskEtichetta {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 50, unique = true)
    private String nome;

    @Column(nullable = false, length = 7)
    private String colore = "#64748B";

    @Column(name = "creata_il", nullable = false, updatable = false)
    private LocalDateTime creataIl = LocalDateTime.now();
}
