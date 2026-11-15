package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** Segmento dinamico: regole JSON valutate sui dati del gestionale al momento dell'uso. */
@Entity
@Table(name = "mailing_segmenti")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailingSegmento {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "nome", nullable = false, length = 120)
    private String nome;

    @Column(name = "descrizione", length = 500)
    private String descrizione;

    @Column(name = "colore", length = 20)
    private String colore;

    /** JSON {"operatore":"E"|"O","condizioni":[...]}. */
    @Column(name = "regole", nullable = false, columnDefinition = "TEXT")
    private String regole;

    @Column(name = "ultimo_conteggio")
    private Integer ultimoConteggio;

    @Column(name = "contato_il")
    private LocalDateTime contatoIl;

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
