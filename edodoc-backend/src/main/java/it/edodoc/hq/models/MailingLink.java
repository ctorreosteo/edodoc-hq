package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

/** Link tracciato: URL originale per indice, per messaggio (campagna o email di automazione). */
@Entity
@Table(name = "mailing_link")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailingLink {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "campagna_id")
    private Long campagnaId;

    @Column(name = "automazione_email_id")
    private Long automazioneEmailId;

    @Column(name = "indice", nullable = false)
    private Integer indice;

    @Column(name = "url", nullable = false, columnDefinition = "TEXT")
    private String url;

    @Column(name = "etichetta", length = 300)
    private String etichetta;
}
