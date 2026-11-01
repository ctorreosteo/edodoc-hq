package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "config")
@Getter @Setter @NoArgsConstructor
public class Config {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 100)
    private String chiave;

    @Column(columnDefinition = "TEXT")
    private String valore;

    @Column(length = 255)
    private String descrizione;
}
