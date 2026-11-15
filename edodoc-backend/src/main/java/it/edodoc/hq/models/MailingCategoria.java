package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

/** Categoria del centro preferenze: il contatto può escluderla senza disiscriversi da tutto. */
@Entity
@Table(name = "mailing_categorie")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailingCategoria {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "nome", nullable = false, length = 80)
    private String nome;

    @Column(name = "descrizione", length = 300)
    private String descrizione;

    @Builder.Default
    @Column(name = "ordine", nullable = false)
    private Integer ordine = 0;

    @Builder.Default
    @Column(name = "attiva", nullable = false)
    private Boolean attiva = true;
}
