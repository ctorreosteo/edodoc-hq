package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Richiesta di firma online del modulo di accettazione, dal link inviato fino al PDF sigillato.
 * Il token del link non è salvato: solo il suo SHA-256. Dopo la firma i campi del documento sono protetti da trigger.
 */
@Entity
@Table(name = "accettazioni_firma")
@Getter @Setter @NoArgsConstructor
public class AccettazioneFirma {

    public enum Stato { INVIATA, APERTA, FIRMATA, ANNULLATA }

    public enum Ruolo { PAZIENTE, GENITORE, TUTORE }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "paziente_id")
    private Long pazienteId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Stato stato;

    @Column(name = "codice_verifica", nullable = false, length = 20, unique = true)
    private String codiceVerifica;

    @Column(name = "token_hash", nullable = false, length = 64)
    private String tokenHash;

    @Column(nullable = false)
    private Boolean minorenne = false;

    @Enumerated(EnumType.STRING)
    @Column(name = "firmatario_ruolo", nullable = false, length = 30)
    private Ruolo firmatarioRuolo;

    /** JSON {@link it.edodoc.hq.dto.AccettazioneDto.Snapshot}: dati della persona seguita e di chi firma. */
    @Column(name = "dati_snapshot", nullable = false, columnDefinition = "TEXT")
    private String datiSnapshot;

    /** Email di chi firma: riceve link, codice monouso e copia firmata. */
    @Column(nullable = false)
    private String email;

    @Column(name = "email_inviata_il")
    private LocalDateTime emailInviataIl;

    @Column(name = "modulo_documento_id", nullable = false)
    private Long moduloDocumentoId;

    @Column(name = "informativa_documento_id", nullable = false)
    private Long informativaDocumentoId;

    @Column(name = "fornitori_documento_id", nullable = false)
    private Long fornitoriDocumentoId;

    @Column(name = "creata_da_utente_id")
    private Long creataDaUtenteId;

    @Column(name = "creata_il", nullable = false)
    private LocalDateTime creataIl;

    @Column(name = "scade_il", nullable = false)
    private LocalDateTime scadeIl;

    @Column(name = "aperta_il")
    private LocalDateTime apertaIl;

    @Column(name = "dati_confermati_il")
    private LocalDateTime datiConfermatiIl;

    @Column(name = "otp_hash", length = 100)
    private String otpHash;

    @Column(name = "otp_scade_il")
    private LocalDateTime otpScadeIl;

    @Column(name = "otp_tentativi", nullable = false)
    private Integer otpTentativi = 0;

    @Column(name = "otp_invii", nullable = false)
    private Integer otpInvii = 0;

    @Column(name = "otp_ultimo_invio_il")
    private LocalDateTime otpUltimoInvioIl;

    @Column(name = "otp_verificato_il")
    private LocalDateTime otpVerificatoIl;

    /** JSON {@link it.edodoc.hq.dto.AccettazioneDto.Scelte}: dichiarazioni spuntate e consensi facoltativi. */
    @Column(columnDefinition = "TEXT")
    private String scelte;

    @Column(name = "firma_png")
    private byte[] firmaPng;

    @Column(name = "firma_ip", length = 64)
    private String firmaIp;

    @Column(name = "firma_user_agent", length = 500)
    private String firmaUserAgent;

    @Column(name = "firmata_il")
    private LocalDateTime firmataIl;

    private byte[] pdf;

    @Column(name = "pdf_sha256", length = 64)
    private String pdfSha256;

    @Column(name = "sigillo_certificato", columnDefinition = "TEXT")
    private String sigilloCertificato;

    @Column(name = "tsa_url")
    private String tsaUrl;

    @Column(name = "tsa_ora")
    private LocalDateTime tsaOra;

    @Column(name = "copia_inviata_il")
    private LocalDateTime copiaInviataIl;

    @Column(name = "conservare_fino_al")
    private LocalDate conservareFinoAl;

    @Column(name = "annullata_il")
    private LocalDateTime annullataIl;

    @Column(name = "annullata_da_utente_id")
    private Long annullataDaUtenteId;

    @Column(name = "motivo_annullamento", length = 500)
    private String motivoAnnullamento;

    public boolean isChiusa() {
        return stato == Stato.FIRMATA || stato == Stato.ANNULLATA;
    }

    /** Ancora firmabile: né firmata né annullata, e il link non è scaduto. */
    public boolean isFirmabile() {
        return !isChiusa() && scadeIl.isAfter(LocalDateTime.now());
    }
}
