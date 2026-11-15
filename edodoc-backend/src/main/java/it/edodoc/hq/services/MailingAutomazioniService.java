package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import it.edodoc.hq.dto.MailingDto;
import it.edodoc.hq.models.MailingAutomazione;
import it.edodoc.hq.models.MailingAutomazioneEmail;
import it.edodoc.hq.models.MailingAutomazioneIscrizione;
import it.edodoc.hq.repositories.MailingAutomazioneEmailRepository;
import it.edodoc.hq.repositories.MailingAutomazioneIscrizioneRepository;
import it.edodoc.hq.repositories.MailingAutomazioneRepository;
import it.edodoc.hq.repositories.MailingSegmentoRepository;
import it.edodoc.hq.repositories.MailingTagRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Automazioni email: CRUD, email delle automazioni, modelli pronti, validazione, attivazione/pausa, report e
 * iscrizione manuale. Il motore che fa avanzare i contatti è {@link MailingAutomazioniMotore}.
 * <p>
 * Le BOZZE si salvano anche incomplete (la tela salva mentre si costruisce); la validazione completa del grafo e del
 * trigger blocca l'attivazione e il salvataggio di un'automazione ATTIVA, con errori 400 in italiano.
 */
@Service
public class MailingAutomazioniService {

    private final MailingAutomazioneRepository automazioni;
    private final MailingAutomazioneEmailRepository emailRepository;
    private final MailingAutomazioneIscrizioneRepository iscrizioni;
    private final MailingTagRepository tagRepository;
    private final MailingSegmentoRepository segmentoRepository;
    private final MailingAutomazioniSql sql;
    private final MailingAutomazioniMotore motore;
    private final MailingMetricheService metriche;
    private final MailingMittentiService mittenti;
    private final MailingContattiService contattiService;
    private final ObjectMapper objectMapper;

    public MailingAutomazioniService(MailingAutomazioneRepository automazioni,
                                     MailingAutomazioneEmailRepository emailRepository,
                                     MailingAutomazioneIscrizioneRepository iscrizioni,
                                     MailingTagRepository tagRepository,
                                     MailingSegmentoRepository segmentoRepository,
                                     MailingAutomazioniSql sql,
                                     MailingAutomazioniMotore motore,
                                     MailingMetricheService metriche,
                                     MailingMittentiService mittenti,
                                     MailingContattiService contattiService,
                                     ObjectMapper objectMapper) {
        this.automazioni = automazioni;
        this.emailRepository = emailRepository;
        this.iscrizioni = iscrizioni;
        this.tagRepository = tagRepository;
        this.segmentoRepository = segmentoRepository;
        this.sql = sql;
        this.motore = motore;
        this.metriche = metriche;
        this.mittenti = mittenti;
        this.contattiService = contattiService;
        this.objectMapper = objectMapper;
    }

    // ───────────────────────── Elenco e dettaglio ─────────────────────────

    @Transactional(readOnly = true)
    public List<MailingDto.AutomazioneRiga> elenco() {
        List<MailingAutomazione> tutte = new ArrayList<>(automazioni.findAll());
        tutte.sort(Comparator.comparing((MailingAutomazione a) -> ordineStato(a.getStato()))
                .thenComparing(a -> a.getAggiornatoIl() != null ? a.getAggiornatoIl() : a.getCreatoIl(),
                        Comparator.nullsLast(Comparator.reverseOrder())));
        Map<Long, Map<String, Integer>> contatori = sql.contatoriPerAutomazione();
        Map<Long, MailingDto.Metriche> m = metriche.perAutomazioni(tutte.stream().map(MailingAutomazione::getId).toList());
        MailingTrigger.Nomi nomi = nomi();
        return tutte.stream().map(a -> riga(a, contatori.getOrDefault(a.getId(), Map.of()),
                m.getOrDefault(a.getId(), metriche.vuote()), nomi)).toList();
    }

    /** Righe delle automazioni ATTIVE (per la panoramica). */
    @Transactional(readOnly = true)
    public List<MailingDto.AutomazioneRiga> attive() {
        return elenco().stream().filter(r -> "ATTIVA".equals(r.stato())).toList();
    }

