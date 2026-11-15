package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * Post pubblicato (o da pubblicare) dalla pagina Meta su Facebook e/o Instagram.
 * L'immagine sta in {@link SocialPubblicazioneImmagine}, fuori da questa riga, cosi gli elenchi non la caricano.
 */
@Entity
@Table(name = "social_pubblicazioni")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SocialPubblicazione {

    public static final String STATO_PROGRAMMATA = "PROGRAMMATA";
    public static final String STATO_IN_CORSO = "IN_CORSO";
    public static final String STATO_PUBBLICATA = "PUBBLICATA";
    public static final String STATO_PARZIALE = "PARZIALE";
    public static final String STATO_ERRORE = "ERRORE";
    public static final String STATO_ANNULLATA = "ANNULLATA";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "page_id", nullable = false, length = 64)
    private String pageId;

    /** CSV di FACEBOOK, INSTAGRAM. */
    @Column(name = "piattaforme", nullable = false, length = 40)
    private String piattaforme;

    @Column(name = "testo", columnDefinition = "TEXT")
    private String testo;

    @Column(name = "link", length = 1000)
    private String link;

    @Column(name = "con_immagine", nullable = false)
    private boolean conImmagine;

    @Column(name = "stato", nullable = false, length = 20)
    private String stato;

    /** Ora locale Europe/Rome; null = pubblicata subito. */
    @Column(name = "programmata_alle")
    private LocalDateTime programmataAlle;

    @Column(name = "pubblicata_il")
    private LocalDateTime pubblicataIl;

    @Column(name = "id_facebook", length = 100)
    private String idFacebook;

    @Column(name = "id_instagram", length = 100)
    private String idInstagram;

    @Column(name = "link_facebook", length = 1000)
    private String linkFacebook;

    @Column(name = "link_instagram", length = 1000)
    private String linkInstagram;

    @Column(name = "errore", columnDefinition = "TEXT")
    private String errore;

    @Column(name = "creato_da_utente_id")
    private Long creatoDaUtenteId;

    @Column(name = "creato_il", nullable = false)
    private LocalDateTime creatoIl;
}
