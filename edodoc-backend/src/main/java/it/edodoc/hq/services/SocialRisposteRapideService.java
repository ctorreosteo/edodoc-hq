package it.edodoc.hq.services;

import it.edodoc.hq.dto.SocialDto;
import it.edodoc.hq.models.SocialRispostaRapida;
import it.edodoc.hq.repositories.SocialRispostaRapidaRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;

/** Risposte pronte della pagina Meta, le piu usate vengono prima. */
@Service
public class SocialRisposteRapideService {

    private final SocialRispostaRapidaRepository repository;
    private final SocialAzioniService azioni;

    public SocialRisposteRapideService(SocialRispostaRapidaRepository repository, SocialAzioniService azioni) {
        this.repository = repository;
        this.azioni = azioni;
    }

    @Transactional(readOnly = true)
    public List<SocialDto.RispostaRapida> elenco() {
        return repository.findAllByOrderByUsiDescTitoloAsc().stream().map(SocialRisposteRapideService::dto).toList();
    }

    @Transactional
    public SocialDto.RispostaRapida crea(SocialDto.RispostaRapidaRequest req) {
        SocialRispostaRapida r = new SocialRispostaRapida();
        applica(r, req);
        r.setCreatoDaUtenteId(azioni.operatoreCorrenteId());
        r.setCreatoIl(LocalDateTime.now());
        return dto(repository.save(r));
    }

    @Transactional
    public SocialDto.RispostaRapida aggiorna(Long id, SocialDto.RispostaRapidaRequest req) {
        SocialRispostaRapida r = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Risposta rapida non trovata."));
        applica(r, req);
        r.setAggiornatoIl(LocalDateTime.now());
        return dto(repository.save(r));
    }

    @Transactional
    public void elimina(Long id) {
        repository.deleteById(id);
    }

    @Transactional
    public void uso(Long id) {
        repository.incrementaUsi(id);
    }

    private static void applica(SocialRispostaRapida r, SocialDto.RispostaRapidaRequest req) {
        if (req == null || !StringUtils.hasText(req.titolo()) || !StringUtils.hasText(req.testo())) {
            throw new IllegalArgumentException("Titolo e testo sono obbligatori.");
        }
        String titolo = req.titolo().trim();
        if (titolo.length() > 120) {
            throw new IllegalArgumentException("Il titolo può avere al massimo 120 caratteri.");
        }
        String scorciatoia = StringUtils.hasText(req.scorciatoia()) ? req.scorciatoia().trim().toLowerCase() : null;
        if (scorciatoia != null) {
            if (!scorciatoia.startsWith("/")) {
                scorciatoia = "/" + scorciatoia;
            }
            if (!scorciatoia.matches("/[a-z0-9àèéìòù_-]{1,39}")) {
                throw new IllegalArgumentException("La scorciatoia è una parola sola, es. /orari.");
            }
        }
        r.setTitolo(titolo);
        r.setTesto(req.testo().trim());
        r.setScorciatoia(scorciatoia);
    }

    private static SocialDto.RispostaRapida dto(SocialRispostaRapida r) {
        return new SocialDto.RispostaRapida(r.getId(), r.getTitolo(), r.getTesto(), r.getScorciatoia(), r.getUsi());
    }
}
