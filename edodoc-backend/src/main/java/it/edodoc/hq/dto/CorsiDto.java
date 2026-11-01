package it.edodoc.hq.dto;

import it.edodoc.hq.models.Corso;
import it.edodoc.hq.models.Lezione;
import it.edodoc.hq.models.Modulo;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

public final class CorsiDto {

    private CorsiDto() {
    }

    public record SalvaCorso(
            @NotBlank(message = "Il titolo è obbligatorio") @Size(max = 255, message = "Titolo troppo lungo") String titolo,
            String descrizione) {
    }

    public record SalvaModulo(
            @NotBlank(message = "Il titolo è obbligatorio") @Size(max = 255, message = "Titolo troppo lungo") String titolo,
            String descrizione) {
    }

    public record SalvaLezione(
            @NotNull(message = "Scegli il tipo di lezione") Lezione.Tipo tipo,
            @NotBlank(message = "Il titolo è obbligatorio") @Size(max = 255, message = "Titolo troppo lungo") String titolo,
            String descrizione,
            String contenuto) {
    }

    public record Ordine(@NotEmpty(message = "Ordine vuoto") List<Long> ids) {
    }

    public record AvviaUpload(@NotNull(message = "Dimensione mancante") @Positive(message = "Il file è vuoto") Long dimensioneBytes) {
    }

    public record RigaCorso(Long id, String titolo, String descrizione, UUID copertinaId, boolean pubblicato,
                            long moduli, long lezioni, long lezioniPubblicate, long secondiVideo) {
    }

    public record RigaModulo(Long id, String titolo, String descrizione, UUID copertinaId, int ordine) {
        public static RigaModulo da(Modulo m) {
            return new RigaModulo(m.getId(), m.getTitolo(), m.getDescrizione(), m.getCopertinaId(), m.getOrdine());
        }
    }

    public record RigaLezione(Long id, Long moduloId, String titolo, String descrizione, Lezione.Tipo tipo, int ordine,
                              boolean pubblicata, boolean completa, String contenuto, Lezione.VideoStato videoStato,
                              String videoErrore, Integer durataSecondi) {
        public static RigaLezione da(Lezione l) {
            return new RigaLezione(l.getId(), l.getModulo().getId(), l.getTitolo(), l.getDescrizione(), l.getTipo(),
                    l.getOrdine(), l.getPubblicata(), l.isCompleta(), l.getContenuto(), l.getVideoStato(),
                    l.getVideoErrore(), l.getDurataSecondi());
        }
    }

    public record ModuloConLezioni(RigaModulo modulo, List<RigaLezione> lezioni) {
    }

    public record Struttura(RigaCorso corso, List<ModuloConLezioni> moduli) {
    }

    public record StatoVideo(Lezione.VideoStato stato, Integer avanzamento, RigaLezione lezione) {
    }

    public record UploadVideo(String uploadUrl) {
    }

    /** URL firmati e temporanei: il client li chiede ogni volta, non li conserva. */
    public record Riproduzione(String iframeUrl, String hlsUrl) {
    }

    // Vista del paziente: niente bozze, niente dati di Cloudflare

    public record AppCorso(Long id, String titolo, String descrizione, UUID copertinaId, int lezioni, int secondiVideo) {
        public static AppCorso da(Corso c, List<Lezione> lezioni) {
            return new AppCorso(c.getId(), c.getTitolo(), c.getDescrizione(), c.getCopertinaId(), lezioni.size(),
                    lezioni.stream().mapToInt(l -> l.getDurataSecondi() != null ? l.getDurataSecondi() : 0).sum());
        }
    }

    public record AppLezioneRiga(Long id, String titolo, String descrizione, Lezione.Tipo tipo, Integer durataSecondi) {
        public static AppLezioneRiga da(Lezione l) {
            return new AppLezioneRiga(l.getId(), l.getTitolo(), l.getDescrizione(), l.getTipo(), l.getDurataSecondi());
        }
    }

    public record AppModulo(Long id, String titolo, String descrizione, UUID copertinaId, List<AppLezioneRiga> lezioni) {
    }

    public record AppCorsoDettaglio(AppCorso corso, List<AppModulo> moduli) {
    }

    public record AppLezione(Long id, String titolo, String descrizione, Lezione.Tipo tipo, Integer durataSecondi,
                             String contenuto, Riproduzione riproduzione) {
    }
}
