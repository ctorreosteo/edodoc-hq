package it.edodoc.hq.config;

import it.edodoc.hq.services.SocialAccessService;
import it.edodoc.hq.services.SocialRealtimeNotifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;

import java.security.Principal;

/**
 * Blocca la subscribe a {@link SocialRealtimeNotifier#TOPIC} a chi non puo aprire la pagina Meta:
 * il topic e broadcast e porta l'anteprima di commenti e messaggi privati.
 */
@Component
public class SocialStompSubscribeInterceptor implements ChannelInterceptor {

    private static final Logger logger = LoggerFactory.getLogger(SocialStompSubscribeInterceptor.class);

    private final SocialAccessService socialAccessService;

    public SocialStompSubscribeInterceptor(SocialAccessService socialAccessService) {
        this.socialAccessService = socialAccessService;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || !StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
            return message;
        }
        if (!SocialRealtimeNotifier.TOPIC.equals(accessor.getDestination())) {
            return message;
        }
        Principal principal = accessor.getUser();
        String username = principal != null ? principal.getName() : null;
        if (!socialAccessService.canAccessByUsername(username)) {
            logger.warn("Social: subscribe a {} rifiutata per utente '{}'",
                    SocialRealtimeNotifier.TOPIC, username == null ? "(anonimo)" : username);
            throw new MessageDeliveryException("Subscribe non autorizzata a " + SocialRealtimeNotifier.TOPIC);
        }
        return message;
    }
}
