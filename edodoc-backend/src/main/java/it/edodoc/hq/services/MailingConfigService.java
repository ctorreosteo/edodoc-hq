package it.edodoc.hq.services;

import it.edodoc.hq.models.Config;
import it.edodoc.hq.repositories.ConfigRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * Configurazione dell'Email Marketing letta in un punto solo. Interruttori e tuning nella tabella {@code config}
 * (si cambiano senza rideploy), URL pubblici nelle properties ({@code app.mailing.*}).
 */
@Service
public class MailingConfigService {

    public static final String CONFIG_INVIO_ABILITATO = "MAILING_INVIO_ABILITATO";
    /**
     * Interruttore di sistema, solo da database: se non è "true" non parte nessuna email (campagne, automazioni,
     * prove, verifica mittenti), qualunque cosa dica l'interruttore della pagina.
     */
    public static final String CONFIG_INVIO_EMAIL_ENABLED = "MAILING_INVIO_ENABLED";
    public static final String CONFIG_INDIRIZZO_POSTALE = "MAILING_INDIRIZZO_POSTALE";
    public static final String CONFIG_FINESTRA_ATTRIBUZIONE = "MAILING_FINESTRA_ATTRIBUZIONE_GIORNI";

    static final int FINESTRA_DEFAULT = 7;
    static final int FINESTRA_MIN = 1;
    static final int FINESTRA_MAX = 90;

    private final ConfigRepository configRepository;

    @Value("${app.mailing.url-pubblico:http://localhost:8081}")
    private String urlPubblico;

    @Value("${app.mailing.url-preferenze:http://localhost:5174/preferenze-email}")
    private String urlPreferenze;

    public MailingConfigService(ConfigRepository configRepository) {
        this.configRepository = configRepository;
    }

    // ── Interruttori ──

    public boolean invioAbilitato() {
        return vero(valore(CONFIG_INVIO_ABILITATO));
    }

    /** Interruttore di sistema {@value #CONFIG_INVIO_EMAIL_ENABLED}: assente o diverso da "true" = spento. */
    public boolean invioEmailDiSistemaAttivo() {
        return vero(valore(CONFIG_INVIO_EMAIL_ENABLED));
    }

    @Transactional
    public void impostaInvioAbilitato(boolean abilitato) {
        scrivi(CONFIG_INVIO_ABILITATO, abilitato ? "true" : "false",
                "Email Marketing: interruttore generale degli invii (campagne e automazioni). Spento = la coda resta ferma");
    }

    /** Interruttore di un job ({@code JOB_MAILING_*_ENABLED}): acceso solo se il valore e "true". */
    public boolean jobAbilitato(String chiave) {
        return StringUtils.hasText(chiave) && vero(valore(chiave.trim()));
    }

    // ── Valori ──

    /** Senza slash finale, es. https://...run.app */
    public String urlPubblico() {
        return senzaSlashFinale(urlPubblico);
    }

    public String urlPreferenze() {
        return senzaSlashFinale(urlPreferenze);
    }

    public String indirizzoPostale() {
        String v = valore(CONFIG_INDIRIZZO_POSTALE);
        return StringUtils.hasText(v) ? v.trim() : "Dr. Edoardo Bo";
    }

    @Transactional
    public void impostaIndirizzoPostale(String indirizzo) {
        if (!StringUtils.hasText(indirizzo)) {
            throw new IllegalArgumentException("L'indirizzo postale è obbligatorio: la legge lo richiede in ogni email.");
        }
        String pulito = indirizzo.trim();
        if (pulito.length() > 500) {
            throw new IllegalArgumentException("L'indirizzo postale è troppo lungo (massimo 500 caratteri).");
        }
        scrivi(CONFIG_INDIRIZZO_POSTALE, pulito,
                "Email Marketing: ragione sociale e indirizzo in fondo a ogni email (obbligatorio per legge)");
    }

    public int finestraAttribuzioneGiorni() {
        return finestraDa(valore(CONFIG_FINESTRA_ATTRIBUZIONE));
    }

    @Transactional
    public void impostaFinestraAttribuzioneGiorni(int giorni) {
        if (giorni < FINESTRA_MIN || giorni > FINESTRA_MAX) {
            throw new IllegalArgumentException("La finestra di attribuzione va da " + FINESTRA_MIN + " a "
                    + FINESTRA_MAX + " giorni.");
        }
        scrivi(CONFIG_FINESTRA_ATTRIBUZIONE, String.valueOf(giorni),
                "Email Marketing: giorni dopo un click entro cui visita o acquisto si attribuiscono alla email");
    }

    // ── Helper ──

    static int finestraDa(String valore) {
        if (!StringUtils.hasText(valore)) {
            return FINESTRA_DEFAULT;
        }
        try {
            int n = Integer.parseInt(valore.trim());
            return Math.min(Math.max(n, FINESTRA_MIN), FINESTRA_MAX);
        } catch (NumberFormatException e) {
            return FINESTRA_DEFAULT;
        }
    }

    static String senzaSlashFinale(String url) {
        if (url == null) {
            return "";
        }
        String u = url.trim();
        while (u.endsWith("/")) {
            u = u.substring(0, u.length() - 1);
        }
        return u;
    }

    private static boolean vero(String valore) {
        return valore != null && "true".equalsIgnoreCase(valore.trim());
    }

    private String valore(String chiave) {
        return configRepository.findByChiave(chiave).map(Config::getValore).orElse(null);
    }

    private void scrivi(String chiave, String valore, String descrizione) {
        Config config = configRepository.findByChiave(chiave).orElseGet(() -> {
            Config nuova = new Config();
            nuova.setChiave(chiave);
            nuova.setDescrizione(descrizione);
            return nuova;
        });
        config.setValore(valore);
        configRepository.save(config);
    }
}
