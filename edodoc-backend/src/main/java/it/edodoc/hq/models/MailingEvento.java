package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** Evento di tracciamento (invio, apertura, click, risposta, disiscrizione, rimbalzo, conversioni). */
@Entity
@Table(name = "mailing_eventi")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailingEvento {

    public enum Tipo {
        INVIATO, APERTURA, CLICK, RISPOSTA, DISISCRIZIONE, RIMBALZO, SPAM, CONVERSIONE_VISITA, CONVERSIONE_ACQUISTO
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "tipo", nullable = false, length = 30)
    private Tipo tipo;

    @Column(name = "invio_id")
    private Long invioId;

    @Column(name = "contatto_id")
    private Long contattoId;

    @Column(name = "campagna_id")
    private Long campagnaId;

    @Column(name = "automazione_id")
    private Long automazioneId;

    @Column(name = "link_indice")
    private Integer linkIndice;

    @Column(name = "url", columnDefinition = "TEXT")
    private String url;

    @Column(name = "dispositivo", length = 20)
    private String dispositivo;

    @Column(name = "client", length = 60)
    private String client;

    /** Apertura/click attribuibile a proxy o scanner: esclusa dalle metriche "umane". */
    @Builder.Default
    @Column(name = "automatico", nullable = false)
    private Boolean automatico = false;

    /** Importo della conversione (visita o acquisto). */
    @Column(name = "valore", precision = 12, scale = 2)
    private BigDecimal valore;

    /** Id della visita o dell'acquisto per le conversioni. */
    @Column(name = "riferimento_id")
    private Long riferimentoId;

    @Column(name = "avvenuto_il", nullable = false)
    private LocalDateTime avvenutoIl;

    @PrePersist
    void prePersist() {
        if (avvenutoIl == null) {
            avvenutoIl = LocalDateTime.now();
        }
    }
}
