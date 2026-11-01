package it.edodoc.hq.services;

import it.edodoc.hq.dto.CasellaDto;
import it.edodoc.hq.exception.IntegrazioneDisattivataException;
import it.edodoc.hq.repositories.PazienteRepository;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class CasellaServiceTest {

    private final GmailService gmail = mock(GmailService.class);
    private final GmailPosta gmailPosta = mock(GmailPosta.class);
    private final DemoPosta demo = new DemoPosta();
    private final PazienteRepository pazienti = mock(PazienteRepository.class);

    private CasellaService service(boolean demoAttiva) {
        return new CasellaService(gmail, gmailPosta, demo, pazienti, demoAttiva);
    }

    @Test
    void conGoogleCollegato_usaGmailAncheInDemo() {
        when(gmail.isAttivo()).thenReturn(true);
        assertThat(service(true).posta()).isSameAs(gmailPosta);
    }

    @Test
    void senzaGoogle_laDemoSoloSeAbilitata() {
        assertThat(service(true).posta()).isSameAs(demo);
        assertThatThrownBy(() -> service(false).posta()).isInstanceOf(IntegrazioneDisattivataException.class);
    }

    @Test
    void idNonValidiVengonoScartati() {
        assertThat(CasellaService.idsValidi(List.of("abc_1", "abc_1", "../x", "a b"))).containsExactly("abc_1");
        assertThatThrownBy(() -> CasellaService.idsValidi(List.of("../x"))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void invioSenzaDestinatari_rifiutato() {
        CasellaDto.Composizione c = new CasellaDto.Composizione(List.of(" "), null, null, "x", "<p>y</p>", null, null, null, null, null);
        assertThatThrownBy(() -> service(true).invia(c, null)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void bozza_tieneSoloGliIndirizziCompleti() {
        CasellaDto.Composizione c = new CasellaDto.Composizione(List.of("marta@esempio.it", "mart@"), null, null, "x", "", null, null, null, null, null);
        assertThat(CasellaService.conDestinatariValidi(c).a()).containsExactly("marta@esempio.it");
    }
}
