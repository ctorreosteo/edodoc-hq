package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/** Dipendenza «fine → inizio»: il successore può iniziare quando il predecessore è finito. */
@Entity
@Table(name = "task_dipendenze")
@Getter @Setter @NoArgsConstructor
public class TaskDipendenza {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "predecessore_id", nullable = false)
    private Long predecessoreId;

    @Column(name = "successore_id", nullable = false)
    private Long successoreId;

    @Column(name = "creato_il", nullable = false)
    private LocalDateTime creatoIl = LocalDateTime.now();

    public TaskDipendenza(Long predecessoreId, Long successoreId) {
        this.predecessoreId = predecessoreId;
        this.successoreId = successoreId;
    }
}
