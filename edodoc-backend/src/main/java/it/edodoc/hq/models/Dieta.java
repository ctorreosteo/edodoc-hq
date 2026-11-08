package it.edodoc.hq.models;

import it.edodoc.hq.dto.DietaDto;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** Piano alimentare. Senza paziente è un modello. */
@Entity
@Table(name = "diete")
@Getter @Setter @NoArgsConstructor
public class Dieta {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "paziente_id")
    private Paziente paziente;

    @Column(nullable = false)
    private String titolo;

    @Column(name = "data_inizio")
    private LocalDate dataInizio;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private DietaDto.Contenuto contenuto = DietaDto.Contenuto.vuoto();

    @Column(name = "consegnata_il")
    private LocalDateTime consegnataIl;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    /** Ultima modifica del contenuto: la imposta il salvataggio, non la consegna. È l'ora mostrata nello storico. */
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();
}
