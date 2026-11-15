package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.io.Serializable;
import java.time.LocalDateTime;

/** Colonne della vista lista scelte da un utente, per tutte le liste ("predefinita") o per una ("lista:<id>"). */
@Entity
@Table(name = "task_colonne_utente")
@IdClass(TaskColonneUtente.Chiave.class)
@Getter @Setter @NoArgsConstructor
public class TaskColonneUtente {

    @Id
    @Column(name = "utente_id")
    private Long utenteId;

    @Id
    @Column(name = "contesto", length = 40)
    private String contesto;

    /** JSON: [{"id":"scadenza","larghezza":136}, ...], nell'ordine in cui si vedono. */
    @Column(name = "colonne", nullable = false, columnDefinition = "TEXT")
    private String colonne;

    @Column(name = "aggiornato_il", nullable = false)
    private LocalDateTime aggiornatoIl;

    public TaskColonneUtente(Long utenteId, String contesto) {
        this.utenteId = utenteId;
        this.contesto = contesto;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @EqualsAndHashCode
    public static class Chiave implements Serializable {
        private Long utenteId;
        private String contesto;
    }
}
