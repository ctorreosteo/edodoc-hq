package it.edodoc.hq.services;

import it.edodoc.hq.models.Utente;
import it.edodoc.hq.repositories.UtenteRepository;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.Set;

/**
 * Chi puo aprire la pagina Meta: solo l'ADMIN. Il REVISORE (account per Apple e Google) non deve mai vedere
 * commenti e messaggi veri, e il PAZIENTE ha solo l'app. Confronto esatto sull'enum, mai per sottostringa.
 *
 * <p>Le richieste REST le filtra gia SecurityConfig; qui serve soprattutto al topic STOMP, dove il principal
 * e solo lo username.
 */
@Service("socialAccess")
public class SocialAccessService {

    /** Stesso nome di Mobilitas (lo usa il Planner per trovare chi approva): qui c'e solo l'ADMIN. */
    static final Set<Utente.Ruolo> RUOLI_AMMESSI = Set.of(Utente.Ruolo.ADMIN);

    private static final String AUTORITA_ADMIN = "ROLE_" + Utente.Ruolo.ADMIN.name();

    private final UtenteRepository utenteRepository;

    public SocialAccessService(UtenteRepository utenteRepository) {
        this.utenteRepository = utenteRepository;
    }

    public boolean canAccess(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            return false;
        }
        return authentication.getAuthorities().stream().anyMatch(a -> AUTORITA_ADMIN.equals(a.getAuthority()));
    }

    /** Per il ChannelInterceptor STOMP: li il principal e lo username. */
    public boolean canAccessByUsername(String username) {
        if (!StringUtils.hasText(username)) {
            return false;
        }
        return utenteRepository.findByUsernameIgnoreCase(username.trim())
                .filter(u -> Boolean.TRUE.equals(u.getAttivo()))
                .map(SocialAccessService::haRuoloAmmesso)
                .orElse(false);
    }

    static boolean haRuoloAmmesso(Utente utente) {
        return utente != null && RUOLI_AMMESSI.contains(utente.getRuolo());
    }
}