    private static int ordineStato(MailingAutomazione.Stato s) {
        return switch (s) {
            case ATTIVA -> 0;
            case IN_PAUSA -> 1;
            case BOZZA -> 2;
            case ARCHIVIATA -> 3;
        };
    }

    private MailingDto.AutomazioneRiga riga(MailingAutomazione a, Map<String, Integer> c, MailingDto.Metriche m,
                                            MailingTrigger.Nomi nomi) {
        int attivi = c.getOrDefault("ATTIVA", 0) + c.getOrDefault("IN_ATTESA", 0);
        int totali = c.values().stream().mapToInt(Integer::intValue).sum();
        JsonNode trigger = json(a.getTriggerConfig());
        return new MailingDto.AutomazioneRiga(a.getId(), a.getNome(), a.getDescrizione(), a.getStato().name(),
                MailingTrigger.tipo(trigger), MailingTrigger.descrizione(trigger, nomi), attivi,
                c.getOrDefault("COMPLETATA", 0), totali, m, MailingTempo.iso(a.getAttivataIl()),
                MailingTempo.iso(a.getAggiornatoIl() != null ? a.getAggiornatoIl() : a.getCreatoIl()));
    }

    @Transactional(readOnly = true)
    public MailingDto.Automazione dettaglio(long id) {
        return dto(trova(id));
    }

    private MailingDto.Automazione dto(MailingAutomazione a) {
        List<MailingAutomazioneEmail> email = emailRepository.findByAutomazioneId(a.getId());
        email.sort(Comparator.comparing(MailingAutomazioneEmail::getId));
        Map<Long, MailingDto.Metriche> m = metriche.perAutomazioniEmail(email.stream().map(MailingAutomazioneEmail::getId).toList());
        List<MailingDto.AutomazioneEmail> emailDto = email.stream()
                .map(e -> emailDto(e, m.getOrDefault(e.getId(), metriche.vuote()))).toList();
        JsonNode grafo = json(a.getGrafo());
        return new MailingDto.Automazione(a.getId(), a.getNome(), a.getDescrizione(), a.getStato().name(),
                a.getMittenteId(), a.getCategoriaId(), json(a.getTriggerConfig()),
                grafo == null ? MailingGrafo.vuoto() : grafo, json(a.getUscita()),
                Boolean.TRUE.equals(a.getRientroConsentito()), Boolean.TRUE.equals(a.getSoloOrariLavorativi()),
                emailDto, MailingTempo.iso(a.getAttivataIl()),
                MailingTempo.iso(a.getAggiornatoIl() != null ? a.getAggiornatoIl() : a.getCreatoIl()));
    }

    private MailingDto.AutomazioneEmail emailDto(MailingAutomazioneEmail e, MailingDto.Metriche m) {
        return new MailingDto.AutomazioneEmail(e.getId(), e.getNome(), e.getOggetto(), e.getPreheader(),
                json(e.getDesign()), e.getHtml(), m);
    }

    // ───────────────────────── Modelli ─────────────────────────

    @Transactional(readOnly = true)
    public List<MailingDto.ModelloAutomazione> modelli() {
        return MailingModelliAutomazioni.tutti(riferimenti());
    }

    MailingModelliAutomazioni.Riferimenti riferimenti() {
        return new MailingModelliAutomazioni.Riferimenti(MailingModelliAutomazioni.SITO_PREDEFINITO,
                MailingModelliAutomazioni.PRENOTA_PREDEFINITO);
    }

    // ───────────────────────── Creazione e modifica ─────────────────────────

