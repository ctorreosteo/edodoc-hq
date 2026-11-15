package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** Un messaggio verso un destinatario (di campagna o di automazione): coda di invio e metriche. */
@Entity
@Table(name = "mailing_invii")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailingInvio {

    public enum Stato { IN_CODA, IN_INVIO, INVIATO, RIMBALZATO, ERRORE, SALTATO, ANNULLATO }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Token pubblico (24 caratteri base62) per pixel, link tracciati e disiscrizione. */
    @Column(name = "token", nullable = false, length = 40)
    private String token;

    @Column(name = "contatto_id", nullable = false)
    private Long contattoId;

    @Column(name = "campagna_id")
    private Long campagnaId;

    @Column(name = "automazione_email_id")
    private Long automazioneEmailId;

    @Column(name = "iscrizione_id")
    private Long iscrizioneId;

    @Column(name = "mittente_id")
    private Long mittenteId;

    @Column(name = "email", nullable = false, length = 255)
    private String email;

    /** Variante del test A/B ("A", "B", ...), null fuori dai test. */
    @Column(name = "variante", length = 5)
    private String variante;

    @Column(name = "oggetto", length = 300)
    private String oggetto;

    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "stato", nullable = false, length = 20)
    private Stato stato = Stato.IN_CODA;

    @Column(name = "programmato_per", nullable = false)
    private LocalDateTime programmatoPer;

    @Builder.Default
    @Column(name = "tentativi", nullable = false)
    private Short tentativi = 0;

    @Column(name = "message_id", length = 255)
    private String messageId;

    @Column(name = "gmail_id", length = 100)
    private String gmailId;

    @Column(name = "inviato_il")
    private LocalDateTime inviatoIl;

    @Column(name = "prima_apertura_il")
    private LocalDateTime primaAperturaIl;

    @Builder.Default
    @Column(name = "aperture", nullable = false)
    private Integer aperture = 0;

    @Column(name = "primo_click_il")
    private LocalDateTime primoClickIl;

    @Builder.Default
    @Column(name = "click", nullable = false)
    private Integer click = 0;

    @Column(name = "risposto_il")
    private LocalDateTime rispostoIl;

    @Column(name = "disiscritto_il")
    private LocalDateTime disiscrittoIl;

    /** Tipo di rimbalzo (testo libero breve, es. permanente/temporaneo). */
    @Column(name = "rimbalzo_tipo", length = 10)
    private String rimbalzoTipo;

    @Column(name = "errore", columnDefinition = "TEXT")
    private String errore;

    @Column(name = "creato_il", nullable = false)
    private LocalDateTime creatoIl;

    @PrePersist
    void prePersist() {
        if (creatoIl == null) {
            creatoIl = LocalDateTime.now();
        }
        if (programmatoPer == null) {
            programmatoPer = creatoIl;
        }
    }
}
