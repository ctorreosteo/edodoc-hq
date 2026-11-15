package it.edodoc.hq.services;

import com.google.api.client.auth.oauth2.TokenResponseException;
import com.google.api.client.googleapis.json.GoogleJsonError;
import com.google.api.client.googleapis.json.GoogleJsonResponseException;
import com.google.api.client.http.HttpTransport;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.JsonFactory;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.services.gmail.Gmail;
import com.google.api.services.gmail.GmailScopes;
import com.google.auth.http.HttpCredentialsAdapter;
import com.google.auth.oauth2.AccessToken;
import com.google.auth.oauth2.GoogleCredentials;
import it.edodoc.hq.models.MailingMittente;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Accesso Google per i mittenti dell'Email Marketing: client Gmail (scope {@value #SCOPE_GMAIL}) sulla casella
 * impersonata dal Service Account e token OAuth per smtp-relay (scope {@value #SCOPE_SMTP}). Stesso schema di
 * {@link GoogleClients} ma con cache ed errori propri: qui gli errori diventano {@link MailingCanaleException}.
 */
@Component
public class MailingGoogleClients {

    public static final String SCOPE_GMAIL = GmailScopes.GMAIL_MODIFY;
    public static final String SCOPE_SMTP = "https://mail.google.com/";

    private static final JsonFactory JSON_FACTORY = GsonFactory.getDefaultInstance();
    private static final HttpTransport TRANSPORT = new NetHttpTransport();

    private final GoogleClients googleClients;
    private final Map<String, Gmail> gmail = new ConcurrentHashMap<>();
    private final Map<String, GoogleCredentials> credenzialiSmtp = new ConcurrentHashMap<>();

    public MailingGoogleClients(GoogleClients googleClients) {
        this.googleClients = googleClients;
    }

    /** Casella Workspace da impersonare: {@code casella_delegata} se c'è (alias "Invia come"), altrimenti l'email. */
    public static String casella(MailingMittente m) {
        return StringUtils.hasText(m.getCasellaDelegata()) ? m.getCasellaDelegata().trim().toLowerCase(Locale.ROOT)
                : m.getEmail().trim().toLowerCase(Locale.ROOT);
    }

    @FunctionalInterface
    public interface ChiamataGmail<T> {
        T esegui(Gmail gmail) throws IOException;
    }

    /** Chiamata Gmail sulla casella del mittente con gli errori tradotti. */
    public <T> T gmail(MailingMittente m, ChiamataGmail<T> chiamata) throws MailingCanaleException {
        String casella = casella(m);
        try {
            return chiamata.esegui(client(casella));
        } catch (GoogleJsonResponseException e) {
            throw tradotto(e, casella);
        } catch (IOException e) {
            if (tokenNegato(e) || GoogleClients.delegaNegata(e)) {
                gmail.remove(casella);
                throw new MailingCanaleException.NonConfigurato("in Google Admin autorizza lo scope " + SCOPE_GMAIL
                        + " per il Service Account (Delega a livello di dominio) sulla casella " + casella + ".", e);
            }
            throw new MailingCanaleException.Temporanea("Gmail non raggiungibile: " + e.getMessage(), e);
        }
    }

    /** Access token del Service Account delegato sulla casella, per AUTH XOAUTH2 su smtp-relay. */
    public String tokenSmtp(MailingMittente m) throws MailingCanaleException {
        String casella = casella(m);
        try {
            GoogleCredentials cred = credenzialiSmtp.get(casella);
            if (cred == null) {
                cred = googleClients.credenzialiDelegate(SCOPE_SMTP, casella);
                credenzialiSmtp.put(casella, cred);
            }
            cred.refreshIfExpired();
            AccessToken token = cred.getAccessToken();
            if (token == null || !StringUtils.hasText(token.getTokenValue())) {
                cred.refresh();
                token = cred.getAccessToken();
            }
            return token.getTokenValue();
        } catch (IOException e) {
            credenzialiSmtp.remove(casella);
            if (tokenNegato(e) || GoogleClients.delegaNegata(e)) {
                throw new MailingCanaleException.NonConfigurato("in Google Admin autorizza lo scope " + SCOPE_SMTP
                        + " per il Service Account (Delega a livello di dominio) sulla casella " + casella + ".", e);
            }
            throw new MailingCanaleException.Temporanea("Token Google non ottenuto: " + e.getMessage(), e);
        }
    }

    private Gmail client(String casella) throws IOException {
        Gmail cached = gmail.get(casella);
        if (cached != null) {
            return cached;
        }
        GoogleCredentials credentials = googleClients.credenzialiDelegate(SCOPE_GMAIL, casella);
        Gmail client = new Gmail.Builder(TRANSPORT, JSON_FACTORY, richiesta -> {
            new HttpCredentialsAdapter(credentials).initialize(richiesta);
            richiesta.setConnectTimeout(15_000);
            richiesta.setReadTimeout(60_000);
        }).setApplicationName("EdoDoc HQ Email Marketing").build();
        gmail.put(casella, client);
        return client;
    }

    static boolean tokenNegato(IOException e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof TokenResponseException) {
                return true;
            }
            if (t.getMessage() != null && t.getMessage().startsWith("Error getting access token")) {
                return true;
            }
        }
        return false;
    }

    private MailingCanaleException tradotto(GoogleJsonResponseException e, String casella) {
        GoogleJsonError dettagli = e.getDetails();
        String reason = dettagli != null && dettagli.getErrors() != null && !dettagli.getErrors().isEmpty()
                ? dettagli.getErrors().get(0).getReason() : null;
        String messaggio = dettagli != null ? dettagli.getMessage() : e.getMessage();
        if (e.getStatusCode() == 401 || e.getStatusCode() == 403 || e.getStatusCode() == 404) {
            gmail.remove(casella);
        }
        return traduciErroreGoogle(e.getStatusCode(), reason, messaggio, casella, e);
    }

    /**
     * Codice HTTP Google → tipo di errore. 429 e 5xx (e i 403 di quota) sono temporanei; 401/403/404 sulla casella
     * vogliono dire delega o utente sbagliati; 400 sul destinatario è permanente per quel contatto.
     */
    static MailingCanaleException traduciErroreGoogle(int codice, String reason, String messaggio, String casella,
                                                      Throwable causa) {
        String r = reason != null ? reason : "";
        String msg = messaggio != null ? messaggio : "";
        String msgLower = msg.toLowerCase(Locale.ROOT);
        if (codice == 429 || codice >= 500
                || r.contains("RateLimitExceeded") || r.contains("rateLimitExceeded") || r.contains("quotaExceeded")
                || r.contains("dailyLimitExceeded") || r.contains("backendError")
                || msgLower.contains("sending limit") || msgLower.contains("quota")) {
            return new MailingCanaleException.Temporanea("Google ha risposto " + codice + ": " + msg, causa);
        }
        if (codice == 401 || codice == 403) {
            return new MailingCanaleException.NonConfigurato("Google ha negato l'accesso alla casella " + casella
                    + " (" + msg + "). Controlla la delega del Service Account e lo scope " + SCOPE_GMAIL + ".", causa);
        }
        if (codice == 404) {
            return new MailingCanaleException.NonConfigurato("la casella " + casella
                    + " non esiste in Google Workspace: controlla \"casella delegata\" del mittente.", causa);
        }
        if (codice == 400 && (msgLower.contains("recipient") || msgLower.contains("to header")
                || msgLower.contains("invalid to") || msgLower.contains("address"))) {
            return new MailingCanaleException.Permanente("Indirizzo rifiutato da Gmail: " + msg, true, causa);
        }
        return new MailingCanaleException.Permanente("Gmail ha rifiutato il messaggio (" + codice + "): " + msg, false, causa);
    }
}
