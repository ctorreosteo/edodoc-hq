package it.edodoc.hq.jobs;

import it.edodoc.hq.models.Config;
import it.edodoc.hq.repositories.ConfigRepository;
import it.edodoc.hq.services.SocialConfigService;
import it.edodoc.hq.services.SocialPubblicazioniService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Pagina Social, ogni minuto: pubblica su Facebook e Instagram i post programmati arrivati all'ora.
 * Non scrive a pazienti, solo sulle pagine del dottore. Disattivabile con {@value #CONFIG_JOB_ENABLED};
 * fermo anche finche l'integrazione Social e spenta.
 */
@Component
public class SocialPubblicazioniJob {

    private static final Logger logger = LoggerFactory.getLogger(SocialPubblicazioniJob.class);
    public static final String CONFIG_JOB_ENABLED = "JOB_SOCIAL_PUBBLICAZIONI_ENABLED";

    private final ConfigRepository configRepository;
    private final SocialConfigService socialConfig;
    private final SocialPubblicazioniService pubblicazioni;

    public SocialPubblicazioniJob(ConfigRepository configRepository, SocialConfigService socialConfig,
                                  SocialPubblicazioniService pubblicazioni) {
        this.configRepository = configRepository;
        this.socialConfig = socialConfig;
        this.pubblicazioni = pubblicazioni;
    }

    public boolean isEnabled() {
        return configRepository.findByChiave(CONFIG_JOB_ENABLED)
                .map(Config::getValore)
                .map(v -> "TRUE".equalsIgnoreCase(v.trim()))
                .orElse(false);
    }

    @Scheduled(cron = "30 * * * * *", zone = "Europe/Rome")
    public void esegui() {
        if (!isEnabled() || !socialConfig.isUtilizzabile()) {
            return;
        }
        // Niente lock di cluster: se un domani girassero due istanze, prendiInCarico impedisce i doppioni
        try {
            int fatte = pubblicazioni.pubblicaScadute();
            if (fatte > 0) {
                logger.info("[JOB SOCIAL] {} post programmati pubblicati", fatte);
            }
        } catch (Exception e) {
            logger.error("[JOB SOCIAL] Errore nella pubblicazione dei post programmati", e);
        }
    }
}
