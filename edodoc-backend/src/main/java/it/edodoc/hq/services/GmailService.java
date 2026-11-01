package it.edodoc.hq.services;

import com.google.api.services.gmail.model.Message;
import it.edodoc.hq.exception.IntegrazioneDisattivataException;
import jakarta.activation.DataHandler;
import jakarta.mail.MessagingException;
import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeBodyPart;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;
import jakarta.mail.util.ByteArrayDataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.Base64;
import java.util.Properties;

/** Invio dall'account Google del dottore, così le email restano nella sua posta inviata. */
@Service
public class GmailService {

    private static final Logger logger = LoggerFactory.getLogger(GmailService.class);

    private final GoogleClients googleClients;
    private final ConfigService configService;

    public GmailService(GoogleClients googleClients, ConfigService configService) {
        this.googleClients = googleClients;
        this.configService = configService;
    }

    public boolean isAttivo() {
        return configService.isAttivo(ConfigService.GMAIL_ENABLED) && googleClients.isConfigurato();
    }

    public String mittente() {
        return googleClients.account();
    }

    public void invia(String destinatario, String oggetto, CorpoEmail corpo, String nomeAllegato, byte[] allegato) {
        if (!isAttivo()) {
            throw new IntegrazioneDisattivataException("L'invio email non è ancora attivo: collega l'account Google in Impostazioni");
        }
        try {
            byte[] grezzo = mime(googleClients.account(), destinatario, oggetto, corpo, nomeAllegato, allegato);
            Message messaggio = new Message().setRaw(Base64.getUrlEncoder().encodeToString(grezzo));
            googleClients.gmail().users().messages().send("me", messaggio).execute();
        } catch (IOException | GeneralSecurityException | MessagingException e) {
            logger.warn("Invio email fallito: {}", e.getMessage());
            throw new IllegalStateException("Google non ha accettato l'email: riprova più tardi", e);
        }
    }

    /** Testo e HTML sono alternative dello stesso messaggio; l'allegato sta accanto a entrambe. */
    static byte[] mime(String mittente, String destinatario, String oggetto, CorpoEmail corpo,
                       String nomeAllegato, byte[] allegato) throws MessagingException, IOException {
        MimeMessage messaggio = new MimeMessage(Session.getInstance(new Properties()));
        messaggio.setFrom(new InternetAddress(mittente));
        messaggio.setRecipient(jakarta.mail.Message.RecipientType.TO, new InternetAddress(destinatario));
        messaggio.setSubject(oggetto, StandardCharsets.UTF_8.name());

        MimeBodyPart testo = new MimeBodyPart();
        testo.setText(corpo.testo(), StandardCharsets.UTF_8.name());
        MimeBodyPart contenuto = testo;
        if (corpo.html() != null) {
            MimeBodyPart html = new MimeBodyPart();
            html.setContent(corpo.html(), "text/html; charset=UTF-8");
            MimeMultipart alternative = new MimeMultipart("alternative");
            alternative.addBodyPart(testo);
            alternative.addBodyPart(html);
            contenuto = new MimeBodyPart();
            contenuto.setContent(alternative);
        }
        MimeMultipart parti = new MimeMultipart();
        parti.addBodyPart(contenuto);
        if (allegato != null) {
            MimeBodyPart file = new MimeBodyPart();
            file.setDataHandler(new DataHandler(new ByteArrayDataSource(allegato, "application/pdf")));
            file.setFileName(nomeAllegato);
            parti.addBodyPart(file);
        }
        messaggio.setContent(parti);

        ByteArrayOutputStream uscita = new ByteArrayOutputStream();
        messaggio.writeTo(uscita);
        return uscita.toByteArray();
    }
}
