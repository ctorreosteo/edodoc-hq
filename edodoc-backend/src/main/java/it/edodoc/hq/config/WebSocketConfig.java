package it.edodoc.hq.config;

import it.edodoc.hq.security.CustomUserDetailsService;
import it.edodoc.hq.security.JwtUtil;
import it.edodoc.hq.security.UtenteDetails;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.lang.NonNull;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

import java.util.Arrays;

/**
 * Realtime del gestionale: STOMP su {@code /ws} (con fallback SockJS) e broker in memoria.
 *
 * <p>La connessione HTTP a {@code /ws} e pubblica (il browser non manda header nell'handshake): l'identita arriva
 * nel frame CONNECT con {@code Authorization: Bearer <jwt>}, lo stesso token delle chiamate REST. Senza un token
 * valido di un utente attivo la sessione resta anonima, e i topic protetti (es. {@code /topic/social}) rifiutano la
 * subscribe nei loro interceptor.
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final JwtUtil jwtUtil;
    private final CustomUserDetailsService userDetailsService;
    private final SocialStompSubscribeInterceptor socialStompSubscribeInterceptor;

    @Value("${app.cors.allowed-origin-patterns}")
    private String allowedOriginPatterns;

    public WebSocketConfig(JwtUtil jwtUtil, CustomUserDetailsService userDetailsService,
                           SocialStompSubscribeInterceptor socialStompSubscribeInterceptor) {
        this.jwtUtil = jwtUtil;
        this.userDetailsService = userDetailsService;
        this.socialStompSubscribeInterceptor = socialStompSubscribeInterceptor;
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(new ChannelInterceptor() {
            @Override
            public Message<?> preSend(@NonNull Message<?> message, @NonNull MessageChannel channel) {
                StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
                if (accessor != null && StompCommand.CONNECT.equals(accessor.getCommand())) {
                    autentica(accessor);
                }
                return message;
            }
        }, socialStompSubscribeInterceptor);
    }

    /** Come JwtFilter: token assente, scaduto o di un utente disattivato = sessione anonima. */
    private void autentica(StompHeaderAccessor accessor) {
        String header = accessor.getFirstNativeHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            return;
        }
        String username = jwtUtil.usernameDa(header.substring(7));
        if (username == null) {
            return;
        }
        try {
            UtenteDetails utente = userDetailsService.loadUserByUsername(username);
            if (utente.isEnabled()) {
                // Il nome del principal e lo username: serve a convertAndSendToUser e agli interceptor di subscribe
                accessor.setUser(new UsernamePasswordAuthenticationToken(utente.getUsername(), null, utente.getAuthorities()));
            }
        } catch (UsernameNotFoundException e) {
            // utente sparito: resta anonimo
        }
    }

    @Override
    public void configureMessageBroker(@NonNull MessageBrokerRegistry config) {
        // /topic per i broadcast, /queue per i messaggi a un singolo utente (via /user)
        config.enableSimpleBroker("/topic", "/queue");
        config.setUserDestinationPrefix("/user");
        config.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void registerStompEndpoints(@NonNull StompEndpointRegistry registry) {
        // Stesse origini ammesse dal CORS delle API
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns(Arrays.stream(allowedOriginPatterns.split(",")).map(String::trim).toArray(String[]::new))
                .withSockJS();
    }
}