    @Transactional
    public MailingDto.Automazione crea(MailingDto.AutomazioneInput in, Long utenteId) {
        if (in == null) {
            throw badRequest("Dati dell'automazione mancanti.");
        }
        LocalDateTime adesso = MailingTempo.adesso();
        if (StringUtils.hasText(in.modello())) {
            return daModello(in, utenteId, adesso);
        }
        String nome = nomeValido(in.nome());
        JsonNode trigger = in.trigger() == null || in.trigger().isNull() ? triggerManuale() : in.trigger();
        verificaTipoTrigger(trigger);
        MailingAutomazione a = MailingAutomazione.builder()
                .nome(nome)
                .descrizione(tronca(in.descrizione(), 500))
                .stato(MailingAutomazione.Stato.BOZZA)
                .mittenteId(in.mittenteId())
                .categoriaId(in.categoriaId())
                .triggerConfig(trigger.toString())
                .grafo(grafoValido(in.grafo()).toString())
                .uscita(uscitaValida(in.uscita()))
                .rientroConsentito(Boolean.TRUE.equals(in.rientroConsentito()))
                .soloOrariLavorativi(in.soloOrariLavorativi() == null || in.soloOrariLavorativi())
                .creatoDaUtenteId(utenteId)
                .creatoIl(adesso)
                .aggiornatoIl(adesso)
                .build();
        return dto(automazioni.save(a));
    }

    private MailingDto.Automazione daModello(MailingDto.AutomazioneInput in, Long utenteId, LocalDateTime adesso) {
        MailingDto.ModelloAutomazione m = MailingModelliAutomazioni.trova(in.modello(), riferimenti());
        if (m == null) {
            throw badRequest("Modello di automazione sconosciuto: " + in.modello());
        }
        MailingAutomazione a = automazioni.save(MailingAutomazione.builder()
                .nome(StringUtils.hasText(in.nome()) ? nomeValido(in.nome()) : m.nome())
                .descrizione(tronca(StringUtils.hasText(in.descrizione()) ? in.descrizione() : m.descrizione(), 500))
                .stato(MailingAutomazione.Stato.BOZZA)
                .mittenteId(in.mittenteId())
                .categoriaId(in.categoriaId())
                .triggerConfig(m.trigger().toString())
                .grafo(MailingGrafo.vuoto().toString())
                .uscita(m.uscita() == null ? null : m.uscita().toString())
                .rientroConsentito(in.rientroConsentito() != null ? in.rientroConsentito()
                        : MailingModelliAutomazioni.rientroConsentito(m.chiave()))
                .soloOrariLavorativi(in.soloOrariLavorativi() == null || in.soloOrariLavorativi())
                .creatoDaUtenteId(utenteId)
                .creatoIl(adesso)
                .aggiornatoIl(adesso)
                .build());
        List<Long> idEmail = new ArrayList<>();
        for (MailingDto.AutomazioneEmailInput e : m.email()) {
            idEmail.add(emailRepository.save(nuovaEmail(a.getId(), e, adesso)).getId());
        }
        a.setGrafo(collegaEmailModello(m.grafo(), idEmail).toString());
        return dto(automazioni.save(a));
    }

    /** Sostituisce {@code emailIndice} dei nodi EMAIL del modello con gli id delle email appena create. */
    static JsonNode collegaEmailModello(JsonNode grafoModello, List<Long> idEmail) {
        JsonNode g = grafoModello.deepCopy();
        for (JsonNode n : MailingGrafo.iterabile(g.path("nodi"))) {
            if ("EMAIL".equals(MailingGrafo.testo(n.path("tipo"))) && n.path("config").isObject()) {
                ObjectNode c = (ObjectNode) n.path("config");
                int indice = (int) MailingGrafo.numero(c.path("emailIndice"), -1L);
                if (indice >= 0 && indice < idEmail.size()) {
                    c.put("emailId", idEmail.get(indice));
                }
                c.remove("emailIndice");
            }
        }
        return g;
    }

