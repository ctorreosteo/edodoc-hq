package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** Template riutilizzabile: documento a blocchi dell'editor ({@code design}) e la sua resa HTML. */
@Entity
@Table(name = "mailing_template")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailingTemplate {

    public enum Origine { EDITOR, SISTEMA }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "nome", nullable = false, length = 160)
    private String nome;

    @Column(name = "categoria", length = 60)
    private String categoria;

    @Column(name = "design", columnDefinition = "TEXT")
    private String design;

    @Column(name = "html", nullable = false, columnDefinition = "TEXT")
    private String html;

    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "origine", nullable = false, length = 20)
    private Origine origine = Origine.EDITOR;


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
