package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.io.Serializable;
import java.time.LocalDateTime;

/** Categoria che il contatto ha escluso dal centro preferenze. */
@Entity
@Table(name = "mailing_contatti_categorie_escluse")
@IdClass(MailingContattoCategoriaEsclusa.Chiave.class)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailingContattoCategoriaEsclusa {

    @Id
    @Column(name = "contatto_id")
    private Long contattoId;

    @Id
    @Column(name = "categoria_id")
    private Long categoriaId;

    @Column(name = "escluso_il", nullable = false)
    private LocalDateTime esclusoIl;

    @PrePersist
    void prePersist() {
        if (esclusoIl == null) {
            esclusoIl = LocalDateTime.now();
        }
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @EqualsAndHashCode
    public static class Chiave implements Serializable {
        private Long contattoId;
        private Long categoriaId;
    }
}
