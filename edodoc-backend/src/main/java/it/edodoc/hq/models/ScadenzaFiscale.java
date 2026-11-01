package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "scadenze_fiscali")
@Getter @Setter @NoArgsConstructor
public class ScadenzaFiscale {

    public enum Stato { DA_PAGARE, PAGATA }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String titolo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private MovimentoCassa.Categoria categoria;

    @Column(name = "data_scadenza", nullable = false)
    private LocalDate dataScadenza;

    @Column(name = "importo_stimato", precision = 10, scale = 2)
    private BigDecimal importoStimato;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Stato stato = Stato.DA_PAGARE;

    @Column(name = "pagata_il")
    private LocalDate pagataIl;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "movimento_id")
    private MovimentoCassa movimento;

    @Column(columnDefinition = "TEXT")
    private String note;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
