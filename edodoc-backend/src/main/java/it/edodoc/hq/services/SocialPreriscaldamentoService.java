package it.edodoc.hq.services;

import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Tiene calda la cache della pagina Meta, perche chi la apre non aspetti mai Meta.
 *
 * <p>Ogni {@value #OGNI_SECONDI} secondi, per ogni pagina collegata, richiede panoramica (7, 14 e 28 giorni), contenuti,
 * commenti e conversazioni: con {@link SocialCache} (stale-while-revalidate) la richiesta ricalcola in background
 * cio che e scaduto. Parte anche all'avvio dell'istanza.
 *
 * <p><b>Non e un {@code @Scheduled}</b> di proposito: la cache e per istanza e va scaldata su ognuna, e un
 * giro lento non deve occupare il thread condiviso dei job.
 */
@Service
public class SocialPreriscaldamentoService {

    private static final Logger logger = LoggerFactory.getLogger(SocialPreriscaldamentoService.class);

    static final int OGNI_SECONDI = 45;

    private final SocialConfigService configService;
    private final SocialAccountService accountService;
    private final SocialInsightsService insights;
    private final SocialCommentiService commenti;
    private final SocialMessaggiService messaggi;

    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "social-preriscaldamento");
        t.setDaemon(true);
        return t;
    });

    public SocialPreriscaldamentoService(SocialConfigService configService, SocialAccountService accountService,
                                         SocialInsightsService insights, SocialCommentiService commenti,
                                         SocialMessaggiService messaggi) {
        this.configService = configService;
        this.accountService = accountService;
        this.insights = insights;
        this.commenti = commenti;
        this.messaggi = messaggi;
    }

    @EventListener(ApplicationReadyEvent.class)
    void avvia() {
        scheduler.scheduleWithFixedDelay(this::giro, 5, OGNI_SECONDI, TimeUnit.SECONDS);
    }

    @PreDestroy
    void chiudi() {
        scheduler.shutdownNow();
    }

    private void giro() {
        try {
            if (!configService.isUtilizzabile()) {
                return;
            }
            accountService.account().forEach(a -> {
                inbox(a.pageId());
                avvia(() -> insights.contenuti(a.pageId(), "TUTTE", 50));
                // Tutti e tre i periodi del selettore: cambiare periodo non deve mai aspettare Meta.
                for (int giorni : new int[] {28, 7, 14}) {
                    avvia(() -> insights.panoramica(a.pageId(), giorni));
                }
            });
        } catch (Exception e) {
            logger.debug("Meta: preriscaldamento saltato: {}", e.getMessage());
        }
    }

    /** Commenti e conversazioni della pagina: dopo un webhook, cosi la rilettura del frontend trova il calcolo gia avviato. */
    public void inbox(String pageId) {
        avvia(() -> commenti.elenco(pageId, "TUTTE"));
        avvia(() -> messaggi.conversazioni(pageId, "TUTTE"));
    }

    private static void avvia(Runnable lettura) {
        CompletableFuture.runAsync(() -> {
            try {
                lettura.run();
            } catch (Exception e) {
                logger.debug("Meta: preriscaldamento di una sezione fallito: {}", e.getMessage());
            }
        });
    }
}
