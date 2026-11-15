package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalTime;

/** Orario della coda del Planner: giorno 1 = lunedì … 7 = domenica. */
@Entity
@Table(name = "planner_slot")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PlannerSlot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private short giorno;

    @Column(nullable = false)
    private LocalTime ora;
}
