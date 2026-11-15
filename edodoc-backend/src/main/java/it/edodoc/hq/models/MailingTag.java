package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** Tag dei contatti; {@code sistema} = assegnato dal gestionale, non rinominabile. */
@Entity
@Table(name = "mailing_tag")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailingTag {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "nome", nullable = false, length = 120)
    private String nome;

    @Column(name = "colore", length = 20)
    private String colore;

    @Builder.Default
    @Column(name = "sistema", nullable = false)
    private Boolean sistema = false;

    @Column(name = "creato_il", nullable = false)
    private LocalDateTime creatoIl;

    @PrePersist
    void prePersist() {
        if (creatoIl == null) {
            creatoIl = LocalDateTime.now();
        }
    }
}
