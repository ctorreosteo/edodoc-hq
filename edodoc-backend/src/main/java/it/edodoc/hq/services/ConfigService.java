package it.edodoc.hq.services;

import it.edodoc.hq.exception.RisorsaNonTrovataException;
import it.edodoc.hq.models.Config;
import it.edodoc.hq.repositories.ConfigRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

/** Valori che il dottore può cambiare senza un rilascio: listino, fisco, dati in fattura, interruttori. */
@Service
public class ConfigService {

    public static final String CALENDAR_ENABLED = "GOOGLE_CALENDAR_SYNC_ENABLED";
    public static final String GMAIL_ENABLED = "GOOGLE_GMAIL_INVIO_ENABLED";
    public static final String TESSERA_ENABLED = "TESSERA_SANITARIA_ENABLED";
    public static final String CLOUDFLARE_STREAM_ENABLED = "CLOUDFLARE_STREAM_ENABLED";
    public static final String PUSH_ENABLED = "PUSH_ENABLED";
    public static final String GOOGLE_ACCOUNT = "GOOGLE_ACCOUNT_EMAIL";
    public static final String CALENDAR_ID = "GOOGLE_CALENDAR_ID";
    public static final String CALENDAR_ULTIMO_SYNC = "GOOGLE_CALENDAR_ULTIMO_SYNC";
    public static final String PROSSIMO_NUMERO = "FATTURA_PROSSIMO_NUMERO";

    // Valori scritti dal sistema e mai mostrati in Impostazioni (segreti OAuth compresi)
    private static final Set<String> SOLO_SISTEMA = Set.of(CALENDAR_ULTIMO_SYNC,
            "YOUTUBE_OAUTH_REFRESH_TOKEN", "YOUTUBE_OAUTH_STATE",
            // Chiave privata del sigillo dei moduli firmati: non si mostra né si cambia da Impostazioni
            "ACCETTAZIONE_SIGILLO_P12", "ACCETTAZIONE_SIGILLO_P12_PASSWORD");

    private final ConfigRepository configRepository;

    public ConfigService(ConfigRepository configRepository) {
        this.configRepository = configRepository;
    }

    public String get(String chiave) {
        return configRepository.findByChiave(chiave).map(Config::getValore).orElse("");
    }

    public boolean isAttivo(String chiave) {
        return "true".equalsIgnoreCase(get(chiave).trim());
    }

    public BigDecimal getDecimale(String chiave) {
        String valore = get(chiave).trim();
        if (valore.isEmpty()) {
            throw new IllegalStateException("Configurazione mancante: " + chiave);
        }
        return new BigDecimal(valore);
    }

    @Transactional(readOnly = true)
    public List<Config> modificabili() {
        return configRepository.findAll(org.springframework.data.domain.Sort.by("chiave")).stream()
                .filter(c -> !SOLO_SISTEMA.contains(c.getChiave()))
                .toList();
    }

    @Transactional
    public Config aggiorna(String chiave, String valore) {
        if (SOLO_SISTEMA.contains(chiave)) {
            throw new IllegalArgumentException("Questo valore è gestito dal sistema");
        }
        Config config = configRepository.findByChiave(chiave)
                .orElseThrow(() -> new RisorsaNonTrovataException("Impostazione non trovata"));
        config.setValore(valore == null ? "" : valore.trim());
        return config;
    }

    @Transactional
    public void salvaDiSistema(String chiave, String valore) {
        configRepository.findByChiave(chiave).ifPresent(c -> c.setValore(valore));
    }
}
