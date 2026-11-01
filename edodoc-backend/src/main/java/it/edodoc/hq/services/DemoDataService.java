package it.edodoc.hq.services;

import it.edodoc.hq.dto.CheckDto;
import it.edodoc.hq.dto.PagamentiDto;
import it.edodoc.hq.dto.PazientiDto;
import it.edodoc.hq.dto.PercorsiDto;
import it.edodoc.hq.dto.TaskDto;
import it.edodoc.hq.dto.VisiteDto;
import it.edodoc.hq.models.CheckSettimanale;
import it.edodoc.hq.models.MovimentoCassa;
import it.edodoc.hq.models.Pagamento;
import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.models.Percorso;
import it.edodoc.hq.models.ScadenzaFiscale;
import it.edodoc.hq.models.Visita;
import it.edodoc.hq.repositories.MovimentoCassaRepository;
import it.edodoc.hq.repositories.PagamentoRepository;
import it.edodoc.hq.repositories.PazienteRepository;
import it.edodoc.hq.repositories.ScadenzaFiscaleRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;

/** Pazienti inventati per provare il gestionale in locale. Non gira mai se il DB contiene già pazienti. */
@Service
public class DemoDataService {

    private static final String[][] PERSONE = {
            {"Giulia", "Ferrari"}, {"Marco", "Colombo"}, {"Elena", "Ricci"}, {"Paolo", "Marino"}, {"Chiara", "Greco"},
            {"Luca", "Bruno"}, {"Anna", "Gallo"}, {"Stefano", "Conti"}, {"Marta", "De Luca"}, {"Andrea", "Mancini"},
            {"Silvia", "Costa"}, {"Roberto", "Giordano"}, {"Laura", "Rizzo"}, {"Davide", "Lombardi"}};

    private static final String[] SITUAZIONI = {
            "Ripresa la dieta dopo l'estate, molto motivata", "Lavora su turni, cena tardi", "Menopausa, sonno scarso",
            "Viaggia spesso per lavoro", "Vuole arrivare al matrimonio della figlia in forma"};

    /** Incassi 2026 della copia dimostrativa del foglio Cassa, da gennaio a ottobre. */
    private static final double[] INCASSI_MENSILI = {10400, 9200, 10100, 9800, 10300, 10200, 9000, 6421.40, 4657.84, 754};

    private final PazienteRepository pazienteRepository;
    private final PazienteService pazienteService;
    private final PercorsoService percorsoService;
    private final VisitaService visitaService;
    private final CheckService checkService;
    private final PagamentoService pagamentoService;
    private final PagamentoRepository pagamentoRepository;
    private final TaskService taskService;
    private final MovimentoCassaRepository movimentoRepository;
    private final ScadenzaFiscaleRepository scadenzaRepository;
    private final ConfigService configService;

    public DemoDataService(PazienteRepository pazienteRepository, PazienteService pazienteService,
                           PercorsoService percorsoService, VisitaService visitaService, CheckService checkService,
                           PagamentoService pagamentoService, PagamentoRepository pagamentoRepository,
                           TaskService taskService, MovimentoCassaRepository movimentoRepository,
                           ScadenzaFiscaleRepository scadenzaRepository, ConfigService configService) {
        this.pazienteRepository = pazienteRepository;
        this.pazienteService = pazienteService;
        this.percorsoService = percorsoService;
        this.visitaService = visitaService;
        this.checkService = checkService;
        this.pagamentoService = pagamentoService;
        this.pagamentoRepository = pagamentoRepository;
        this.taskService = taskService;
        this.movimentoRepository = movimentoRepository;
        this.scadenzaRepository = scadenzaRepository;
        this.configService = configService;
    }

