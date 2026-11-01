package it.edodoc.hq.services;

import it.edodoc.hq.dto.FattureDto;
import it.edodoc.hq.exception.ConflittoException;
import it.edodoc.hq.exception.RisorsaNonTrovataException;
import it.edodoc.hq.models.Config;
import it.edodoc.hq.models.Fattura;
import it.edodoc.hq.models.Pagamento;
import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.repositories.ConfigRepository;
import it.edodoc.hq.repositories.FatturaRepository;
import it.edodoc.hq.repositories.PagamentoRepository;
import it.edodoc.hq.repositories.PazienteRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@Service
public class FatturaService {

    private final FatturaRepository fatturaRepository;
    private final PagamentoRepository pagamentoRepository;
    private final PazienteRepository pazienteRepository;
    private final ConfigRepository configRepository;
    private final ConfigService configService;
    private final FatturaPdfService pdfService;

    public FatturaService(FatturaRepository fatturaRepository, PagamentoRepository pagamentoRepository,
                          PazienteRepository pazienteRepository, ConfigRepository configRepository,
                          ConfigService configService, FatturaPdfService pdfService) {
        this.fatturaRepository = fatturaRepository;
        this.pagamentoRepository = pagamentoRepository;
        this.pazienteRepository = pazienteRepository;
        this.configRepository = configRepository;
        this.configService = configService;
        this.pdfService = pdfService;
    }

    @Transactional(readOnly = true)
    public List<FattureDto.Riga> nelPeriodo(LocalDate da, LocalDate a) {
        return fatturaRepository.findNelPeriodo(da, a).stream().map(FattureDto.Riga::da).toList();
    }

    @Transactional(readOnly = true)
    public List<FattureDto.Riga> delPaziente(Long pazienteId) {
        return fatturaRepository.findDelPaziente(pazienteId).stream().map(FattureDto.Riga::da).toList();
    }

    private FatturaCalcolo.Importi importi(BigDecimal prezzo) {
        return FatturaCalcolo.calcola(prezzo, configService.getDecimale("FATTURA_ALIQUOTA_CONTRIBUTO"),
                configService.getDecimale("FATTURA_BOLLO_SOGLIA"), configService.getDecimale("FATTURA_BOLLO_IMPORTO"),
                configService.isAttivo("FATTURA_BOLLO_DENTRO_IL_PREZZO"));
    }

    @Transactional(readOnly = true)
    public FattureDto.Anteprima anteprima(FattureDto.Emetti r) {
        Pagamento pagamento = pagamentoDa(r);
        Paziente paziente = pazienteDa(r, pagamento);
        BigDecimal prezzo = prezzoDa(r, pagamento);
        FatturaCalcolo.Importi importi = importi(prezzo);
        return new FattureDto.Anteprima(configService.getDecimale(ConfigService.PROSSIMO_NUMERO).intValue(),
                r.data() != null ? r.data() : LocalDate.now(), paziente.getNomeCompleto(),
                paziente.getIndirizzoCompleto(), paziente.getCodiceFiscale(), descrizioneDa(r),
                importi.imponibile(), importi.contributo(), importi.bollo(), importi.totale());
    }

    @Transactional
    public FattureDto.Riga emetti(FattureDto.Emetti r) {
        Pagamento pagamento = pagamentoDa(r);
        Paziente paziente = pazienteDa(r, pagamento);
        BigDecimal prezzo = prezzoDa(r, pagamento);
        LocalDate data = r.data() != null ? r.data() : LocalDate.now();

        verificaEmittente();
        verificaPaziente(paziente);
        if (pagamento != null) {
            if (pagamento.getStato() != Pagamento.Stato.PAGATO) {
                throw new ConflittoException("Si fattura a pagamento ricevuto: registra prima il pagamento");
            }
            if (fatturaRepository.existsByPagamentoIdAndStato(pagamento.getId(), Fattura.Stato.EMESSA)) {
                throw new ConflittoException("Questo pagamento ha già una fattura");
            }
        }

        // Il blocco sulla riga serializza le emissioni: numero e data restano coerenti anche in parallelo
        Config contatore = configRepository.findByChiavePerAggiornare(ConfigService.PROSSIMO_NUMERO)
                .orElseThrow(() -> new IllegalStateException("Contatore fatture mancante"));
        fatturaRepository.findUltimaData().filter(data::isBefore).ifPresent(ultima -> {
            throw new IllegalArgumentException("La data non può precedere l'ultima fattura emessa");
        });
        int numero = Integer.parseInt(contatore.getValore().trim());
        contatore.setValore(String.valueOf(numero + 1));

        if (pagamento == null) {
            pagamento = incassoDellaFatturaLibera(paziente, prezzo, data, descrizioneDa(r));
        }

        FatturaCalcolo.Importi importi = importi(prezzo);
        Fattura fattura = new Fattura();
        fattura.setNumero(numero);
        fattura.setDataEmissione(data);
        fattura.setPaziente(paziente);
        fattura.setPagamento(pagamento);
        fattura.setIntestatario(paziente.getNomeCompleto());
        fattura.setIndirizzo(paziente.getIndirizzoCompleto());
        fattura.setCodiceFiscale(paziente.getCodiceFiscale().toUpperCase(Locale.ROOT));
        fattura.setDescrizione(descrizioneDa(r));
        fattura.setImponibile(importi.imponibile());
        fattura.setContributo(importi.contributo());
        fattura.setBollo(importi.bollo());
        fattura.setImportoTotale(importi.totale());
        fattura.setTsOpposizione(Boolean.TRUE.equals(r.tsOpposizione()));
        return FattureDto.Riga.da(fatturaRepository.save(fattura));
    }

