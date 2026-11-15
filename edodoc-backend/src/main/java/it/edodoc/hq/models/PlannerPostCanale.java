package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * Un canale di un post del Planner: dove va, in che formato, con quale testo (null = quello del post) e com'è andata.
 */
@Entity
@Table(name = "planner_post_canali")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PlannerPostCanale {

    public static final String STATO_IN_ATTESA = "IN_ATTESA";
    public static final String STATO_IN_PUBBLICAZIONE = "IN_PUBBLICAZIONE";
    /** Canale manuale arrivato all'ora: qualcuno lo deve pubblicare. */
    public static final String STATO_DA_PUBBLICARE = "DA_PUBBLICARE";
    public static final String STATO_PUBBLICATO = "PUBBLICATO";
    public static final String STATO_ERRORE = "ERRORE";

    public static final String MODALITA_AUTOMATICA = "AUTOMATICA";
    public static final String MODALITA_MANUALE = "MANUALE";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "post_id", nullable = false)
    private Long postId;

    @Column(nullable = false, length = 20)
    private String canale;

    /** Page id per Facebook e Instagram, id dello studio per Google Business, null per gli altri. */
    @Column(length = 64)
    private String account;

    @Column(name = "account_nome", length = 200)
    private String accountNome;

    @Column(nullable = false, length = 20)
    private String formato;

    @Column(nullable = false, length = 12)
    private String modalita;

    @Column(columnDefinition = "TEXT")
    private String testo;

    @Column(length = 200)
    private String titolo;

    /** JSON delle opzioni del canale. */
    @Column(columnDefinition = "TEXT")
    private String opzioni;

    @Column(nullable = false, length = 20)
    private String stato;

    @Column(name = "id_esterno", length = 200)
    private String idEsterno;

    @Column(name = "link_esterno", length = 1000)
    private String linkEsterno;

    @Column(columnDefinition = "TEXT")
    private String errore;

    @Column(name = "pubblicato_il")
    private LocalDateTime pubblicatoIl;

    @Column(name = "pubblicato_da_utente_id")
    private Long pubblicatoDaUtenteId;

    private Long visualizzazioni;

    private Long copertura;

    @Column(name = "mi_piace")
    private Long miPiace;

    private Long commenti;

    private Long condivisioni;

    private Long salvataggi;

    @Column(name = "metriche_il")
    private LocalDateTime metricheIl;
}
