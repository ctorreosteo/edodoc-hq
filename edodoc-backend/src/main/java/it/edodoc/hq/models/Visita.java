package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "visite")
@Getter @Setter @NoArgsConstructor
public class Visita {

    public enum Tipo {
        CHIAMATA_CONOSCITIVA(30), PRIMA_VISITA(60), CONTROLLO(30), MANTENIMENTO(30);

        public final int minutiPredefiniti;

        Tipo(int minutiPredefiniti) {
            this.minutiPredefiniti = minutiPredefiniti;
        }
    }

    public enum Modalita { ONLINE, PRESENZA }

    public enum Stato { PROGRAMMATA, EFFETTUATA, ANNULLATA, NON_PRESENTATO }

    public enum GoogleSync { DA_SINCRONIZZARE, SINCRONIZZATA, ERRORE }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "paziente_id")
    private Paziente paziente;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "percorso_id")
    private Percorso percorso;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Tipo tipo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Modalita modalita;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Stato stato = Stato.PROGRAMMATA;

    @Column(nullable = false)
    private LocalDateTime inizio;

    @Column(nullable = false)
    private LocalDateTime fine;

    @Column(name = "numero_visita")
    private Integer numeroVisita;

    @Column(name = "con_meet", nullable = false)
    private Boolean conMeet = false;

    @Column(name = "meet_url")
    private String meetUrl;

    @Column(name = "invita_paziente", nullable = false)
    private Boolean invitaPaziente = true;

    @Column(columnDefinition = "TEXT")
    private String note;

    @Column(name = "google_event_id")
    private String googleEventId;

    @Enumerated(EnumType.STRING)
    @Column(name = "google_sync_stato", nullable = false)
    private GoogleSync googleSyncStato = GoogleSync.DA_SINCRONIZZARE;

    @Column(name = "google_sync_errore", columnDefinition = "TEXT")
    private String googleSyncErrore;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    void aggiornata() {
        updatedAt = LocalDateTime.now();
    }
}
