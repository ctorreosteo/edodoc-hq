package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "messaggi")
@Getter @Setter @NoArgsConstructor
public class Messaggio {

    public enum Mittente { PAZIENTE, DOTTORE }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "paziente_id")
    private Paziente paziente;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Mittente mittente;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String testo;

    @Column(name = "client_id")
    private UUID clientId;

    @Column(name = "inviato_il", nullable = false)
    private LocalDateTime inviatoIl = LocalDateTime.now();

    @Column(name = "letto_il")
    private LocalDateTime lettoIl;
}
