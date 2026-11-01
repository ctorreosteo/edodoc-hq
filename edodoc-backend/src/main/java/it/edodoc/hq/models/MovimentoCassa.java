package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "movimenti_cassa")
@Getter @Setter @NoArgsConstructor
public class MovimentoCassa {

    public enum Tipo { ENTRATA, USCITA }

    public enum Categoria {
        YOUTUBE_ADS, CONSULENZA, ALTRO_RICAVO,
        IMPOSTE, CASSA_PREVIDENZA, ORDINE, COMMERCIALISTA, SOFTWARE, ALTRA_SPESA
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private LocalDate data;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Tipo tipo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Categoria categoria;

    @Column(nullable = false)
    private String descrizione;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal importo;

    @Column(columnDefinition = "TEXT")
    private String note;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
