package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

/** Miniatura JPEG di un media del Planner. */
@Entity
@Table(name = "planner_media_anteprime")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PlannerMediaAnteprima {

    @Id
    @Column(name = "media_id")
    private Long mediaId;

    @Column(nullable = false)
    private byte[] contenuto;
}
