package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "task")
@Getter @Setter @NoArgsConstructor
public class Task {

    public enum Stato { DA_FARE, FATTO }

    public enum Priorita { BASSA, MEDIA, ALTA }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String titolo;

    @Column(columnDefinition = "TEXT")
    private String descrizione;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "lista_id")
    private TaskLista lista;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Stato stato = Stato.DA_FARE;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Priorita priorita = Priorita.MEDIA;

    private LocalDate scadenza;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "paziente_id")
    private Paziente paziente;

    @Column(name = "chiave_automatica", unique = true)
    private String chiaveAutomatica;

    @Column(name = "completato_il")
    private LocalDateTime completatoIl;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
