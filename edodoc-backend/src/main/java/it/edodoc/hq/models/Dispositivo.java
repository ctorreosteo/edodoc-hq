package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "dispositivi")
@Getter @Setter @NoArgsConstructor
public class Dispositivo {

    public enum Piattaforma { IOS, ANDROID }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "utente_id")
    private Utente utente;

    @Column(name = "push_token", nullable = false, unique = true)
    private String pushToken;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Piattaforma piattaforma;

    @Column(name = "aggiornato_il", nullable = false)
    private LocalDateTime aggiornatoIl = LocalDateTime.now();
}
