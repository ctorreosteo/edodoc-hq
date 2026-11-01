package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "pazienti")
@Getter @Setter @NoArgsConstructor
public class Paziente {

    public enum Stato { LEAD, LISTA_ATTESA, ATTIVO, MANTENIMENTO, CONCLUSO }

    public enum Fonte { YOUTUBE, INSTAGRAM, MASTERCLASS, LIBRO, PASSAPAROLA, SITO, ALTRO }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String nome;

    @Column(nullable = false)
    private String cognome;

    private String email;
    private String cellulare;

    @Column(name = "codice_fiscale", length = 16)
    private String codiceFiscale;

    @Column(name = "data_nascita")
    private LocalDate dataNascita;

    private String indirizzo;
    private String cap;
    private String citta;
    private String provincia;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Stato stato = Stato.LEAD;

    @Enumerated(EnumType.STRING)
    private Fonte fonte;

    @Column(columnDefinition = "TEXT")
    private String situazione;

    @Column(columnDefinition = "TEXT")
    private String nota;

    @Column(name = "peso_iniziale_kg", precision = 5, scale = 2)
    private BigDecimal pesoInizialeKg;

    @Column(name = "peso_obiettivo_kg", precision = 5, scale = 2)
    private BigDecimal pesoObiettivoKg;

    @Column(nullable = false)
    private Boolean attivo = true;

    @Column(name = "archiviato_il")
    private LocalDateTime archiviatoIl;

    @Column(name = "anonimizzato_il")
    private LocalDateTime anonimizzatoIl;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    void aggiornato() {
        updatedAt = LocalDateTime.now();
    }

    public String getNomeCompleto() {
        return nome + " " + cognome;
    }

    /** Riga unica per la fattura: via, CAP, città, provincia. Null se manca via o città. */
    public String getIndirizzoCompleto() {
        if (indirizzo == null || indirizzo.isBlank() || citta == null || citta.isBlank()) return null;
        StringBuilder s = new StringBuilder(indirizzo.trim()).append(", ");
        if (cap != null && !cap.isBlank()) s.append(cap.trim()).append(' ');
        s.append(citta.trim());
        if (provincia != null && !provincia.isBlank()) s.append(" (").append(provincia.trim()).append(')');
        return s.toString();
    }
}
