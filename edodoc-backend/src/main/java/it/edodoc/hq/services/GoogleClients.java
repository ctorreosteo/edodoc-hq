package it.edodoc.hq.services;

import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.services.calendar.Calendar;
import com.google.api.services.calendar.CalendarScopes;
import com.google.api.services.gmail.Gmail;
import com.google.api.services.gmail.GmailScopes;
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

/**
 * Service Account con domain-wide delegation che impersona l'account Workspace del dottore,
 * lo stesso schema di Mobilitas. Credenziali in GOOGLE_CREDENTIALS_PATH, account in config.
 */
@Component
public class GoogleClients {

    private static final String APPLICATION_NAME = "EdoDoc HQ";

    private final ConfigService configService;
    private final String credentialsPath;

    public GoogleClients(ConfigService configService, @Value("${app.google.credentials-path:}") String credentialsPath) {
        this.configService = configService;
        this.credentialsPath = credentialsPath;
    }

    public boolean isConfigurato() {
        return !credentialsPath.isBlank() && Files.isReadable(Path.of(credentialsPath))
                && !account().isBlank();
    }

    public String account() {
        return configService.get(ConfigService.GOOGLE_ACCOUNT).trim();
    }

    public Calendar calendar() throws IOException, GeneralSecurityException {
        return new Calendar.Builder(GoogleNetHttpTransport.newTrustedTransport(), GsonFactory.getDefaultInstance(),
                new HttpCredentialsAdapter(credenziali(CalendarScopes.CALENDAR)))
                .setApplicationName(APPLICATION_NAME).build();
    }

    public Gmail gmail() throws IOException, GeneralSecurityException {
        return new Gmail.Builder(GoogleNetHttpTransport.newTrustedTransport(), GsonFactory.getDefaultInstance(),
                new HttpCredentialsAdapter(credenziali(GmailScopes.GMAIL_MODIFY)))
                .setApplicationName(APPLICATION_NAME).build();
    }

    private GoogleCredentials credenziali(String scope) throws IOException {
        if (!isConfigurato()) {
            throw new IntegrazioneDisattivataException("Account Google non ancora collegato: mancano le credenziali o l'account del dottore");
        }
        try (InputStream file = Files.newInputStream(Path.of(credentialsPath))) {
            return GoogleCredentials.fromStream(file).createScoped(List.of(scope)).createDelegated(account());
        }
    }
}
