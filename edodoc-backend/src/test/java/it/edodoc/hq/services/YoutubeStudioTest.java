package it.edodoc.hq.services;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class YoutubeStudioTest {

    @Test
    void estraeIdDaiLinkYoutube() {
        assertThat(YoutubeIdeeService.estraiVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s")).isEqualTo("dQw4w9WgXcQ");
        assertThat(YoutubeIdeeService.estraiVideoId("https://youtu.be/dQw4w9WgXcQ")).isEqualTo("dQw4w9WgXcQ");
        assertThat(YoutubeIdeeService.estraiVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).isEqualTo("dQw4w9WgXcQ");
        assertThat(YoutubeIdeeService.estraiVideoId("dQw4w9WgXcQ")).isEqualTo("dQw4w9WgXcQ");
        assertThatThrownBy(() -> YoutubeIdeeService.estraiVideoId("non è un video")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void durataIso8601InSecondi() {
        assertThat(YoutubeStudioService.durataSecondi("PT1H2M3S")).isEqualTo(3723);
        assertThat(YoutubeStudioService.durataSecondi("PT45S")).isEqualTo(45);
        assertThat(YoutubeStudioService.durataSecondi("P0D")).isZero();
        assertThat(YoutubeStudioService.durataSecondi("boh")).isZero();
    }

    @Test
    void periodoPrecedenteHaLaStessaDurata() {
        YoutubeStudioService.Periodo p = new YoutubeStudioService.Periodo(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 28));
        assertThat(p.alPrecedente()).isEqualTo(LocalDate.of(2026, 9, 30));
        assertThat(p.dalPrecedente()).isEqualTo(LocalDate.of(2026, 9, 3));
    }

    @Test
    void periodoSiFermaAllUltimoGiornoConDatiMantenendoLaDurata() {
        LocalDate ultimo = LocalDate.of(2026, 10, 23);
        YoutubeStudioService.Periodo p = YoutubeStudioService.periodo("2026-09-29", "2026-10-26", true, ultimo);
        assertThat(p.al()).isEqualTo(ultimo);
        assertThat(p.dal()).isEqualTo(LocalDate.of(2026, 9, 26));
        // Senza scorrimento (dettaglio video) l'inizio resta dov'è
        YoutubeStudioService.Periodo d = YoutubeStudioService.periodo("2026-10-01", "2026-10-26", false, ultimo);
        assertThat(d.dal()).isEqualTo(LocalDate.of(2026, 10, 1));
        assertThat(d.al()).isEqualTo(ultimo);
        // Video uscito dopo l'ultimo giorno elaborato
        YoutubeStudioService.Periodo n = YoutubeStudioService.periodo("2026-10-25", null, false, ultimo);
        assertThat(n.dal()).isEqualTo(ultimo);
        // Periodo già nel passato: invariato
        YoutubeStudioService.Periodo v = YoutubeStudioService.periodo("2026-01-01", "2026-01-31", true, ultimo);
        assertThat(v.dal()).isEqualTo(LocalDate.of(2026, 1, 1));
        assertThat(v.al()).isEqualTo(LocalDate.of(2026, 1, 31));
    }

    @Test
    void vociConLaStessaEtichettaSiSommano() {
        var voci = java.util.List.of(
                new it.edodoc.hq.dto.YoutubeDto.Voce("SUBSCRIBER", "Home e iscrizioni", 30, 60.0),
                new it.edodoc.hq.dto.YoutubeDto.Voce("YT_SEARCH", "Ricerca YouTube", 50, 100.0),
                new it.edodoc.hq.dto.YoutubeDto.Voce("BROWSE", "Home e iscrizioni", 40, 80.0));
        var somme = YoutubeStudioService.unisciPerEtichetta(voci, false);
        assertThat(somme).hasSize(2);
        assertThat(somme.get(0).etichetta()).isEqualTo("Home e iscrizioni");
        assertThat(somme.get(0).valore()).isEqualTo(70);
        assertThat(somme.get(0).secondario()).isEqualTo(140.0);
        var medie = YoutubeStudioService.unisciPerEtichetta(voci, true);
        assertThat(medie.get(0).secondario()).isEqualTo((60.0 * 30 + 80.0 * 40) / 70);
    }

    @Test
    void etichetteInItaliano() {
        assertThat(YoutubeStudioService.etichettaPaese("IT")).isEqualTo("Italia");
        assertThat(YoutubeStudioService.etichettaFonte("YT_SEARCH")).isEqualTo("Ricerca YouTube");
        assertThat(YoutubeStudioService.etichettaFonte("QUALCOSA_NUOVO")).isEqualTo("Qualcosa nuovo");
        assertThat(YoutubeStudioService.etichettaEta("age25-34")).isEqualTo("25–34");
        assertThat(YoutubeStudioService.etichettaEta("age65-")).isEqualTo("65+");
    }
}