    @Transactional
    public MailingDto.Automazione aggiorna(long id, MailingDto.AutomazioneInput in) {
        if (in == null) {
            throw badRequest("Dati dell'automazione mancanti.");
        }
        MailingAutomazione a = trova(id);
        if (a.getStato() == MailingAutomazione.Stato.ARCHIVIATA) {
            throw badRequest("L'automazione è archiviata e non si può modificare.");
        }
        Set<String> nodiPrima = MailingGrafo.leggi(json(a.getGrafo())).ids();
        if (in.nome() != null) {
            a.setNome(nomeValido(in.nome()));
        }
        if (in.descrizione() != null) {
            a.setDescrizione(tronca(in.descrizione(), 500));
        }
        a.setMittenteId(in.mittenteId());
        a.setCategoriaId(in.categoriaId());
        if (in.trigger() != null && !in.trigger().isNull()) {
            verificaTipoTrigger(in.trigger());
            a.setTriggerConfig(in.trigger().toString());
        }
        if (in.grafo() != null && !in.grafo().isNull()) {
            a.setGrafo(grafoValido(in.grafo()).toString());
        }
        a.setUscita(uscitaValida(in.uscita()));
        if (in.rientroConsentito() != null) {
            a.setRientroConsentito(in.rientroConsentito());
        }
        if (in.soloOrariLavorativi() != null) {
            a.setSoloOrariLavorativi(in.soloOrariLavorativi());
        }
        if (a.getStato() == MailingAutomazione.Stato.ATTIVA) {
            verificaAttivabile(a);
        }
        a.setAggiornatoIl(MailingTempo.adesso());
        automazioni.save(a);

        // Chi è fermo su un passo che non c'è più esce dal percorso.
        Set<String> nodiDopo = MailingGrafo.leggi(json(a.getGrafo())).ids();
        Set<String> rimossi = new HashSet<>(nodiPrima);
        rimossi.removeAll(nodiDopo);
        if (!rimossi.isEmpty()) {
            for (MailingAutomazioneIscrizione i : iscrizioni.findByAutomazioneIdAndStatoIn(id, MailingAutomazioniMotore.STATI_IN_CORSO)) {
                if (i.getNodoCorrente() != null && rimossi.contains(i.getNodoCorrente())) {
                    escidaNodoRimosso(i);
                }
            }
        }
        return dto(a);
    }

    private void escidaNodoRimosso(MailingAutomazioneIscrizione i) {
        ObjectNode ctx = json(i.getContesto()) instanceof ObjectNode o ? o : JsonNodeFactory.instance.objectNode();
        ctx.put("motivoUscita", "Il passo su cui si trovava è stato rimosso dall'automazione");
        i.setContesto(ctx.toString());
        i.setStato(MailingAutomazioneIscrizione.Stato.USCITA);
        i.setProssimaAzioneIl(null);
        i.setConclusaIl(MailingTempo.adesso());
        iscrizioni.save(i);
        sql.annullaInviiInCoda(i.getId());
    }

    @Transactional
    public void elimina(long id) {
        MailingAutomazione a = trova(id);
        if (a.getStato() == MailingAutomazione.Stato.ATTIVA) {
            throw badRequest("Metti in pausa l'automazione prima di eliminarla.");
        }
        sql.annullaInviiInCodaAutomazione(id, null);
        automazioni.delete(a);
    }

    // ───────────────────────── Email dell'automazione ─────────────────────────

    @Transactional
    public MailingDto.AutomazioneEmail creaEmail(long automazioneId, MailingDto.AutomazioneEmailInput in) {
        MailingAutomazione a = trova(automazioneId);
        MailingAutomazioneEmail e = emailRepository.save(nuovaEmail(a.getId(), validaEmail(in, false), MailingTempo.adesso()));
        tocca(a);
        return emailDto(e, metriche.vuote());
    }

    @Transactional
    public MailingDto.AutomazioneEmail aggiornaEmail(long automazioneId, long emailId, MailingDto.AutomazioneEmailInput in) {
        MailingAutomazione a = trova(automazioneId);
        MailingAutomazioneEmail e = trovaEmail(automazioneId, emailId);
        boolean attiva = a.getStato() == MailingAutomazione.Stato.ATTIVA && usataNelGrafo(a, emailId);
        validaEmail(in, attiva);
        e.setNome(tronca(in.nome(), 200));
        e.setOggetto(oggetto(in.oggetto()));
        e.setPreheader(tronca(in.preheader(), 300));
        e.setDesign(in.design() == null || in.design().isNull() ? null : in.design().toString());
        e.setHtml(in.html() == null ? "" : in.html());
        e.setAggiornatoIl(MailingTempo.adesso());
        emailRepository.save(e);
        tocca(a);
        return emailDto(e, metriche.perAutomazioneEmail(e.getId()));
    }

