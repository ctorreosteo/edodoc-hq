package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "fatture")
@Getter @Setter @NoArgsConstructor
public class Fattura {

    public enum Stato { EMESSA, ANNULLATA }

    public enum TesseraSanitaria { DA_INSERIRE, INSERITA, ERRORE }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, updatable = false)
    private Integer numero;

    @Column(name = "data_emissione", nullable = false)
    private LocalDate dataEmissione;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Stato stato = Stato.EMESSA;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "paziente_id")
    private Paziente paziente;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pagamento_id")
    private Pagamento pagamento;

    @Column(nullable = false)
    private String intestatario;

    @Column(nullable = false)
    private String indirizzo;

    @Column(name = "codice_fiscale", nullable = false, length = 16)
    private String codiceFiscale;

    @Column(nullable = false)
    private String descrizione;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal imponibile;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal contributo;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal bollo;

    @Column(name = "importo_totale", nullable = false, precision = 10, scale = 2)
    private BigDecimal importoTotale;

    @Column(name = "motivo_annullamento", columnDefinition = "TEXT")
    private String motivoAnnullamento;

    @Column(name = "email_destinatario")
    private String emailDestinatario;

    @Column(name = "email_inviata_il")
    private LocalDateTime emailInviataIl;

    @Enumerated(EnumType.STRING)
    @Column(name = "ts_stato", nullable = false)
    private TesseraSanitaria tsStato = TesseraSanitaria.DA_INSERIRE;

    @Column(name = "ts_inserita_il")
    private LocalDateTime tsInseritaIl;

    @Column(name = "ts_opposizione", nullable = false)
    private Boolean tsOpposizione = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    /** Stessa regola dei file storici: {@code numero_cognome.pdf}. */
    public String getNomeFile() {
        String cognome = paziente.getCognome().trim().replaceAll("[^\\p{L}0-9]+", "");
        return numero + "_" + cognome + ".pdf";
    }
}
