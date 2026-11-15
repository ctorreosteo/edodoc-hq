package it.edodoc.hq.models;

import jakarta.persistence.*;
import lombok.*;

/** Immagine (JPEG) di una {@link SocialPubblicazione}. */
@Entity
@Table(name = "social_pubblicazioni_immagini")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SocialPubblicazioneImmagine {

    @Id
    @Column(name = "pubblicazione_id")
    private Long pubblicazioneId;

    @Column(name = "mime_type", nullable = false, length = 60)
    private String mimeType;

    @Column(name = "contenuto", nullable = false)
    private byte[] contenuto;
}
