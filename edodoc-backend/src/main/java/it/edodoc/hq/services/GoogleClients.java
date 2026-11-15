package it.edodoc.hq.services;

import com.google.api.client.http.HttpTransport;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.services.calendar.Calendar;
import com.google.api.services.calendar.CalendarScopes;
import com.google.api.services.gmail.Gmail;
import com.google.api.services.gmail.GmailScopes;
import com.google.auth.ServiceAccountSigner;
import com.google.auth.http.HttpCredentialsAdapter;
import com.google.auth.oauth2.GoogleCredentials;
import it.edodoc.hq.exception.IntegrazioneDisattivataException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.GeneralSecurityException;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Service Account con domain-wide delegation che impersona l'account Workspace del dottore,
 * lo stesso schema di Mobilitas. In locale la chiave sta in GOOGLE_CREDENTIALS_PATH; su Cloud Run
 * non esistono chiavi e il Service Account firma da sé via IAM (GOOGLE_SENZA_CHIAVE, vedi {@link DelegaSenzaChiave}).
 * Le credenziali restano in memoria: rinnovano il token solo quando scade.
 */
@Component
public class GoogleClients {

    private static final String APPLICATION_NAME = "EdoDoc HQ";

    private final ConfigService configService;
    private static final HttpTransport TRASPORTO = new NetHttpTransport();

    private final String credentialsPath;
    private final boolean senzaChiave;
    private final Map<String, GoogleCredentials> credenziali = new ConcurrentHashMap<>();

    public GoogleClients(ConfigService configService, @Value("${app.google.credentials-path:}") String credentialsPath,
                         @Value("${app.google.senza-chiave:false}") boolean senzaChiave) {
        this.configService = configService;
        this.credentialsPath = credentialsPath;
        this.senzaChiave = senzaChiave;
    }

    public boolean isConfigurato() {
        boolean conFile = !credentialsPath.isBlank() && Files.isReadable(Path.of(credentialsPath));
        return (senzaChiave || conFile) && !account().isBlank();
    }

    /** Il token negato da Google con la delega di dominio è quasi sempre lo scope non autorizzato in Google Admin. */
    public static boolean delegaNegata(IOException errore) {
        for (Throwable t = errore; t != null; t = t.getCause()) {
            String messaggio = t.getMessage() == null ? "" : t.getMessage().toLowerCase(Locale.ROOT);
            if (t instanceof DelegaSenzaChiave.DelegaNegataException || messaggio.contains("unauthorized_client")
                    || messaggio.contains("access_denied") || messaggio.startsWith("error getting access token")) {
                return true;
            }
        }
        return false;
    }

    public String account() {
        return configService.get(ConfigService.GOOGLE_ACCOUNT).trim();
    }

    public Calendar calendar() throws IOException, GeneralSecurityException {
        return new Calendar.Builder(TRASPORTO, GsonFactory.getDefaultInstance(),
                new HttpCredentialsAdapter(credenziali(CalendarScopes.CALENDAR)))
                .setApplicationName(APPLICATION_NAME).build();
    }

    public Gmail gmail() throws IOException, GeneralSecurityException {
        return new Gmail.Builder(TRASPORTO, GsonFactory.getDefaultInstance(),
                new HttpCredentialsAdapter(credenziali(GmailScopes.GMAIL_MODIFY)))
                .setApplicationName(APPLICATION_NAME).build();
    }

    private GoogleCredentials credenziali(String scope) throws IOException {
        return credenzialiDelegate(scope, account());
    }

    /**
     * Credenziali del Service Account che impersona {@code casella} (una casella del dominio Workspace, anche diversa
     * da quella del dottore: i mittenti dell'Email Marketing). Restano in cache come le altre.
     */
    public GoogleCredentials credenzialiDelegate(String scope, String casella) throws IOException {
        boolean conFile = !credentialsPath.isBlank() && Files.isReadable(Path.of(credentialsPath));
        if (!(senzaChiave || conFile) || casella == null || casella.isBlank()) {
            throw new IntegrazioneDisattivataException("Account Google non ancora collegato: mancano le credenziali o l'account del dottore");
        }
        String account = casella.trim();
        String chiave = scope + "|" + account;
        GoogleCredentials esistenti = credenziali.get(chiave);
        if (esistenti != null) {
            return esistenti;
        }
        GoogleCredentials nuove = senzaChiave ? senzaChiave(scope, account) : daFile(scope, account);
        credenziali.put(chiave, nuove);
        return nuove;
    }

    private GoogleCredentials daFile(String scope, String account) throws IOException {
        try (InputStream file = Files.newInputStream(Path.of(credentialsPath))) {
            return GoogleCredentials.fromStream(file).createScoped(List.of(scope)).createDelegated(account);
        }
    }

    private static GoogleCredentials senzaChiave(String scope, String account) throws IOException {
        GoogleCredentials ambiente = GoogleCredentials.getApplicationDefault();
        if (ambiente instanceof ServiceAccountSigner firmatario) {
            return new DelegaSenzaChiave(firmatario, account, scope);
        }
        throw new IOException("Le credenziali dell'ambiente non possono firmare: GOOGLE_SENZA_CHIAVE vale solo su Cloud Run");
    }
}
