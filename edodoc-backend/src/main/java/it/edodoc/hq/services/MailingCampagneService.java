package it.edodoc.hq.services;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import it.edodoc.hq.dto.MailingDto;
import it.edodoc.hq.models.MailingCampagna;
import it.edodoc.hq.models.MailingContatto;
import it.edodoc.hq.models.MailingMittente;
import it.edodoc.hq.models.MailingTemplate;
import it.edodoc.hq.repositories.MailingCampagnaRepository;
import it.edodoc.hq.repositories.MailingContattoRepository;
import it.edodoc.hq.repositories.MailingMittenteRepository;
import it.edodoc.hq.repositories.MailingTemplateRepository;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Campagne dell'Email Marketing: CRUD, stima del pubblico, controlli pre-invio con punteggio spam, invio di prova,
 * avvio (subito o programmato), test A/B, invio intelligente, pausa/ripresa/annullamento, report e destinatari.
 */
@Service
public class MailingCampagneService {

    private static final Logger logger = LoggerFactory.getLogger(MailingCampagneService.class);

    static final Set<MailingCampagna.Stato> MODIFICABILI = EnumSet.of(MailingCampagna.Stato.BOZZA, MailingCampagna.Stato.PROGRAMMATA);
    static final Set<MailingCampagna.Stato> ELIMINABILI = EnumSet.of(MailingCampagna.Stato.BOZZA, MailingCampagna.Stato.ANNULLATA,
            MailingCampagna.Stato.PROGRAMMATA);
    static final int LIMITE_HTML_BYTE = 100 * 1024;
    static final int OGGETTO_MAX = 90;
    private static final DateTimeFormatter ORA_SERIE = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:00");

    /** Parole e frasi che i filtri antispam guardano con sospetto (italiano e inglese). */
    static final List<String> PAROLE_SPAM = List.of("gratis", "gratuito", "gratuita", "100%", "guadagna", "guadagno facile",
            "offerta imperdibile", "imperdibile", "clicca qui", "clicca subito", "urgente", "agisci ora", "solo oggi",
            "ultima possibilità", "vinci", "hai vinto", "soldi", "denaro", "senza impegno", "garantito", "garantita",
            "rimborso garantito", "prezzo più basso", "sconto del", "risparmia", "miracolo", "miracoloso", "guarigione",
            "free", "act now", "winner", "cash", "guaranteed", "click here", "buy now", "limited time", "risk free",
            "€€", "$$$", "!!!");

    private static final Pattern URL_ACCORCIATO = Pattern.compile("(?i)https?://(bit\\.ly|tinyurl\\.com|goo\\.gl|t\\.co|ow\\.ly|is\\.gd|buff\\.ly|cutt\\.ly)/");

    private final MailingCampagnaRepository campagnaRepository;
    private final MailingMittenteRepository mittenteRepository;
    private final MailingTemplateRepository templateRepository;
    private final MailingContattoRepository contattoRepository;
    private final MailingPubblicoService pubblicoService;
    private final MailingContattiService contattiService;
    private final MailingMittentiService mittentiService;
    private final MailingCodaService codaService;
    private final MailingComposizioneService composizione;
    private final MailingMetricheService metriche;
    private final MailingCanali canali;
    private final MailingConfigService config;
    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate tx;

    public MailingCampagneService(MailingCampagnaRepository campagnaRepository, MailingMittenteRepository mittenteRepository,
                                  MailingTemplateRepository templateRepository, MailingContattoRepository contattoRepository,
                                  MailingPubblicoService pubblicoService, MailingContattiService contattiService,
                                  MailingMittentiService mittentiService, MailingCodaService codaService,
                                  MailingComposizioneService composizione, MailingMetricheService metriche,
                                  MailingCanali canali, MailingConfigService config,
                                  NamedParameterJdbcTemplate jdbc, ObjectMapper objectMapper,
                                  PlatformTransactionManager transactionManager) {
        this.campagnaRepository = campagnaRepository;
        this.mittenteRepository = mittenteRepository;
        this.templateRepository = templateRepository;
        this.contattoRepository = contattoRepository;
        this.pubblicoService = pubblicoService;
        this.contattiService = contattiService;
        this.mittentiService = mittentiService;
        this.codaService = codaService;
        this.composizione = composizione;
        this.metriche = metriche;
        this.canali = canali;
        this.config = config;
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.tx = new TransactionTemplate(transactionManager);
    }

    // ═════════════════════════ Lettura ═════════════════════════

    @Transactional(readOnly = true)
    public List<MailingDto.CampagnaRiga> lista(String stato) {
        List<MailingCampagna> campagne;
        if (StringUtils.hasText(stato)) {
            campagne = campagnaRepository.findByStato(statoValido(stato));
        } else {
            campagne = campagnaRepository.findAll();
        }
        campagne = new ArrayList<>(campagne);
        campagne.sort((a, b) -> ordinamento(b).compareTo(ordinamento(a)));
        return righe(campagne);
    }

    private static LocalDateTime ordinamento(MailingCampagna c) {
        LocalDateTime t = c.getAggiornatoIl() != null ? c.getAggiornatoIl() : c.getCreatoIl();
        if (c.getInvioIniziatoIl() != null && (t == null || c.getInvioIniziatoIl().isAfter(t))) {
            t = c.getInvioIniziatoIl();
        }
        return t != null ? t : LocalDateTime.MIN;
    }

