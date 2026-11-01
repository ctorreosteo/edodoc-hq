package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "contatti_settimana")
@Getter @Setter @NoArgsConstructor
public class ContattoSettimana {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "paziente_id")
    private Paziente paziente;

    @Column(nullable = false)
    private LocalDate settimana;

    @Column(name = "lunedi_fatto_il")
    private LocalDateTime lunediFattoIl;

    @Column(name = "mercoledi_fatto_il")
    private LocalDateTime mercolediFattoIl;
}
