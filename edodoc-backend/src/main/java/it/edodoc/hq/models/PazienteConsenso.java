package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/** Una scelta su un consenso facoltativo. Solo inserimenti: lo stato attuale è l'ultima riga per tipo. */
@Entity
@Table(name = "pazienti_consensi")
@Getter @Setter @NoArgsConstructor
public class PazienteConsenso {

    public enum Tipo { CONTATTO_MEDICO }

    public enum Fonte { ACCETTAZIONE, MANUALE }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "paziente_id", nullable = false)
    private Long pazienteId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private Tipo tipo;

    @Column(nullable = false)
    private Boolean concesso;

    @Column(nullable = false)
    private LocalDateTime il;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private Fonte fonte;

    @Column(name = "accettazione_id")
    private Long accettazioneId;

    @Column(name = "registrato_da_utente_id")
    private Long registratoDaUtenteId;

    @Column(length = 500)
    private String note;
}
