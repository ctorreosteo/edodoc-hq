package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

/** Media di un post del Planner, nell'ordine di pubblicazione. */
@Entity
@Table(name = "planner_post_media")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PlannerPostMedia {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "post_id", nullable = false)
    private Long postId;

    @Column(name = "media_id", nullable = false)
    private Long mediaId;

    @Column(nullable = false)
    private int posizione;
}
