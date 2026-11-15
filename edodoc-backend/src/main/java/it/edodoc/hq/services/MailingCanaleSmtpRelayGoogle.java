package it.edodoc.hq.services;

import it.edodoc.hq.models.MailingMittente;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.springframework.stereotype.Component;

import java.util.Locale;
import java.util.Properties;

/**
 * Canale SMTP_RELAY_GOOGLE: {@code smtp-relay.gmail.com:587} STARTTLS con AUTH XOAUTH2 (token del Service Account
 * delegato sulla casella, scope {@value MailingGoogleClients#SCOPE_SMTP}). Richiede in Google Admin il servizio
 * "SMTP relay" con autenticazione SMTP e "solo indirizzi del dominio", più lo scope autorizzato per il Service Account.
 */
@Component
public class MailingCanaleSmtpRelayGoogle implements MailingCanale {

    static final String HOST = "smtp-relay.gmail.com";
    static final int PORTA = 587;

    private final MailingGoogleClients google;

    public MailingCanaleSmtpRelayGoogle(MailingGoogleClients google) {
        this.google = google;
    }

    @Override
    public MailingMittente.Canale tipo() {
        return MailingMittente.Canale.SMTP_RELAY_GOOGLE;
    }

    @Override
    public String invia(MailingMittente m, MimeMessage msg) throws MailingCanaleException {
        String token = google.tokenSmtp(m);
        Properties p = MailingCanaleSmtp.proprietaBase(HOST, PORTA, m.getEmail(), true);
        p.put("mail.smtp.auth.mechanisms", "XOAUTH2");
        p.put("mail.smtp.auth.login.disable", "true");
        p.put("mail.smtp.auth.plain.disable", "true");
        // smtp-relay vuole un EHLO con un nome di dominio, non il nome della macchina.
        String email = m.getEmail();
        p.put("mail.smtp.localhost", email.substring(email.indexOf('@') + 1).toLowerCase(Locale.ROOT));
        return MailingCanaleSmtp.consegna(Session.getInstance(p), HOST, PORTA, MailingGoogleClients.casella(m), token, msg);
    }
}
