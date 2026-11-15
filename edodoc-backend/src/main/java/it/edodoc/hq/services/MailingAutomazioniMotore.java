package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import it.edodoc.hq.models.MailingAutomazione;
import it.edodoc.hq.models.MailingAutomazioneEmail;
import it.edodoc.hq.models.MailingAutomazioneIscrizione;
import it.edodoc.hq.models.MailingContatto;
import it.edodoc.hq.models.MailingInvio;
import it.edodoc.hq.models.MailingSegmento;
import it.edodoc.hq.models.MailingTag;
import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.models.Task;
import it.edodoc.hq.repositories.MailingAutomazioneEmailRepository;
import it.edodoc.hq.repositories.MailingAutomazioneIscrizioneRepository;
import it.edodoc.hq.repositories.MailingAutomazioneRepository;
import it.edodoc.hq.repositories.MailingContattoRepository;
import it.edodoc.hq.repositories.MailingSegmentoRepository;
import it.edodoc.hq.repositories.MailingTagRepository;
import it.edodoc.hq.repositories.PazienteRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Motore delle automazioni email (sostituisce i Customer Journey di Mailchimp).
 * <ul>
 *   <li>Ascolta gli eventi del gestionale ({@link MailingEventoGestionale}) dopo il commit: fa uscire chi soddisfa la
 *       regola d'uscita (DISISCRITTO fa sempre uscire) e iscrive i contatti alle automazioni ATTIVE con trigger
 *       compatibile.</li>
 *   <li>Fa avanzare un'iscrizione eseguendo in sequenza i passi istantanei finché arriva a un'attesa o alla fine.
 *       EMAIL accoda l'invio (che parte da solo dalla coda) e prosegue subito.</li>
 * </ul>
 * Ogni iscrizione avanza nella propria transazione con la riga bloccata (FOR UPDATE SKIP LOCKED): due istanze non la
 * lavorano mai insieme. Un errore su un'iscrizione viene riprovato fino a {@value #MAX_TENTATIVI} volte e poi resta in
 * ERRORE, senza fermare le altre.
 * <p>
 * Contesto dell'iscrizione (JSON): {@code {trigger, parametri, percorso: [nodi visitati], attesa: nodo su cui si
 * aspetta, email: {nodo: invioId}, esiti: {nodo: SI|NO}, tentativi, motivoUscita}}.
 */
@Service
public class MailingAutomazioniMotore {

    private static final Logger logger = LoggerFactory.getLogger(MailingAutomazioniMotore.class);

    /** Protezione dai loop: passi eseguiti al massimo in un solo avanzamento. */
    static final int MAX_PASSI = 50;
    static final int MAX_TENTATIVI = 3;

    static final Set<MailingAutomazioneIscrizione.Stato> STATI_IN_CORSO =
            Set.of(MailingAutomazioneIscrizione.Stato.ATTIVA, MailingAutomazioneIscrizione.Stato.IN_ATTESA);

    private static final Pattern SEGNAPOSTO = Pattern.compile("\\{\\{\\s*([a-z_]+)\\s*(?:\\|([^}]*))?}}");

    /** Lista di sistema dei task creati dalle automazioni. */
    static final String LISTA_TASK = "CONTATTI";

    private final MailingAutomazioneRepository automazioni;
    private final MailingAutomazioneEmailRepository emailRepository;
    private final MailingAutomazioneIscrizioneRepository iscrizioni;
    private final MailingContattoRepository contatti;
    private final MailingTagRepository tagRepository;
    private final MailingSegmentoRepository segmentoRepository;
    private final PazienteRepository pazienteRepository;
    private final MailingAutomazioniSql sql;
    private final MailingContattiService contattiService;
    private final MailingSegmentiService segmentiService;
    private final MailingCodaService codaService;
    private final TaskService taskService;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate tx;

