package it.edodoc.hq.services;

import it.edodoc.hq.dto.FinanceDto;
import it.edodoc.hq.exception.ConflittoException;
import it.edodoc.hq.exception.RisorsaNonTrovataException;
import it.edodoc.hq.models.MovimentoCassa;
import it.edodoc.hq.models.Pagamento;
import it.edodoc.hq.models.Percorso;
import it.edodoc.hq.models.ScadenzaFiscale;
import it.edodoc.hq.repositories.MovimentoCassaRepository;
import it.edodoc.hq.repositories.PagamentoRepository;
import it.edodoc.hq.repositories.PercorsoRepository;
import it.edodoc.hq.repositories.ScadenzaFiscaleRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Service
public class FinanceService {

    private final PagamentoRepository pagamentoRepository;
    private final MovimentoCassaRepository movimentoRepository;
    private final ScadenzaFiscaleRepository scadenzaRepository;
    private final PercorsoRepository percorsoRepository;
    private final ConfigService configService;

    public FinanceService(PagamentoRepository pagamentoRepository, MovimentoCassaRepository movimentoRepository,
                          ScadenzaFiscaleRepository scadenzaRepository, PercorsoRepository percorsoRepository,
                          ConfigService configService) {
        this.pagamentoRepository = pagamentoRepository;
        this.movimentoRepository = movimentoRepository;
        this.scadenzaRepository = scadenzaRepository;
        this.percorsoRepository = percorsoRepository;
        this.configService = configService;
    }

    private static BigDecimal euro(BigDecimal valore) {
        return valore.setScale(2, RoundingMode.HALF_UP);
    }

    /** Le stesse righe del foglio Cassa, ma ricavate da pagamenti e movimenti invece che scritte a mano. */
    @Transactional(readOnly = true)
    public FinanceDto.Riepilogo riepilogo(int anno, LocalDate oggi) {
        LocalDate inizio = LocalDate.of(anno, 1, 1);
        LocalDate fine = LocalDate.of(anno, 12, 31);
        BigDecimal[] pazienti = azzerati(), youtube = azzerati(), altro = azzerati(), uscite = azzerati();

        for (Pagamento p : pagamentoRepository.findPagatiNelPeriodo(inizio, fine)) {
            aggiungi(pazienti, p.getDataPagamento().getMonthValue(), p.getImporto());
        }
        for (MovimentoCassa m : movimentoRepository.findByDataBetweenOrderByDataDescIdDesc(inizio, fine)) {
            BigDecimal[] destinazione = m.getTipo() == MovimentoCassa.Tipo.USCITA ? uscite
                    : m.getCategoria() == MovimentoCassa.Categoria.YOUTUBE_ADS ? youtube : altro;
            aggiungi(destinazione, m.getData().getMonthValue(), m.getImporto());
        }

        List<FinanceDto.Mese> mesi = new ArrayList<>();
        for (int i = 0; i < 12; i++) {
            mesi.add(mese(i + 1, pazienti[i], youtube[i], altro[i], uscite[i]));
        }
        FinanceDto.Mese totali = mese(0, somma(pazienti), somma(youtube), somma(altro), somma(uscite));

        BigDecimal soglia = configService.getDecimale("FISCO_SOGLIA_FORFETTARIO");
        BigDecimal obiettivo = configService.getDecimale("FISCO_OBIETTIVO_ANNUO");
        BigDecimal cliente = configService.getDecimale("LISTINO_PAGAMENTO_UNICO");

        BigDecimal certo = totali.lordo();
        BigDecimal conRate = certo.add(pagamentoRepository.sommaDaPagare(inizio, fine));
        List<Percorso> inScadenza = percorsoRepository.findAttiviInScadenza(oggi.isAfter(inizio) ? oggi : inizio, fine);
        BigDecimal rinnovi = configService.getDecimale("LISTINO_MANTENIMENTO").multiply(BigDecimal.valueOf(inScadenza.size()));
        BigDecimal ads = adsAttesi(youtube, anno, oggi);
        BigDecimal previsione = conRate.add(rinnovi).add(ads);

        List<FinanceDto.Livello> livelli = List.of(
                livello("Livello 1", "Incassato certo", certo, obiettivo, soglia),
                livello("Livello 2", "Più le rate ancora da incassare quest'anno", conRate, obiettivo, soglia),
                livello("Livello 3", "Più rinnovi attesi (" + inScadenza.size() + " a mantenimento) e Ads dei mesi restanti", previsione, obiettivo, soglia));

        BigDecimal saldo = somma(pazienti).add(somma(youtube)).add(somma(altro)).subtract(somma(uscite));
        boolean candidatureAperte = soglia.subtract(certo).compareTo(cliente) >= 0;
        return new FinanceDto.Riepilogo(anno, mesi, totali, livelli, soglia, obiettivo, cliente, candidatureAperte, euro(saldo));
    }

    private FinanceDto.Mese mese(int numero, BigDecimal pazienti, BigDecimal youtube, BigDecimal altro, BigDecimal uscite) {
        BigDecimal base = configService.getDecimale("FISCO_COEFFICIENTE_REDDITIVITA");
        BigDecimal aliquotaContributo = configService.getDecimale("FATTURA_ALIQUOTA_CONTRIBUTO");
        BigDecimal lordo = pazienti.add(youtube).add(altro);
        BigDecimal imposta = lordo.multiply(base).multiply(configService.getDecimale("FISCO_ALIQUOTA_SOSTITUTIVA"));
        BigDecimal cassa = lordo.multiply(base).multiply(configService.getDecimale("FISCO_ALIQUOTA_CASSA"));
        BigDecimal contributo = pazienti.subtract(pazienti.divide(BigDecimal.ONE.add(aliquotaContributo), 2, RoundingMode.HALF_UP));
        return new FinanceDto.Mese(numero, euro(pazienti), euro(youtube), euro(altro), euro(lordo), euro(imposta),
                euro(contributo), euro(cassa), euro(lordo.subtract(contributo)), euro(uscite));
    }

