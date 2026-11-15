package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** Profilo Instagram professionale di un concorrente, osservato con Business Discovery di Meta. */
@Entity
@Table(name = "planner_concorrenti")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PlannerConcorrente {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "brand_id", nullable = false)
    private Long brandId;

    @Column(nullable = false, length = 40)
    private String username;

    @Column(name = "creato_il", nullable = false)
    private LocalDateTime creatoIl;
}