    public MailingAutomazioniMotore(MailingAutomazioneRepository automazioni,
                                    MailingAutomazioneEmailRepository emailRepository,
                                    MailingAutomazioneIscrizioneRepository iscrizioni,
                                    MailingContattoRepository contatti,
                                    MailingTagRepository tagRepository,
                                    MailingSegmentoRepository segmentoRepository,
                                    PazienteRepository pazienteRepository,
                                    MailingAutomazioniSql sql,
                                    MailingContattiService contattiService,
                                    MailingSegmentiService segmentiService,
                                    MailingCodaService codaService,
                                    TaskService taskService,
                                    ObjectMapper objectMapper,
                                    TransactionTemplate tx) {
        this.automazioni = automazioni;
        this.emailRepository = emailRepository;
        this.iscrizioni = iscrizioni;
        this.contatti = contatti;
        this.tagRepository = tagRepository;
        this.segmentoRepository = segmentoRepository;
        this.pazienteRepository = pazienteRepository;
        this.sql = sql;
        this.contattiService = contattiService;
        this.segmentiService = segmentiService;
        this.codaService = codaService;
        this.taskService = taskService;
        this.objectMapper = objectMapper;
        this.tx = tx;
    }

    // ───────────────────────── Eventi del gestionale ─────────────────────────

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void suEventoGestionale(MailingEventoGestionale evento) {
        try {
            gestisciEvento(evento);
        } catch (Exception e) {
            logger.error("[MAILING AUTOMAZIONI] Evento {} non gestito: {}", evento == null ? null : evento.tipo(),
                    e.getMessage(), e);
        }
    }

    /** Uscite e iscrizioni provocate da un evento. Pubblico per i test e per le chiamate sincrone. */
    public void gestisciEvento(MailingEventoGestionale evento) {
        if (evento == null || evento.tipo() == null) {
            return;
        }
        Long contattoId = risolviContatto(evento);
        if (contattoId == null) {
            return;
        }
        String tipo = evento.tipo().toUpperCase(Locale.ROOT);

        // 1. Uscite: DISISCRITTO fa uscire da tutto; altrimenti la regola d'uscita di ogni automazione.
        for (MailingAutomazioneIscrizione i : iscrizioni.findByContattoIdAndStatoIn(contattoId, STATI_IN_CORSO)) {
            if (MailingEventoGestionale.DISISCRITTO.equals(tipo)) {
                esciInTransazione(i.getId(), "Il contatto si è disiscritto");
                continue;
            }
            MailingAutomazione a = automazioni.findById(i.getAutomazioneId()).orElse(null);
            if (a != null && uscitaPerEvento(json(a.getUscita()), tipo, evento.parametri())) {
                esciInTransazione(i.getId(), "Regola d'uscita: " + tipo);
            }
        }
        if (MailingEventoGestionale.DISISCRITTO.equals(tipo)) {
            return;
        }

        // 2. Iscrizioni alle automazioni attive con trigger compatibile.
        Map<String, Object> parametri = evento.parametri();
        for (MailingAutomazione a : automazioni.findByStato(MailingAutomazione.Stato.ATTIVA)) {
            JsonNode trigger = json(a.getTriggerConfig());
            if (MailingTrigger.corrisponde(trigger, tipo, parametri)) {
                try {
                    iscrivi(a.getId(), contattoId, tipo, parametri);
                } catch (Exception e) {
                    logger.warn("[MAILING AUTOMAZIONI] Iscrizione contatto {} ad automazione {} fallita: {}",
                            contattoId, a.getId(), e.getMessage());
                }
            }
        }
    }

    private Long risolviContatto(MailingEventoGestionale e) {
        if (e.contattoId() != null) {
            return e.contattoId();
        }
        if (e.pazienteId() != null) {
            return contatti.findByPazienteId(e.pazienteId()).stream().map(MailingContatto::getId).findFirst().orElse(null);
        }
        return null;
    }

    /** True se la regola d'uscita (stessa forma del trigger, o un elenco di regole) scatta con questo evento. */
    static boolean uscitaPerEvento(JsonNode uscita, String tipoEvento, Map<String, Object> parametri) {
        if (uscita == null || uscita.isNull() || uscita.isMissingNode()) {
            return false;
        }
        if (uscita.isArray()) {
            for (JsonNode u : uscita) {
                if (uscitaPerEvento(u, tipoEvento, parametri)) {
                    return true;
                }
            }
            return false;
        }
        if (uscita.path("eventi").isArray()) {
            return uscitaPerEvento(uscita.path("eventi"), tipoEvento, parametri);
        }
        return MailingTrigger.corrisponde(uscita, tipoEvento, parametri);
    }

