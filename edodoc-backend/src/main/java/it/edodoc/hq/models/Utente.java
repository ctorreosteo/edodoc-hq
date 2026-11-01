package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "utenti")
@Getter @Setter @NoArgsConstructor
public class Utente {

    /** REVISORE: il dottore per Apple e Google. Entra nell'area dottore, ma nessuna regola di SecurityConfig lo ammette ai dati. */
    public enum Ruolo { ADMIN, PAZIENTE, REVISORE }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String username;

    @Column(name = "password_hash")
    private String passwordHash;

    @Column(nullable = false)
    private String nome;

    @Column(nullable = false)
    private String cognome;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Ruolo ruolo;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "paziente_id")
    private Paziente paziente;

    @Column(nullable = false)
    private Boolean attivo = true;

    /** Solo lo SHA-256 del token: il link in chiaro lo riceve il paziente. */
    @Column(name = "invito_token_hash")
    private String invitoTokenHash;

    @Column(name = "invito_scadenza")
    private LocalDateTime invitoScadenza;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
