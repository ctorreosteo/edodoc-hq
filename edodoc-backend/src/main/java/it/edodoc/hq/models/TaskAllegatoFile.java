package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Contenuto di un allegato, a parte: gli elenchi leggono solo i metadati. */
@Entity
@Table(name = "task_allegati_file")
@Getter @Setter @NoArgsConstructor
public class TaskAllegatoFile {

    @Id
    @Column(name = "allegato_id")
    private Long allegatoId;

    @Column(nullable = false)
    private byte[] contenuto;

    public TaskAllegatoFile(Long allegatoId, byte[] contenuto) {
        this.allegatoId = allegatoId;
        this.contenuto = contenuto;
    }
}
