package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "pagamenti")
@Getter @Setter @NoArgsConstructor
public class Pagamento {

    public enum Tipo { ACCONTO, UNICO, RATA, MANTENIMENTO, ALTRO }

    public enum Stato { DA_PAGARE, PAGATO, ANNULLATO }

    public enum Metodo { BONIFICO, CARTA, CONTANTI, PAYPAL, ALTRO }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "paziente_id")
    private Paziente paziente;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "percorso_id")
    private Percorso percorso;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Tipo tipo;

    @Column(nullable = false)
    private String descrizione;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal importo;

    @Column(nullable = false)
    private LocalDate scadenza;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Stato stato = Stato.DA_PAGARE;

    @Column(name = "data_pagamento")
    private LocalDate dataPagamento;

    @Enumerated(EnumType.STRING)
    private Metodo metodo;

    @Column(nullable = false)
    private Boolean contabile = false;

    @Column(columnDefinition = "TEXT")
    private String note;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    public boolean isScaduto(LocalDate oggi) {
        return stato == Stato.DA_PAGARE && scadenza.isBefore(oggi);
    }
}
