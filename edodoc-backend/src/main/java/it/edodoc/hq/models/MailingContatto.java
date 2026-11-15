package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** Destinatario dell'email marketing: paziente, lead o contatto importato, con consenso e stato di iscrizione. */
@Entity
@Table(name = "mailing_contatti")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailingContatto {

    public enum Stato { ISCRITTO, DISISCRITTO, RIMBALZATO, SEGNALATO_SPAM, ARCHIVIATO }

    public enum BaseGiuridica { CONSENSO, CLIENTE_SOFT_SPAM, MANUALE }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "email", nullable = false, length = 255)
    private String email;

    @Column(name = "nome", length = 120)
    private String nome;

    @Column(name = "cognome", length = 120)
    private String cognome;

    @Column(name = "paziente_id")
    private Long pazienteId;


    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "stato", nullable = false, length = 20)
    private Stato stato = Stato.ISCRITTO;

    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "base_giuridica", nullable = false, length = 30)
    private BaseGiuridica baseGiuridica = BaseGiuridica.CLIENTE_SOFT_SPAM;

    @Column(name = "fonte", length = 60)
    private String fonte;

    @Column(name = "consenso_il")
    private LocalDateTime consensoIl;

    @Column(name = "disiscritto_il")
    private LocalDateTime disiscrittoIl;

    @Column(name = "motivo_disiscrizione", length = 500)
    private String motivoDisiscrizione;

    @Builder.Default
    @Column(name = "rimbalzi_temporanei", nullable = false)
    private Integer rimbalziTemporanei = 0;

    /** Token pubblico (32 caratteri base62) per disiscrizione e centro preferenze. */
    @Column(name = "token", nullable = false, length = 64)
    private String token;

    @Builder.Default
    @Column(name = "punteggio", nullable = false)
    private Integer punteggio = 50;

    /** Ora (0-23, Europe/Rome) in cui il contatto apre più spesso: usata dall'invio intelligente. */
    @Column(name = "ora_apertura_preferita")
    private Short oraAperturaPreferita;

    @Column(name = "ultimo_invio_il")
    private LocalDateTime ultimoInvioIl;

    @Column(name = "ultima_apertura_il")
    private LocalDateTime ultimaAperturaIl;

    @Column(name = "ultimo_click_il")
    private LocalDateTime ultimoClickIl;


    @Column(name = "note", columnDefinition = "TEXT")
    private String note;

    @Column(name = "creato_il", nullable = false)
    private LocalDateTime creatoIl;

    @Column(name = "aggiornato_il")
    private LocalDateTime aggiornatoIl;

    @PrePersist
    void prePersist() {
        if (creatoIl == null) {
            creatoIl = LocalDateTime.now();
        }
    }
}
