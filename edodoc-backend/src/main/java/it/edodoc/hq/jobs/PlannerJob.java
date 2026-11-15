package it.edodoc.hq.jobs;

import it.edodoc.hq.models.Config;
import it.edodoc.hq.repositories.ConfigRepository;
import it.edodoc.hq.services.PlannerMetricheService;
import it.edodoc.hq.services.PlannerPubblicazioneService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Planner social. Ogni minuto: pubblica i post arrivati all'ora sui canali collegati e avvisa per quelli da
 * pubblicare a mano ({@value #CONFIG_PUBBLICAZIONI}). Ogni ora: rilegge i numeri dei post usciti negli ultimi 30
 * giorni ({@value #CONFIG_METRICHE}). Non scrive a pazienti, solo sui profili social di EdoDoc.
 *
 * <p>Niente lock di cluster: EdoDoc gira a istanza singola, e comunque ogni post si prende in carico con un UPDATE
 * condizionato ({@code PlannerPostRepository.prendiInCarico}), che non lo fa partire due volte. Senza credenziali
 * nessuna chiamata esterna: i canali non collegati passano «da pubblicare a mano».
 */
@Component
public class PlannerJob {

    private static final Logger logger = LoggerFactory.getLogger(PlannerJob.class);
    public static final String CONFIG_PUBBLICAZIONI = "JOB_PLANNER_PUBBLICAZIONI_ENABLED";
    public static final String CONFIG_METRICHE = "JOB_PLANNER_METRICHE_ENABLED";

    private final ConfigRepository configRepository;
    private final PlannerPubblicazioneService pubblicazione;
    private final PlannerMetricheService metriche;

    public PlannerJob(ConfigRepository configRepository, PlannerPubblicazioneService pubblicazione,
                      PlannerMetricheService metriche) {
        this.configRepository = configRepository;
        this.pubblicazione = pubblicazione;
        this.metriche = metriche;
    }

    private boolean attivo(String chiave) {
        return configRepository.findByChiave(chiave)
                .map(Config::getValore)
                .map(v -> "TRUE".equalsIgnoreCase(v.trim()))
                .orElse(false);
    }

    @Scheduled(cron = "15 * * * * *", zone = "Europe/Rome")
    public void pubblicazioni() {
        if (!attivo(CONFIG_PUBBLICAZIONI)) {
            return;
        }
        try {
            int avviati = pubblicazione.pubblicaScaduti();
            if (avviati > 0) {
                logger.info("[JOB PLANNER] {} post avviati alla pubblicazione", avviati);
            }
        } catch (Exception e) {
            logger.error("[JOB PLANNER] Errore nella pubblicazione dei post programmati", e);
        }
    }

    @Scheduled(cron = "0 40 * * * *", zone = "Europe/Rome")
    public void metriche() {
        if (!attivo(CONFIG_METRICHE)) {
            return;
        }
        try {
            int n = metriche.aggiorna();
            if (n > 0) {
                logger.info("[JOB PLANNER] Numeri aggiornati per {} pubblicazioni", n);
            }
        } catch (Exception e) {
            logger.error("[JOB PLANNER] Errore nella lettura dei numeri dei post", e);
        }
    }
}
