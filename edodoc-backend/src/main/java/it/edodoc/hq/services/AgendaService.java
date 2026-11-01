package it.edodoc.hq.services;

import it.edodoc.hq.dto.AgendaDto;
import it.edodoc.hq.exception.IntegrazioneDisattivataException;
import it.edodoc.hq.repositories.PazienteRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Locale;

/**
 * Sceglie il calendario (Google, oppure quello dimostrativo in locale). La pagina non dipende dall'interruttore
 * della sincronizzazione delle visite: con l'account collegato il calendario del dottore si apre comunque.
 */
@Service
public class AgendaService {

    private final GoogleClients googleClients;
    private final GoogleAgenda googleAgenda;
    private final DemoAgenda demoAgenda;
    private final PazienteRepository pazienteRepository;
    private final boolean demoAttiva;

    public AgendaService(GoogleClients googleClients, GoogleAgenda googleAgenda, DemoAgenda demoAgenda,
                         PazienteRepository pazienteRepository,
                         @Value("${app.init.demo-enabled:false}") boolean demoAttiva) {
        this.googleClients = googleClients;
        this.googleAgenda = googleAgenda;
        this.demoAgenda = demoAgenda;
        this.pazienteRepository = pazienteRepository;
        this.demoAttiva = demoAttiva;
    }

    public AgendaFonte fonte() {
        if (googleClients.isConfigurato()) {
            return googleAgenda;
        }
        if (demoAttiva) {
            return demoAgenda;
        }
        throw new IntegrazioneDisattivataException("Il calendario non è ancora collegato: collega l'account Google in Impostazioni");
    }

    public List<AgendaDto.Contatto> contatti() {
        return pazienteRepository.findByAttivoTrueOrderByCognomeAscNomeAsc().stream()
                .filter(p -> p.getEmail() != null && !p.getEmail().isBlank())
                .map(p -> new AgendaDto.Contatto(p.getEmail().trim().toLowerCase(Locale.ROOT), p.getNomeCompleto(), "Paziente", p.getId()))
                .toList();
    }
}