    // ───────────────────────── Iscrizione ─────────────────────────

    /**
     * Iscrive il contatto all'automazione e lo fa partire subito. Ritorna false (senza errore) se il contatto non è
     * ISCRITTO, se ha già un'iscrizione in corso, o se l'ha già avuta e il rientro non è consentito.
     */
    public boolean iscrivi(long automazioneId, long contattoId, String origine, Map<String, Object> parametri) {
        Long iscrizioneId = tx.execute(status -> {
            sql.bloccaIscrizione(automazioneId, contattoId);
            MailingAutomazione a = automazioni.findById(automazioneId).orElse(null);
            MailingContatto c = contatti.findById(contattoId).orElse(null);
            if (a == null || c == null || c.getStato() != MailingContatto.Stato.ISCRITTO) {
                return null;
            }
            if (!puoEntrare(Boolean.TRUE.equals(a.getRientroConsentito()),
                    iscrizioni.existsByAutomazioneIdAndContattoId(automazioneId, contattoId),
                    iscrizioni.existsByAutomazioneIdAndContattoIdAndStatoIn(automazioneId, contattoId, STATI_IN_CORSO))) {
                return null;
            }
            MailingGrafo grafo = MailingGrafo.leggi(json(a.getGrafo()));
            MailingGrafo.Nodo inizio = grafo.iniziale();
            if (inizio == null) {
                return null;
            }
            ObjectNode ctx = JsonNodeFactory.instance.objectNode();
            ctx.put("trigger", origine);
            ctx.set("parametri", objectMapper.valueToTree(parametri == null ? Map.of() : parametri));
            ctx.putArray("percorso").add(inizio.id());
            LocalDateTime adesso = MailingTempo.adesso();
            MailingAutomazioneIscrizione i = MailingAutomazioneIscrizione.builder()
                    .automazioneId(automazioneId)
                    .contattoId(contattoId)
                    .nodoCorrente(inizio.id())
                    .stato(MailingAutomazioneIscrizione.Stato.ATTIVA)
                    .prossimaAzioneIl(adesso)
                    .contesto(ctx.toString())
                    .iniziataIl(adesso)
                    .build();
            return iscrizioni.save(i).getId();
        });
        if (iscrizioneId == null) {
            return false;
        }
        avanza(iscrizioneId);
        return true;
    }

    /** Regola di ingresso: mai due iscrizioni in corso; una sola nella vita se il rientro non è consentito. */
    static boolean puoEntrare(boolean rientroConsentito, boolean giaIscrittoInPassato, boolean iscrizioneInCorso) {
        if (iscrizioneInCorso) {
            return false;
        }
        return rientroConsentito || !giaIscrittoInPassato;
    }

    // ───────────────────────── Avanzamento ─────────────────────────

    /**
     * Fa avanzare un'iscrizione se è il suo momento. Idempotente: se la riga è già in lavorazione, non è più in corso
     * o la prossima azione è nel futuro, non fa nulla. Gli errori vengono registrati sull'iscrizione.
     *
     * @return true se l'iscrizione è stata lavorata
     */
    public boolean avanza(long iscrizioneId) {
        try {
            Boolean fatto = tx.execute(status -> avanzaInTransazione(iscrizioneId));
            return Boolean.TRUE.equals(fatto);
        } catch (Exception e) {
            registraErrore(iscrizioneId, e);
            return false;
        }
    }

    private boolean avanzaInTransazione(long iscrizioneId) {
        Optional<MailingAutomazioneIscrizione> bloccata = iscrizioni.bloccaPerAvanzamento(iscrizioneId);
        if (bloccata.isEmpty()) {
            return false;
        }
        MailingAutomazioneIscrizione i = bloccata.get();
        if (!STATI_IN_CORSO.contains(i.getStato())) {
            return false;
        }
        LocalDateTime adesso = MailingTempo.adesso();
        if (i.getProssimaAzioneIl() != null && i.getProssimaAzioneIl().isAfter(adesso)) {
            return false;
        }
        MailingAutomazione a = automazioni.findById(i.getAutomazioneId()).orElse(null);
        if (a == null || a.getStato() != MailingAutomazione.Stato.ATTIVA) {
            return false; // in pausa: l'iscrizione resta dov'è e riparte alla riattivazione
        }
        MailingContatto c = contatti.findById(i.getContattoId()).orElse(null);
        if (c == null || c.getStato() != MailingContatto.Stato.ISCRITTO) {
            esci(i, "Il contatto non è più iscritto");
            return true;
        }
        JsonNode uscita = json(a.getUscita());
        JsonNode regoleUscita = regoleUscita(uscita);
        if (regoleUscita != null && segmentiService.soddisfa(c.getId(), regoleUscita)) {
            esci(i, "Regola d'uscita soddisfatta");
            return true;
        }
        Esecutore esecutore = new Esecutore(a, c);
        Esito esito = esegui(MailingGrafo.leggi(json(a.getGrafo())), i, contesto(i), adesso,
                Boolean.TRUE.equals(a.getSoloOrariLavorativi()), esecutore);
        applica(i, esito);
        return true;
    }

