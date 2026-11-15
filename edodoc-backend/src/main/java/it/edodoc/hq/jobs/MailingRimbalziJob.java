package it.edodoc.hq.jobs;

import it.edodoc.hq.models.Config;
import it.edodoc.hq.repositories.ConfigRepository;
import it.edodoc.hq.services.MailingRimbalziService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Email Marketing: ogni 10 minuti legge le caselle dei mittenti Google (Gmail API) per rimbalzi e risposte; alle 3:30
 * ricalcola punteggio dei contatti e ora di apertura preferita (invio intelligente). Non scrive a nessuno e non
 * tocca i messaggi della casella. Disattivabile con {@value #CONFIG_JOB_ENABLED}.
 */
@Component
public class MailingRimbalziJob {

    private static final Logger logger = LoggerFactory.getLogger(MailingRimbalziJob.class);
    public static final String CONFIG_JOB_ENABLED = "JOB_MAILING_RIMBALZI_ENABLED";
    public static final String SCHEDULE = "ogni 10 minuti; punteggi alle 3:30";

    private final ConfigRepository configRepository;
    private final MailingRimbalziService rimbalzi;
    private final ScheduledJobClusterLock clusterLock;
    private final AtomicBoolean inCorso = new AtomicBoolean(false);

    private volatile Instant lastRunStartedAt;
    private volatile Instant lastRunFinishedAt;
    private volatile String lastMessage;
    private volatile String lastError;

    public MailingRimbalziJob(ConfigRepository configRepository, MailingRimbalziService rimbalzi,
                              ScheduledJobClusterLock clusterLock) {
        this.configRepository = configRepository;
        this.rimbalzi = rimbalzi;
        this.clusterLock = clusterLock;
    }

    public boolean isEnabled() {
        return configRepository.findByChiave(CONFIG_JOB_ENABLED)
                .map(Config::getValore)
                .map(v -> "TRUE".equalsIgnoreCase(v.trim()))
                .orElse(false);
    }

    @Scheduled(cron = "0 */10 * * * *", zone = "Europe/Rome")
    public void controllaCaselle() {
        if (!isEnabled()) {
            return;
        }
        clusterLock.runIfAcquired(ScheduledJobClusterLock.name("MailingRimbalzi"), this::esegui);
    }

    @Scheduled(cron = "0 30 3 * * *", zone = "Europe/Rome")
    public void ricalcolaPunteggi() {
        if (!isEnabled()) {
            return;
        }
        clusterLock.runIfAcquired(ScheduledJobClusterLock.name("MailingPunteggi"), () -> {
            try {
                int[] r = rimbalzi.ricalcolaPunteggi();
                logger.info("[JOB MAILING] Punteggi aggiornati: {}, ore preferite: {}", r[0], r[1]);
            } catch (Exception e) {
                logger.error("[JOB MAILING] Ricalcolo punteggi non riuscito", e);
            }
        });
    }

    /** Lettura delle caselle (anche manuale dal monitor dei job). */
    public String esegui() {
        if (!inCorso.compareAndSet(false, true)) {
            return "Controllo già in corso";
        }
        lastRunStartedAt = Instant.now();
        try {
            MailingRimbalziService.Riepilogo r = rimbalzi.controllaTutti();
            lastMessage = r.rimbalzi() + " rimbalzi, " + r.risposte() + " risposte, " + r.disiscrizioni()
                    + " disiscrizioni via email" + (r.errori() > 0 ? ", " + r.errori() + " caselle non lette" : "");
            lastError = r.errori() > 0 ? "Alcune caselle non sono state lette: controlla la delega Gmail dei mittenti" : null;
            if (r.rimbalzi() + r.risposte() + r.disiscrizioni() > 0) {
                logger.info("[JOB MAILING] {}", lastMessage);
            }
            return lastMessage;
        } catch (Exception e) {
            lastError = e.getMessage();
            logger.error("[JOB MAILING] Controllo rimbalzi non riuscito", e);
            return "Errore: " + e.getMessage();
        } finally {
            lastRunFinishedAt = Instant.now();
            inCorso.set(false);
        }
    }

    public boolean isRunning() {
        return inCorso.get();
    }

    public Instant getLastRunStartedAt() {
        return lastRunStartedAt;
    }

    public Instant getLastRunFinishedAt() {
        return lastRunFinishedAt;
    }

    public String getLastMessage() {
        return lastMessage;
    }

    public String getLastError() {
        return lastError;
    }
}
