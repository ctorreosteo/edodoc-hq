package it.edodoc.hq.services;

import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Supplier;

/**
 * Cache delle letture Graph della pagina Meta, pensata perche la pagina risponda subito.
 *
 * <ul>
 *   <li><b>stale-while-revalidate</b>: scaduto il TTL si restituisce comunque l'ultimo valore (fino a
 *       {@link #MASSIMA_VECCHIAIA}) e lo si ricalcola in background. Meta e lento (una panoramica sono
 *       decine di chiamate), chi apre la pagina non deve aspettarlo;</li>
 *   <li><b>single-flight</b>: richieste concorrenti per la stessa chiave aspettano lo stesso calcolo invece di
 *       moltiplicare le chiamate a Meta (che ha limiti per pagina);</li>
 *   <li>le chiavi iniziano col page id, cosi webhook e azioni invalidano cio che riguarda quella pagina.</li>
 * </ul>
 *
 * <p>La cache e per istanza: la tiene calda {@code SocialPreriscaldamentoJob}.
 */
@Component
public class SocialCache {

    private static final Logger logger = LoggerFactory.getLogger(SocialCache.class);

    /** Oltre questa eta un valore scaduto non si mostra piu: si aspetta il ricalcolo. */
    static final Duration MASSIMA_VECCHIAIA = Duration.ofHours(6);

    private record Voce(long calcolatoIl, long scadeIl, Object valore) {
    }

    private final Map<String, Voce> voci = new ConcurrentHashMap<>();
    private final Map<String, CompletableFuture<Object>> inCorso = new ConcurrentHashMap<>();

    /*
     * Pool senza limite fisso: un calcolo puo aspettarne un altro (la panoramica legge contenuti e commenti
     * dalla cache) e con pochi thread si bloccherebbero a vicenda. Il numero di calcoli e comunque limitato dal
     * single-flight: al massimo uno per chiave.
     */
    private final ExecutorService esecutore = Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "social-cache");
        t.setDaemon(true);
        return t;
    });

    @PreDestroy
    void chiudi() {
        esecutore.shutdownNow();
    }

    public <T> T ottieni(String pageId, String chiave, Duration ttl, Supplier<T> calcolo) {
        String k = pageId + ":" + chiave;
        long adesso = System.currentTimeMillis();
        Voce v = voci.get(k);
        if (v != null && v.scadeIl() > adesso) {
            return valore(v);
        }
        if (v != null && adesso - v.calcolatoIl() < MASSIMA_VECCHIAIA.toMillis()) {
            avvia(k, ttl, calcolo);
            return valore(v);
        }
        try {
            return valore(avvia(k, ttl, calcolo).join());
        } catch (CompletionException e) {
            if (e.getCause() instanceof RuntimeException re) {
                throw re;
            }
            if (e.getCause() instanceof Error err) {
                throw err;
            }
            throw e;
        }
    }

    /** Ricalcola in background anche se il valore e ancora fresco (preriscaldamento). */
    public <T> void aggiornaInBackground(String pageId, String chiave, Duration ttl, Supplier<T> calcolo) {
        avvia(pageId + ":" + chiave, ttl, calcolo);
    }

    /** Il valore c'e ed e ancora fresco: il preriscaldamento puo saltarlo. */
    public boolean fresco(String pageId, String chiave, Duration margine) {
        Voce v = voci.get(pageId + ":" + chiave);
        return v != null && v.scadeIl() - margine.toMillis() > System.currentTimeMillis();
    }

    @SuppressWarnings("unchecked")
    private static <T> T valore(Object v) {
        return (T) (v instanceof Voce voce ? voce.valore() : v);
    }

    private <T> CompletableFuture<Object> avvia(String k, Duration ttl, Supplier<T> calcolo) {
        CompletableFuture<Object> nuovo = new CompletableFuture<>();
        CompletableFuture<Object> esistente = inCorso.putIfAbsent(k, nuovo);
        if (esistente != null) {
            return esistente;
        }
        esecutore.execute(() -> {
            long inizio = System.currentTimeMillis();
            try {
                T valore = calcolo.get();
                long fine = System.currentTimeMillis();
                // Prima il valore, poi via dal "in corso": chi arriva in mezzo trova gia il dato fresco.
                voci.put(k, new Voce(fine, fine + ttl.toMillis(), valore));
                inCorso.remove(k, nuovo);
                nuovo.complete(valore);
                if (fine - inizio > 3000) {
                    logger.info("Meta: {} ricalcolato in {} ms", k, fine - inizio);
                }
            } catch (Throwable e) {
                inCorso.remove(k, nuovo);
                nuovo.completeExceptionally(e);
                logger.warn("Meta: ricalcolo di {} fallito: {}", k, e.getMessage());
            }
        });
        return nuovo;
    }

    /**
     * Invalida le voci della pagina che iniziano col prefisso indicato (null = tutte). Dopo un'azione o un webhook
     * il dato vecchio e sbagliato: la prossima lettura aspetta il ricalcolo (o si aggancia a quello in corso).
     */
    public void invalida(String pageId, String prefisso) {
        String k = pageId + ":" + (prefisso == null ? "" : prefisso);
        voci.keySet().removeIf(chiave -> chiave.startsWith(k));
    }

    /**
     * Segna come scadute le voci col prefisso senza buttarle: si continua a mostrarle mentre si ricalcolano.
     * Per i dati lenti e poco urgenti (statistiche), dove un minuto di ritardo non sbaglia niente.
     */
    public void segnaScaduto(String pageId, String prefisso) {
        String k = pageId + ":" + (prefisso == null ? "" : prefisso);
        voci.replaceAll((chiave, v) -> chiave.startsWith(k) ? new Voce(v.calcolatoIl(), 0, v.valore()) : v);
    }

    public void invalidaTutto() {
        voci.clear();
    }
}