    /** Regole segmento della regola d'uscita: {@code parametri.regole} inline o il segmento di ENTRATA_SEGMENTO. */
    private JsonNode regoleUscita(JsonNode uscita) {
        if (uscita == null || !uscita.isObject()) {
            return null;
        }
        JsonNode inline = uscita.path("parametri").path("regole");
        if (inline.isObject() && inline.path("condizioni").isArray()) {
            return inline;
        }
        if (uscita.path("regole").isObject()) {
            return uscita.path("regole");
        }
        if ("ENTRATA_SEGMENTO".equals(MailingTrigger.tipo(uscita))) {
            Long segId = MailingTrigger.segmentoId(uscita);
            if (segId != null) {
                return segmentoRepository.findById(segId).map(MailingSegmento::getRegole).map(this::json).orElse(null);
            }
        }
        return null;
    }

    /** Azioni con effetti esterni, separate dalla logica di navigazione (sostituibili nei test). */
    interface Azioni {
        /** Accoda l'email; ritorna l'id dell'invio o null se il contatto non è idoneo. */
        Long accodaEmail(long emailId, long iscrizioneId, LocalDateTime quando);

        boolean haAperto(long iscrizioneId, long emailId);

        boolean haCliccato(long iscrizioneId, long emailId);

        boolean soddisfaRegole(JsonNode regole);

        void aggiungiTag(JsonNode config);

        void rimuoviTag(JsonNode config);

        void notificaStaff(JsonNode config);
    }

    /** Esito di un avanzamento: nuovo stato, nodo, prossima azione, contesto. */
    record Esito(MailingAutomazioneIscrizione.Stato stato, String nodo, LocalDateTime prossimaAzioneIl,
                 ObjectNode contesto, String errore) {
    }

