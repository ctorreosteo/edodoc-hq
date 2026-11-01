package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "sessioni_app")
@Getter @Setter @NoArgsConstructor
public class SessioneApp {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "utente_id")
    private Utente utente;

    /** Solo lo SHA-256 del token: quello in chiaro resta sul telefono. */
    @Column(name = "refresh_hash", nullable = false, unique = true)
    private String refreshHash;

    @Column(nullable = false)
    private LocalDateTime scadenza;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
