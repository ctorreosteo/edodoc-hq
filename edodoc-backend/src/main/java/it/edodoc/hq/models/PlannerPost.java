package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * Post del Planner social: testo base, media e una riga per canale ({@link PlannerPostCanale}).
 * Le ore sono locali Europe/Rome.
 */
@Entity
@Table(name = "planner_post")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PlannerPost {

    public static final String STATO_IDEA = "IDEA";
    public static final String STATO_BOZZA = "BOZZA";
    public static final String STATO_IN_APPROVAZIONE = "IN_APPROVAZIONE";
    public static final String STATO_PROGRAMMATO = "PROGRAMMATO";
    public static final String STATO_IN_PUBBLICAZIONE = "IN_PUBBLICAZIONE";
    /** Pubblicato dove poteva il gestionale: restano canali da pubblicare a mano. */
    public static final String STATO_DA_COMPLETARE = "DA_COMPLETARE";
    public static final String STATO_PUBBLICATO = "PUBBLICATO";
    public static final String STATO_PARZIALE = "PARZIALE";
    public static final String STATO_ERRORE = "ERRORE";

    /** Stati in cui il post si modifica ancora liberamente (non è partito niente). */
    public static final java.util.Set<String> STATI_MODIFICABILI =
            java.util.Set.of(STATO_IDEA, STATO_BOZZA, STATO_IN_APPROVAZIONE, STATO_PROGRAMMATO);

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Spazio di lavoro ({@link PlannerBrand}). */
    @Column(name = "brand_id", nullable = false)
    private Long brandId;

    /** Nome interno (non si pubblica). */
    @Column(length = 200)
    private String titolo;

    @Column(columnDefinition = "TEXT")
    private String testo;

    /** Parametri UTM automatici sul link (utm_source = canale). */
    @Column(nullable = false)
    @Builder.Default
    private boolean utm = true;

    @Column(name = "primo_commento", columnDefinition = "TEXT")
    private String primoCommento;

    @Column(length = 1000)
    private String link;

    @Column(nullable = false, length = 20)
    private String stato;

    @Column(name = "programmato_alle")
    private LocalDateTime programmatoAlle;

    @Column(name = "pubblicato_il")
    private LocalDateTime pubblicatoIl;

    /** Quando il job o «Pubblica ora» l'ha preso: serve a sbloccare una pubblicazione interrotta. */
    @Column(name = "presa_in_carico_il")
    private LocalDateTime presaInCaricoIl;

    @Column(name = "etichetta_id")
    private Long etichettaId;

    /** Note interne del team. */
    @Column(columnDefinition = "TEXT")
    private String note;

    @Column(name = "responsabile_utente_id")
    private Long responsabileUtenteId;

    @Column(name = "creato_da_utente_id")
    private Long creatoDaUtenteId;

    @Column(name = "approvato_da_utente_id")
    private Long approvatoDaUtenteId;

    @Column(name = "approvato_il")
    private LocalDateTime approvatoIl;

    @Column(name = "motivo_rifiuto", columnDefinition = "TEXT")
    private String motivoRifiuto;

    /** Ordine nelle colonne delle idee. */
    @Column(nullable = false)
    private int posizione;

    @Column(name = "creato_il", nullable = false)
    private LocalDateTime creatoIl;

    @Column(name = "aggiornato_il", nullable = false)
    private LocalDateTime aggiornatoIl;
}