    /**
     * Esegue i passi dal nodo corrente: i passi istantanei uno dopo l'altro, fino a un'attesa, alla fine o a un nodo
     * mancante (uscita). Funzione pura rispetto al database: gli effetti passano da {@link Azioni}.
     */
    static Esito esegui(MailingGrafo grafo, MailingAutomazioneIscrizione i, ObjectNode ctx, LocalDateTime adesso,
                        boolean soloOrariLavorativi, Azioni azioni) {
        String corrente = i.getNodoCorrente();
        LocalDateTime base = adesso;
        for (int passo = 0; passo < MAX_PASSI; passo++) {
            MailingGrafo.Nodo nodo = grafo.nodo(corrente);
            if (nodo == null) {
                ctx.put("motivoUscita", "Il passo su cui si trovava è stato rimosso dall'automazione");
                return new Esito(MailingAutomazioneIscrizione.Stato.USCITA, corrente, null, ctx, null);
            }
            JsonNode cfg = nodo.cfg();
            String ramo = null;
            switch (nodo.tipo()) {
                case "EMAIL" -> {
                    ObjectNode inviate = ctx.withObjectProperty("email");
                    if (!inviate.has(nodo.id())) {
                        long emailId = MailingGrafo.numero(cfg.path("emailId"), -1L);
                        if (emailId < 0) {
                            throw new IllegalStateException("Il passo email non ha un'email associata");
                        }
                        LocalDateTime quando = soloOrariLavorativi ? MailingTrigger.finestraLavorativa(base) : base;
                        Long invioId = azioni.accodaEmail(emailId, i.getId(), quando);
                        if (invioId == null) {
                            inviate.putNull(nodo.id());
                        } else {
                            inviate.put(nodo.id(), invioId);
                        }
                        if (quando.isAfter(base)) {
                            base = quando; // le attese successive partono da quando l'email esce davvero
                        }
                    }
                }
                case "ATTESA", "ATTESA_FINO_A" -> {
                    String inAttesa = MailingGrafo.testo(ctx.path("attesa"));
                    if (nodo.id().equals(inAttesa)) {
                        ctx.remove("attesa"); // attesa finita: si prosegue
                    } else {
                        LocalDateTime fino;
                        if ("ATTESA".equals(nodo.tipo())) {
                            long minuti = MailingGrafo.minutiAttesa(cfg);
                            if (minuti <= 0) {
                                throw new IllegalStateException("Attesa senza durata");
                            }
                            fino = base.plusMinutes(minuti);
                        } else {
                            LocalTime ora = MailingGrafo.oraAttesa(cfg);
                            if (ora == null) {
                                throw new IllegalStateException("Attesa senza orario valido");
                            }
                            fino = MailingGrafo.prossimaOccorrenza(base, MailingGrafo.giorniAttesa(cfg), ora);
                        }
                        ctx.put("attesa", nodo.id());
                        return new Esito(MailingAutomazioneIscrizione.Stato.IN_ATTESA, nodo.id(), fino, ctx, null);
                    }
                }
                case "CONDIZIONE" -> {
                    boolean esito = valutaCondizione(grafo, cfg, i.getId(), azioni);
                    ramo = esito ? "SI" : "NO";
                    ctx.withObjectProperty("esiti").put(nodo.id(), ramo);
                }
                case "AGGIUNGI_TAG" -> azioni.aggiungiTag(cfg);
                case "RIMUOVI_TAG" -> azioni.rimuoviTag(cfg);
                case "NOTIFICA_STAFF" -> azioni.notificaStaff(cfg);
                case "FINE" -> {
                    return new Esito(MailingAutomazioneIscrizione.Stato.COMPLETATA, nodo.id(), null, ctx, null);
                }
                default -> throw new IllegalStateException("Tipo di passo sconosciuto: " + nodo.tipo());
            }
            MailingGrafo.Nodo prossimo = grafo.successivo(nodo.id(), ramo);
            if (prossimo == null) {
                // Fine del percorso (anche un ramo SI/NO lasciato vuoto)
                return new Esito(MailingAutomazioneIscrizione.Stato.COMPLETATA, nodo.id(), null, ctx, null);
            }
            corrente = prossimo.id();
            aggiungiPercorso(ctx, corrente);
        }
        return new Esito(MailingAutomazioneIscrizione.Stato.ERRORE, corrente, null, ctx,
                "Troppi passi in un solo avanzamento (" + MAX_PASSI + "): controlla il percorso");
    }

    static boolean valutaCondizione(MailingGrafo grafo, JsonNode cfg, long iscrizioneId, Azioni azioni) {
        String tipo = MailingGrafo.tipoCondizione(cfg);
        if (tipo == null) {
            throw new IllegalStateException("Condizione senza criterio");
        }
        if ("REGOLA".equals(tipo)) {
            return azioni.soddisfaRegole(cfg.path("regole"));
        }
        String rif = MailingGrafo.testo(cfg.path("APERTO".equals(tipo) ? "haAperto" : "haCliccato"));
        MailingGrafo.Nodo emailNodo = grafo.nodo(rif);
        if (emailNodo == null || !"EMAIL".equals(emailNodo.tipo())) {
            return false;
        }
        // Con le varianti il contatto ha ricevuto una sola delle email del passo: basta che abbia interagito con quella
        for (long emailId : MailingGrafo.emailDelPasso(emailNodo.cfg())) {
            if ("APERTO".equals(tipo) ? azioni.haAperto(iscrizioneId, emailId) : azioni.haCliccato(iscrizioneId, emailId)) {
                return true;
            }
        }
        return false;
    }

    static void aggiungiPercorso(ObjectNode ctx, String nodoId) {
        ArrayNode percorso = ctx.withArrayProperty("percorso");
        for (JsonNode n : percorso) {
            if (nodoId.equals(n.asText())) {
                return;
            }
        }
        percorso.add(nodoId);
    }

