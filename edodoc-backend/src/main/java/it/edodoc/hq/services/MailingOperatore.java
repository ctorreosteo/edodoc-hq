package it.edodoc.hq.services;

import it.edodoc.hq.security.UtenteDetails;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/** Id dell'utente che sta facendo la richiesta, null nei job e fuori da una richiesta autenticata. */
final class MailingOperatore {

    private MailingOperatore() {
    }

    static Long corrente() {
        Authentication a = SecurityContextHolder.getContext().getAuthentication();
        return a != null && a.getPrincipal() instanceof UtenteDetails u ? u.getId() : null;
    }
}
