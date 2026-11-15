package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/** File allegato a un task (o a un suo commento). Il contenuto sta in {@link TaskAllegatoFile}. */
@Entity
@Table(name = "task_allegati")
@Getter @Setter @NoArgsConstructor
public class TaskAllegato {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "task_id", nullable = false)
    private Long taskId;

    /** Evento COMMENTO con cui è stato caricato, se c'è. */
    @Column(name = "evento_id")
    private Long eventoId;

    @Column(name = "nome_file", nullable = false)
    private String nomeFile;

    @Column(name = "content_type", length = 150)
    private String contentType;

    @Column(length = 20)
    private String estensione;

    @Column(nullable = false)
    private long dimensione;

    @Column(name = "creato_il", nullable = false, updatable = false)
    private LocalDateTime creatoIl = LocalDateTime.now();
}
