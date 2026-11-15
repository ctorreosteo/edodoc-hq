package it.edodoc.hq.services;

import it.edodoc.hq.dto.ObiettiviDto;
import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.models.Percorso;
import it.edodoc.hq.repositories.PazienteRepository;
import it.edodoc.hq.repositories.PercorsoRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class ObiettivoService {

    /** L'obiettivo dello studio: 300 clienti che comprano un percorso nel 2027. */
    public static final int ANNO = 2027;
    public static final int TARGET = 300;

    private final PercorsoRepository percorsoRepository;
    private final PazienteRepository pazienteRepository;

    public ObiettivoService(PercorsoRepository percorsoRepository, PazienteRepository pazienteRepository) {
        this.percorsoRepository = percorsoRepository;
        this.pazienteRepository = pazienteRepository;
    }

    @Transactional(readOnly = true)
    public ObiettiviDto.Obiettivo obiettivo() {
        return new ObiettiviDto.Obiettivo(ANNO, TARGET, LocalDate.now(),
                conquiste(ANNO), conquiste(ANNO - 1),
                pazienteRepository.countByAttivoTrueAndStato(Paziente.Stato.LEAD),
                pazienteRepository.countByAttivoTrueAndStato(Paziente.Stato.LISTA_ATTESA));
    }

    /** Un cliente conta una volta sola nell'anno: vale la data del suo primo percorso, l'importo è la somma di tutti. */
    List<ObiettiviDto.Conquista> conquiste(int anno) {
        List<Percorso> percorsi = percorsoRepository.findVendutiTra(LocalDate.of(anno, 1, 1), LocalDate.of(anno, 12, 31));
        Map<Long, List<Percorso>> perCliente = new LinkedHashMap<>();
        for (Percorso p : percorsi) {
            perCliente.computeIfAbsent(p.getPaziente().getId(), k -> new ArrayList<>()).add(p);
        }
        List<ObiettiviDto.Conquista> righe = new ArrayList<>();
        for (List<Percorso> suoi : perCliente.values()) {
            Percorso primo = suoi.get(0);
            BigDecimal importo = suoi.stream().map(Percorso::getImportoTotale).reduce(BigDecimal.ZERO, BigDecimal::add);
            Paziente pz = primo.getPaziente();
            righe.add(new ObiettiviDto.Conquista(pz.getId(), pz.getNomeCompleto(), primo.getDataInizio(), primo.getTipo(),
                    pz.getFonte(), importo, suoi.size()));
        }
        return righe;
    }
}