    public List<MailingDto.CampagnaRiga> righe(List<MailingCampagna> campagne) {
        Map<Long, MailingDto.Metriche> m = metriche.perCampagne(campagne.stream().map(MailingCampagna::getId).toList());
        Map<Long, String> mittenti = new HashMap<>();
        mittenteRepository.findAll().forEach(x -> mittenti.put(x.getId(), x.getEmail()));
        List<MailingDto.CampagnaRiga> out = new ArrayList<>();
        for (MailingCampagna c : campagne) {
            MailingDto.Metriche met = m.getOrDefault(c.getId(), metriche.vuote());
            out.add(new MailingDto.CampagnaRiga(c.getId(), c.getNome(), c.getStato().name(), c.getOggetto(),
                    c.getMittenteId() != null ? mittenti.get(c.getMittenteId()) : null, MailingTempo.iso(c.getProgrammataIl()),
                    MailingTempo.iso(c.getInvioIniziatoIl()), MailingTempo.iso(c.getInvioCompletatoIl()),
                    c.getDestinatariTotali(), haTestAb(c), met,
                    MailingTempo.iso(c.getAggiornatoIl() != null ? c.getAggiornatoIl() : c.getCreatoIl())));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public MailingDto.Campagna dettaglio(long id) {
        MailingCampagna c = trova(id);
        return dto(c, metriche.perCampagna(id));
    }

    MailingDto.Campagna dto(MailingCampagna c, MailingDto.Metriche m) {
        return new MailingDto.Campagna(c.getId(), c.getNome(), c.getStato().name(), c.getMittenteId(), c.getCategoriaId(),
                c.getOggetto(), c.getPreheader(), json(c.getDesign()), c.getHtml(), pubblico(c), testAb(c),
                Boolean.TRUE.equals(c.getInvioIntelligente()), c.getUtmCampaign(), MailingTempo.iso(c.getProgrammataIl()),
                MailingTempo.iso(c.getInvioIniziatoIl()), MailingTempo.iso(c.getInvioCompletatoIl()), c.getDestinatariTotali(),
                m, MailingTempo.iso(c.getCreatoIl()), MailingTempo.iso(c.getAggiornatoIl()));
    }

    // ═════════════════════════ Scrittura ═════════════════════════

    @Transactional
    public MailingDto.Campagna crea(MailingDto.CampagnaInput in, Long utenteId) {
        MailingCampagna c = new MailingCampagna();
        c.setStato(MailingCampagna.Stato.BOZZA);
        c.setCreatoDaUtenteId(utenteId);
        c.setCreatoIl(MailingTempo.adesso());
        if (in != null && in.templateId() != null && in.design() == null && in.html() == null) {
            MailingTemplate t = templateRepository.findById(in.templateId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Template non trovato"));
            c.setDesign(t.getDesign());
            c.setHtml(t.getHtml());
        }
        applica(c, in);
        if (c.getMittenteId() == null) {
            mittentiService.predefinito().ifPresent(m -> c.setMittenteId(m.getId()));
        }
        return dto(campagnaRepository.save(c), metriche.vuote());
    }

    @Transactional
    public MailingDto.Campagna aggiorna(long id, MailingDto.CampagnaInput in) {
        MailingCampagna c = trova(id);
        if (!MODIFICABILI.contains(c.getStato())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Si possono modificare solo campagne in bozza o programmate: questa è " + etichettaStato(c.getStato()) + ".");
        }
        if (in != null && in.templateId() != null && in.design() == null && in.html() == null) {
            templateRepository.findById(in.templateId()).ifPresent(t -> {
                c.setDesign(t.getDesign());
                c.setHtml(t.getHtml());
            });
        }
        applica(c, in);
        c.setAggiornatoIl(MailingTempo.adesso());
        return dto(campagnaRepository.save(c), metriche.vuote());
    }

    /**
     * Applica l'input (PUT completo): oggetto, preheader, mittente, categoria, A/B, UTM e invio intelligente si
     * sostituiscono sempre; design, html e pubblico solo se presenti (sono pesanti e il frontend può ometterli).
     */
    private void applica(MailingCampagna c, MailingDto.CampagnaInput in) {
        if (in == null) {
            throw new IllegalArgumentException("Dati della campagna mancanti");
        }
        String nome = in.nome() != null ? in.nome().trim() : "";
        if (nome.isEmpty()) {
            nome = c.getNome() != null ? c.getNome() : "Nuova campagna";
        }
        c.setNome(tronca(nome, 200));
        if (in.mittenteId() != null && !mittenteRepository.existsById(in.mittenteId())) {
            throw new IllegalArgumentException("Mittente non trovato");
        }
        c.setMittenteId(in.mittenteId() != null ? in.mittenteId() : c.getMittenteId());
        c.setCategoriaId(in.categoriaId());
        c.setOggetto(vuotoNull(tronca(in.oggetto(), 300)));
        c.setPreheader(vuotoNull(tronca(in.preheader(), 300)));
        if (in.design() != null && !in.design().isNull()) {
            c.setDesign(in.design().toString());
        }
        if (in.html() != null) {
            c.setHtml(in.html());
        }
        if (in.pubblico() != null) {
            c.setPubblico(scrivi(in.pubblico()));
        }
        if (in.testAb() != null && in.testAb().varianti() != null && !in.testAb().varianti().isEmpty()) {
            c.setTestAb(scrivi(normalizzaTestAb(in.testAb())));
        } else {
            c.setTestAb(null);
        }
        c.setInvioIntelligente(Boolean.TRUE.equals(in.invioIntelligente()));
        c.setUtmCampaign(vuotoNull(tronca(in.utmCampaign(), 120)));
    }

    static MailingDto.TestAb normalizzaTestAb(MailingDto.TestAb t) {
        List<MailingDto.VarianteAb> varianti = new ArrayList<>();
        String chiavi = "ABC";
        int i = 0;
        for (MailingDto.VarianteAb v : t.varianti()) {
            if (v == null || i >= 3) {
                continue;
            }
            varianti.add(new MailingDto.VarianteAb(String.valueOf(chiavi.charAt(i)), vuotoNull(tronca(v.oggetto(), 300)),
                    vuotoNull(tronca(v.preheader(), 300))));
            i++;
        }
        int perc = Math.max(5, Math.min(50, t.percentualeTest() > 0 ? t.percentualeTest() : 20));
        String metrica = "CLICK".equalsIgnoreCase(t.metrica()) ? "CLICK" : "APERTURE";
        int ore = Math.max(1, Math.min(72, t.oreAttesa() > 0 ? t.oreAttesa() : 4));
        return new MailingDto.TestAb(varianti, perc, metrica, ore, null, null);
    }

    @Transactional
    public MailingDto.Campagna duplica(long id, Long utenteId) {
        MailingCampagna o = trova(id);
        MailingCampagna c = MailingCampagna.builder()
                .nome(tronca("Copia di " + o.getNome(), 200))
                .stato(MailingCampagna.Stato.BOZZA)
                .mittenteId(o.getMittenteId())
                .categoriaId(o.getCategoriaId())
                .oggetto(o.getOggetto())
                .preheader(o.getPreheader())
                .design(o.getDesign())
                .html(o.getHtml())
                .pubblico(o.getPubblico())
                .invioIntelligente(Boolean.TRUE.equals(o.getInvioIntelligente()))
                .utmCampaign(o.getUtmCampaign())
                .creatoDaUtenteId(utenteId)
                .creatoIl(MailingTempo.adesso())
                .build();
        MailingDto.TestAb ab = testAb(o);
        if (ab != null) {
            c.setTestAb(scrivi(new MailingDto.TestAb(ab.varianti(), ab.percentualeTest(), ab.metrica(), ab.oreAttesa(), null, null)));
        }
        return dto(campagnaRepository.save(c), metriche.vuote());
    }

    @Transactional
    public void elimina(long id) {
        MailingCampagna c = trova(id);
        if (!ELIMINABILI.contains(c.getStato())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Si possono eliminare solo bozze, campagne programmate o annullate.");
        }
        campagnaRepository.delete(c);
    }

    // ═════════════════════════ Stima del pubblico ═════════════════════════

    @Transactional(readOnly = true)
    public MailingDto.StimaPubblico stima(MailingDto.StimaPubblicoInput in) {
        MailingDto.Pubblico p = in != null && in.pubblico() != null ? in.pubblico()
                : new MailingDto.Pubblico(false, List.of(), List.of(), null, List.of(), List.of());
        MailingPubblicoService.Risoluzione r = pubblicoService.risolvi(p, in != null ? in.categoriaId() : null);
        int n = r.destinatari().size();
        Integer giorni = null;
        String fine = null;
        MailingMittente m = null;
        try {
            m = mittentiService.risolvi(in != null ? in.mittenteId() : null);
        } catch (ResponseStatusException e) {
            // nessun mittente: niente ETA
        }
        if (m != null && n > 0) {
            int[] c = mittentiService.conteggi().getOrDefault(m.getId(), new int[2]);
            LocalDateTime ora = MailingTempo.adesso();
            LocalDateTime f = stimaFine(n + c[1], m.getLimiteGiornaliero(), c[0], m.getLimiteAlMinuto(), ora);
            giorni = (int) ChronoUnit.DAYS.between(ora.toLocalDate(), f.toLocalDate()) + 1;
            fine = MailingTempo.iso(f);
        }
        List<Long> primi = r.destinatari().subList(0, Math.min(5, n));
        List<MailingDto.ContattoRiga> campione = contattiService.righe(contattoRepository.findAllById(primi));
        return new MailingDto.StimaPubblico(n, r.disiscritti(), r.rimbalzati(), r.categoriaEsclusa(), r.senzaEmailValida(),
                giorni != null ? giorni : 0, fine, campione);
    }

    /**
     * Quando finirà di partire una coda di {@code daInviare} email: prima la quota residua delle 24 ore, poi una quota
     * piena al giorno; dentro la giornata al ritmo di {@code limiteAlMinuto}.
     */
    public static LocalDateTime stimaFine(int daInviare, int limiteGiornaliero, int inviatiUltime24h, int limiteAlMinuto,
                                          LocalDateTime ora) {
        int perMinuto = Math.max(1, limiteAlMinuto);
        int perGiorno = Math.max(1, limiteGiornaliero);
        int residuoOggi = Math.max(0, perGiorno - inviatiUltime24h);
        if (daInviare <= residuoOggi) {
            return ora.plusMinutes((daInviare + perMinuto - 1) / perMinuto);
        }
        int resto = daInviare - residuoOggi;
        int giorniPieni = (resto - 1) / perGiorno;
        int ultimoGiorno = resto - giorniPieni * perGiorno;
        return ora.plusDays(giorniPieni + 1L).plusMinutes((ultimoGiorno + perMinuto - 1) / perMinuto);
    }

    // ═════════════════════════ Controlli pre-invio ═════════════════════════

    /** Esito dell'analisi del contenuto (pura, testata): controlli e punteggio spam 0 (pulito) – 10 (molto a rischio). */
    public record AnalisiContenuto(List<MailingDto.Controllo> controlli, int punteggioSpam) {
    }

    @Transactional(readOnly = true)
    public MailingDto.Controlli controlli(long id) {
        MailingCampagna c = trova(id);
        List<MailingDto.Controllo> out = new ArrayList<>();
        MailingMittente m = c.getMittenteId() != null ? mittenteRepository.findById(c.getMittenteId()).orElse(null) : null;
        if (m == null) {
            m = mittentiService.predefinito().orElse(null);
        }
        if (m == null) {
            out.add(new MailingDto.Controllo("mittente", "BLOCCANTE", "Nessun mittente",
                    "Aggiungi un mittente in Impostazioni → Mittenti e verificalo."));
        } else if (!Boolean.TRUE.equals(m.getAttivo())) {
            out.add(new MailingDto.Controllo("mittente", "BLOCCANTE", "Mittente disattivato", m.getEmail() + " è disattivato."));
        } else if (m.getVerificatoIl() == null) {
            out.add(new MailingDto.Controllo("mittente", "BLOCCANTE", "Mittente da verificare",
                    "Prima di spedire a tutti, verifica " + m.getEmail() + " (Impostazioni → Mittenti → Verifica): "
                            + "manda una prova e controlla SPF, DKIM e DMARC."));
        } else if (StringUtils.hasText(m.getUltimoErrore())) {
            out.add(new MailingDto.Controllo("mittente", "BLOCCANTE", "Il mittente ha un errore", m.getUltimoErrore()));
        } else {
            out.add(new MailingDto.Controllo("mittente", "OK", "Mittente pronto", m.getNomeVisualizzato() + " <" + m.getEmail() + ">"));
        }
        try {
            MailingPubblicoService.Risoluzione r = pubblicoService.risolvi(pubblicoONessuno(c), c.getCategoriaId());
            int n = r.destinatari().size();
            if (n == 0) {
                out.add(new MailingDto.Controllo("pubblico", "BLOCCANTE", "Nessun destinatario",
                        "Il pubblico scelto non contiene contatti iscritti."));
            } else {
                String dettaglio = n + " contatti iscritti";
                if (m != null) {
                    int[] q = mittentiService.conteggi().getOrDefault(m.getId(), new int[2]);
                    LocalDateTime ora = MailingTempo.adesso();
                    LocalDateTime f = stimaFine(n + q[1], m.getLimiteGiornaliero(), q[0], m.getLimiteAlMinuto(), ora);
                    long giorni = ChronoUnit.DAYS.between(ora.toLocalDate(), f.toLocalDate());
                    if (giorni > 0) {
                        dettaglio += ": con la quota di " + m.getLimiteGiornaliero() + " al giorno l'invio durerà circa "
                                + (giorni + 1) + " giorni";
                    }
                }
                out.add(new MailingDto.Controllo("pubblico", "OK", "Pubblico", dettaglio));
            }
        } catch (RuntimeException e) {
            out.add(new MailingDto.Controllo("pubblico", "BLOCCANTE", "Pubblico non valido", e.getMessage()));
        }
        AnalisiContenuto a = analizza(c.getOggetto(), c.getPreheader(), c.getHtml(), testAb(c));
        out.addAll(a.controlli());
        if (!config.invioAbilitato()) {
            out.add(new MailingDto.Controllo("interruttore", "AVVISO", "Invii spenti",
                    "L'interruttore generale degli invii è spento: la campagna resterà in coda finché non lo accendi in Impostazioni."));
        }
        boolean pronta = out.stream().noneMatch(x -> "BLOCCANTE".equals(x.esito()));
        return new MailingDto.Controlli(pronta, a.punteggioSpam(), out);
    }

    /** Controlli sul contenuto: oggetto, preheader, link, immagini, peso, parole spam, maiuscole, punti esclamativi. */
    static AnalisiContenuto analizza(String oggetto, String preheader, String html, MailingDto.TestAb ab) {
        List<MailingDto.Controllo> out = new ArrayList<>();
        int spam = 0;
        String ogg = oggetto != null ? oggetto.trim() : "";
        if (ogg.isEmpty()) {
            out.add(new MailingDto.Controllo("oggetto", "BLOCCANTE", "Oggetto mancante", "Scrivi l'oggetto dell'email."));
        } else if (ogg.length() >= OGGETTO_MAX) {
            out.add(new MailingDto.Controllo("oggetto", "AVVISO", "Oggetto lungo",
                    ogg.length() + " caratteri: sopra i " + OGGETTO_MAX + " il telefono lo taglia. Meglio sotto i 50."));
        } else {
            out.add(new MailingDto.Controllo("oggetto", "OK", "Oggetto", ogg.length() + " caratteri"));
        }
        if (tuttoMaiuscolo(ogg)) {
            spam += 2;
            out.add(new MailingDto.Controllo("maiuscole", "AVVISO", "Oggetto tutto maiuscolo",
                    "Le maiuscole sembrano urla e attirano i filtri antispam."));
        }
        long esclamativiOggetto = ogg.chars().filter(ch -> ch == '!').count();
        if (esclamativiOggetto > 1) {
            spam += 1;
            out.add(new MailingDto.Controllo("esclamativi", "AVVISO", "Troppi punti esclamativi",
                    "L'oggetto ne ha " + esclamativiOggetto + ": usane al massimo uno."));
        }
        if (!StringUtils.hasText(preheader)) {
            out.add(new MailingDto.Controllo("preheader", "AVVISO", "Preheader vuoto",
                    "Il preheader è la riga che si legge accanto all'oggetto: senza, il telefono mostra l'inizio dell'email."));
        } else {
            out.add(new MailingDto.Controllo("preheader", "OK", "Preheader", preheader.trim()));
        }
        if (ab != null && ab.varianti() != null && !ab.varianti().isEmpty()) {
            boolean valide = ab.varianti().size() >= 2 && ab.varianti().stream().allMatch(v -> v != null && StringUtils.hasText(v.oggetto()));
            out.add(valide
                    ? new MailingDto.Controllo("testAb", "OK", "Test A/B", ab.varianti().size() + " varianti sul "
                    + ab.percentualeTest() + "% del pubblico, vincitore dopo " + ab.oreAttesa() + " ore")
                    : new MailingDto.Controllo("testAb", "BLOCCANTE", "Test A/B incompleto",
                    "Servono almeno 2 varianti, ognuna con il suo oggetto."));
        }

        if (!StringUtils.hasText(html)) {
            out.add(new MailingDto.Controllo("contenuto", "BLOCCANTE", "Email vuota", "Scrivi il contenuto dell'email."));
            return new AnalisiContenuto(out, Math.min(10, spam));
        }
        Document doc = Jsoup.parse(html);
        List<String> nonValidi = new ArrayList<>();
        int vuoti = 0;
        for (Element a : doc.select("a[href]")) {
            String href = a.attr("href").trim();
            if (href.isEmpty() || href.equals("#")) {
                vuoti++;
            } else if (MailingComposizioneService.hrefHttp(href)) {
                if (!href.contains("{{") && !MailingComposizioneService.urlValido(href)) {
                    nonValidi.add(href);
                }
            } else if (!href.startsWith("{{") && !href.toLowerCase(Locale.ROOT).startsWith("mailto:")
                    && !href.toLowerCase(Locale.ROOT).startsWith("tel:")) {
                nonValidi.add(href);
            }
        }
        if (!nonValidi.isEmpty()) {
            out.add(new MailingDto.Controllo("link", "BLOCCANTE", "Link non validi",
                    "Correggi: " + String.join(", ", nonValidi.subList(0, Math.min(5, nonValidi.size())))));
        } else if (vuoti > 0) {
            out.add(new MailingDto.Controllo("link", "AVVISO", "Link senza destinazione", vuoti + " link non portano da nessuna parte."));
        } else {
            out.add(new MailingDto.Controllo("link", "OK", "Link", doc.select("a[href]").size() + " link controllati"));
        }
        if (URL_ACCORCIATO.matcher(html).find()) {
            spam += 1;
            out.add(new MailingDto.Controllo("accorciati", "AVVISO", "Link accorciati",
                    "bit.ly e simili sono usati dagli spammer: metti il link completo."));
        }
        List<Element> immagini = doc.select("img").stream()
                .filter(img -> !"1".equals(img.attr("width")) || !"1".equals(img.attr("height"))).toList();
        long senzaAlt = immagini.stream().filter(img -> !img.hasAttr("alt") || img.attr("alt").isBlank()).count();
        if (senzaAlt > 0) {
            out.add(new MailingDto.Controllo("alt", "AVVISO", "Immagini senza testo alternativo",
                    senzaAlt + " immagini senza descrizione: chi ha le immagini bloccate vede un riquadro vuoto."));
        } else if (!immagini.isEmpty()) {
            out.add(new MailingDto.Controllo("alt", "OK", "Immagini", immagini.size() + " immagini con descrizione"));
        }
        if (MailingComposizioneService.haLinkDisiscrizione(html)) {
            out.add(new MailingDto.Controllo("disiscrizione", "OK", "Link di disiscrizione", "Presente nel contenuto."));
        } else {
            out.add(new MailingDto.Controllo("disiscrizione", "OK", "Link di disiscrizione",
                    "Non c'è nel contenuto: in fondo aggiungeremo il piè di pagina con indirizzo, disiscrizione e preferenze."));
        }
        int peso = html.getBytes(StandardCharsets.UTF_8).length;
        if (peso > LIMITE_HTML_BYTE) {
            spam += 1;
            out.add(new MailingDto.Controllo("peso", "AVVISO", "Email troppo pesante",
                    (peso / 1024) + " KB: oltre ~100 KB Gmail taglia l'email e nasconde il link di disiscrizione. "
                            + "Accorcia il testo o togli blocchi."));
        } else {
            out.add(new MailingDto.Controllo("peso", "OK", "Peso dell'email", (peso / 1024) + " KB"));
        }
        doc.select("style, script, head, [data-mailing-preheader]").remove();
        String testo = doc.text();
        String tutto = (ogg + " " + testo).toLowerCase(Locale.ITALIAN);
        List<String> trovate = new ArrayList<>();
        for (String p : PAROLE_SPAM) {
            if (contieneParola(tutto, p)) {
                trovate.add(p);
            }
        }
        if (!trovate.isEmpty()) {
            spam += Math.min(4, trovate.size());
            out.add(new MailingDto.Controllo("paroleSpam", "AVVISO", "Parole da filtro antispam",
                    "Evita o riformula: " + String.join(", ", trovate.subList(0, Math.min(6, trovate.size())))
                            + ". Per la pubblicità sanitaria evita anche promesse di guarigione."));
        }
        long esclamativiTesto = testo.chars().filter(ch -> ch == '!').count();
        if (esclamativiTesto > 5) {
            spam += 1;
            out.add(new MailingDto.Controllo("esclamativiTesto", "AVVISO", "Molti punti esclamativi",
                    esclamativiTesto + " nel testo: un tono pacato passa meglio i filtri."));
        }
        int caratteri = testo.replaceAll("\\s+", "").length();
        if (!immagini.isEmpty() && caratteri < 100 * immagini.size()) {
            spam += caratteri < 50 ? 3 : 2;
            out.add(new MailingDto.Controllo("testoImmagini", "AVVISO", "Poco testo rispetto alle immagini",
                    "Le email fatte quasi solo di immagini finiscono spesso in spam: aggiungi testo (almeno ~100 caratteri per immagine)."));
        }
        return new AnalisiContenuto(out, Math.min(10, spam));
    }

    static boolean tuttoMaiuscolo(String s) {
        long lettere = s.chars().filter(Character::isLetter).count();
        return lettere >= 6 && s.chars().filter(Character::isLetter).allMatch(Character::isUpperCase);
    }

    private static boolean contieneParola(String testo, String parola) {
        if (!Character.isLetterOrDigit(parola.charAt(0))) {
            return testo.contains(parola);
        }
        return Pattern.compile("(?<![\\p{L}\\d])" + Pattern.quote(parola) + "(?![\\p{L}\\d])").matcher(testo).find();
    }

    // ═════════════════════════ Invio di prova ═════════════════════════

    public void invioTest(long id, MailingDto.InvioTest in) {
        MailingCampagna c = trova(id);
        List<String> indirizzi = indirizziProva(in == null ? null : in.indirizzi());
        if (!StringUtils.hasText(c.getHtml())) {
            throw new IllegalArgumentException("L'email è vuota");
        }
        MailingMittente m = mittentiService.risolvi(c.getMittenteId());
        MailingComposizioneService.Sorgente s = composizione.sorgenteCampagna(c);
        MailingDto.TestAb ab = testAb(c);
        for (String indirizzo : indirizzi) {
            MailingComposizioneService.Sorgente sv = s;
            if (ab != null && ab.varianti() != null && !ab.varianti().isEmpty() && s.oggetto() == null) {
                MailingDto.VarianteAb v = ab.varianti().get(0);
                sv = new MailingComposizioneService.Sorgente(s.campagnaId(), null, null, s.categoriaId(), v.oggetto(),
                        v.preheader() != null ? v.preheader() : s.preheader(), s.html(), s.utmCampaign());
            }
            inviaProva(m, composizione.componiTest(sv, m, indirizzo, in.contattoAnteprimaId()));
        }
    }

    /**
     * Prova del contenuto così com'è nell'editor (email di automazione, template, campagna), senza salvarlo:
     * stesso messaggio di un invio vero, con oggetto "[TEST]" e segnaposto di esempio o del contatto scelto.
     */
    public void invioProva(MailingDto.InvioProva in) {
        if (in == null) {
            throw new IllegalArgumentException("Dati della prova mancanti");
        }
        List<String> indirizzi = indirizziProva(in.indirizzi());
        if (MailingGrafo.htmlVuoto(in.html())) {
            throw new IllegalArgumentException("L'email è vuota");
        }
        MailingMittente m = mittentiService.risolvi(in.mittenteId());
        MailingComposizioneService.Sorgente s = new MailingComposizioneService.Sorgente(null, null, null,
                in.categoriaId(), StringUtils.hasText(in.oggetto()) ? in.oggetto().trim() : null, in.preheader(),
                in.html(), null);
        for (String indirizzo : indirizzi) {
            inviaProva(m, composizione.componiTest(s, m, indirizzo, in.contattoAnteprimaId()));
        }
    }

    private static List<String> indirizziProva(List<String> grezzi) {
        if (grezzi == null || grezzi.isEmpty()) {
            throw new IllegalArgumentException("Indica almeno un indirizzo per la prova");
        }
        List<String> indirizzi = grezzi.stream()
                .map(x -> MailingMittentiService.emailValida(x, "Indirizzo di prova non valido: " + x)).distinct().toList();
        if (indirizzi.size() > 5) {
            throw new IllegalArgumentException("Al massimo 5 indirizzi per la prova");
        }
        return indirizzi;
    }

    private void inviaProva(MailingMittente m, MailingComposizioneService.Composto composto) {
        try {
            canali.invia(m, composto.messaggio());
        } catch (MailingCanaleException e) {
            HttpStatus status = e instanceof MailingCanaleException.NonConfigurato ? HttpStatus.CONFLICT : HttpStatus.BAD_GATEWAY;
            throw new ResponseStatusException(status, e.getMessage(), e);
        }
    }

    // ═════════════════════════ Avvio ═════════════════════════

    @Transactional
    public MailingDto.Campagna invia(long id, MailingDto.AvvioInvio in, Long utenteId) {
        MailingCampagna c = trova(id);
        if (!MODIFICABILI.contains(c.getStato())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "La campagna è già " + etichettaStato(c.getStato()) + ".");
        }
        MailingDto.Controlli ctrl = controlli(id);
        if (!ctrl.pronta()) {
            String bloccanti = ctrl.controlli().stream().filter(x -> "BLOCCANTE".equals(x.esito()))
                    .map(MailingDto.Controllo::titolo).reduce((a, b) -> a + ", " + b).orElse("");
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Prima di inviare risolvi: " + bloccanti + ".");
        }
        LocalDateTime quando = in != null ? MailingTempo.daIso(in.programmataIl()) : null;
        LocalDateTime ora = MailingTempo.adesso();
        if (c.getCreatoDaUtenteId() == null) {
            c.setCreatoDaUtenteId(utenteId);
        }
        if (quando != null && quando.isAfter(ora.plusMinutes(1))) {
            c.setStato(MailingCampagna.Stato.PROGRAMMATA);
            c.setProgrammataIl(quando);
            c.setAggiornatoIl(ora);
            campagnaRepository.save(c);
            return dettaglio(id);
        }
        avviaOra(c);
        return dettaglio(id);
    }

    /** Accoda subito la campagna: tutto il pubblico, oppure la quota di test divisa fra le varianti A/B. */
    void avviaOra(MailingCampagna c) {
        MailingMittente m = mittentiService.risolvi(c.getMittenteId());
        MailingPubblicoService.Risoluzione r = pubblicoService.risolvi(pubblicoONessuno(c), c.getCategoriaId());
        List<Long> ids = r.destinatari();
        if (ids.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Nessun contatto iscritto nel pubblico della campagna.");
        }
        LocalDateTime ora = MailingTempo.adesso();
        c.setMittenteId(m.getId());
        c.setInvioIniziatoIl(ora);
        c.setDestinatariTotali(ids.size());
        c.setAggiornatoIl(ora);
        MailingDto.TestAb ab = testAb(c);
        if (ab != null && ab.varianti() != null && ab.varianti().size() >= 2 && ab.vincitore() == null) {
            List<List<Long>> gruppi = gruppiTest(ids, ab.percentualeTest(), ab.varianti().size(), c.getId());
            for (int k = 0; k < gruppi.size(); k++) {
                MailingDto.VarianteAb v = ab.varianti().get(k);
                codaService.accodaCampagna(c.getId(), m.getId(), gruppi.get(k), v.chiave(), v.oggetto(), null, ora);
            }
            c.setStato(MailingCampagna.Stato.TEST_AB);
        } else {
            Map<Long, LocalDateTime> orari = Boolean.TRUE.equals(c.getInvioIntelligente()) ? orariIntelligenti(ids, ora) : null;
            codaService.accodaCampagna(c.getId(), m.getId(), ids, null, c.getOggetto(), orari, ora);
            c.setStato(MailingCampagna.Stato.IN_INVIO);
        }
        campagnaRepository.save(c);
        logger.info("[MAILING] Campagna {} avviata: {} destinatari, stato {}", c.getId(), ids.size(), c.getStato());
    }

    /**
     * Gruppi del test A/B: il pubblico mescolato (in modo riproducibile per campagna), la quota di test (almeno un
     * contatto per variante) divisa a turno fra le varianti.
     */
    static List<List<Long>> gruppiTest(List<Long> ids, int percentuale, int varianti, long seme) {
        List<Long> mescolati = new ArrayList<>(ids);
        Collections.shuffle(mescolati, new Random(seme));
        int quota = (int) Math.round(ids.size() * percentuale / 100.0);
        quota = Math.min(ids.size(), Math.max(varianti, quota));
        List<List<Long>> gruppi = new ArrayList<>();
        for (int k = 0; k < varianti; k++) {
            gruppi.add(new ArrayList<>());
        }
        for (int i = 0; i < quota; i++) {
            gruppi.get(i % varianti).add(mescolati.get(i));
        }
        return gruppi;
    }

    /** Invio intelligente: prossima occorrenza (entro 24 h) dell'ora preferita del contatto; senza storico, adesso. */
    Map<Long, LocalDateTime> orariIntelligenti(List<Long> ids, LocalDateTime ora) {
        Map<Long, LocalDateTime> out = new HashMap<>();
        for (int da = 0; da < ids.size(); da += 5000) {
            List<Long> blocco = ids.subList(da, Math.min(da + 5000, ids.size()));
            jdbc.query("SELECT id, ora_apertura_preferita FROM mailing_contatti WHERE id IN (:ids) AND ora_apertura_preferita IS NOT NULL",
                    new MapSqlParameterSource("ids", blocco),
                    rs -> {
                        long id = rs.getLong("id");
                        out.put(id, prossimaOccorrenza(ora, rs.getInt("ora_apertura_preferita"), id));
                    });
        }
        return out;
    }

    /** Prossima volta (da adesso, entro 24 h) che sono le {@code ora}; i minuti sparpagliati per contatto. */
    static LocalDateTime prossimaOccorrenza(LocalDateTime adesso, int ora, long contattoId) {
        int h = Math.max(0, Math.min(23, ora));
        LocalDateTime t = adesso.toLocalDate().atTime(h, (int) (Math.abs(contattoId) % 60));
        if (t.isBefore(adesso)) {
            t = t.plusDays(1);
        }
        return t;
    }

    /** Job: avvia le campagne programmate arrivate all'ora (una transazione per campagna). */
    public int avviaProgrammateScadute() {
        int n = 0;
        for (MailingCampagna x : campagnaRepository.findByStatoAndProgrammataIlLessThanEqual(MailingCampagna.Stato.PROGRAMMATA,
                MailingTempo.adesso())) {
            long id = x.getId();
            try {
                tx.executeWithoutResult(s -> avviaOra(trova(id)));
                n++;
            } catch (RuntimeException e) {
                logger.warn("[MAILING] Campagna programmata {} non avviata: {}", id, e.getMessage());
                tx.executeWithoutResult(s -> {
                    MailingCampagna c = trova(id);
                    c.setStato(MailingCampagna.Stato.BOZZA);
                    c.setAggiornatoIl(MailingTempo.adesso());
                    campagnaRepository.save(c);
                    notificaCreatore(c, false, "La campagna «" + c.getNome() + "» non è partita all'ora programmata: "
                            + messaggioErrore(e) + " È tornata in bozza.");
                });
            }
        }
        return n;
    }

    // ═════════════════════════ A/B ═════════════════════════

    /** Risultato di una variante: consegnati e successi (aperture umane o click unici). */
    public record RisultatoVariante(String chiave, int consegnati, int successi) {
    }

    /**
     * Vincitore: tasso più alto (successi / consegnati); a parità più successi; a parità ancora la prima variante.
     */
    static String sceltaVincitore(List<RisultatoVariante> risultati) {
        RisultatoVariante migliore = null;
        double tassoMigliore = -1;
        for (RisultatoVariante r : risultati) {
            double t = r.consegnati() > 0 ? (double) r.successi() / r.consegnati() : 0;
            if (migliore == null || t > tassoMigliore + 1e-9
                    || (Math.abs(t - tassoMigliore) <= 1e-9 && r.successi() > migliore.successi())) {
                migliore = r;
                tassoMigliore = t;
            }
        }
        return migliore != null ? migliore.chiave() : null;
    }

    /** Job: per le campagne in TEST_AB scadute sceglie il vincitore e accoda il resto del pubblico. */
    public int decidiTestAbScaduti() {
        int n = 0;
        LocalDateTime ora = MailingTempo.adesso();
        for (MailingCampagna c : campagnaRepository.findByStato(MailingCampagna.Stato.TEST_AB)) {
            MailingDto.TestAb ab = testAb(c);
            if (ab == null || c.getInvioIniziatoIl() == null) {
                continue;
            }
            if (c.getInvioIniziatoIl().plusHours(ab.oreAttesa()).isAfter(ora)) {
                continue;
            }
            try {
                long id = c.getId();
                tx.executeWithoutResult(s -> decidi(trova(id), ab, ora));
                n++;
            } catch (RuntimeException e) {
                logger.warn("[MAILING] A/B della campagna {} non deciso: {}", c.getId(), e.getMessage());
            }
        }
        return n;
    }

    private void decidi(MailingCampagna c, MailingDto.TestAb ab, LocalDateTime ora) {
        List<RisultatoVariante> risultati = new ArrayList<>();
        for (MailingDto.VarianteAb v : ab.varianti()) {
            MailingDto.Metriche m = metriche.perVariante(c.getId(), v.chiave());
            int consegnati = Math.max(0, m.inviati() - m.rimbalzi());
            risultati.add(new RisultatoVariante(v.chiave(), consegnati,
                    "CLICK".equals(ab.metrica()) ? m.clickUnici() : m.apertureUniche()));
        }
        String vincitore = sceltaVincitore(risultati);
        MailingDto.VarianteAb v = ab.varianti().stream().filter(x -> x.chiave().equals(vincitore)).findFirst()
                .orElse(ab.varianti().get(0));
        c.setTestAb(scrivi(new MailingDto.TestAb(ab.varianti(), ab.percentualeTest(), ab.metrica(), ab.oreAttesa(),
                v.chiave(), MailingTempo.iso(ora))));
        MailingMittente m = mittentiService.risolvi(c.getMittenteId());
        MailingPubblicoService.Risoluzione r = pubblicoService.risolvi(pubblicoONessuno(c), c.getCategoriaId());
        Map<Long, LocalDateTime> orari = Boolean.TRUE.equals(c.getInvioIntelligente()) ? orariIntelligenti(r.destinatari(), ora) : null;
        int accodati = codaService.accodaCampagna(c.getId(), m.getId(), r.destinatari(), null, v.oggetto(), orari, ora);
        Integer totale = jdbc.queryForObject("SELECT COUNT(*) FROM mailing_invii WHERE campagna_id = :id AND stato NOT IN ('ANNULLATO','SALTATO')",
                Map.of("id", c.getId()), Integer.class);
        c.setDestinatariTotali(totale);
        c.setStato(MailingCampagna.Stato.IN_INVIO);
        c.setAggiornatoIl(ora);
        campagnaRepository.save(c);
        logger.info("[MAILING] Campagna {}: vince la variante {}, altri {} invii accodati", c.getId(), v.chiave(), accodati);
    }

    // ═════════════════════════ Pausa, ripresa, annullamento, completamento ═════════════════════════

    @Transactional
    public MailingDto.Campagna pausa(long id) {
        MailingCampagna c = trova(id);
        if (c.getStato() != MailingCampagna.Stato.IN_INVIO && c.getStato() != MailingCampagna.Stato.TEST_AB) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Si può mettere in pausa solo una campagna in invio.");
        }
        cambia(c, MailingCampagna.Stato.IN_PAUSA);
        return dettaglio(id);
    }

    @Transactional
    public MailingDto.Campagna riprendi(long id) {
        MailingCampagna c = trova(id);
        if (c.getStato() != MailingCampagna.Stato.IN_PAUSA) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "La campagna non è in pausa.");
        }
        MailingDto.TestAb ab = testAb(c);
        boolean testInCorso = ab != null && ab.varianti() != null && ab.varianti().size() >= 2 && ab.vincitore() == null;
        cambia(c, testInCorso ? MailingCampagna.Stato.TEST_AB : MailingCampagna.Stato.IN_INVIO);
        return dettaglio(id);
    }

    @Transactional
    public MailingDto.Campagna annulla(long id) {
        MailingCampagna c = trova(id);
        if (!EnumSet.of(MailingCampagna.Stato.PROGRAMMATA, MailingCampagna.Stato.IN_INVIO, MailingCampagna.Stato.TEST_AB,
                MailingCampagna.Stato.IN_PAUSA).contains(c.getStato())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Questa campagna non si può annullare.");
        }
        int annullati = codaService.annullaInCodaPerCampagna(id);
        cambia(c, MailingCampagna.Stato.ANNULLATA);
        logger.info("[MAILING] Campagna {} annullata: {} invii in coda tolti", id, annullati);
        return dettaglio(id);
    }

    private void cambia(MailingCampagna c, MailingCampagna.Stato stato) {
        c.setStato(stato);
        c.setAggiornatoIl(MailingTempo.adesso());
        campagnaRepository.save(c);
    }

    /** Conteggi dell'avanzamento: [inviati (anche rimbalzati), totale, errori, in coda]. */
    public int[] avanzamento(long campagnaId) {
        int[] out = new int[4];
        jdbc.query("SELECT COUNT(*) FILTER (WHERE stato IN ('INVIATO','RIMBALZATO')) AS inviati, "
                        + "COUNT(*) FILTER (WHERE stato NOT IN ('ANNULLATO','SALTATO')) AS totale, "
                        + "COUNT(*) FILTER (WHERE stato = 'ERRORE') AS errori, "
                        + "COUNT(*) FILTER (WHERE stato IN ('IN_CODA','IN_INVIO')) AS coda "
                        + "FROM mailing_invii WHERE campagna_id = :id",
                Map.of("id", campagnaId), rs -> {
                    out[0] = rs.getInt("inviati");
                    out[1] = rs.getInt("totale");
                    out[2] = rs.getInt("errori");
                    out[3] = rs.getInt("coda");
                });
        return out;
    }

    /** Stima della fine della coda di una campagna (ISO) in base alla quota del suo mittente. */
    public String etaFine(MailingCampagna c, int inCoda) {
        if (inCoda <= 0 || c.getMittenteId() == null) {
            return null;
        }
        MailingMittente m = mittenteRepository.findById(c.getMittenteId()).orElse(null);
        if (m == null) {
            return null;
        }
        int[] q = mittentiService.conteggi().getOrDefault(m.getId(), new int[2]);
        return MailingTempo.iso(stimaFine(q[1], m.getLimiteGiornaliero(), q[0], m.getLimiteAlMinuto(), MailingTempo.adesso()));
    }

    /** Se la campagna in invio non ha più nulla in coda: INVIATA, notifica realtime e al creatore. */
    @Transactional
    public boolean verificaCompletamento(long campagnaId) {
        MailingCampagna c = campagnaRepository.findById(campagnaId).orElse(null);
        if (c == null || c.getStato() != MailingCampagna.Stato.IN_INVIO) {
            return false;
        }
        int[] a = avanzamento(campagnaId);
        if (a[3] > 0) {
            return false;
        }
        c.setStato(MailingCampagna.Stato.INVIATA);
        c.setInvioCompletatoIl(MailingTempo.adesso());
        c.setAggiornatoIl(MailingTempo.adesso());
        campagnaRepository.save(c);
        notificaCreatore(c, true, "La campagna «" + c.getNome() + "» è stata inviata a " + a[0] + " contatti"
                + (a[2] > 0 ? " (" + a[2] + " non partite per errore)" : "") + ".");
        return true;
    }

    /** Job: completa le campagne in invio rimaste senza coda (es. tutti saltati o annullati). */
    public int completaFinite() {
        int n = 0;
        for (MailingCampagna c : campagnaRepository.findByStato(MailingCampagna.Stato.IN_INVIO)) {
            if (verificaCompletamento(c.getId())) {
                n++;
            }
        }
        return n;
    }

    /** Metti in pausa le campagne del mittente (mittente non configurato). Ritorna gli id. */
    @Transactional
    public List<Long> pausaPerMittente(long mittenteId) {
        List<Long> ids = new ArrayList<>();
        for (MailingCampagna.Stato s : List.of(MailingCampagna.Stato.IN_INVIO, MailingCampagna.Stato.TEST_AB)) {
            for (MailingCampagna c : campagnaRepository.findByStato(s)) {
                if (c.getMittenteId() != null && c.getMittenteId() == mittenteId) {
                    cambia(c, MailingCampagna.Stato.IN_PAUSA);
                    ids.add(c.getId());
                }
            }
        }
        return ids;
    }

    /** In EdoDoc non c'è una campanella: l'esito resta nel log e la pagina lo mostra ricaricando lo stato. */
    private void notificaCreatore(MailingCampagna c, boolean successo, String messaggio) {
        if (successo) {
            logger.info("[MAILING] Campagna {}: {}", c.getId(), messaggio);
        } else {
            logger.warn("[MAILING] Campagna {}: {}", c.getId(), messaggio);
        }
    }

    // ═════════════════════════ Report ═════════════════════════

    @Transactional(readOnly = true)
    public MailingDto.ReportCampagna report(long id) {
        MailingCampagna c = trova(id);
        MailingDto.Metriche m = metriche.perCampagna(id);
        MailingDto.Campagna dto = dto(c, m);
        MapSqlParameterSource p = new MapSqlParameterSource("id", id);

        LocalDateTime inizio = c.getInvioIniziatoIl() != null ? c.getInvioIniziatoIl() : c.getCreatoIl();
        LocalDateTime da = inizio.truncatedTo(ChronoUnit.HOURS);
        LocalDateTime a = da.plusHours(48);
        Map<String, Map<String, Number>> ore = new LinkedHashMap<>();
        LocalDateTime limite = MailingTempo.adesso().isBefore(a) ? MailingTempo.adesso() : a;
        for (LocalDateTime t = da; !t.isAfter(limite); t = t.plusHours(1)) {
            Map<String, Number> v = new LinkedHashMap<>();
            v.put("inviati", 0);
            v.put("aperture", 0);
            v.put("click", 0);
            ore.put(ORA_SERIE.format(t), v);
        }
        p.addValue("da", da).addValue("a", a);
        jdbc.query("SELECT date_trunc('hour', inviato_il) AS ora, COUNT(*) AS n FROM mailing_invii "
                + "WHERE campagna_id = :id AND inviato_il >= :da AND inviato_il < :a GROUP BY 1", p, rs -> {
            Map<String, Number> v = ore.get(ORA_SERIE.format(rs.getTimestamp("ora").toLocalDateTime()));
            if (v != null) {
                v.put("inviati", rs.getInt("n"));
            }
        });
        jdbc.query("SELECT date_trunc('hour', avvenuto_il) AS ora, "
                + "COUNT(DISTINCT invio_id) FILTER (WHERE tipo = 'APERTURA') AS aperture, "
                + "COUNT(DISTINCT invio_id) FILTER (WHERE tipo = 'CLICK') AS click "
                + "FROM mailing_eventi WHERE campagna_id = :id AND tipo IN ('APERTURA','CLICK') AND NOT automatico "
                + "AND avvenuto_il >= :da AND avvenuto_il < :a GROUP BY 1", p, rs -> {
            Map<String, Number> v = ore.get(ORA_SERIE.format(rs.getTimestamp("ora").toLocalDateTime()));
            if (v != null) {
                v.put("aperture", rs.getInt("aperture"));
                v.put("click", rs.getInt("click"));
            }
        });
        List<MailingDto.PuntoSerie> andamento = ore.entrySet().stream()
                .map(e -> new MailingDto.PuntoSerie(e.getKey(), e.getValue())).toList();

        List<MailingDto.LinkReport> link = jdbc.query("SELECT l.indice, l.url, l.etichetta, "
                        + "COUNT(DISTINCT e.invio_id) FILTER (WHERE NOT e.automatico) AS unici, "
                        + "COUNT(e.id) FILTER (WHERE NOT e.automatico) AS totali "
                        + "FROM mailing_link l LEFT JOIN mailing_eventi e ON e.campagna_id = l.campagna_id AND e.tipo = 'CLICK' "
                        + "AND e.link_indice = l.indice WHERE l.campagna_id = :id GROUP BY l.indice, l.url, l.etichetta ORDER BY l.indice",
                p, (rs, i) -> new MailingDto.LinkReport(rs.getInt("indice"), rs.getString("url"), rs.getString("etichetta"),
                        rs.getInt("unici"), rs.getInt("totali")));

        List<MailingDto.VoceConteggio> dispositivi = jdbc.query("SELECT COALESCE(dispositivo, 'SCONOSCIUTO') AS k, "
                        + "COUNT(DISTINCT invio_id) AS n FROM mailing_eventi WHERE campagna_id = :id AND tipo IN ('APERTURA','CLICK') "
                        + "AND NOT automatico GROUP BY 1 ORDER BY 2 DESC", p,
                (rs, i) -> new MailingDto.VoceConteggio(rs.getString("k"), etichettaDispositivo(rs.getString("k")), rs.getInt("n")));
        List<MailingDto.VoceConteggio> client = jdbc.query("SELECT COALESCE(client, 'Sconosciuto') AS k, "
                        + "COUNT(DISTINCT invio_id) AS n FROM mailing_eventi WHERE campagna_id = :id AND tipo = 'APERTURA' "
                        + "AND NOT automatico GROUP BY 1 ORDER BY 2 DESC LIMIT 10", p,
                (rs, i) -> new MailingDto.VoceConteggio(rs.getString("k"), rs.getString("k"), rs.getInt("n")));

        List<MailingDto.ReportVariante> varianti = new ArrayList<>();
        MailingDto.TestAb ab = testAb(c);
        if (ab != null && ab.varianti() != null) {
            for (MailingDto.VarianteAb v : ab.varianti()) {
                varianti.add(new MailingDto.ReportVariante(v.chiave(), v.oggetto(), metriche.perVariante(id, v.chiave()),
                        v.chiave().equals(ab.vincitore())));
            }
        }

        List<MailingDto.Attivita> conversioni = jdbc.query("SELECT e.id, e.tipo, e.avvenuto_il, e.contatto_id, e.url, "
                        + "e.dispositivo, e.valore, e.automazione_id, c.nome, c.cognome, c.email FROM mailing_eventi e "
                        + "LEFT JOIN mailing_contatti c ON c.id = e.contatto_id WHERE e.campagna_id = :id "
                        + "AND e.tipo IN ('CONVERSIONE_VISITA','CONVERSIONE_ACQUISTO') ORDER BY e.avvenuto_il DESC LIMIT 100",
                p, (rs, i) -> {
                    String nome = MailingTracciamentoService.nomeBreve(rs.getString("nome"), rs.getString("cognome"), rs.getString("email"));
                    String tipo = rs.getString("tipo");
                    return new MailingDto.Attivita(rs.getLong("id"), tipo, MailingTempo.iso(rs.getTimestamp("avvenuto_il").toLocalDateTime()),
                            rs.getObject("contatto_id") != null ? rs.getLong("contatto_id") : null, nome, rs.getString("email"), id,
                            null, MailingTracciamentoService.messaggio(tipo, nome, c.getNome(), null), rs.getString("url"),
                            rs.getString("dispositivo"), rs.getBigDecimal("valore"));
                });
        return new MailingDto.ReportCampagna(dto, m, andamento, link, dispositivi, client, varianti, conversioni);
    }

    static String etichettaDispositivo(String k) {
        return switch (k != null ? k : "") {
            case "MOBILE" -> "Smartphone";
            case "TABLET" -> "Tablet";
            case "DESKTOP" -> "Computer";
            default -> "Non rilevato";
        };
    }

    @Transactional(readOnly = true)
    public MailingDto.Pagina<MailingDto.DestinatarioRiga> destinatari(long id, String filtro, int pagina, int dimensione) {
        trova(id);
        String condizione = switch (filtro != null ? filtro.trim().toUpperCase(Locale.ROOT) : "TUTTI") {
            case "APERTO" -> " AND i.prima_apertura_il IS NOT NULL";
            case "CLICK" -> " AND i.primo_click_il IS NOT NULL";
            case "NON_APERTO" -> " AND i.stato = 'INVIATO' AND i.prima_apertura_il IS NULL";
            case "RIMBALZATO" -> " AND i.stato = 'RIMBALZATO'";
            case "DISISCRITTO" -> " AND i.disiscritto_il IS NOT NULL";
            default -> "";
        };
        int dim = Math.max(1, Math.min(200, dimensione > 0 ? dimensione : 50));
        int pag = Math.max(0, pagina);
        MapSqlParameterSource p = new MapSqlParameterSource("id", id).addValue("lim", dim).addValue("off", (long) pag * dim);
        Long totale = jdbc.queryForObject("SELECT COUNT(*) FROM mailing_invii i WHERE i.campagna_id = :id" + condizione, p, Long.class);
        List<MailingDto.DestinatarioRiga> righe = jdbc.query("SELECT i.id, i.contatto_id, i.email, c.nome, c.cognome, i.stato, "
                        + "i.variante, i.inviato_il, i.prima_apertura_il, i.aperture, i.primo_click_il, i.click, i.risposto_il, "
                        + "i.disiscritto_il, i.errore FROM mailing_invii i JOIN mailing_contatti c ON c.id = i.contatto_id "
                        + "WHERE i.campagna_id = :id" + condizione
                        + " ORDER BY i.inviato_il DESC NULLS LAST, i.id LIMIT :lim OFFSET :off", p,
                (rs, n) -> new MailingDto.DestinatarioRiga(rs.getLong("id"), rs.getLong("contatto_id"), rs.getString("email"),
                        MailingComposizioneService.nomeCompleto(new MailingComposizioneService.DatiContatto(null,
                                rs.getString("nome"), rs.getString("cognome"), null, null, null)),
                        rs.getString("stato"), rs.getString("variante"), iso(rs.getTimestamp("inviato_il")),
                        iso(rs.getTimestamp("prima_apertura_il")), rs.getInt("aperture"), iso(rs.getTimestamp("primo_click_il")),
                        rs.getInt("click"), iso(rs.getTimestamp("risposto_il")), iso(rs.getTimestamp("disiscritto_il")),
                        rs.getString("errore")));
        return new MailingDto.Pagina<>(righe, totale != null ? totale : 0, pag, dim);
    }

    private static String iso(java.sql.Timestamp t) {
        return t != null ? MailingTempo.iso(t.toLocalDateTime()) : null;
    }

    // ═════════════════════════ Supporto ═════════════════════════

    MailingCampagna trova(long id) {
        return campagnaRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Campagna non trovata"));
    }

    private MailingCampagna.Stato statoValido(String s) {
        try {
            return MailingCampagna.Stato.valueOf(s.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Stato campagna non valido: " + s);
        }
    }

    static String etichettaStato(MailingCampagna.Stato s) {
        return switch (s) {
            case BOZZA -> "in bozza";
            case PROGRAMMATA -> "programmata";
            case IN_INVIO -> "in invio";
            case TEST_AB -> "in test A/B";
            case IN_PAUSA -> "in pausa";
            case INVIATA -> "inviata";
            case ANNULLATA -> "annullata";
        };
    }

    boolean haTestAb(MailingCampagna c) {
        MailingDto.TestAb ab = testAb(c);
        return ab != null && ab.varianti() != null && ab.varianti().size() >= 2;
    }

    MailingDto.TestAb testAb(MailingCampagna c) {
        if (!StringUtils.hasText(c.getTestAb())) {
            return null;
        }
        try {
            return objectMapper.readValue(c.getTestAb(), MailingDto.TestAb.class);
        } catch (Exception e) {
            return null;
        }
    }

    MailingDto.Pubblico pubblico(MailingCampagna c) {
        if (!StringUtils.hasText(c.getPubblico())) {
            return null;
        }
        try {
            return objectMapper.readValue(c.getPubblico(), MailingDto.Pubblico.class);
        } catch (Exception e) {
            return null;
        }
    }

    private MailingDto.Pubblico pubblicoONessuno(MailingCampagna c) {
        MailingDto.Pubblico p = pubblico(c);
        return p != null ? p : new MailingDto.Pubblico(false, List.of(), List.of(), null, List.of(), List.of());
    }

    private JsonNode json(String s) {
        if (!StringUtils.hasText(s)) {
            return null;
        }
        try {
            return objectMapper.readTree(s);
        } catch (Exception e) {
            return null;
        }
    }

    private String scrivi(Object o) {
        try {
            return objectMapper.writeValueAsString(o);
        } catch (Exception e) {
            throw new IllegalArgumentException("Dati non serializzabili: " + e.getMessage());
        }
    }

    static String tronca(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }

    static String vuotoNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static String messaggioErrore(RuntimeException e) {
        if (e instanceof ResponseStatusException r && r.getReason() != null) {
            return r.getReason();
        }
        return e.getMessage() != null ? e.getMessage() : "errore imprevisto.";
    }
}
