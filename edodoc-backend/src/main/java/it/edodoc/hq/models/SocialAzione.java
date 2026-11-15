package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * Cosa si e fatto dalla pagina Meta (risposte, messaggi, moderazione, pubblicazioni).
 * Da qui la pagina sa chi ha risposto a un commento o inviato un messaggio.
 */
@Entity
@Table(name = "social_azioni")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SocialAzione {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** RISPOSTA_COMMENTO, MESSAGGIO, MESSAGGIO_PRIVATO, NASCOSTO, MOSTRATO, ELIMINATO, MI_PIACE, GESTITO, PUBBLICAZIONE. */
    @Column(name = "tipo", nullable = false, length = 40)
    private String tipo;

    @Column(name = "piattaforma", length = 20)
    private String piattaforma;

    @Column(name = "page_id", nullable = false, length = 64)
    private String pageId;

    /** Commento, conversazione o pubblicazione su cui si e agito. */
    @Column(name = "oggetto_id", length = 120)
    private String oggettoId;

    /** Id restituito da Meta (la risposta creata, il messaggio inviato). */
    @Column(name = "risultato_id", length = 120)
    private String risultatoId;

    @Column(name = "anteprima", length = 200)
    private String anteprima;

    @Column(name = "utente_id")
    private Long utenteId;

    @Column(name = "creato_il", nullable = false)
    private LocalDateTime creatoIl;
}
