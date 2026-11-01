package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "percorsi")
@Getter @Setter @NoArgsConstructor
public class Percorso {

    public enum Tipo {
        METODO_BUSSOLA(6, 6), RINNOVO(6, 6), MANTENIMENTO(4, 12);

        public final int visite;
        public final int mesi;

        Tipo(int visite, int mesi) {
            this.visite = visite;
            this.mesi = mesi;
        }
    }

    public enum PianoPagamento { UNICO, RATE }

    public enum Stato { ATTIVO, CONCLUSO, ANNULLATO }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "paziente_id")
    private Paziente paziente;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Tipo tipo;

    @Enumerated(EnumType.STRING)
    @Column(name = "piano_pagamento", nullable = false)
    private PianoPagamento pianoPagamento;

    @Column(name = "data_inizio", nullable = false)
    private LocalDate dataInizio;

    @Column(name = "data_fine", nullable = false)
    private LocalDate dataFine;

    @Column(name = "visite_totali", nullable = false)
    private Integer visiteTotali;

    @Column(name = "importo_totale", nullable = false, precision = 10, scale = 2)
    private BigDecimal importoTotale;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Stato stato = Stato.ATTIVO;

    @Column(columnDefinition = "TEXT")
    private String note;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
