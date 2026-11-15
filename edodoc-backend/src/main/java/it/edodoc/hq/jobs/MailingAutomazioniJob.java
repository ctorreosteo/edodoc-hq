package it.edodoc.hq.jobs;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import it.edodoc.hq.models.MailingAutomazione;
import it.edodoc.hq.models.MailingSegmento;
import it.edodoc.hq.repositories.MailingAutomazioneIscrizioneRepository;
import it.edodoc.hq.repositories.MailingAutomazioneRepository;
import it.edodoc.hq.repositories.MailingSegmentoRepository;
import it.edodoc.hq.services.MailingAutomazioniMotore;
import it.edodoc.hq.services.MailingAutomazioniSql;
import it.edodoc.hq.services.MailingConfigService;
import it.edodoc.hq.services.MailingSegmentiService;
import it.edodoc.hq.services.MailingTempo;
import it.edodoc.hq.services.MailingTrigger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Email Marketing, automazioni:
 * <ul>
 *   <li>ogni minuto fa avanzare le iscrizioni con
 *       la prossima azione scaduta, a lotti, saltando quelle già in lavorazione (SKIP LOCKED);</li>
 *   <li>alle 7:00 iscrive i contatti dei trigger COMPLEANNO e INATTIVO_DA_GIORNI;</li>
 *   <li>ogni ora iscrive chi è entrato nei segmenti dei trigger ENTRATA_SEGMENTO.</li>
 * </ul>
 * Non scrive direttamente a nessuno: accoda le email, che partono dal worker di invio solo con
 * MAILING_INVIO_ABILITATO acceso. Disattivabile con {@value #CONFIG_JOB_ENABLED}.
 */
@Component
public class MailingAutomazioniJob {

    private static final Logger logger = LoggerFactory.getLogger(MailingAutomazioniJob.class);
    public static final String CONFIG_JOB_ENABLED = "JOB_MAILING_AUTOMAZIONI_ENABLED";
    public static final String SCHEDULE = "ogni minuto (avanzamento), 7:00 (compleanni, inattivi), ogni ora al :15 (segmenti) — Europe/Rome";

    static final int LOTTO = 200;
    /** Tempo massimo di un giro di avanzamento: il resto lo fa il giro successivo. */
    static final Duration BUDGET_AVANZAMENTO = Duration.ofSeconds(90);
    static final int GIORNI_TRA_COMPLEANNI = 300;
    static final int GIORNI_TRA_RIATTIVAZIONI = 365;

    private final MailingConfigService config;
    private final MailingAutomazioneRepository automazioni;
    private final MailingAutomazioneIscrizioneRepository iscrizioni;
    private final MailingSegmentoRepository segmenti;
    private final MailingAutomazioniMotore motore;
    private final MailingAutomazioniSql sql;
    private final MailingSegmentiService segmentiService;
    private final ScheduledJobClusterLock clusterLock;
    private final TransactionTemplate tx;
    private final ObjectMapper objectMapper;
    private final ExecutorService jobExecutor;

    /** Passaggi in corso (avanzamento, giornaliero, segmenti possono sovrapporsi: il motore è sicuro). */
    private final AtomicInteger inCorso = new AtomicInteger();
    private volatile LocalDateTime lastRunStartedAt;
    private volatile LocalDateTime lastRunFinishedAt;
    private volatile String lastMessage;
    private volatile String lastError;

    public MailingAutomazioniJob(MailingConfigService config, MailingAutomazioneRepository automazioni,
                                 MailingAutomazioneIscrizioneRepository iscrizioni, MailingSegmentoRepository segmenti,
                                 MailingAutomazioniMotore motore, MailingAutomazioniSql sql,
                                 MailingSegmentiService segmentiService, ScheduledJobClusterLock clusterLock,
                                 TransactionTemplate tx, ObjectMapper objectMapper,
                                 @Qualifier("mailingJobExecutor") ExecutorService jobExecutor) {
        this.config = config;
        this.automazioni = automazioni;
        this.iscrizioni = iscrizioni;
        this.segmenti = segmenti;
        this.motore = motore;
        this.sql = sql;
        this.segmentiService = segmentiService;
        this.clusterLock = clusterLock;
        this.tx = tx;
        this.objectMapper = objectMapper;
        this.jobExecutor = jobExecutor;
    }

    public boolean isEnabled() {
        return config.jobAbilitato(CONFIG_JOB_ENABLED);
    }

    public boolean isRunning() {
        return inCorso.get() > 0;
    }

    public LocalDateTime getLastRunStartedAt() {
        return lastRunStartedAt;
    }

    public LocalDateTime getLastRunFinishedAt() {
        return lastRunFinishedAt;
    }

    public String getLastMessage() {
        return lastMessage;
    }

    public String getLastError() {
        return lastError;
    }

    // ───────────────────────── Pianificazioni ─────────────────────────

    @Scheduled(cron = "0 * * * * *", zone = "Europe/Rome")
    public void avanzamento() {
        if (!isEnabled()) {
            return;
        }
        clusterLock.runIfAcquired(ScheduledJobClusterLock.name("MailingAutomazioniAvanzamento"),
                Duration.ofMinutes(10), Duration.ofSeconds(20), () -> traccia("avanzamento", this::avanzaScadute));
    }

    @Scheduled(cron = "0 0 7 * * *", zone = "Europe/Rome")
    public void giornaliero() {
        if (!isEnabled()) {
            return;
        }
        clusterLock.runIfAcquired(ScheduledJobClusterLock.name("MailingAutomazioniGiornaliero"),
                Duration.ofHours(1), Duration.ofMinutes(5), () -> traccia("trigger giornalieri", this::triggerGiornalieri));
    }

    @Scheduled(cron = "0 15 * * * *", zone = "Europe/Rome")
    public void orario() {
        if (!isEnabled()) {
            return;
        }
        clusterLock.runIfAcquired(ScheduledJobClusterLock.name("MailingAutomazioniSegmenti"),
                Duration.ofMinutes(50), Duration.ofMinutes(5), () -> traccia("segmenti", this::triggerSegmenti));
    }

    /** Avvio manuale dal monitor dei job: tutti e tre i passaggi, in background. */
    public void runAsync() {
        if (isRunning()) {
            throw new IllegalStateException("Il job delle automazioni è già in esecuzione");
        }
        jobExecutor.submit(() -> traccia("esecuzione manuale", () -> {
            String a = triggerGiornalieri();
            String b = triggerSegmenti();
            String c = avanzaScadute();
            return a + " · " + b + " · " + c;
        }));
    }

    private void traccia(String fase, java.util.function.Supplier<String> lavoro) {
        inCorso.incrementAndGet();
        lastRunStartedAt = LocalDateTime.now();
        lastError = null;
        try {
            String esito = lavoro.get();
            lastMessage = fase + ": " + esito;
            if (esito != null && !esito.startsWith("0 ")) {
                logger.info("[JOB MAILING AUTOMAZIONI] {}", lastMessage);
            }
        } catch (Exception e) {
            lastError = e.getMessage();
            lastMessage = "Errore in " + fase + ": " + e.getMessage();
            logger.error("[JOB MAILING AUTOMAZIONI] Errore in {}", fase, e);
        } finally {
            lastRunFinishedAt = LocalDateTime.now();
            inCorso.decrementAndGet();
        }
    }

    // ───────────────────────── Lavoro ─────────────────────────

    /** Fa avanzare le iscrizioni scadute a lotti, entro il budget di tempo. */
    String avanzaScadute() {
        long inizio = System.nanoTime();
        int lavorate = 0;
        Set<Long> viste = new HashSet<>();
        while (Duration.ofNanos(System.nanoTime() - inizio).compareTo(BUDGET_AVANZAMENTO) < 0) {
            List<Long> ids = tx.execute(s -> iscrizioni.idsDaAvanzare(MailingTempo.adesso(), LOTTO));
            if (ids == null || ids.isEmpty()) {
                break;
            }
            int nuove = 0;
            for (Long id : ids) {
                if (!viste.add(id)) {
                    continue; // già tentata in questo giro (es. errore riprogrammato): al prossimo
                }
                nuove++;
                if (motore.avanza(id)) {
                    lavorate++;
                }
            }
            if (nuove == 0 || ids.size() < LOTTO) {
                break;
            }
        }
        return lavorate + " iscrizioni avanzate";
    }

    /** COMPLEANNO e INATTIVO_DA_GIORNI per tutte le automazioni attive. */
    String triggerGiornalieri() {
        LocalDateTime adesso = MailingTempo.adesso();
        LocalDate oggi = adesso.toLocalDate();
        int iscritti = 0;
        for (MailingAutomazione a : automazioni.findByStato(MailingAutomazione.Stato.ATTIVA)) {
            JsonNode trigger = json(a.getTriggerConfig());
            String tipo = MailingTrigger.tipo(trigger);
            boolean rientro = Boolean.TRUE.equals(a.getRientroConsentito());
            List<Long> candidati;
            String origine;
            if ("COMPLEANNO".equals(tipo)) {
                LocalDate compleanno = oggi.plusDays(MailingTrigger.giorniPrima(trigger));
                candidati = sql.candidatiCompleanno(a.getId(), compleanno,
                        rientro ? adesso.minusDays(GIORNI_TRA_COMPLEANNI) : null);
                origine = "COMPLEANNO";
            } else if ("INATTIVO_DA_GIORNI".equals(tipo)) {
                MailingTrigger.FinestraInattivi f = MailingTrigger.finestraInattivi(trigger, oggi, a.getAttivataIl());
                candidati = sql.candidatiInattivi(a.getId(), f.soglia(), f.ultimaMinima(), oggi,
                        rientro ? adesso.minusDays(GIORNI_TRA_RIATTIVAZIONI) : null, f.limite());
                origine = "INATTIVO_DA_GIORNI";
            } else {
                continue;
            }
            iscritti += iscriviTutti(a.getId(), candidati, origine);
        }
        return iscritti + " contatti iscritti da compleanni e inattività";
    }

    /** ENTRATA_SEGMENTO: chi soddisfa ora il segmento e non è mai entrato nell'automazione. */
    String triggerSegmenti() {
        int iscritti = 0;
        for (MailingAutomazione a : automazioni.findByStato(MailingAutomazione.Stato.ATTIVA)) {
            JsonNode trigger = json(a.getTriggerConfig());
            if (!"ENTRATA_SEGMENTO".equals(MailingTrigger.tipo(trigger))) {
                continue;
            }
            Long segmentoId = MailingTrigger.segmentoId(trigger);
            JsonNode regole = segmentoId == null ? null
                    : segmenti.findById(segmentoId).map(MailingSegmento::getRegole).map(this::json).orElse(null);
            if (regole == null) {
                logger.warn("[JOB MAILING AUTOMAZIONI] Automazione {}: segmento {} assente", a.getId(), segmentoId);
                continue;
            }
            Set<Long> gia = new HashSet<>(sql.contattiGiaIscritti(a.getId()));
            List<Long> candidati = segmentiService.contattiIds(regole).stream().filter(id -> !gia.contains(id)).toList();
            iscritti += iscriviTutti(a.getId(), candidati, "ENTRATA_SEGMENTO");
        }
        return iscritti + " contatti iscritti dai segmenti";
    }

    private int iscriviTutti(long automazioneId, List<Long> contattoIds, String origine) {
        int n = 0;
        for (Long contattoId : contattoIds) {
            try {
                if (motore.iscrivi(automazioneId, contattoId, origine, Map.of())) {
                    n++;
                }
            } catch (Exception e) {
                logger.warn("[JOB MAILING AUTOMAZIONI] Iscrizione contatto {} ad automazione {} fallita: {}",
                        contattoId, automazioneId, e.getMessage());
            }
        }
        return n;
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
