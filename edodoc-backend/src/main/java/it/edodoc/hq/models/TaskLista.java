package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "task_liste")
@Getter @Setter @NoArgsConstructor
public class TaskLista {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String nome;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cartella_id")
    private TaskCartella cartella;

    /** Solo le liste di sistema: i job le ritrovano da qui, anche se vengono rinominate o spostate. */
    @Column(unique = true)
    private String codice;

    @Column(nullable = false)
    private String colore;

    @Column(nullable = false)
    private String icona = "list";

    @Column(nullable = false)
    private Integer ordine = 0;

    @Column(nullable = false)
    private Boolean archiviata = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
