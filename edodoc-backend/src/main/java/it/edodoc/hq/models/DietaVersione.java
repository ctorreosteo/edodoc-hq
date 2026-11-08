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

/** Fotografia di una dieta a un salvataggio: non si modifica più. */
@Entity
@Table(name = "dieta_versioni")
@Getter @Setter @NoArgsConstructor
public class DietaVersione {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "dieta_id")
    private Dieta dieta;

    @Column(nullable = false)
    private Integer numero;

    @Column(nullable = false)
    private String titolo;

    @Column(name = "data_inizio")
    private LocalDate dataInizio;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private DietaDto.Contenuto contenuto;

    private String nota;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
