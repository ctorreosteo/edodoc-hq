package it.edodoc.hq.services;

import it.edodoc.hq.dto.SocialDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Push real-time della pagina Meta: un solo topic broadcast ({@value #TOPIC}), protetto in subscribe da
 * {@link it.edodoc.hq.config.SocialStompSubscribeInterceptor}. Il frame dice solo cosa e cambiato;
 * la pagina rilegge da REST.
 */
@Service
public class SocialRealtimeNotifier {

    public static final String TOPIC = "/topic/social";

    public static final String TIPO_COMMENTO = "COMMENTO";
    public static final String TIPO_MESSAGGIO = "MESSAGGIO";
    public static final String TIPO_AGGIORNAMENTO = "AGGIORNAMENTO";
    public static final String TIPO_PUBBLICAZIONE = "PUBBLICAZIONE";

    private static final Logger logger = LoggerFactory.getLogger(SocialRealtimeNotifier.class);

    private final SimpMessagingTemplate messagingTemplate;

    public SocialRealtimeNotifier(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    /** Dopo il commit della transazione corrente, se c'e; altrimenti subito. */
    public void pubblica(SocialDto.SocialEvento evento) {
        if (evento == null || evento.tipo() == null) {
            return;
        }
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    pubblicaOra(evento);
                }
            });
        } else {
            pubblicaOra(evento);
        }
    }

    private void pubblicaOra(SocialDto.SocialEvento evento) {
        try {
            messagingTemplate.convertAndSend(TOPIC, evento);
        } catch (Exception e) {
            logger.error("Social realtime: invio fallito (tipo={})", evento.tipo(), e);
        }
    }
}
