package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.BatchSize;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.HashSet;
import java.util.Set;

/** Task del gestionale. Inizio e scadenza come data + ora facoltativa, senza fuso orario. */
@Entity
@Table(name = "task")
@Getter @Setter @NoArgsConstructor
public class Task {

    public enum Stato {
        DA_FARE, IN_CORSO, IN_ATTESA, COMPLETATO, ANNULLATO;

        public boolean isChiuso() {
            return this == COMPLETATO || this == ANNULLATO;
        }
    }

    /** In ordine di importanza decrescente; null = nessuna priorità. */
    public enum Priorita { URGENTE, ALTA, NORMALE, BASSA }

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
    private Priorita priorita;

    private LocalDate scadenza;

    @Column(name = "scadenza_ora")
    private LocalTime scadenzaOra;

    /** Inizio del lavoro (Gantt); la fine è la scadenza. Mai dopo la scadenza. */
    @Column(name = "data_inizio")
    private LocalDate dataInizio;

    /** Ora d'inizio, solo con la data d'inizio. */
    @Column(name = "inizio_ora")
    private LocalTime inizioOra;

    /** Stima di durata in minuti (null = non stimato). */
    @Column(name = "stima_minuti")
    private Integer stimaMinuti;

    /** Task principale, se questo è un suo sottotask (un livello solo, stessa lista). */
    @Column(name = "parent_id")
    private Long parentId;

    /** Posizione nella colonna del kanban: più basso = più in alto. */
    @Column(nullable = false)
    private double ordine;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "paziente_id")
    private Paziente paziente;

    @Column(name = "chiave_automatica", unique = true)
    private String chiaveAutomatica;

    @ElementCollection
    @BatchSize(size = 100)
    @CollectionTable(name = "task_etichette_task", joinColumns = @JoinColumn(name = "task_id"))
    @Column(name = "etichetta_id")
    private Set<Long> etichettaIds = new HashSet<>();

    @ElementCollection
    @BatchSize(size = 100)
    @CollectionTable(name = "task_assegnatari", joinColumns = @JoinColumn(name = "task_id"))
    @Column(name = "utente_id")
    private Set<Long> assegnatariIds = new HashSet<>();

    /** Chi l'ha creato; null per i task dei job. */
    @Column(name = "creato_da_utente_id")
    private Long creatoDaUtenteId;

    @Column(name = "completato_il")
    private LocalDateTime completatoIl;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "aggiornato_il", nullable = false)
    private LocalDateTime aggiornatoIl = LocalDateTime.now();
}
