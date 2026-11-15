package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/** Chiamata conoscitiva prenotata dal sito. Orario, stato e Google stanno sulla visita collegata. */
@Entity
@Table(name = "prenotazioni")
@Getter @Setter @NoArgsConstructor
public class Prenotazione {

    public enum RispostaInvito { IN_ATTESA, ACCETTATO, FORSE, RIFIUTATO }

    public enum DisdettaDa { PERSONA, INVITO }

    public enum Esito { INTERESSATO, CI_PENSA, ACQUISTATO, NON_ADATTO }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "visita_id")
    private Visita visita;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "paziente_id")
    private Paziente paziente;

    @Column(columnDefinition = "TEXT")
    private String obiettivo;

    @Column(columnDefinition = "TEXT")
    private String messaggio;

    // Questionario del sito: vuoti sulle prenotazioni arrivate prima
    private String professione;

    @Column(name = "conosciuto_da")
    private String conosciutoDa;

    @Column(name = "percorsi_precedenti", columnDefinition = "TEXT")
    private String percorsiPrecedenti;

    private String investimento;

    private String priorita;

    @Column(name = "perche_ora", columnDefinition = "TEXT")
    private String percheOra;

    @Column(name = "nuovo_contatto", nullable = false)
    private Boolean nuovoContatto = true;

    @Enumerated(EnumType.STRING)
    @Column(name = "risposta_invito", nullable = false)
    private RispostaInvito rispostaInvito = RispostaInvito.IN_ATTESA;

    @Column(name = "disdetta_il")
    private LocalDateTime disdettaIl;

    @Enumerated(EnumType.STRING)
    @Column(name = "disdetta_da")
    private DisdettaDa disdettaDa;

    @Column(name = "disdetta_motivo")
    private String disdettaMotivo;

    @Enumerated(EnumType.STRING)
    private Esito esito;

    @Column(name = "note_dottore", columnDefinition = "TEXT")
    private String noteDottore;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
