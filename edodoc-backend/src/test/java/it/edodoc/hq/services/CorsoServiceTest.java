package it.edodoc.hq.services;

import it.edodoc.hq.exception.ConflittoException;
import it.edodoc.hq.models.Lezione;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CorsoServiceTest {

    private static Lezione lezione(Lezione.Tipo tipo) {
        Lezione lezione = new Lezione();
        lezione.setTipo(tipo);
        return lezione;
    }

    private static CloudflareStreamService.InfoVideo info(boolean pronto, String stato) {
        return new CloudflareStreamService.InfoVideo(pronto, stato, null, null, null);
    }

    @Test
    void video_completoSoloQuandoPronto() {
        Lezione video = lezione(Lezione.Tipo.VIDEO);
        assertThat(video.isCompleta()).isFalse();
        video.setVideoStato(Lezione.VideoStato.ELABORAZIONE);
        assertThat(video.isCompleta()).isFalse();
        video.setVideoStato(Lezione.VideoStato.PRONTO);
        assertThat(video.isCompleta()).isTrue();
    }

    @Test
    void testo_completoSoloConContenuto() {
        Lezione testo = lezione(Lezione.Tipo.TESTO);
        testo.setContenuto("   ");
        assertThat(testo.isCompleta()).isFalse();
        testo.setContenuto("Mangia lento");
        assertThat(testo.isCompleta()).isTrue();
    }

    @Test
    void statoVideo_seguiCloudflare() {
        assertThat(CorsoService.statoVideo(info(true, "ready"))).isEqualTo(Lezione.VideoStato.PRONTO);
        assertThat(CorsoService.statoVideo(info(false, "inprogress"))).isEqualTo(Lezione.VideoStato.ELABORAZIONE);
        assertThat(CorsoService.statoVideo(info(false, "queued"))).isEqualTo(Lezione.VideoStato.ELABORAZIONE);
        assertThat(CorsoService.statoVideo(info(false, "pendingupload"))).isEqualTo(Lezione.VideoStato.CARICAMENTO);
        assertThat(CorsoService.statoVideo(info(false, "error"))).isEqualTo(Lezione.VideoStato.ERRORE);
    }

    @Test
    void riordino_accettaSoloGliStessiElementi() {
        assertThatCode(() -> CorsoService.verificaStessiElementi(List.of(1L, 2L, 3L), List.of(3L, 1L, 2L))).doesNotThrowAnyException();
        assertThatThrownBy(() -> CorsoService.verificaStessiElementi(List.of(1L, 2L), List.of(1L))).isInstanceOf(ConflittoException.class);
        assertThatThrownBy(() -> CorsoService.verificaStessiElementi(List.of(1L, 2L), List.of(1L, 9L))).isInstanceOf(ConflittoException.class);
        assertThatThrownBy(() -> CorsoService.verificaStessiElementi(List.of(1L, 2L), List.of(1L, 1L))).isInstanceOf(ConflittoException.class);
    }
}