    @Transactional
    public void caricaSeVuoto() {
        if (pazienteRepository.count() > 0) {
            return;
        }
        configService.aggiorna("EMITTENTE_INDIRIZZO", "Via Esempio 1, 20100 Milano (MI)");
        configService.aggiorna("EMITTENTE_PARTITA_IVA", "00000000000");
        configService.aggiorna("EMITTENTE_CODICE_FISCALE", "DMODTI00A01F205X");
        configService.aggiorna("EMITTENTE_ALBO", "Dati dimostrativi");
        configService.aggiorna("EMITTENTE_IBAN", "IT00X0000000000000000000000");

        LocalDate oggi = LocalDate.now();
        LocalDate settimana = CheckService.settimanaDi(oggi);
        List<Long> attivi = new ArrayList<>();

        for (int i = 0; i < PERSONE.length; i++) {
            String[] persona = PERSONE[i];
            String email = (persona[0] + "." + persona[1]).toLowerCase().replace(" ", "") + "@esempio.it";
            Paziente.Stato stato = i < 10 ? Paziente.Stato.LEAD : i < 12 ? Paziente.Stato.LISTA_ATTESA : Paziente.Stato.LEAD;
            Long id = pazienteService.crea(new PazientiDto.Salva(persona[0], persona[1], email, "39333000" + (1000 + i),
                    codiceFiscale(i), LocalDate.of(1965 + i, 1 + i % 12, 10 + i), "Via delle Prove " + (i + 1), "20100",
                    "Milano", "MI", stato, Paziente.Fonte.values()[i % 5], SITUAZIONI[i % SITUAZIONI.length], null,
                    BigDecimal.valueOf(78 + i), BigDecimal.valueOf(68 + i))).id();
            if (i < 10) {
                attivi.add(id);
                creaPercorso(id, i, oggi);
            }
        }
        Long inAttesa = pazienteRepository.findAll().get(10).getId();
        pagamentoService.registra(pagamentoService.crea(new PagamentiDto.Salva(inAttesa, Pagamento.Tipo.ACCONTO,
                "Acconto lista d'attesa 2027", new BigDecimal("50"), oggi.minusDays(10), null)).id(),
                new PagamentiDto.Registra(oggi.minusDays(10), Pagamento.Metodo.BONIFICO, true, null));

        for (int s = 7; s >= 0; s--) {
            LocalDate lunedi = settimana.minusWeeks(s);
            for (int i = 0; i < attivi.size(); i++) {
                if (s == 0 && i >= 7) continue;
                if ((i + s) % 9 == 8) continue;
                checkService.salva(attivi.get(i), risposte(i, s), CheckSettimanale.Fonte.APP, lunedi);
            }
        }

        taskService.crea(new TaskDto.Salva(taskService.idListaDiSistema("CONTATTI"), "Ricontattare dopo la call conoscitiva", null, oggi.plusDays(2), null,
                pazienteRepository.findAll().get(12).getId()));
        taskService.crea(new TaskDto.Salva(taskService.idListaDiSistema("PIANI"), "Sostituire il pesce a pranzo", null, oggi.minusDays(1), null, attivi.get(2)));
        taskService.crea(new TaskDto.Salva(taskService.idListaDiSistema("GENERALE"), "Rispondere ai commenti YouTube", null, oggi, null, null));

        incassiDelFoglioCassa(attivi, oggi);
        movimentiEScadenze(oggi);
    }

    private void creaPercorso(Long pazienteId, int i, LocalDate oggi) {
        LocalDate inizio = oggi.minusMonths(1 + i % 5).with(DayOfWeek.TUESDAY);
        Percorso.PianoPagamento piano = i % 3 == 0 ? Percorso.PianoPagamento.RATE : Percorso.PianoPagamento.UNICO;
        percorsoService.crea(new PercorsiDto.Crea(pazienteId, Percorso.Tipo.METODO_BUSSOLA, piano, inizio, null));

        int effettuate = i % 5;
        for (int v = 0; v <= effettuate; v++) {
            LocalDate giorno = inizio.plusWeeks(4L * v);
            VisiteDto.Riga visita = visitaService.crea(new VisiteDto.Salva(pazienteId,
                    v == 0 ? Visita.Tipo.PRIMA_VISITA : Visita.Tipo.CONTROLLO,
                    i % 2 == 0 ? Visita.Modalita.ONLINE : Visita.Modalita.PRESENZA,
                    giorno.atTime(9 + i, v % 2 == 0 ? 0 : 30), null, i % 2 == 0, true, null));
            if (giorno.isBefore(oggi)) {
                visitaService.cambiaStato(visita.id(), Visita.Stato.EFFETTUATA);
            }
        }
        visitaService.crea(new VisiteDto.Salva(pazienteId, Visita.Tipo.CONTROLLO, Visita.Modalita.ONLINE,
                oggi.plusDays(i % 7).atTime(15 + i % 4, i % 2 == 0 ? 0 : 30), null, true, true, null));
    }

