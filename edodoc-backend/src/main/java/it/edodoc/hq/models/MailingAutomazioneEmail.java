package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** Contenuto di un'email di automazione (un nodo EMAIL del grafo la indica con config.emailId). */
@Entity
@Table(name = "mailing_automazioni_email")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailingAutomazioneEmail {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "automazione_id", nullable = false)
    private Long automazioneId;

    @Column(name = "nome", length = 200)
    private String nome;

    @Column(name = "oggetto", nullable = false, length = 300)
    private String oggetto;

    @Column(name = "preheader", length = 300)
    private String preheader;

    @Column(name = "design", columnDefinition = "TEXT")
    private String design;

    @Column(name = "html", nullable = false, columnDefinition = "TEXT")
    private String html;


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
