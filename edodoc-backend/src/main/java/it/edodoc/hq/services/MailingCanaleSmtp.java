package it.edodoc.hq.services;

import it.edodoc.hq.models.MailingMittente;
import jakarta.mail.Address;
import jakarta.mail.AuthenticationFailedException;
import jakarta.mail.MessagingException;
import jakarta.mail.SendFailedException;
import jakarta.mail.Session;
import jakarta.mail.Transport;
import jakarta.mail.internet.MimeMessage;
import org.eclipse.angus.mail.smtp.SMTPAddressFailedException;
import org.eclipse.angus.mail.smtp.SMTPSendFailedException;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.util.Properties;

/**
 * Canale SMTP: server qualsiasi (domini fuori da Workspace). Host, porta e utente stanno sul mittente; la password
 * no: {@code smtp_password_env} è il nome della variabile d'ambiente che la contiene. La password non viene mai
 * loggata né restituita. Porta 465 = SSL implicito, le altre STARTTLS obbligatorio.
 * <p>
 * Contiene anche la consegna SMTP condivisa con {@link MailingCanaleSmtpRelayGoogle} e la traduzione degli errori.
 */
@Component
public class MailingCanaleSmtp implements MailingCanale {

    @Override
    public MailingMittente.Canale tipo() {
        return MailingMittente.Canale.SMTP;
    }

    @Override
    public String invia(MailingMittente m, MimeMessage msg) throws MailingCanaleException {
        if (!StringUtils.hasText(m.getSmtpHost())) {
            throw new MailingCanaleException.NonConfigurato("manca il server SMTP del mittente " + m.getEmail() + ".", null);
        }
        String password = null;
        if (StringUtils.hasText(m.getSmtpPasswordEnv())) {
            password = System.getenv(m.getSmtpPasswordEnv().trim());
            if (!StringUtils.hasText(password)) {
                throw new MailingCanaleException.NonConfigurato("la variabile d'ambiente " + m.getSmtpPasswordEnv().trim()
                        + " con la password SMTP non è impostata sul server.", null);
            }
        }
        int porta = m.getSmtpPorta() != null ? m.getSmtpPorta() : 587;
        Properties p = proprietaBase(m.getSmtpHost().trim(), porta, m.getEmail(), StringUtils.hasText(password));
        String utente = StringUtils.hasText(m.getSmtpUtente()) ? m.getSmtpUtente().trim() : m.getEmail();
        return consegna(Session.getInstance(p), m.getSmtpHost().trim(), porta, utente, password, msg);
    }

    static Properties proprietaBase(String host, int porta, String envelopeFrom, boolean auth) {
        Properties p = new Properties();
        p.put("mail.transport.protocol", porta == 465 ? "smtps" : "smtp");
        String pr = porta == 465 ? "mail.smtps." : "mail.smtp.";
        p.put(pr + "host", host);
        p.put(pr + "port", String.valueOf(porta));
        p.put(pr + "auth", String.valueOf(auth));
        if (porta != 465) {
            p.put("mail.smtp.starttls.enable", "true");
            p.put("mail.smtp.starttls.required", "true");
        }
        p.put(pr + "ssl.protocols", "TLSv1.2 TLSv1.3");
        p.put(pr + "ssl.checkserveridentity", "true");
        p.put(pr + "connectiontimeout", "15000");
        p.put(pr + "timeout", "60000");
        p.put(pr + "writetimeout", "60000");
        if (envelopeFrom != null) {
            // Mittente della busta: i rimbalzi tornano alla casella del mittente, dove li legge MailingRimbalziJob.
            p.put(pr + "from", envelopeFrom);
        }
        return p;
    }

    /** Apre la connessione, autentica, consegna. Ritorna il Message-ID del messaggio. */
    static String consegna(Session session, String host, int porta, String utente, String password, MimeMessage msg)
            throws MailingCanaleException {
        Transport t = null;
        try {
            msg.saveChanges();
            String protocollo = porta == 465 ? "smtps" : "smtp";
            t = session.getTransport(protocollo);
            if (password != null) {
                t.connect(host, porta, utente, password);
            } else {
                t.connect(host, porta, null, null);
            }
            Address[] destinatari = msg.getAllRecipients();
            t.sendMessage(msg, destinatari);
            return msg.getMessageID();
        } catch (MessagingException e) {
            throw traduci(e);
        } finally {
            if (t != null) {
                try {
                    t.close();
                } catch (MessagingException ignorata) {
                    // chiusura: niente da fare
                }
            }
        }
    }

    /** Errore jakarta.mail → tipo di errore del canale (5xx sul destinatario = permanente, 4xx = temporaneo). */
    static MailingCanaleException traduci(MessagingException e) {
        if (e instanceof AuthenticationFailedException) {
            return new MailingCanaleException.NonConfigurato(
                    "il server SMTP ha rifiutato le credenziali (" + pulito(e) + ").", e);
        }
        for (Exception x = e; x != null; x = x instanceof MessagingException me ? me.getNextException() : null) {
            if (x instanceof SMTPAddressFailedException af) {
                int codice = af.getReturnCode();
                return codice >= 500
                        ? new MailingCanaleException.Permanente("Indirizzo rifiutato (" + codice + "): " + pulito(af), true, e)
                        : new MailingCanaleException.Temporanea("Destinatario non disponibile (" + codice + "): " + pulito(af), e);
            }
        }
        if (e instanceof SMTPSendFailedException sf) {
            int codice = sf.getReturnCode();
            if (codice == 530 || codice == 535 || codice == 550 && pulito(sf).toLowerCase().contains("relay")) {
                return new MailingCanaleException.NonConfigurato("il server SMTP non accetta invii da questo mittente ("
                        + codice + ": " + pulito(sf) + "). Per smtp-relay Google controlla il servizio in Admin.", e);
            }
            return codice >= 500
                    ? new MailingCanaleException.Permanente("Messaggio rifiutato (" + codice + "): " + pulito(sf), false, e)
                    : new MailingCanaleException.Temporanea("Server SMTP occupato (" + codice + "): " + pulito(sf), e);
        }
        if (e instanceof SendFailedException sfe && sfe.getInvalidAddresses() != null && sfe.getInvalidAddresses().length > 0) {
            return new MailingCanaleException.Permanente("Indirizzo non valido: " + pulito(e), true, e);
        }
        Throwable causa = e.getCause();
        if (causa instanceof UnknownHostException) {
            return new MailingCanaleException.NonConfigurato("server SMTP inesistente (" + causa.getMessage() + ").", e);
        }
        if (causa instanceof ConnectException || causa instanceof SocketTimeoutException || causa instanceof IOException) {
            return new MailingCanaleException.Temporanea("Server SMTP non raggiungibile: " + pulito(e), e);
        }
        return new MailingCanaleException.Temporanea("Errore SMTP: " + pulito(e), e);
    }

    private static String pulito(Exception e) {
        String m = e.getMessage();
        return m == null ? e.getClass().getSimpleName() : m.replaceAll("\\s+", " ").trim();
    }
}
