package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/** Cronologia di un task: commenti e modifiche. Per le modifiche {@code testo} è la frase senza soggetto ("ha ..."). */
@Entity
@Table(name = "task_eventi")
@Getter @Setter @NoArgsConstructor
public class TaskEvento {

    public enum Tipo {
        CREATO, COMMENTO, STATO, PRIORITA, SCADENZA, TITOLO, DESCRIZIONE, LISTA,
        ASSEGNATARI, ETICHETTE, PAZIENTE, ALLEGATO, ALLEGATO_RIMOSSO, CHECKLIST, STIMA, SOTTOTASK, INIZIO, DIPENDENZA
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "task_id", nullable = false)
    private Long taskId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private Tipo tipo;

    @Column(columnDefinition = "TEXT")
    private String testo;

    @Column(name = "valore_precedente", length = 500)
    private String valorePrecedente;

    @Column(name = "valore_nuovo", length = 500)
    private String valoreNuovo;

    @Column(name = "creato_il", nullable = false)
    private LocalDateTime creatoIl = LocalDateTime.now();

    @Column(name = "modificato_il")
    private LocalDateTime modificatoIl;
}