    /** Fatturato e incassato coincidono: una fattura senza pagamento nasce con il suo incasso. */
    private Pagamento incassoDellaFatturaLibera(Paziente paziente, BigDecimal prezzo, LocalDate data, String descrizione) {
        Pagamento incasso = new Pagamento();
        incasso.setPaziente(paziente);
        incasso.setTipo(Pagamento.Tipo.ALTRO);
        incasso.setDescrizione(descrizione);
        incasso.setImporto(prezzo);
        incasso.setScadenza(data);
        incasso.setStato(Pagamento.Stato.PAGATO);
        incasso.setDataPagamento(data);
        incasso.setMetodo(Pagamento.Metodo.BONIFICO);
        return pagamentoRepository.save(incasso);
    }

    /** Il numero resta occupato: una fattura emessa non si cancella, si annulla. */
    @Transactional
    public FattureDto.Riga annulla(Long id, String motivo) {
        Fattura fattura = trova(id);
        if (fattura.getStato() == Fattura.Stato.ANNULLATA) {
            throw new ConflittoException("La fattura è già annullata");
        }
        fattura.setStato(Fattura.Stato.ANNULLATA);
        fattura.setMotivoAnnullamento(motivo.trim());
        return FattureDto.Riga.da(fattura);
    }

    @Transactional(readOnly = true)
    public PdfFattura pdf(Long id) throws IOException {
        Fattura fattura = trova(id);
        return new PdfFattura(fattura.getNomeFile(), pdfService.genera(fattura));
    }

    /** Il PDF non porta il segno dell'annullamento: al paziente arrivano solo le fatture valide, così non ne detrae una annullata. */
    @Transactional(readOnly = true)
    public List<FattureDto.AppFattura> delPazienteApp(Long pazienteId) {
        return fatturaRepository.findDelPaziente(pazienteId).stream()
                .filter(f -> f.getStato() == Fattura.Stato.EMESSA)
                .map(FattureDto.AppFattura::da).toList();
    }

    @Transactional(readOnly = true)
    public PdfFattura pdfApp(Long pazienteId, Long id) throws IOException {
        Fattura fattura = fatturaRepository.findConDettagli(id)
                .filter(f -> f.getPaziente().getId().equals(pazienteId) && f.getStato() == Fattura.Stato.EMESSA)
                .orElseThrow(() -> new RisorsaNonTrovataException("Fattura non trovata"));
        return new PdfFattura(fattura.getNomeFile(), pdfService.genera(fattura));
    }

    public record PdfFattura(String nomeFile, byte[] contenuto) {
    }

    private Pagamento pagamentoDa(FattureDto.Emetti r) {
        if (r.pagamentoId() == null) {
            return null;
        }
        return pagamentoRepository.findConPaziente(r.pagamentoId())
                .orElseThrow(() -> new RisorsaNonTrovataException("Pagamento non trovato"));
    }

    private Paziente pazienteDa(FattureDto.Emetti r, Pagamento pagamento) {
        if (pagamento != null) {
            return pagamento.getPaziente();
        }
        if (r.pazienteId() == null) {
            throw new IllegalArgumentException("Scegli il paziente");
        }
        return pazienteRepository.findByIdAndAttivoTrue(r.pazienteId())
                .orElseThrow(() -> new RisorsaNonTrovataException("Paziente non trovato"));
    }

    private static BigDecimal prezzoDa(FattureDto.Emetti r, Pagamento pagamento) {
        if (pagamento != null) {
            return pagamento.getImporto();
        }
        if (r.importo() == null) {
            throw new IllegalArgumentException("Indica l'importo");
        }
        return r.importo();
    }

    private String descrizioneDa(FattureDto.Emetti r) {
        return r.descrizione() != null && !r.descrizione().isBlank()
                ? r.descrizione().trim() : configService.get("FATTURA_DESCRIZIONE");
    }

    private void verificaPaziente(Paziente paziente) {
        List<String> mancanti = new ArrayList<>();
        if (paziente.getCodiceFiscale() == null || paziente.getCodiceFiscale().isBlank()) mancanti.add("codice fiscale");
        if (paziente.getIndirizzoCompleto() == null) mancanti.add("indirizzo di residenza");
        if (!mancanti.isEmpty()) {
            throw new IllegalArgumentException("Per la fattura manca: " + String.join(", ", mancanti));
        }
    }

    private void verificaEmittente() {
        if (configService.get("EMITTENTE_PARTITA_IVA").isBlank() || configService.get("EMITTENTE_CODICE_FISCALE").isBlank()
                || configService.get("EMITTENTE_INDIRIZZO").isBlank()) {
            throw new ConflittoException("Compila i dati dell'emittente in Impostazioni prima di emettere la prima fattura");
        }
    }

    private Fattura trova(Long id) {
        return fatturaRepository.findConDettagli(id)
                .orElseThrow(() -> new RisorsaNonTrovataException("Fattura non trovata"));
    }
}
