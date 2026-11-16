package it.edodoc.hq.services;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Email al dottore per ogni chiamata conoscitiva prenotata dal sito. Parte dopo il commit e fuori dalla richiesta:
 * se Gmail non risponde la prenotazione resta valida, l'avviso si perde e resta una riga nel log.
 * Destinatario in CONOSCITIVA_EMAIL_AVVISO; vuoto = l'account Google del gestionale (quello che invia).
 */
@Service
public class AvvisoPrenotazioneService {

    private static final Logger logger = LoggerFactory.getLogger(AvvisoPrenotazioneService.class);

    /** Pronto da spedire: lo prepara chi registra la prenotazione, con i dati appena salvati. */
    public record Avviso(String oggetto, String testo) {
    }

    private final GmailService gmailService;
    private final ConfigService configService;

    public AvvisoPrenotazioneService(GmailService gmailService, ConfigService configService) {
        this.gmailService = gmailService;
        this.configService = configService;
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void invia(Avviso avviso) {
        if (!gmailService.isAttivo()) {
            logger.info("Avviso di nuova prenotazione non inviato: l'invio da Gmail è spento");
            return;
        }
        String configurato = configService.get("CONOSCITIVA_EMAIL_AVVISO");
        String destinatario = configurato == null || configurato.isBlank() ? gmailService.mittente() : configurato.trim();
        try {
            gmailService.invia(destinatario, avviso.oggetto(), CorpoEmail.da(avviso.testo()), null, null);
        } catch (RuntimeException e) {
            logger.warn("Avviso di nuova prenotazione non inviato: {}", e.getMessage());
        }
    }
}
