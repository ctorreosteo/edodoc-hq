package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * Immagine o video della libreria del Planner. Il file sta in {@link PlannerMediaFile} e la miniatura in
 * {@link PlannerMediaAnteprima}, fuori da questa riga, così gli elenchi non li caricano.
 */
@Entity
@Table(name = "planner_media")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PlannerMedia {

    public static final String TIPO_IMMAGINE = "IMMAGINE";
    public static final String TIPO_VIDEO = "VIDEO";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Indirizzo pubblico del file: le piattaforme lo scaricano da lì. */
    @Column(nullable = false, unique = true, length = 48)
    private String token;

    @Column(name = "nome_file", length = 255)
    private String nomeFile;

    @Column(name = "mime_type", nullable = false, length = 60)
    private String mimeType;

    @Column(nullable = false, length = 10)
    private String tipo;

    private Integer larghezza;

    private Integer altezza;

    @Column(name = "durata_secondi", precision = 9, scale = 2)
    private java.math.BigDecimal durataSecondi;

    @Column(name = "byte_dimensione", nullable = false)
    private long byteDimensione;

    @Column(length = 200)
    private String tag;

    @Column(name = "creato_da_utente_id")
    private Long creatoDaUtenteId;

    @Column(name = "creato_il", nullable = false)
    private LocalDateTime creatoIl;
}
