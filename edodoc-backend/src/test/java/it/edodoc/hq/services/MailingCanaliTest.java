package it.edodoc.hq.services;

import jakarta.mail.AuthenticationFailedException;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.InternetAddress;
import org.eclipse.angus.mail.smtp.SMTPAddressFailedException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MailingCanaliTest {

    @Test
    void erroriGoogle429E5xxTemporanei() {
        assertInstanceOf(MailingCanaleException.Temporanea.class,
                MailingGoogleClients.traduciErroreGoogle(429, "rateLimitExceeded", "Too many", "x@y.it", null));
        assertInstanceOf(MailingCanaleException.Temporanea.class,
                MailingGoogleClients.traduciErroreGoogle(503, null, "Backend", "x@y.it", null));
        assertInstanceOf(MailingCanaleException.Temporanea.class,
                MailingGoogleClients.traduciErroreGoogle(403, "userRateLimitExceeded", "User-rate limit exceeded", "x@y.it", null));
    }

    @Test
    void erroriGoogleDiDelegaNonConfigurati() {
        MailingCanaleException e = MailingGoogleClients.traduciErroreGoogle(403, "forbidden", "Delegation denied", "x@y.it", null);
        assertInstanceOf(MailingCanaleException.NonConfigurato.class, e);
        assertTrue(e.getMessage().startsWith(MailingCanaleException.NON_CONFIGURATO + ":"));
        assertInstanceOf(MailingCanaleException.NonConfigurato.class,
                MailingGoogleClients.traduciErroreGoogle(404, null, "Not found", "x@y.it", null));
    }

    @Test
    void erroreGoogleSulDestinatarioPermanente() {
        MailingCanaleException e = MailingGoogleClients.traduciErroreGoogle(400, "invalidArgument", "Invalid To header", "x@y.it", null);
        assertInstanceOf(MailingCanaleException.Permanente.class, e);
        assertTrue(((MailingCanaleException.Permanente) e).isPerDestinatario());
    }

    @Test
    void erroriSmtpTradotti() throws Exception {
        assertInstanceOf(MailingCanaleException.NonConfigurato.class,
                MailingCanaleSmtp.traduci(new AuthenticationFailedException("535 bad credentials")));
        MessagingException perm = new MessagingException("send failed",
                new SMTPAddressFailedException(new InternetAddress("a@b.it"), "RCPT", 550, "5.1.1 user unknown"));
        perm.setNextException(new SMTPAddressFailedException(new InternetAddress("a@b.it"), "RCPT", 550, "5.1.1 user unknown"));
        MailingCanaleException p = MailingCanaleSmtp.traduci(perm);
        assertInstanceOf(MailingCanaleException.Permanente.class, p);
        assertTrue(((MailingCanaleException.Permanente) p).isPerDestinatario());
        MessagingException temp = new MessagingException("x");
        temp.setNextException(new SMTPAddressFailedException(new InternetAddress("a@b.it"), "RCPT", 452, "4.2.2 mailbox full"));
        assertInstanceOf(MailingCanaleException.Temporanea.class, MailingCanaleSmtp.traduci(temp));
        assertFalse(MailingCanaleSmtp.traduci(new MessagingException("boh")) instanceof MailingCanaleException.Permanente);
    }
}
