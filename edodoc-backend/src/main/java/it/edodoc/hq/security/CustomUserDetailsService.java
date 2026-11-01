package it.edodoc.hq.security;

import it.edodoc.hq.repositories.UtenteRepository;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CustomUserDetailsService implements UserDetailsService {

    private final UtenteRepository utenteRepository;

    public CustomUserDetailsService(UtenteRepository utenteRepository) {
        this.utenteRepository = utenteRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public UtenteDetails loadUserByUsername(String username) {
        return utenteRepository.findByUsernameIgnoreCase(username)
                .map(UtenteDetails::new)
                .orElseThrow(() -> new UsernameNotFoundException("Utente non trovato"));
    }
}