    private void applica(MailingAutomazioneIscrizione i, Esito esito) {
        i.setNodoCorrente(esito.nodo());
        i.setStato(esito.stato());
        i.setProssimaAzioneIl(esito.prossimaAzioneIl());
        esito.contesto().remove("tentativi");
        i.setContesto(esito.contesto().toString());
        i.setErrore(esito.errore());
        if (esito.stato() == MailingAutomazioneIscrizione.Stato.COMPLETATA
                || esito.stato() == MailingAutomazioneIscrizione.Stato.USCITA
                || esito.stato() == MailingAutomazioneIscrizione.Stato.ERRORE) {
            i.setConclusaIl(MailingTempo.adesso());
            i.setProssimaAzioneIl(null);
        }
        iscrizioni.save(i);
        if (esito.stato() == MailingAutomazioneIscrizione.Stato.USCITA) {
            sql.annullaInviiInCoda(i.getId());
        }
    }

    // ───────────────────────── Uscita ed errori ─────────────────────────

    /** Fa uscire un'iscrizione in corso (stato USCITA) e annulla le sue email ancora in coda. */
    public void esciInTransazione(long iscrizioneId, String motivo) {
        tx.executeWithoutResult(status -> iscrizioni.findById(iscrizioneId).ifPresent(i -> {
            if (STATI_IN_CORSO.contains(i.getStato())) {
                esci(i, motivo);
            }
        }));
    }

    private void esci(MailingAutomazioneIscrizione i, String motivo) {
        ObjectNode ctx = contesto(i);
        ctx.put("motivoUscita", motivo);
        i.setContesto(ctx.toString());
        i.setStato(MailingAutomazioneIscrizione.Stato.USCITA);
        i.setProssimaAzioneIl(null);
        i.setConclusaIl(MailingTempo.adesso());
        iscrizioni.save(i);
        sql.annullaInviiInCoda(i.getId());
    }

    /** Errore di un avanzamento: riprova dopo 15/30 minuti, al terzo tentativo l'iscrizione va in ERRORE. */
    private void registraErrore(long iscrizioneId, Exception e) {
        String messaggio = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
        logger.warn("[MAILING AUTOMAZIONI] Avanzamento iscrizione {} fallito: {}", iscrizioneId, messaggio);
        try {
            tx.executeWithoutResult(status -> iscrizioni.findById(iscrizioneId).ifPresent(i -> {
                if (!STATI_IN_CORSO.contains(i.getStato())) {
                    return;
                }
                ObjectNode ctx = contesto(i);
                int tentativi = ctx.path("tentativi").asInt(0) + 1;
                ctx.put("tentativi", tentativi);
                i.setContesto(ctx.toString());
                i.setErrore(messaggio.length() > 2000 ? messaggio.substring(0, 2000) : messaggio);
                if (tentativi >= MAX_TENTATIVI) {
                    i.setStato(MailingAutomazioneIscrizione.Stato.ERRORE);
                    i.setProssimaAzioneIl(null);
                    i.setConclusaIl(MailingTempo.adesso());
                } else {
                    i.setProssimaAzioneIl(MailingTempo.adesso().plusMinutes(15L * tentativi));
                }
                iscrizioni.save(i);
            }));
        } catch (Exception e2) {
            logger.error("[MAILING AUTOMAZIONI] Impossibile registrare l'errore dell'iscrizione {}: {}", iscrizioneId,
                    e2.getMessage());
        }
    }

    // ───────────────────────── Azioni reali ─────────────────────────

    private final class Esecutore implements Azioni {
        private final MailingAutomazione automazione;
        private final MailingContatto contatto;

        Esecutore(MailingAutomazione automazione, MailingContatto contatto) {
            this.automazione = automazione;
            this.contatto = contatto;
        }

        @Override
        public Long accodaEmail(long emailId, long iscrizioneId, LocalDateTime quando) {
            MailingAutomazioneEmail email = emailRepository.findById(emailId).orElse(null);
            if (email == null || !automazione.getId().equals(email.getAutomazioneId())) {
                throw new IllegalStateException("L'email del passo non esiste più");
            }
            MailingInvio invio = codaService.accodaEmailAutomazione(emailId, iscrizioneId, contatto.getId(),
                    automazione.getMittenteId(), automazione.getCategoriaId(), quando);
            return invio == null ? null : invio.getId();
        }

