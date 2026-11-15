package it.edodoc.hq.services;

import it.edodoc.hq.models.Utente;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

/**
 * Notifiche STOMP a un singolo utente ({@code /user/{username}/queue/...}). Versione minima di quella di Mobilitas:
 * solo cio che usano pagina Meta e Planner social, senza storico notifiche ne push sui dispositivi.
 */
@Service
public class WebSocketNotificationService {

    public static final String QUEUE_PLANNER_SOCIAL = "/queue/planner-social";

    private static final Logger logger = LoggerFactory.getLogger(WebSocketNotificationService.class);

    private final SimpMessagingTemplate messagingTemplate;

    public WebSocketNotificationService(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    /**
     * Planner social: post da approvare, approvato o rifiutato, canali da pubblicare a mano, errori di pubblicazione.
     * Canale utente: /user/queue/planner-social. Payload: evento, postId, titolo, messaggio.
     */
    public void notifyPlannerSocial(Utente destinatario, Object payload) {
        try {
            if (destinatario == null || destinatario.getUsername() == null || destinatario.getUsername().isBlank()) {
                return;
            }
            messagingTemplate.convertAndSendToUser(destinatario.getUsername(), QUEUE_PLANNER_SOCIAL, payload);
        } catch (Exception e) {
            logger.error("Errore nell'invio notifica planner social a {}: {}",
                    destinatario != null ? destinatario.getUsername() : null, e.getMessage(), e);
        }
    }
}
