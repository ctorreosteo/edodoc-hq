package it.edodoc.hq.services;

import it.edodoc.hq.repositories.ConfigRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Configurazione della pagina Meta (pagine Facebook e profili Instagram collegati), letta in un punto solo.
 *
 * <p>I <b>secret</b> (token, app secret, verify token) stanno nelle properties/env, l'<b>interruttore</b>
 * nella tabella {@code config} ({@value #CONFIG_ABILITATA}), cosi si accende senza rideployare.
 *
 * <p>Un solo token (System User del Business Manager, non scadente) basta per tutte le pagine: gli account
 * si scoprono da {@code /me/accounts} insieme ai token di pagina, che non lasciano mai il backend.
 */
@Service
public class SocialConfigService {

    public static final String CONFIG_ABILITATA = "SOCIAL_INTEGRAZIONE_ABILITATA";
    public static final String CONFIG_INTERVALLO_AGGIORNAMENTO = "SOCIAL_INTERVALLO_AGGIORNAMENTO_SECONDI";

    private static final int INTERVALLO_DEFAULT_SECONDI = 60;
    private static final int INTERVALLO_MINIMO_SECONDI = 15;
    private static final int INTERVALLO_MASSIMO_SECONDI = 900;

    private final ConfigRepository configRepository;

    @Value("${meta.social.base-url:https://graph.facebook.com}")
    private String baseUrl;

    @Value("${meta.social.versione:v25.0}")
    private String versione;

    @Value("${meta.social.access-token:}")
    private String accessToken;

    /** Allowlist opzionale (CSV di page id): vuota = tutte le pagine a cui il token ha accesso. */
    @Value("${meta.social.page-ids:}")
    private String pageIds;

    /** Firma HMAC-SHA256 dei webhook (header X-Hub-Signature-256). */
    @Value("${meta.social.app-secret:}")
    private String appSecret;

    @Value("${meta.social.verify-token:}")
    private String verifyToken;

    @Value("${meta.social.integrazione-abilitata:}")
    private String integrazioneAbilitataEnv;

    @Value("${meta.social.webhook-firma-obbligatoria:true}")
    private boolean webhookFirmaObbligatoria;

    public SocialConfigService(ConfigRepository configRepository) {
        this.configRepository = configRepository;
    }

    /** Interruttore: prima la env {@code SOCIAL_INTEGRAZIONE_ABILITATA}, poi la tabella config. */
    public boolean isAbilitata() {
        if (StringUtils.hasText(integrazioneAbilitataEnv)) {
            return Boolean.parseBoolean(integrazioneAbilitataEnv.trim());
        }
        return configRepository.findByChiave(CONFIG_ABILITATA)
                .map(c -> Boolean.parseBoolean(c.getValore() == null ? "" : c.getValore().trim()))
                .orElse(false);
    }

    public boolean isConfigurata() {
        return StringUtils.hasText(accessToken);
    }

    /** True solo se l'interruttore e acceso e c'e il token. */
    public boolean isUtilizzabile() {
        return isAbilitata() && isConfigurata();
    }

    /** Il webhook puo essere registrato su Meta (verify token + app secret presenti). */
    public boolean isWebhookConfigurato() {
        return StringUtils.hasText(verifyToken) && StringUtils.hasText(appSecret);
    }

    public boolean isFirmaObbligatoria() {
        return webhookFirmaObbligatoria;
    }

    /** Perche la pagina non funziona, in una frase. Non nomina mai il valore di un secret. */
    public String motivoIndisponibilita() {
        if (!isAbilitata()) {
            return "L'integrazione con Facebook e Instagram non è ancora attiva: va acceso l'interruttore "
                    + CONFIG_ABILITATA + " nella configurazione del gestionale.";
        }
        if (!isConfigurata()) {
            return "L'integrazione Meta è accesa ma manca il token (META_SOCIAL_ACCESS_TOKEN). "
                    + "Contatta chi gestisce la configurazione del gestionale.";
        }
        return "";
    }

    public int intervalloAggiornamentoSecondi() {
        int valore = configRepository.findByChiave(CONFIG_INTERVALLO_AGGIORNAMENTO)
                .map(c -> {
                    try {
                        return Integer.parseInt(c.getValore() == null ? "" : c.getValore().trim());
                    } catch (NumberFormatException e) {
                        return INTERVALLO_DEFAULT_SECONDI;
                    }
                })
                .orElse(INTERVALLO_DEFAULT_SECONDI);
        if (valore <= 0) {
            return 0;
        }
        return Math.min(Math.max(valore, INTERVALLO_MINIMO_SECONDI), INTERVALLO_MASSIMO_SECONDI);
    }

    public Set<String> pageIdAmmessi() {
        if (!StringUtils.hasText(pageIds)) {
            return Set.of();
        }
        return Arrays.stream(pageIds.split(","))
                .map(String::trim)
                .filter(StringUtils::hasText)
                .collect(Collectors.toUnmodifiableSet());
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public String getVersione() {
        return versione;
    }

    public String getAccessToken() {
        return accessToken;
    }

    public String getAppSecret() {
        return appSecret;
    }

    public String getVerifyToken() {
        return verifyToken;
    }
}
