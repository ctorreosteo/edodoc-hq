package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** Risposta pronta della pagina Meta; digitata con la sua scorciatoia nel composer. */
@Entity
@Table(name = "social_risposte_rapide")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SocialRispostaRapida {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "titolo", nullable = false, length = 120)
    private String titolo;

    @Column(name = "testo", nullable = false, columnDefinition = "TEXT")
    private String testo;

    /** Es. "/orari": digitata nel composer richiama la risposta. */
    @Column(name = "scorciatoia", length = 40)
    private String scorciatoia;

    @Column(name = "usi", nullable = false)
    private long usi;

    @Column(name = "creato_da_utente_id")
    private Long creatoDaUtenteId;

    @Column(name = "creato_il", nullable = false)
    private LocalDateTime creatoIl;

    @Column(name = "aggiornato_il")
    private LocalDateTime aggiornatoIl;
}
