package it.edodoc.hq.services;

import com.google.api.services.gmail.model.Message;
import it.edodoc.hq.models.MailingMittente;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Base64;
import java.util.List;

/**
 * Canale GMAIL_API: {@code users.messages.send} sulla casella impersonata dal Service Account. Per un alias
 * "Invia come" il From del messaggio è l'alias ({@code email} del mittente) e la casella è {@code casella_delegata}:
 * l'alias deve essere configurato in Gmail su quella casella, altrimenti Gmail riscrive il From.
 */
@Component
public class MailingCanaleGmailApi implements MailingCanale {

    private final MailingGoogleClients google;

    public MailingCanaleGmailApi(MailingGoogleClients google) {
        this.google = google;
    }

    @Override
    public MailingMittente.Canale tipo() {
        return MailingMittente.Canale.GMAIL_API;
    }

    @Override
    public String invia(MailingMittente m, MimeMessage msg) throws MailingCanaleException {
        String raw;
        String messageIdNostro;
        try {
            msg.saveChanges();
            messageIdNostro = msg.getMessageID();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            msg.writeTo(out);
            raw = Base64.getUrlEncoder().encodeToString(out.toByteArray());
        } catch (MessagingException | IOException e) {
            throw new MailingCanaleException.Permanente("Messaggio non componibile: " + e.getMessage(), false, e);
        }
        Message inviato = google.gmail(m, g -> g.users().messages().send("me", new Message().setRaw(raw)).execute());
        // Gmail di norma conserva il Message-ID del client: se lo sostituisce, il worker deve salvare quello vero
        // (le risposte lo citano in In-Reply-To).
        try {
            Message meta = google.gmail(m, g -> g.users().messages().get("me", inviato.getId())
                    .setFormat("metadata").setMetadataHeaders(List.of("Message-ID")).execute());
            String vero = CasellaMime.header(meta, "Message-ID");
            if (StringUtils.hasText(vero) && !vero.equals(messageIdNostro)) {
                msg.setHeader("Message-ID", vero.trim());
            }
        } catch (MailingCanaleException | MessagingException ignorata) {
            // il messaggio è partito: senza conferma del Message-ID si tiene il nostro
        }
        return inviato.getId();
    }
}
