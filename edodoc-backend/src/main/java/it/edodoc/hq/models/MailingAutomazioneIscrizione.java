package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** Percorso di un contatto dentro un'automazione: nodo corrente e prossima azione. */
@Entity
@Table(name = "mailing_automazioni_iscrizioni")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailingAutomazioneIscrizione {

    public enum Stato { ATTIVA, IN_ATTESA, COMPLETATA, USCITA, ERRORE }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "automazione_id", nullable = false)
    private Long automazioneId;

    @Column(name = "contatto_id", nullable = false)
    private Long contattoId;

    @Column(name = "nodo_corrente", length = 60)
    private String nodoCorrente;

    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "stato", nullable = false, length = 20)
    private Stato stato = Stato.ATTIVA;

    @Column(name = "prossima_azione_il")
    private LocalDateTime prossimaAzioneIl;

    /** JSON con i dati del trigger e dei passi già fatti. */
    @Column(name = "contesto", columnDefinition = "TEXT")
    private String contesto;

    @Column(name = "errore", columnDefinition = "TEXT")
    private String errore;

    @Column(name = "iniziata_il", nullable = false)
    private LocalDateTime iniziataIl;

    @Column(name = "conclusa_il")
    private LocalDateTime conclusaIl;

    @PrePersist
    void prePersist() {
        if (iniziataIl == null) {
            iniziataIl = LocalDateTime.now();
        }
    }
}
