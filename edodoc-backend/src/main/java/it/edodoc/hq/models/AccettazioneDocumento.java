package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** Versione di un testo dell'accettazione (modulo, informativa, fornitori). Una versione pubblicata non cambia mai. */
@Entity
@Table(name = "accettazioni_documenti")
@Getter @Setter @NoArgsConstructor
public class AccettazioneDocumento {

    public enum Tipo { MODULO, INFORMATIVA, FORNITORI }

    public enum Formato { JSON, MARKDOWN }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Tipo tipo;

    @Column(nullable = false, length = 20)
    private String versione;

    @Column(nullable = false, length = 200)
    private String titolo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Formato formato;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String contenuto;

    @Column(nullable = false, length = 64)
    private String sha256;

    @Column(nullable = false)
    private Boolean attivo = false;

    @Column(name = "valido_dal", nullable = false)
    private LocalDate validoDal;

    @Column(name = "creato_il", nullable = false, insertable = false, updatable = false)
    private LocalDateTime creatoIl;
}
