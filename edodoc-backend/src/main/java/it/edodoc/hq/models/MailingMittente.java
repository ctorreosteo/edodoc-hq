package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** Casella da cui partono le email marketing (Workspace via delega, smtp-relay Google o SMTP esterno). */
@Entity
@Table(name = "mailing_mittenti")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailingMittente {

    public enum Canale { GMAIL_API, SMTP_RELAY_GOOGLE, SMTP }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "email", nullable = false, length = 255)
    private String email;

    @Column(name = "nome_visualizzato", nullable = false, length = 120)
    private String nomeVisualizzato;

    @Column(name = "rispondi_a", length = 255)
    private String rispondiA;

    /** Casella Workspace impersonata (se diversa dall'indirizzo mittente, es. alias). */
    @Column(name = "casella_delegata", length = 255)
    private String casellaDelegata;

    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "canale", nullable = false, length = 30)
    private Canale canale = Canale.GMAIL_API;

    @Column(name = "smtp_host", length = 255)
    private String smtpHost;

    @Column(name = "smtp_porta")
    private Integer smtpPorta;

    @Column(name = "smtp_utente", length = 255)
    private String smtpUtente;

    /** Nome della variabile d'ambiente con la password SMTP (mai la password in chiaro). */
    @Column(name = "smtp_password_env", length = 120)
    private String smtpPasswordEnv;

    @Builder.Default
    @Column(name = "limite_giornaliero", nullable = false)
    private Integer limiteGiornaliero = 1500;

    @Builder.Default
    @Column(name = "limite_al_minuto", nullable = false)
    private Integer limiteAlMinuto = 20;

    @Builder.Default
    @Column(name = "predefinito", nullable = false)
    private Boolean predefinito = false;

    @Builder.Default
    @Column(name = "attivo", nullable = false)
    private Boolean attivo = true;

    @Column(name = "verificato_il")
    private LocalDateTime verificatoIl;

    @Column(name = "ultimo_errore", columnDefinition = "TEXT")
    private String ultimoErrore;

    @Column(name = "rimbalzi_controllati_fino_al")
    private LocalDateTime rimbalziControllatiFinoAl;

    @Column(name = "creato_da_utente_id")
    private Long creatoDaUtenteId;

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