    @Transactional
    public void eliminaEmail(long automazioneId, long emailId) {
        MailingAutomazione a = trova(automazioneId);
        MailingAutomazioneEmail e = trovaEmail(automazioneId, emailId);
        if (a.getStato() == MailingAutomazione.Stato.ATTIVA && usataNelGrafo(a, emailId)) {
            throw badRequest("Questa email è un passo dell'automazione attiva: togli prima il passo dal percorso.");
        }
        sql.annullaInviiInCodaAutomazione(automazioneId, emailId);
        emailRepository.delete(e);
        tocca(a);
    }

    private boolean usataNelGrafo(MailingAutomazione a, long emailId) {
        return MailingGrafo.leggi(json(a.getGrafo())).nodi().stream()
                .anyMatch(n -> "EMAIL".equals(n.tipo()) && MailingGrafo.emailDelPasso(n.cfg()).contains(emailId));
    }

    /**
     * La tela crea l'email vuota quando si aggiunge il passo e la salva mentre la si scrive: oggetto e contenuto
     * diventano obbligatori solo per un'email usata da un'automazione attiva (e all'attivazione).
     */
    private MailingDto.AutomazioneEmailInput validaEmail(MailingDto.AutomazioneEmailInput in, boolean inUso) {
        if (in == null) {
            throw badRequest("Dati dell'email mancanti.");
        }
        if (in.oggetto() != null && in.oggetto().trim().length() > 300) {
            throw badRequest("L'oggetto è troppo lungo (massimo 300 caratteri).");
        }
        if (inUso && !StringUtils.hasText(in.oggetto())) {
            throw badRequest("Scrivi l'oggetto: l'email fa parte di un'automazione attiva.");
        }
        if (inUso && MailingGrafo.htmlVuoto(in.html())) {
            throw badRequest("L'email è vuota: l'automazione è attiva e non può inviare un'email senza contenuto.");
        }
        return in;
    }

    private static String oggetto(String oggetto) {
        return oggetto == null ? "" : tronca300(oggetto.trim());
    }

    private static String tronca300(String s) {
        return s.length() > 300 ? s.substring(0, 300) : s;
    }

    private MailingAutomazioneEmail nuovaEmail(long automazioneId, MailingDto.AutomazioneEmailInput in, LocalDateTime adesso) {
        return MailingAutomazioneEmail.builder()
                .automazioneId(automazioneId)
                .nome(tronca(in.nome(), 200))
                .oggetto(oggetto(in.oggetto()))
                .preheader(tronca(in.preheader(), 300))
                .design(in.design() == null || in.design().isNull() ? null : in.design().toString())
                .html(in.html() == null ? "" : in.html())
                .creatoIl(adesso)
                .aggiornatoIl(adesso)
                .build();
    }

