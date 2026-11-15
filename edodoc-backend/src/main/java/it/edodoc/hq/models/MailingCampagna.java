package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** Campagna (invio unico a un pubblico), eventualmente con test A/B; anche quelle importate da Mailchimp. */
@Entity
@Table(name = "mailing_campagne")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailingCampagna {

    /** TEST_AB = inviate le varianti di prova, in attesa del vincitore. */
    public enum Stato { BOZZA, PROGRAMMATA, IN_INVIO, TEST_AB, IN_PAUSA, INVIATA, ANNULLATA }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "nome", nullable = false, length = 200)
    private String nome;

    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "stato", nullable = false, length = 20)
    private Stato stato = Stato.BOZZA;

    @Column(name = "mittente_id")
    private Long mittenteId;

    @Column(name = "categoria_id")
    private Long categoriaId;

    @Column(name = "oggetto", length = 300)
    private String oggetto;

    @Column(name = "preheader", length = 300)
    private String preheader;

    @Column(name = "design", columnDefinition = "TEXT")
    private String design;

    @Column(name = "html", columnDefinition = "TEXT")
    private String html;

    /** JSON {"segmentiIds","tagIds","regole","esclusiSegmentiIds","esclusiTagIds","tutti"}. */
    @Column(name = "pubblico", columnDefinition = "TEXT")
    private String pubblico;

    /** JSON {"varianti","percentualeTest","metrica","oreAttesa","vincitore"}. */
    @Column(name = "test_ab", columnDefinition = "TEXT")
    private String testAb;

    @Builder.Default
    @Column(name = "invio_intelligente", nullable = false)
    private Boolean invioIntelligente = false;

    @Column(name = "utm_campaign", length = 120)
    private String utmCampaign;

    @Column(name = "programmata_il")
    private LocalDateTime programmataIl;

    @Column(name = "invio_iniziato_il")
    private LocalDateTime invioIniziatoIl;

    @Column(name = "invio_completato_il")
    private LocalDateTime invioCompletatoIl;

    @Column(name = "destinatari_totali")
    private Integer destinatariTotali;



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
