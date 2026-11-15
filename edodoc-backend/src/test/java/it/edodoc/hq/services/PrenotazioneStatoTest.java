package it.edodoc.hq.services;

import it.edodoc.hq.dto.PrenotazioniDto;
import it.edodoc.hq.models.Prenotazione;
import it.edodoc.hq.models.Visita;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class PrenotazioneStatoTest {

    private static final LocalDateTime ADESSO = LocalDateTime.of(2026, 11, 16, 12, 0);

    private static Prenotazione prenotazione(Visita.Stato stato, LocalDateTime inizio, boolean disdetta) {
        Visita v = new Visita();
        v.setStato(stato);
        v.setInizio(inizio);
        v.setFine(inizio.plusMinutes(30));
        Prenotazione p = new Prenotazione();
        p.setVisita(v);
        if (disdetta) p.setDisdettaIl(ADESSO.minusDays(1));
        return p;
    }

    @Test
    void laChiamataPassataMaAncoraProgrammataEDaChiudere() {
        assertThat(PrenotazioneService.stato(prenotazione(Visita.Stato.PROGRAMMATA, ADESSO.plusHours(2), false), ADESSO))
                .isEqualTo(PrenotazioniDto.Stato.IN_PROGRAMMA);
        assertThat(PrenotazioneService.stato(prenotazione(Visita.Stato.PROGRAMMATA, ADESSO.minusHours(2), false), ADESSO))
                .isEqualTo(PrenotazioniDto.Stato.DA_CHIUDERE);
    }

    @Test
    void annullataDallaPersonaEDisdettaDalDottoreEAnnullata() {
        assertThat(PrenotazioneService.stato(prenotazione(Visita.Stato.ANNULLATA, ADESSO, true), ADESSO)).isEqualTo(PrenotazioniDto.Stato.DISDETTA);
        assertThat(PrenotazioneService.stato(prenotazione(Visita.Stato.ANNULLATA, ADESSO, false), ADESSO)).isEqualTo(PrenotazioniDto.Stato.ANNULLATA);
        assertThat(PrenotazioneService.stato(prenotazione(Visita.Stato.EFFETTUATA, ADESSO, false), ADESSO)).isEqualTo(PrenotazioniDto.Stato.SVOLTA);
    }
}
