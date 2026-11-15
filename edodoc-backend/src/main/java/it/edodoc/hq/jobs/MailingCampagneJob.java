package it.edodoc.hq.jobs;

import it.edodoc.hq.models.Config;
import it.edodoc.hq.repositories.ConfigRepository;
import it.edodoc.hq.services.MailingCampagneService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;

/**
 * Email Marketing, ogni minuto (in pratica ogni 2, per il lock minimo dei job): avvia le campagne programmate
 * arrivate all'ora (le mette in coda), decide i test A/B scaduti e chiude le campagne rimaste senza coda.
 * Non spedisce nulla: l'invio vero è di {@link MailingInvioWorker}. Usa lo stesso interruttore del worker
 * ({@value MailingInvioWorker#CONFIG_JOB_ENABLED}).
 */
@Component
public class MailingCampagneJob {

    private static final Logger logger = LoggerFactory.getLogger(MailingCampagneJob.class);
    public static final String SCHEDULE = "ogni minuto";

    private final ConfigRepository configRepository;
    private final MailingCampagneService campagne;
    private final ScheduledJobClusterLock clusterLock;

    private volatile boolean running;
    private volatile Instant lastRunStartedAt;
    private volatile Instant lastRunFinishedAt;
    private volatile String lastMessage;
    private volatile String lastError;

    public MailingCampagneJob(ConfigRepository configRepository, MailingCampagneService campagne,
                              ScheduledJobClusterLock clusterLock) {
        this.configRepository = configRepository;
        this.campagne = campagne;
        this.clusterLock = clusterLock;
    }

    public boolean isEnabled() {
        return configRepository.findByChiave(MailingInvioWorker.CONFIG_JOB_ENABLED)
                .map(Config::getValore)
                .map(v -> "TRUE".equalsIgnoreCase(v.trim()))
                .orElse(false);
    }

    @Scheduled(cron = "20 * * * * *", zone = "Europe/Rome")
    public void esegui() {
        if (!isEnabled()) {
            return;
        }
        clusterLock.runIfAcquired(ScheduledJobClusterLock.name("MailingCampagne"), () -> {
            running = true;
            lastRunStartedAt = Instant.now();
            try {
                int avviate = campagne.avviaProgrammateScadute();
                int decise = campagne.decidiTestAbScaduti();
                int concluse = campagne.completaFinite();
                lastMessage = avviate + " programmate avviate, " + decise + " test A/B decisi, " + concluse + " concluse";
                lastError = null;
                if (avviate + decise + concluse > 0) {
                    logger.info("[JOB MAILING] {}", lastMessage);
                }
            } catch (Exception e) {
                lastError = e.getMessage();
                logger.error("[JOB MAILING] Errore sulle campagne programmate", e);
            } finally {
                running = false;
                lastRunFinishedAt = Instant.now();
            }
        });
    }

    public boolean isRunning() {
        return running;
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
