package it.edodoc.hq.services;

import it.edodoc.hq.models.MailingMittente;
import jakarta.mail.internet.MimeMessage;

/**
 * Un modo di far partire le email marketing (Gmail API, smtp-relay Google, SMTP esterno). Il messaggio arriva già
 * composto da {@link MailingComposizioneService} (From, To, header, Message-ID): il canale lo consegna e basta.
 */
public interface MailingCanale {

    MailingMittente.Canale tipo();

    /**
     * Consegna il messaggio. Ritorna l'id del provider (id Gmail per GMAIL_API, Message-ID per SMTP).
     * Se il provider sostituisce il Message-ID, il canale aggiorna l'header del {@code msg} con quello vero.
     */
    String invia(MailingMittente m, MimeMessage msg) throws MailingCanaleException;
}