    private static CheckDto.Risposte risposte(int i, int s) {
        boolean difficile = (i + s) % 4 == 0;
        return new CheckDto.Risposte(difficile ? 13 : 18, "Una pizza con gli amici", difficile ? 2 : 4,
                "Tre passeggiate da 40 minuti", BigDecimal.valueOf(78 + i - (7 - s) * 0.4 + (difficile ? 1 : 0)),
                "Pesata lunedì e venerdì", difficile ? "Mi vedo uguale" : "I pantaloni vanno meglio", !difficile,
                difficile ? 3 : 4);
    }

    /** Porta ogni mese al totale del foglio demo, così la cassa si può confrontare con quella del foglio. */
    private void incassiDelFoglioCassa(List<Long> attivi, LocalDate oggi) {
        for (Pagamento rata : pagamentoRepository.findDaPagare()) {
            if (!rata.getScadenza().isAfter(oggi.minusDays(20))) {
                pagamentoService.annulla(rata.getId());
            }
        }
        for (int m = 0; m < INCASSI_MENSILI.length; m++) {
            LocalDate data = YearMonth.of(2026, m + 1).atDay(10);
            if (data.isAfter(oggi)) break;
            Long paziente = attivi.get(m % attivi.size());
            PagamentiDto.Riga riga = pagamentoService.crea(new PagamentiDto.Salva(paziente, Pagamento.Tipo.ALTRO,
                    "Incassi del mese (dati dimostrativi)", BigDecimal.valueOf(INCASSI_MENSILI[m]), data, null));
            pagamentoService.registra(riga.id(), new PagamentiDto.Registra(data, Pagamento.Metodo.BONIFICO, true, null));
        }
    }

    private void movimentiEScadenze(LocalDate oggi) {
        double ads = 2866.76 / 9;
        for (int m = 1; m <= 9; m++) {
            movimento(LocalDate.of(2026, m, 28), MovimentoCassa.Tipo.ENTRATA, MovimentoCassa.Categoria.YOUTUBE_ADS,
                    "Ricavi YouTube Ads", BigDecimal.valueOf(ads).setScale(2, java.math.RoundingMode.HALF_UP));
        }
        movimento(LocalDate.of(2026, 1, 20), MovimentoCassa.Tipo.USCITA, MovimentoCassa.Categoria.ORDINE, "Quota ordine", new BigDecimal("180"));
        movimento(LocalDate.of(2026, 3, 15), MovimentoCassa.Tipo.USCITA, MovimentoCassa.Categoria.COMMERCIALISTA, "Commercialista", new BigDecimal("400"));

        scadenza("Acconto imposte (F24)", MovimentoCassa.Categoria.IMPOSTE, oggi.plusDays(29), "2800");
        scadenza("Versamento cassa di previdenza", MovimentoCassa.Categoria.CASSA_PREVIDENZA, oggi.plusDays(45), "700");
        scadenza("Quota ordine", MovimentoCassa.Categoria.ORDINE, oggi.plusDays(75), "180");
    }

    private void movimento(LocalDate data, MovimentoCassa.Tipo tipo, MovimentoCassa.Categoria categoria, String descrizione, BigDecimal importo) {
        MovimentoCassa m = new MovimentoCassa();
        m.setData(data);
        m.setTipo(tipo);
        m.setCategoria(categoria);
        m.setDescrizione(descrizione);
        m.setImporto(importo);
        movimentoRepository.save(m);
    }

    private void scadenza(String titolo, MovimentoCassa.Categoria categoria, LocalDate data, String importo) {
        ScadenzaFiscale s = new ScadenzaFiscale();
        s.setTitolo(titolo);
        s.setCategoria(categoria);
        s.setDataScadenza(data);
        s.setImportoStimato(new BigDecimal(importo));
        scadenzaRepository.save(s);
    }

    private static String codiceFiscale(int i) {
        return String.format("DMOPZN%02dA01F205X", 60 + i);
    }
}
