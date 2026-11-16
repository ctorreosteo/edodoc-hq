package it.edodoc.hq.services;

import it.edodoc.hq.dto.ConoscitivaDto;
import it.edodoc.hq.models.Paziente;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class AvvisoPrenotazioneTest {

    @Test
    void lEmailAlDottoreDiceChiQuandoECosaHaScritto() {
        Paziente p = new Paziente();
        p.setNome("Giulia");
        p.setCognome("Rossi");
        p.setEmail("giulia@example.com");
        p.setCellulare("333 1234567");
        ConoscitivaDto.Prenota r = new ConoscitivaDto.Prenota(LocalDateTime.of(2026, 11, 18, 10, 0), "Giulia", "Rossi",
                "giulia@example.com", "333 1234567", "Perdere 5 kg", null, "Insegnante", "Instagram", null, "1.000-1.500 €",
                "Alta", "Mi sposo a giugno", true, null);

        var avviso = ConoscitivaService.avviso(p, r, r.inizio(), true);

        assertThat(avviso.oggetto()).isEqualTo("Nuova discovery call: Giulia Rossi, mercoledì 18 novembre alle 10:00");
        assertThat(avviso.testo())
                .contains("Chi: Giulia Rossi (nuovo contatto)")
                .contains("Quando: Mercoledì 18 novembre alle 10:00")
                .contains("Telefono: 333 1234567")
                .contains("Obiettivo: Perdere 5 kg")
                .contains("Perché adesso: Mi sposo a giugno")
                .doesNotContain("Messaggio:")
                .contains("https://hq.edodoc.it/discovery");
    }
}
