package it.edodoc.hq.services;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Limite semplice per IP degli endpoint pubblici del mailing: finestra fissa di un minuto, in memoria (per istanza).
 * Basta a fermare raffiche e scanner; non è una difesa distribuita.
 */
@Component
public class MailingRateLimiter {

    private static final int MASSIMO_CHIAVI = 50_000;

    private record Finestra(long minuto, int conteggio) {
    }

    private final Map<String, Finestra> finestre = new ConcurrentHashMap<>();

    /** Vero se la richiesta rientra nel limite {@code massimoAlMinuto} per {@code gruppo + ip}. */
    public boolean consenti(String gruppo, String ip, int massimoAlMinuto) {
        return consenti(gruppo, ip, massimoAlMinuto, System.currentTimeMillis());
    }

    boolean consenti(String gruppo, String ip, int massimoAlMinuto, long oraMs) {
        long minuto = oraMs / 60_000L;
        if (finestre.size() > MASSIMO_CHIAVI) {
            finestre.entrySet().removeIf(e -> e.getValue().minuto() < minuto);
        }
        String chiave = gruppo + "|" + (ip != null ? ip : "?");
        Finestra f = finestre.compute(chiave, (k, v) -> v == null || v.minuto() != minuto
                ? new Finestra(minuto, 1) : new Finestra(minuto, v.conteggio() + 1));
        return f.conteggio() <= massimoAlMinuto;
    }
}
