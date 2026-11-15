package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.io.Serializable;
import java.time.LocalDateTime;

/** Tag assegnato a un contatto. */
@Entity
@Table(name = "mailing_contatti_tag")
@IdClass(MailingContattoTag.Chiave.class)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailingContattoTag {

    @Id
    @Column(name = "contatto_id")
    private Long contattoId;

    @Id
    @Column(name = "tag_id")
    private Long tagId;

    @Column(name = "aggiunto_il", nullable = false)
    private LocalDateTime aggiuntoIl;

    /** Null quando il tag l'ha messo il gestionale (automazioni, hook, import). */
    @Column(name = "aggiunto_da_utente_id")
    private Long aggiuntoDaUtenteId;

    @PrePersist
    void prePersist() {
        if (aggiuntoIl == null) {
            aggiuntoIl = LocalDateTime.now();
        }
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @EqualsAndHashCode
    public static class Chiave implements Serializable {
        private Long contattoId;
        private Long tagId;
    }
}
