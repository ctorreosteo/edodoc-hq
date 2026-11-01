package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "copertine")
@Getter @Setter @NoArgsConstructor
public class Copertina {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String tipo;

    @Column(nullable = false)
    private byte[] dati;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
