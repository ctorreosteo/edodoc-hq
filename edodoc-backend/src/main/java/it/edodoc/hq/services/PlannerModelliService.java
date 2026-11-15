package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import it.edodoc.hq.dto.PlannerDto;
import it.edodoc.hq.models.PlannerModello;
import it.edodoc.hq.repositories.PlannerModelloRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * Modelli di post del Planner social: un post (testo, canali, rubrica, link, primo commento) salvato per ripartire da
 * lì. Il contenuto è il JSON che il composer manda; i media non si salvano (si scelgono ogni volta).
 */
@Service
public class PlannerModelliService {

    private static final int MAX_CONTENUTO = 60_000;

    private final PlannerModelloRepository repository;
    private final PlannerSpaziService spazi;
    private final PlannerUtenti anagrafica;
    private final ObjectMapper objectMapper;

    public PlannerModelliService(PlannerModelloRepository repository, PlannerSpaziService spazi, PlannerUtenti anagrafica,
                                 ObjectMapper objectMapper) {
        this.repository = repository;
        this.spazi = spazi;
        this.anagrafica = anagrafica;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public List<PlannerDto.Modello> elenco(Long brandId) {
        List<PlannerModello> l = repository.perSpazio(spazi.risolvi(brandId).getId());
        Map<Long, String> nomi = anagrafica.nomiUtenti(l.stream().map(PlannerModello::getCreatoDaUtenteId).toList());
        return l.stream().map(m -> dto(m, nomi.get(m.getCreatoDaUtenteId()))).toList();
    }

    @Transactional
    public PlannerDto.Modello crea(PlannerDto.ModelloRequest req) {
        if (req == null || !StringUtils.hasText(req.nome())) {
            throw new IllegalArgumentException("Dai un nome al modello.");
        }
        if (req.contenuto() == null || !req.contenuto().isObject()) {
            throw new IllegalArgumentException("Il modello è vuoto.");
        }
        String contenuto = req.contenuto().toString();
        if (contenuto.length() > MAX_CONTENUTO) {
            throw new IllegalArgumentException("Il modello è troppo lungo.");
        }
        PlannerModello m = repository.save(PlannerModello.builder()
                .brandId(Boolean.TRUE.equals(req.perTuttiGliSpazi()) ? null : spazi.risolvi(req.brandId()).getId())
                .nome(PlannerUtenti.tronca(req.nome(), 120))
                .contenuto(contenuto)
                .creatoDaUtenteId(anagrafica.operatoreCorrenteId())
                .creatoIl(LocalDateTime.now())
                .build());
        return dto(m, anagrafica.nomeUtente(m.getCreatoDaUtenteId()));
    }

    @Transactional
    public void elimina(Long id) {
        repository.deleteById(id);
    }

    @Transactional
    public void uso(Long id) {
        repository.findById(id).ifPresent(m -> {
            m.setUsi(m.getUsi() + 1);
            repository.save(m);
        });
    }

    private PlannerDto.Modello dto(PlannerModello m, String nome) {
        JsonNode c;
        try {
            c = objectMapper.readTree(m.getContenuto());
        } catch (Exception e) {
            c = JsonNodeFactory.instance.objectNode();
        }
        return new PlannerDto.Modello(m.getId(), m.getBrandId(), m.getNome(), c, m.getUsi(), nome, PlannerCanali.iso(m.getCreatoIl()));
    }
}
