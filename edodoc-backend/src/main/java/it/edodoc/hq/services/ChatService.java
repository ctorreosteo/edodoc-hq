package it.edodoc.hq.services;

import it.edodoc.hq.dto.ChatDto;
import it.edodoc.hq.exception.RisorsaNonTrovataException;
import it.edodoc.hq.models.Messaggio;
import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.repositories.MessaggioRepository;
import it.edodoc.hq.repositories.PazienteRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/** Chat tra paziente e dottore. Niente socket: l'app interroga dopoId a chat aperta e riceve una push a chat chiusa. */
@Service
public class ChatService {

    private static final int LIMITE_PREDEFINITO = 50;
    private static final int LIMITE_MASSIMO = 100;

    private final MessaggioRepository messaggioRepository;
    private final PazienteRepository pazienteRepository;
    private final ApplicationEventPublisher eventi;

    public ChatService(MessaggioRepository messaggioRepository, PazienteRepository pazienteRepository,
                       ApplicationEventPublisher eventi) {
        this.messaggioRepository = messaggioRepository;
        this.pazienteRepository = pazienteRepository;
        this.eventi = eventi;
    }

    /**
     * Sempre dal più vecchio al più recente. dopoId: solo i nuovi, per aggiornare la chat aperta.
     * primaDiId: la pagina precedente. Senza nessuno dei due: gli ultimi messaggi.
     */
    @Transactional(readOnly = true)
    public List<ChatDto.RigaMessaggio> messaggi(Long pazienteId, Long dopoId, Long primaDiId, Integer limite) {
        Pageable pagina = PageRequest.of(0, limiteValido(limite));
        List<Messaggio> messaggi;
        if (dopoId != null) {
            messaggi = messaggioRepository.findByPazienteIdAndIdGreaterThanOrderByIdAsc(pazienteId, dopoId, pagina);
        } else {
            messaggi = new ArrayList<>(primaDiId != null
                    ? messaggioRepository.findByPazienteIdAndIdLessThanOrderByIdDesc(pazienteId, primaDiId, pagina)
                    : messaggioRepository.findByPazienteIdOrderByIdDesc(pazienteId, pagina));
            Collections.reverse(messaggi);
        }
        return messaggi.stream().map(ChatDto.RigaMessaggio::da).toList();
    }

    @Transactional
    public ChatDto.RigaMessaggio scrivi(Long pazienteId, Messaggio.Mittente mittente, ChatDto.Invio invio) {
        Paziente paziente = pazienteRepository.findByIdAndAttivoTrue(pazienteId)
                .orElseThrow(() -> new RisorsaNonTrovataException("Paziente non trovato"));
        if (invio.clientId() != null) {
            var giaRicevuto = messaggioRepository.findByPazienteIdAndClientId(pazienteId, invio.clientId());
            if (giaRicevuto.isPresent()) {
                return ChatDto.RigaMessaggio.da(giaRicevuto.get());
            }
        }
        Messaggio messaggio = new Messaggio();
        messaggio.setPaziente(paziente);
        messaggio.setMittente(mittente);
        messaggio.setTesto(invio.testo().trim());
        messaggio.setClientId(invio.clientId());
        messaggioRepository.save(messaggio);
        eventi.publishEvent(notifica(pazienteId, mittente));
        return ChatDto.RigaMessaggio.da(messaggio);
    }

    /** lettore: chi ha aperto la chat. Diventano letti i messaggi scritti dall'altro. */
    @Transactional
    public void segnaLetti(Long pazienteId, Messaggio.Mittente lettore) {
        messaggioRepository.segnaLetti(pazienteId, altro(lettore), LocalDateTime.now());
    }

    @Transactional(readOnly = true)
    public long nonLetti(Long pazienteId, Messaggio.Mittente lettore) {
        return messaggioRepository.countByPazienteIdAndMittenteAndLettoIlIsNull(pazienteId, altro(lettore));
    }

    @Transactional(readOnly = true)
    public List<ChatDto.Conversazione> conversazioni() {
        Map<Long, Long> nonLetti = messaggioRepository.contaNonLetti(Messaggio.Mittente.PAZIENTE).stream()
                .collect(Collectors.toMap(r -> (Long) r[0], r -> (Long) r[1]));
        return messaggioRepository.findUltimi().stream()
                .map(m -> new ChatDto.Conversazione(m.getPaziente().getId(), m.getPaziente().getNomeCompleto(),
                        ChatDto.RigaMessaggio.da(m), nonLetti.getOrDefault(m.getPaziente().getId(), 0L)))
                .toList();
    }

    static int limiteValido(Integer limite) {
        return limite == null ? LIMITE_PREDEFINITO : Math.max(1, Math.min(limite, LIMITE_MASSIMO));
    }

    static Notifica notifica(Long pazienteId, Messaggio.Mittente mittente) {
        return mittente == Messaggio.Mittente.DOTTORE
                ? new Notifica(pazienteId, "EdoDoc", "Hai un nuovo messaggio dal Dr. Bo", Map.of("tipo", "MESSAGGIO"))
                : new Notifica(null, "EdoDoc", "Hai un nuovo messaggio da un paziente",
                        Map.of("tipo", "MESSAGGIO", "pazienteId", pazienteId));
    }

    private static Messaggio.Mittente altro(Messaggio.Mittente mittente) {
        return mittente == Messaggio.Mittente.PAZIENTE ? Messaggio.Mittente.DOTTORE : Messaggio.Mittente.PAZIENTE;
    }
}
