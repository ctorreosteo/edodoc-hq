package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** Scheda del piano editoriale YouTube: un video dall'idea alla pubblicazione. */
@Entity
@Table(name = "youtube_idee")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class YoutubeIdea {

    public static final java.util.List<String> STATI =
            java.util.List.of("IDEA", "SCRIPT", "RIPRESE", "MONTAGGIO", "PRONTO", "PUBBLICATO");
    public static final java.util.List<String> FORMATI = java.util.List.of("VIDEO", "SHORT", "LIVE");
    public static final java.util.List<String> PRIORITA = java.util.List.of("BASSA", "MEDIA", "ALTA");

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 200)
    private String titolo;

    @Column(columnDefinition = "TEXT")
    private String note;

    @Column(nullable = false, length = 20)
    private String stato;

    @Column(nullable = false, length = 20)
    private String formato;

    @Column(nullable = false, length = 10)
    private String priorita;

    @Column(name = "data_uscita")
    private LocalDate dataUscita;

    @Column(name = "video_id", length = 32)
    private String videoId;

    @Column(name = "responsabile_utente_id")
    private Long responsabileUtenteId;

    @Column(nullable = false)
    private int posizione;

    @Column(name = "creata_da_utente_id")
    private Long creataDaUtenteId;

    @Column(name = "creata_il", nullable = false, updatable = false)
    private LocalDateTime creataIl;

    @Column(name = "aggiornata_il", nullable = false)
    private LocalDateTime aggiornataIl;

    @PrePersist
    void onCreate() {
        LocalDateTime adesso = LocalDateTime.now();
        if (creataIl == null) {
            creataIl = adesso;
        }
        aggiornataIl = adesso;
        if (stato == null) {
            stato = "IDEA";
        }
        if (formato == null) {
            formato = "VIDEO";
        }
        if (priorita == null) {
            priorita = "MEDIA";
        }
    }

    @PreUpdate
    void onUpdate() {
        aggiornataIl = LocalDateTime.now();
    }
}