    private static FinanceDto.Livello livello(String nome, String descrizione, BigDecimal totale, BigDecimal obiettivo, BigDecimal soglia) {
        return new FinanceDto.Livello(nome, descrizione, euro(totale), euro(obiettivo.subtract(totale)), euro(soglia.subtract(totale)));
    }

    /** Media dei mesi con Ads già registrati, proiettata sui mesi che restano. */
    private static BigDecimal adsAttesi(BigDecimal[] youtube, int anno, LocalDate oggi) {
        if (oggi.getYear() != anno) {
            return BigDecimal.ZERO;
        }
        int conDati = 0;
        BigDecimal totale = BigDecimal.ZERO;
        for (BigDecimal mese : youtube) {
            if (mese.signum() > 0) {
                conDati++;
                totale = totale.add(mese);
            }
        }
        if (conDati == 0) {
            return BigDecimal.ZERO;
        }
        return totale.divide(BigDecimal.valueOf(conDati), 2, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(12 - oggi.getMonthValue()));
    }

    private static BigDecimal[] azzerati() {
        BigDecimal[] valori = new BigDecimal[12];
        java.util.Arrays.fill(valori, BigDecimal.ZERO);
        return valori;
    }

    private static void aggiungi(BigDecimal[] mesi, int mese, BigDecimal importo) {
        mesi[mese - 1] = mesi[mese - 1].add(importo);
    }

    private static BigDecimal somma(BigDecimal[] valori) {
        return java.util.Arrays.stream(valori).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    @Transactional(readOnly = true)
    public List<FinanceDto.Movimento> movimenti(int anno) {
        return movimentoRepository.findByDataBetweenOrderByDataDescIdDesc(LocalDate.of(anno, 1, 1), LocalDate.of(anno, 12, 31))
                .stream().map(FinanceDto.Movimento::da).toList();
    }

    @Transactional
    public FinanceDto.Movimento salvaMovimento(Long id, FinanceDto.SalvaMovimento r) {
        MovimentoCassa m = id == null ? new MovimentoCassa() : movimentoRepository.findById(id)
                .orElseThrow(() -> new RisorsaNonTrovataException("Movimento non trovato"));
        m.setData(r.data());
        m.setTipo(r.tipo());
        m.setCategoria(r.categoria());
        m.setDescrizione(r.descrizione().trim());
        m.setImporto(r.importo());
        m.setNote(r.note());
        return FinanceDto.Movimento.da(movimentoRepository.save(m));
    }

    @Transactional
    public void eliminaMovimento(Long id) {
        movimentoRepository.deleteById(id);
    }

    @Transactional(readOnly = true)
    public List<FinanceDto.Scadenza> scadenze(int anno) {
        return scadenzaRepository.findByDataScadenzaBetweenOrderByDataScadenza(LocalDate.of(anno, 1, 1), LocalDate.of(anno, 12, 31))
                .stream().map(FinanceDto.Scadenza::da).toList();
    }

    @Transactional
    public FinanceDto.Scadenza salvaScadenza(Long id, FinanceDto.SalvaScadenza r) {
        ScadenzaFiscale s = id == null ? new ScadenzaFiscale() : scadenzaRepository.findById(id)
                .orElseThrow(() -> new RisorsaNonTrovataException("Scadenza non trovata"));
        s.setTitolo(r.titolo().trim());
        s.setCategoria(r.categoria());
        s.setDataScadenza(r.dataScadenza());
        s.setImportoStimato(r.importoStimato());
        s.setNote(r.note());
        return FinanceDto.Scadenza.da(scadenzaRepository.save(s));
    }

    @Transactional
    public FinanceDto.Scadenza pagaScadenza(Long id, FinanceDto.PagaScadenza r) {
        ScadenzaFiscale s = scadenzaRepository.findById(id)
                .orElseThrow(() -> new RisorsaNonTrovataException("Scadenza non trovata"));
        if (s.getStato() == ScadenzaFiscale.Stato.PAGATA) {
            throw new ConflittoException("Scadenza già pagata");
        }
        MovimentoCassa uscita = new MovimentoCassa();
        uscita.setData(r.data());
        uscita.setTipo(MovimentoCassa.Tipo.USCITA);
        uscita.setCategoria(s.getCategoria());
        uscita.setDescrizione(s.getTitolo());
        uscita.setImporto(r.importo());
        s.setMovimento(movimentoRepository.save(uscita));
        s.setStato(ScadenzaFiscale.Stato.PAGATA);
        s.setPagataIl(r.data());
        return FinanceDto.Scadenza.da(s);
    }

    @Transactional
    public void eliminaScadenza(Long id) {
        ScadenzaFiscale s = scadenzaRepository.findById(id)
                .orElseThrow(() -> new RisorsaNonTrovataException("Scadenza non trovata"));
        if (s.getStato() == ScadenzaFiscale.Stato.PAGATA) {
            throw new ConflittoException("Una scadenza pagata non si elimina: ha già il suo movimento di cassa");
        }
        scadenzaRepository.delete(s);
    }
}
