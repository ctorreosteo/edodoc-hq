package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

/** Contenuto di un media del Planner. */
@Entity
@Table(name = "planner_media_file")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PlannerMediaFile {

    @Id
    @Column(name = "media_id")
    private Long mediaId;

    @Column(nullable = false)
    private byte[] contenuto;
}
