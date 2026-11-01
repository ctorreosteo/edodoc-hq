package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "task_tipi")
@Getter @Setter @NoArgsConstructor
public class TaskTipo {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String codice;

    @Column(nullable = false)
    private String etichetta;

    @Column(name = "titolo_default", nullable = false)
    private String titoloDefault;

    @Column(name = "giorni_default", nullable = false)
    private Integer giorniDefault = 0;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Task.Priorita priorita = Task.Priorita.MEDIA;

    @Column(nullable = false)
    private String icona;

    @Column(nullable = false)
    private Integer ordine = 0;

    @Column(nullable = false)
    private Boolean attivo = true;
}
