package it.edodoc.hq.services;

import it.edodoc.hq.dto.FattureDto;
import it.edodoc.hq.exception.IntegrazioneDisattivataException;
import it.edodoc.hq.models.Fattura;
import it.edodoc.hq.repositories.FatturaRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.List;

/**
 * Tessera Sanitaria. La trasmissione al Sistema TS è predisposta ma spenta (TESSERA_SANITARIA_ENABLED):
 * finché è spenta il dottore lavora dall'elenco del mese e segna a mano ciò che ha inserito.
 */
@Service
public class TesseraSanitariaService {

    private final FatturaRepository fatturaRepository;
    private final ConfigService configService;

    public TesseraSanitariaService(FatturaRepository fatturaRepository, ConfigService configService) {
        this.fatturaRepository = fatturaRepository;
        this.configService = configService;
    }

    public boolean isAttiva() {
        return configService.isAttivo(ConfigService.TESSERA_ENABLED);
    }

    @Transactional(readOnly = true)
    public List<FattureDto.RigaTessera> daInserire(YearMonth mese) {
        return fatturaRepository.findDaInserireInTessera(mese.atDay(1), mese.atEndOfMonth()).stream()
                .map(f -> new FattureDto.RigaTessera(f.getId(), f.getNumero(), f.getDataEmissione(),
                        f.getCodiceFiscale(), f.getImportoTotale()))
                .toList();
    }

    @Transactional
    public void segnaInserita(Long fatturaId, boolean inserita) {
        Fattura fattura = fatturaRepository.findById(fatturaId)
                .orElseThrow(() -> new IllegalArgumentException("Fattura non trovata"));
        fattura.setTsStato(inserita ? Fattura.TesseraSanitaria.INSERITA : Fattura.TesseraSanitaria.DA_INSERIRE);
        fattura.setTsInseritaIl(inserita ? LocalDateTime.now() : null);
    }

    /** Punto d'aggancio del client verso il Sistema TS: credenziali e certificato non ci sono ancora. */
    public void trasmetti(Long fatturaId) {
        if (!isAttiva()) {
            throw new IntegrazioneDisattivataException("La trasmissione alla Tessera Sanitaria non è attiva");
        }
        throw new IntegrazioneDisattivataException("Client Sistema TS non ancora configurato: servono credenziali e certificato");
    }
}
