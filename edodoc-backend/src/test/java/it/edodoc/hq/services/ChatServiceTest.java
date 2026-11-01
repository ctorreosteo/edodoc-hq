package it.edodoc.hq.services;

import it.edodoc.hq.dto.ChatDto;
import it.edodoc.hq.models.Messaggio;
import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.repositories.MessaggioRepository;
import it.edodoc.hq.repositories.PazienteRepository;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ChatServiceTest {

    private final MessaggioRepository messaggi = mock(MessaggioRepository.class);
    private final PazienteRepository pazienti = mock(PazienteRepository.class);
    private final ApplicationEventPublisher eventi = mock(ApplicationEventPublisher.class);
    private final ChatService service = new ChatService(messaggi, pazienti, eventi);

    private Messaggio messaggio(long id) {
        Messaggio m = new Messaggio();
        m.setId(id);
        m.setMittente(Messaggio.Mittente.PAZIENTE);
        m.setTesto("ciao");
        return m;
    }

    @Test
    void limite_restaNeiBordi() {
        assertThat(ChatService.limiteValido(null)).isEqualTo(50);
        assertThat(ChatService.limiteValido(0)).isEqualTo(1);
        assertThat(ChatService.limiteValido(5000)).isEqualTo(100);
    }

    @Test
    void ultimiMessaggi_dalPiuVecchio() {
        when(messaggi.findByPazienteIdOrderByIdDesc(eq(7L), any())).thenReturn(List.of(messaggio(3), messaggio(2)));
        assertThat(service.messaggi(7L, null, null, null)).extracting(ChatDto.RigaMessaggio::id).containsExactly(2L, 3L);
    }

    @Test
    void reinvio_conStessoClientId_nonDuplicaENonNotifica() {
        UUID clientId = UUID.randomUUID();
        Paziente paziente = new Paziente();
        when(pazienti.findByIdAndAttivoTrue(7L)).thenReturn(Optional.of(paziente));
        when(messaggi.findByPazienteIdAndClientId(7L, clientId)).thenReturn(Optional.of(messaggio(3)));

        ChatDto.RigaMessaggio riga = service.scrivi(7L, Messaggio.Mittente.PAZIENTE, new ChatDto.Invio("ciao", clientId));

        assertThat(riga.id()).isEqualTo(3L);
        verify(messaggi, never()).save(any());
        verify(eventi, never()).publishEvent(any(Object.class));
    }

    @Test
    void notifica_vaAllAltroESenzaIlTesto() {
        Notifica alPaziente = ChatService.notifica(7L, Messaggio.Mittente.DOTTORE);
        assertThat(alPaziente.pazienteId()).isEqualTo(7L);

        Notifica alDottore = ChatService.notifica(7L, Messaggio.Mittente.PAZIENTE);
        assertThat(alDottore.pazienteId()).isNull();
        assertThat(alDottore.dati()).isEqualTo(Map.of("tipo", "MESSAGGIO", "pazienteId", 7L));
    }

    @Test
    void chiApreLaChat_segnaLettiQuelliDellAltro() {
        service.segnaLetti(7L, Messaggio.Mittente.PAZIENTE);
        verify(messaggi).segnaLetti(eq(7L), eq(Messaggio.Mittente.DOTTORE), any());
    }
}
