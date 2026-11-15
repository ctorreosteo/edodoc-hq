package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/** Una riga della cronologia di una prenotazione: cosa è successo e quando. */
@Entity
@Table(name = "prenotazione_eventi")
@Getter @Setter @NoArgsConstructor
public class PrenotazioneEvento {

    public enum Tipo { CREATA, SPOSTATA, STATO, DISDETTA, INVITO, ESITO, CONTATTO, NOTA }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "prenotazione_id", nullable = false)
    private Long prenotazioneId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Tipo tipo;

    @Column(nullable = false, length = 500)
    private String testo;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    public static PrenotazioneEvento di(Long prenotazioneId, Tipo tipo, String testo) {
        PrenotazioneEvento e = new PrenotazioneEvento();
        e.setPrenotazioneId(prenotazioneId);
        e.setTipo(tipo);
        e.setTesto(testo.length() > 500 ? testo.substring(0, 497) + "…" : testo);
        return e;
    }
}
