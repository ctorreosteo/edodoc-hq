package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "lezioni")
@Getter @Setter @NoArgsConstructor
public class Lezione {

    public enum Tipo { VIDEO, TESTO }

    public enum VideoStato { CARICAMENTO, ELABORAZIONE, PRONTO, ERRORE }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "modulo_id")
    private Modulo modulo;

    @Column(nullable = false)
    private String titolo;

    @Column(columnDefinition = "TEXT")
    private String descrizione;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Tipo tipo;

    @Column(nullable = false)
    private Integer ordine = 0;

    @Column(nullable = false)
    private Boolean pubblicata = false;

    @Column(columnDefinition = "TEXT")
    private String contenuto;

    @Column(name = "cloudflare_uid")
    private String cloudflareUid;

    @Enumerated(EnumType.STRING)
    @Column(name = "video_stato")
    private VideoStato videoStato;

    @Column(name = "video_errore")
    private String videoErrore;

    @Column(name = "durata_secondi")
    private Integer durataSecondi;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    /** Una lezione senza video pronto o senza testo non può arrivare al paziente. */
    public boolean isCompleta() {
        return tipo == Tipo.VIDEO
                ? videoStato == VideoStato.PRONTO
                : contenuto != null && !contenuto.isBlank();
    }
}
