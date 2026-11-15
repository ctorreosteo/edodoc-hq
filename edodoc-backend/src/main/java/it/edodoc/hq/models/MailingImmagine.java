package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** Immagine caricata dall'editor, servita pubblicamente per token (i client di posta non sono autenticati). */
@Entity
@Table(name = "mailing_immagini")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailingImmagine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "token", nullable = false, length = 64)
    private String token;

    @Column(name = "nome_file", length = 255)
    private String nomeFile;

    @Column(name = "mime_type", nullable = false, length = 60)
    private String mimeType;

    @Column(name = "larghezza")
    private Integer larghezza;

    @Column(name = "altezza")
    private Integer altezza;

    @Column(name = "byte_dimensione", nullable = false)
    private Integer byteDimensione;

    @Column(name = "contenuto", nullable = false, columnDefinition = "bytea")
    private byte[] contenuto;

    @Column(name = "creato_da_utente_id")
    private Long creatoDaUtenteId;

    @Column(name = "creato_il", nullable = false)
    private LocalDateTime creatoIl;

    @PrePersist
    void prePersist() {
        if (creatoIl == null) {
            creatoIl = LocalDateTime.now();
        }
    }
}