    private MailingAutomazioneEmail trovaEmail(long automazioneId, long emailId) {
        MailingAutomazioneEmail e = emailRepository.findById(emailId).orElse(null);
        if (e == null || !e.getAutomazioneId().equals(automazioneId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Email dell'automazione non trovata.");
        }
        return e;
    }

    private void tocca(MailingAutomazione a) {
        a.setAggiornatoIl(MailingTempo.adesso());
        automazioni.save(a);
    }

    // ───────────────────────── Stato ─────────────────────────

    @Transactional
    public MailingDto.Automazione attiva(long id) {
        MailingAutomazione a = trova(id);
        if (a.getStato() == MailingAutomazione.Stato.ATTIVA) {
            return dto(a);
        }
        verificaAttivabile(a);
        LocalDateTime adesso = MailingTempo.adesso();
        a.setStato(MailingAutomazione.Stato.ATTIVA);
        a.setAttivataIl(adesso);
        a.setAggiornatoIl(adesso);
        // Le iscrizioni rimaste ferme durante la pausa ripartono dal job (prossima azione già scaduta).
        return dto(automazioni.save(a));
    }

    @Transactional
    public MailingDto.Automazione pausa(long id) {
        MailingAutomazione a = trova(id);
        if (a.getStato() != MailingAutomazione.Stato.ATTIVA) {
            throw badRequest("Solo un'automazione attiva può essere messa in pausa.");
        }
        a.setStato(MailingAutomazione.Stato.IN_PAUSA);
        a.setAggiornatoIl(MailingTempo.adesso());
        return dto(automazioni.save(a));
    }

    /** Errori che impediscono l'attivazione (trigger, grafo, mittente): 400 con l'elenco. */
    private void verificaAttivabile(MailingAutomazione a) {
        List<String> errori = new ArrayList<>(erroriTrigger(json(a.getTriggerConfig())));
        Map<Long, MailingGrafo.EmailInfo> email = new HashMap<>();
        emailRepository.findByAutomazioneId(a.getId())
                .forEach(e -> email.put(e.getId(), new MailingGrafo.EmailInfo(e.getOggetto(), e.getHtml())));
        errori.addAll(MailingGrafo.leggi(json(a.getGrafo())).valida(email));
        errori.addAll(erroriTag(json(a.getGrafo())));
        if (!errori.isEmpty()) {
            throw badRequest("L'automazione non si può attivare: " + String.join(" ", errori));
        }
        try {
            mittenti.risolvi(a.getMittenteId());
        } catch (ResponseStatusException e) {
            throw badRequest(e.getReason() != null ? e.getReason() : "Nessun mittente attivo configurato.");
        }
    }

    private List<String> erroriTag(JsonNode grafoJson) {
        List<String> errori = new ArrayList<>();
        MailingGrafo g = MailingGrafo.leggi(grafoJson);
        Map<String, Integer> numeri = g.numerazione();
        for (MailingGrafo.Nodo n : g.nodi()) {
            if ("AGGIUNGI_TAG".equals(n.tipo()) || "RIMUOVI_TAG".equals(n.tipo())) {
                long tagId = MailingGrafo.numero(n.cfg().path("tagId"), -1L);
                if (tagId > 0 && !tagRepository.existsById(tagId)) {
                    errori.add("Passo " + numeri.get(n.id()) + ": il tag scelto non esiste più.");
                }
            }
        }
        return errori;
    }

    /** Errori del trigger (tipo e parametri), in italiano. */
    List<String> erroriTrigger(JsonNode trigger) {
        List<String> errori = new ArrayList<>(erroriTriggerStatici(trigger));
        if (!errori.isEmpty()) {
            return errori;
        }
        JsonNode p = trigger.path("parametri");
        switch (MailingTrigger.tipo(trigger)) {
            case "TAG_AGGIUNTO" -> {
                long tagId = MailingGrafo.numero(p.path("tagId"), -1L);
                if (!tagRepository.existsById(tagId)) {
                    errori.add("Il tag che fa partire l'automazione non esiste più.");
                }
            }
            case "ENTRATA_SEGMENTO" -> {
                Long seg = MailingTrigger.segmentoId(trigger);
                if (seg == null || !segmentoRepository.existsById(seg)) {
                    errori.add("Il segmento che fa partire l'automazione non esiste più.");
                }
            }
            default -> {
            }
        }
        return errori;
    }

    /** Controlli del trigger che non toccano il database (testati a parte). */
    static List<String> erroriTriggerStatici(JsonNode trigger) {
        List<String> errori = new ArrayList<>();
        String tipo = MailingTrigger.tipo(trigger);
        if (tipo == null || !MailingTrigger.TIPI.contains(tipo)) {
            errori.add("Scegli che cosa fa partire l'automazione.");
            return errori;
        }
        JsonNode p = trigger.path("parametri");
        switch (tipo) {
            case "TAG_AGGIUNTO" -> {
                if (MailingGrafo.numero(p.path("tagId"), -1L) <= 0) {
                    errori.add("Scegli il tag che fa partire l'automazione.");
                }
            }
            case "ENTRATA_SEGMENTO" -> {
                if (MailingTrigger.segmentoId(trigger) == null) {
                    errori.add("Scegli il segmento che fa partire l'automazione.");
                }
            }
            case "INATTIVO_DA_GIORNI" -> {
                if (MailingGrafo.numero(p.path("giorni"), -1L) < 1) {
                    errori.add("Indica dopo quanti giorni senza visite parte l'automazione.");
                }
                if (p.has("maxIniziali") && !p.path("maxIniziali").isNull()) {
                    long max = MailingGrafo.numero(p.path("maxIniziali"), -1L);
                    if (max < 1 || max > 5000) {
                        errori.add("Il massimo di iscrizioni al giorno dei già inattivi va da 1 a 5000.");
                    }
                }
            }
            case "COMPLEANNO" -> {
                long g = MailingGrafo.numero(p.path("giorniPrima"), 0L);
                if (g < 0 || g > 60) {
                    errori.add("I giorni di anticipo sul compleanno vanno da 0 a 60.");
                }
            }
            case "VISITA_EFFETTUATA" -> {
                if (p.has("numero") && !p.path("numero").isNull() && MailingGrafo.numero(p.path("numero"), 0L) < 1) {
                    errori.add("Il numero della visita parte da 1.");
                }
            }
            default -> {
            }
        }
        return errori;
    }

    // ───────────────────────── Iscrizione manuale ─────────────────────────

    public MailingDto.EsitoIscrizione iscrivi(long automazioneId, MailingDto.IscrizioneManuale in) {
        MailingAutomazione a = automazioni.findById(automazioneId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Automazione non trovata."));
        if (a.getStato() != MailingAutomazione.Stato.ATTIVA) {
            throw badRequest("Attiva l'automazione prima di iscrivere dei contatti.");
        }
        if (in == null || in.contattoIds() == null || in.contattoIds().isEmpty()) {
            throw badRequest("Scegli almeno un contatto da iscrivere.");
        }
        if (in.contattoIds().size() > 5000) {
            throw badRequest("Puoi iscrivere al massimo 5000 contatti alla volta.");
        }
        int iscritti = 0;
        int saltati = 0;
        for (Long contattoId : new java.util.LinkedHashSet<>(in.contattoIds())) {
            if (contattoId != null && motore.iscrivi(automazioneId, contattoId, "MANUALE", Map.of())) {
                iscritti++;
            } else {
                saltati++;
            }
        }
        return new MailingDto.EsitoIscrizione(iscritti, saltati);
    }

    // ───────────────────────── Report ─────────────────────────

    @Transactional(readOnly = true)
    public MailingDto.ReportAutomazione report(long id) {
        MailingAutomazione a = trova(id);
        MailingDto.Automazione dto = dto(a);
        Map<String, Integer> c = sql.contatori(id);
        Map<String, Integer> entrati = sql.entratiPerNodo(id);
        Map<String, Integer> inAttesa = sql.perNodoCorrente(id, List.of("ATTIVA", "IN_ATTESA"));
        Map<String, Integer> usciti = sql.perNodoCorrente(id, List.of("USCITA"));
        Map<Long, MailingDto.Metriche> perEmail = new HashMap<>();
        dto.email().forEach(e -> perEmail.put(e.id(), e.metriche()));

        List<MailingDto.ReportNodo> nodi = new ArrayList<>();
        for (MailingGrafo.Nodo n : MailingGrafo.leggi(dto.grafo()).nodi()) {
            MailingDto.Metriche m = null;
            if ("EMAIL".equals(n.tipo())) {
                // Con le varianti il passo somma le sue email
                m = MailingMetricheService.somma(MailingGrafo.emailDelPasso(n.cfg()).stream()
                        .map(e -> perEmail.getOrDefault(e, metriche.vuote())).toList());
            }
            nodi.add(new MailingDto.ReportNodo(n.id(), entrati.getOrDefault(n.id(), 0), inAttesa.getOrDefault(n.id(), 0),
                    usciti.getOrDefault(n.id(), 0), m));
        }

        LocalDate oggi = MailingTempo.adesso().toLocalDate();
        LocalDate da = oggi.minusDays(29);
        Map<String, Integer> ingressi = sql.ingressiGiornalieri(id, da);
        List<MailingDto.PuntoSerie> serie = new ArrayList<>();
        for (LocalDate g = da; !g.isAfter(oggi); g = g.plusDays(1)) {
            Map<String, Number> v = new LinkedHashMap<>();
            v.put("ingressi", ingressi.getOrDefault(g.toString(), 0));
            serie.add(new MailingDto.PuntoSerie(g.toString(), v));
        }
        return new MailingDto.ReportAutomazione(dto,
                c.getOrDefault("ATTIVA", 0) + c.getOrDefault("IN_ATTESA", 0),
                c.getOrDefault("COMPLETATA", 0), c.getOrDefault("USCITA", 0), c.getOrDefault("ERRORE", 0),
                metriche.perAutomazione(id), nodi, serie);
    }

    // ───────────────────────── Supporto ─────────────────────────

    MailingTrigger.Nomi nomi() {
        Map<Long, String> tag = new HashMap<>();
        tagRepository.findAll().forEach(t -> tag.put(t.getId(), t.getNome()));
        Map<Long, String> segmenti = new HashMap<>();
        segmentoRepository.findAll().forEach(s -> segmenti.put(s.getId(), s.getNome()));
        return new MailingTrigger.Nomi() {
            public String tag(Long id) {
                return tag.get(id);
            }

            public String segmento(Long id) {
                return segmenti.get(id);
            }
        };
    }

    private MailingAutomazione trova(long id) {
        return automazioni.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Automazione non trovata."));
    }

    private void verificaTipoTrigger(JsonNode trigger) {
        String tipo = MailingTrigger.tipo(trigger);
        if (tipo == null || !MailingTrigger.TIPI.contains(tipo)) {
            throw badRequest("Trigger non valido: scegli che cosa fa partire l'automazione.");
        }
    }

    private static JsonNode grafoValido(JsonNode grafo) {
        if (grafo == null || grafo.isNull()) {
            return MailingGrafo.vuoto();
        }
        if (!grafo.isObject() || (grafo.has("nodi") && !grafo.path("nodi").isArray())
                || (grafo.has("archi") && !grafo.path("archi").isArray())) {
            throw badRequest("Il percorso dell'automazione non è nel formato atteso.");
        }
        ObjectNode g = grafo.deepCopy();
        if (!g.has("nodi")) {
            g.putArray("nodi");
        }
        if (!g.has("archi")) {
            g.putArray("archi");
        }
        return g;
    }

    private static String uscitaValida(JsonNode uscita) {
        if (uscita == null || uscita.isNull() || (uscita.isObject() && uscita.isEmpty())) {
            return null;
        }
        if (!uscita.isObject() && !uscita.isArray()) {
            throw badRequest("La regola d'uscita non è nel formato atteso.");
        }
        if (uscita.isObject() && MailingTrigger.tipo(uscita) == null && !uscita.has("eventi") && !uscita.has("regole")) {
            return null;
        }
        return uscita.toString();
    }

    private static JsonNode triggerManuale() {
        ObjectNode t = JsonNodeFactory.instance.objectNode();
        t.put("tipo", "MANUALE");
        t.putObject("parametri");
        return t;
    }

    private static String nomeValido(String nome) {
        if (!StringUtils.hasText(nome)) {
            throw badRequest("Dai un nome all'automazione.");
        }
        String n = nome.trim();
        if (n.length() > 200) {
            throw badRequest("Il nome è troppo lungo (massimo 200 caratteri).");
        }
        return n;
    }

    private static String tronca(String s, int max) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        if (t.isEmpty()) {
            return null;
        }
        return t.length() > max ? t.substring(0, max) : t;
    }

    static ResponseStatusException badRequest(String messaggio) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, messaggio);
    }

    private JsonNode json(String s) {
        if (s == null || s.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readTree(s);
        } catch (Exception e) {
            return null;
        }
    }
}
