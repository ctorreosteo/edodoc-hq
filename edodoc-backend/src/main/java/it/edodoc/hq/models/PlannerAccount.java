package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * Account di uno spazio del Planner social: integrato (pagina Meta, canale YouTube, scheda Google già collegati al
 * gestionale), collegato via OAuth qui (TikTok, con i token) o manuale (profilo da pubblicare a mano).
 * I token non escono mai dal backend.
 */
@Entity
@Table(name = "planner_account")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PlannerAccount {

    public static final String TIPO_INTEGRATO = "INTEGRATO";
    public static final String TIPO_OAUTH = "OAUTH";
    public static final String TIPO_MANUALE = "MANUALE";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "brand_id", nullable = false)
    private Long brandId;

    @Column(nullable = false, length = 20)
    private String canale;

    @Column(nullable = false, length = 12)
    private String tipo;

    /** Page id, id dello studio, open_id TikTok; null per YouTube e per gli account manuali. */
    @Column(length = 100)
    private String account;

    @Column(nullable = false, length = 200)
    private String nome;

    @Column(length = 200)
    private String dettaglio;

    @Column(length = 1000)
    private String immagine;

    @Column(name = "url_profilo", length = 1000)
    private String urlProfilo;

    @Column(name = "access_token", columnDefinition = "TEXT")
    private String accessToken;

    @Column(name = "refresh_token", columnDefinition = "TEXT")
    private String refreshToken;

    @Column(name = "token_scade_il")
    private LocalDateTime tokenScadeIl;

    @Column(name = "refresh_scade_il")
    private LocalDateTime refreshScadeIl;

    @Column(name = "creato_il", nullable = false)
    private LocalDateTime creatoIl;
}
