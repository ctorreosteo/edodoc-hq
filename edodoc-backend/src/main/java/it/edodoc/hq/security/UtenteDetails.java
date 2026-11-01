package it.edodoc.hq.security;

import it.edodoc.hq.models.Utente;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;

/** Tiene gli id e non l'entity: il principal vive oltre la sessione JPA. */
public class UtenteDetails implements UserDetails {

    private final Long id;
    private final Long pazienteId;
    private final String username;
    private final String passwordHash;
    private final boolean attivo;
    private final List<GrantedAuthority> authorities;

    public UtenteDetails(Utente utente) {
        this.id = utente.getId();
        this.pazienteId = utente.getPaziente() != null ? utente.getPaziente().getId() : null;
        this.username = utente.getUsername();
        this.passwordHash = utente.getPasswordHash();
        this.attivo = Boolean.TRUE.equals(utente.getAttivo());
        this.authorities = List.of(new SimpleGrantedAuthority("ROLE_" + utente.getRuolo().name()));
    }

    public Long getId() {
        return id;
    }

    public Long getPazienteId() {
        return pazienteId;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return authorities;
    }

    @Override
    public String getPassword() {
        return passwordHash;
    }

    @Override
    public String getUsername() {
        return username;
    }

    @Override
    public boolean isEnabled() {
        return attivo;
    }
}
