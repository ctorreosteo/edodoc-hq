package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "task_checklist")
@Getter @Setter @NoArgsConstructor
public class TaskChecklistVoce {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "task_id", nullable = false)
    private Long taskId;

    @Column(nullable = false, length = 500)
    private String testo;

    @Column(nullable = false)
    private boolean completato;

    @Column(nullable = false)
    private int ordine;

    @Column(name = "completato_il")
    private LocalDateTime completatoIl;

    public TaskChecklistVoce(Long taskId, String testo, int ordine) {
        this.taskId = taskId;
        this.testo = testo;
        this.ordine = ordine;
    }
}