        @Override
        public boolean haAperto(long iscrizioneId, long emailId) {
            return sql.haInteragito(iscrizioneId, emailId, false);
        }

        @Override
        public boolean haCliccato(long iscrizioneId, long emailId) {
            return sql.haInteragito(iscrizioneId, emailId, true);
        }

        @Override
        public boolean soddisfaRegole(JsonNode regole) {
            return segmentiService.soddisfa(contatto.getId(), regole);
        }

        @Override
        public void aggiungiTag(JsonNode config) {
            long tagId = MailingGrafo.numero(config.path("tagId"), -1L);
            if (tagId > 0) {
                if (!tagRepository.existsById(tagId)) {
                    throw new IllegalStateException("Il tag da aggiungere non esiste più");
                }
                contattiService.aggiungiTagId(contatto.getId(), tagId, null);
                return;
            }
            String nome = MailingGrafo.testo(config.path("nome"));
            if (nome == null) {
                throw new IllegalStateException("Il passo non indica quale tag aggiungere");
            }
            contattiService.aggiungiTag(contatto.getId(), nome, false, null);
        }

        @Override
        public void rimuoviTag(JsonNode config) {
            long tagId = MailingGrafo.numero(config.path("tagId"), -1L);
            if (tagId < 0) {
                String nome = MailingGrafo.testo(config.path("nome"));
                tagId = nome == null ? -1L : tagRepository.findByNomeIgnoreCase(nome).map(MailingTag::getId).orElse(-1L);
            }
            if (tagId > 0) {
                contattiService.rimuoviTag(contatto.getId(), tagId);
            }
        }

        /** In EdoDoc c'è un solo utente: il passo crea un task per il dottore, collegato al paziente se c'è. */
        @Override
        public void notificaStaff(JsonNode config) {
            String testo = sostituisciSegnaposto(MailingGrafo.testo(config.path("testo")), contatto);
            String titolo = testo == null || testo.isBlank()
                    ? "Automazione «" + automazione.getNome() + "»: " + nomeCompleto(contatto) : testo.trim();
            Paziente paziente = contatto.getPazienteId() == null ? null
                    : pazienteRepository.findById(contatto.getPazienteId()).orElse(null);
            String chiave = "mailing:" + automazione.getId() + ":" + contatto.getId() + ":" + MailingTempo.adesso();
            taskService.creaAutomatico(chiave.length() > 100 ? chiave.substring(0, 100) : chiave, LISTA_TASK,
                    titolo.length() > 200 ? titolo.substring(0, 200) : titolo, Task.Priorita.NORMALE,
                    MailingTempo.adesso().toLocalDate(), paziente);
        }

    }

    static String nomeCompleto(MailingContatto c) {
        String n = ((c.getNome() == null ? "" : c.getNome()) + " " + (c.getCognome() == null ? "" : c.getCognome())).trim();
        return n.isEmpty() ? c.getEmail() : n;
    }

    /** Segnaposto del testo della notifica allo staff ({{nome}}, {{cognome}}, {{nome_completo}}, {{email}}). */
    static String sostituisciSegnaposto(String testo, MailingContatto c) {
        if (testo == null) {
            return null;
        }
        Matcher m = SEGNAPOSTO.matcher(testo);
        StringBuilder sb = new StringBuilder();
        while (m.find()) {
            String valore = switch (m.group(1)) {
                case "nome" -> c.getNome();
                case "cognome" -> c.getCognome();
                case "nome_completo" -> nomeCompleto(c);
                case "email" -> c.getEmail();
                default -> null;
            };
            if (valore == null || valore.isBlank()) {
                valore = m.group(2) == null ? "" : m.group(2).trim();
            }
            m.appendReplacement(sb, Matcher.quoteReplacement(valore));
        }
        m.appendTail(sb);
        return sb.toString();
    }

    // ───────────────────────── JSON ─────────────────────────

    private ObjectNode contesto(MailingAutomazioneIscrizione i) {
        JsonNode n = json(i.getContesto());
        return n != null && n.isObject() ? (ObjectNode) n : JsonNodeFactory.instance.objectNode();
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
