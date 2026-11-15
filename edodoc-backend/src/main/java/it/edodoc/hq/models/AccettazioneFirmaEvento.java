package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/** Riga del registro a catena di hash di una richiesta di firma. Solo inserimenti. */
@Entity
@Table(name = "accettazioni_firma_eventi")
@Getter @Setter @NoArgsConstructor
public class AccettazioneFirmaEvento {

    public enum Tipo {
        CREATA, EMAIL_INVIATA, EMAIL_NON_INVIATA, LINK_RIGENERATO, APERTA, DATI_CONFERMATI, DOCUMENTO_APERTO,
        CODICE_INVIATO, CODICE_ERRATO, CODICE_VERIFICATO, FIRMATA, PDF_SIGILLATO, MARCA_NON_DISPONIBILE,
        COPIA_INVIATA, COPIA_NON_INVIATA, COPIA_SCARICATA, ANNULLATA
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "accettazione_id", nullable = false)
    private Long accettazioneId;

    @Column(nullable = false)
    private Integer seq;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private Tipo tipo;

    @Column(nullable = false)
    private LocalDateTime il;

    @Column(length = 64)
    private String ip;

    @Column(name = "user_agent", length = 500)
    private String userAgent;

    @Column(name = "utente_id")
    private Long utenteId;

    @Column(columnDefinition = "TEXT")
    private String dettagli;

    @Column(name = "hash_precedente", nullable = false, length = 64)
    private String hashPrecedente;

    @Column(nullable = false, length = 64)
    private String hash;
}
