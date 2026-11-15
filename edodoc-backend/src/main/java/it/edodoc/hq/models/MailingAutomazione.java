package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** Automazione a grafo: un trigger iscrive i contatti, che avanzano fra i nodi (email, attese, condizioni...). */
@Entity
@Table(name = "mailing_automazioni")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailingAutomazione {

    public enum Stato { BOZZA, ATTIVA, IN_PAUSA, ARCHIVIATA }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "nome", nullable = false, length = 200)
    private String nome;

    @Column(name = "descrizione", length = 500)
    private String descrizione;

    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "stato", nullable = false, length = 20)
    private Stato stato = Stato.BOZZA;

    @Column(name = "mittente_id")
    private Long mittenteId;

    @Column(name = "categoria_id")
    private Long categoriaId;

    /** JSON {"tipo":..., "parametri":{..}}. */
    @Column(name = "trigger_config", nullable = false, columnDefinition = "TEXT")
    private String triggerConfig;

    /** JSON {"nodi":[...],"archi":[...]}. */
    @Column(name = "grafo", nullable = false, columnDefinition = "TEXT")
    private String grafo;

    /** JSON delle regole di uscita; null = nessuna. */
    @Column(name = "uscita", columnDefinition = "TEXT")
    private String uscita;

    @Builder.Default
    @Column(name = "rientro_consentito", nullable = false)
    private Boolean rientroConsentito = false;

    @Builder.Default
    @Column(name = "solo_orari_lavorativi", nullable = false)
    private Boolean soloOrariLavorativi = true;


    @Column(name = "attivata_il")
    private LocalDateTime attivataIl;

    @Column(name = "creato_da_utente_id")
    private Long creatoDaUtenteId;

    @Column(name = "creato_il", nullable = false)
    private LocalDateTime creatoIl;

    @Column(name = "aggiornato_il")
    private LocalDateTime aggiornatoIl;

    @PrePersist
    void prePersist() {
        if (creatoIl == null) {
            creatoIl = LocalDateTime.now();
        }
    }
}
