package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** Commento o conversazione segnato come gestito (esce da "Da rispondere" senza bisogno di rispondere). */
@Entity
@Table(name = "social_gestiti")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SocialGestito {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "oggetto_id", nullable = false, unique = true, length = 120)
    private String oggettoId;

    /** COMMENTO | CONVERSAZIONE */
    @Column(name = "tipo", nullable = false, length = 20)
    private String tipo;

    @Column(name = "piattaforma", length = 20)
    private String piattaforma;

    @Column(name = "page_id", nullable = false, length = 64)
    private String pageId;

    @Column(name = "utente_id")
    private Long utenteId;

    @Column(name = "gestito_il", nullable = false)
    private LocalDateTime gestitoIl;
}
