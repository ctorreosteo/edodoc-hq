package it.edodoc.hq.services;

import it.edodoc.hq.dto.CasellaDto;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class DemoPostaTest {

    private final DemoPosta posta = new DemoPosta();

    private long nonLettiInArrivo() {
        return posta.stato(null).inArrivoNonLetti();
    }

    @Test
    void segnaLetto_abbassaIlContatoreECambiaLoStato() {
        String prima = posta.casella().historyId();
        CasellaDto.ThreadRiga riga = posta.elenco("INBOX", "is:unread", null).righe().get(0);
        long nonLetti = nonLettiInArrivo();
        posta.modifica(List.of(riga.id()), List.of(), List.of("UNREAD"));
        assertThat(nonLettiInArrivo()).isEqualTo(nonLetti - 1);
        assertThat(posta.stato(prima).cambiato()).isTrue();
    }

    @Test
    void cestino_toglieDallArrivoERipristinaRiporta() {
        String id = posta.elenco("INBOX", null, null).righe().get(0).id();
        posta.cestina(List.of(id));
        assertThat(posta.elenco("INBOX", null, null).righe()).noneMatch(r -> r.id().equals(id));
        assertThat(posta.elenco("TRASH", null, null).righe()).anyMatch(r -> r.id().equals(id));
        posta.ripristina(List.of(id));
        assertThat(posta.elenco("INBOX", null, null).righe()).anyMatch(r -> r.id().equals(id));
    }

    @Test
    void ricerca_perTestoEPerAllegato() {
        assertThat(posta.elenco("INBOX", "contabile", null).righe()).hasSize(1);
        assertThat(posta.elenco("INBOX", "has:attachment", null).righe()).hasSize(1);
        assertThat(posta.elenco("INBOX", "inesistente", null).righe()).isEmpty();
    }

    @Test
    void risposta_restaNelThreadEBozzaSparisceDopoInvio() {
        String id = posta.elenco("INBOX", null, null).righe().get(0).id();
        int prima = posta.thread(id).messaggi().size();
        CasellaDto.EsitoBozza bozza = posta.salvaBozza(new CasellaDto.Composizione(List.of("a@esempio.it"), List.of(), List.of(), "Re", "<p>x</p>",
                id, null, null, List.of(), null), List.of());
        assertThat(posta.elenco("DRAFT", null, null).righe()).hasSize(1);
        posta.invia(new CasellaDto.Composizione(List.of("a@esempio.it"), List.of(), List.of(), "Re", "<p>x</p>",
                id, null, null, List.of(), bozza.bozzaId()), List.of());
        assertThat(posta.elenco("DRAFT", null, null).righe()).isEmpty();
        assertThat(posta.thread(id).messaggi()).hasSize(prima + 1);
    }

    @Test
    void html_arrivaSanificato() {
        String id = posta.elenco("SPAM", null, null).righe().get(0).id();
        assertThat(posta.thread(id).messaggi().get(0).html()).doesNotContain("<script").doesNotContain("onclick");
    }
}
