package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "check_settimanali")
@Getter @Setter @NoArgsConstructor
public class CheckSettimanale {

    public enum Fonte { APP, GESTIONALE }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "paziente_id")
    private Paziente paziente;

    @Column(nullable = false)
    private LocalDate settimana;

    @Column(name = "compilato_il", nullable = false)
    private LocalDateTime compilatoIl = LocalDateTime.now();

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Fonte fonte = Fonte.APP;

    @Column(name = "pasti_ottimali")
    private Integer pastiOttimali;

    @Column(name = "pasti_liberi", columnDefinition = "TEXT")
    private String pastiLiberi;

    private Integer energia;

    @Column(columnDefinition = "TEXT")
    private String allenamento;

    @Column(name = "peso_kg", precision = 5, scale = 2)
    private BigDecimal pesoKg;

    @Column(name = "andamento_peso", columnDefinition = "TEXT")
    private String andamentoPeso;

    @Column(columnDefinition = "TEXT")
    private String percezione;

    @Column(name = "percezione_migliorata")
    private Boolean percezioneMigliorata;

    private Integer impegno;

    @Column(name = "peso_fermo", nullable = false)
    private Boolean pesoFermo = false;

    @Column(name = "percezione_negativa", nullable = false)
    private Boolean percezioneNegativa = false;

    @Column(name = "energia_bassa", nullable = false)
    private Boolean energiaBassa = false;

    @Column(name = "letto_il")
    private LocalDateTime lettoIl;

    @Column(columnDefinition = "TEXT")
    private String feedback;

    @Column(name = "feedback_il")
    private LocalDateTime feedbackIl;

    @Column(name = "feedback_letto_il")
    private LocalDateTime feedbackLettoIl;

    @Column(name = "feedback_audio_id")
    private UUID feedbackAudioId;

    @Column(name = "feedback_audio_secondi")
    private Integer feedbackAudioSecondi;

    @Column(name = "feedback_email_il")
    private LocalDateTime feedbackEmailIl;

    public boolean haSegnali() {
        return pesoFermo || percezioneNegativa || energiaBassa;
    }

    /** Il feedback può essere solo vocale: il testo da solo non dice se il dottore ha risposto. */
    public boolean haFeedback() {
        return feedback != null || feedbackAudioId != null;
    }
}
