package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** Link in bio di uno spazio del Planner: pagina pubblica /bio/{slug} con pulsanti e ultimi post. */
@Entity
@Table(name = "planner_bio")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PlannerBio {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "brand_id", nullable = false, unique = true)
    private Long brandId;

    @Column(nullable = false, unique = true, length = 60)
    private String slug;

    @Column(nullable = false, length = 120)
    private String titolo;

    @Column(length = 500)
    private String descrizione;

    @Column(name = "immagine_url", length = 1000)
    private String immagineUrl;

    @Column(nullable = false, length = 9)
    private String colore;

    /** JSON [{"id", "etichetta", "url"}]. */
    @Column(nullable = false, columnDefinition = "TEXT")
    private String pulsanti;

    @Column(name = "mostra_post", nullable = false)
    private boolean mostraPost;

    @Column(nullable = false)
    private boolean attiva;

    @Column(name = "aggiornata_il", nullable = false)
    private LocalDateTime aggiornataIl;
}
