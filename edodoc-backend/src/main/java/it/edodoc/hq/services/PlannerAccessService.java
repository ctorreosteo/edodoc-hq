package it.edodoc.hq.services;

import it.edodoc.hq.models.Utente;
import org.springframework.stereotype.Service;

/**
 * Planner social: in EdoDoc la pagina la apre solo chi è ADMIN (lo garantisce SecurityConfig per tutto /api/planner),
 * e lo stesso ADMIN approva i post e cambia le impostazioni (rubriche, orari della coda, spazi, approvazione
 * obbligatoria). In Mobilitas gli approvatori erano ADMIN, CMO e MANAGER_MARKETING.
 */
@Service
public class PlannerAccessService {

    public boolean puoApprovare(Utente utente) {
        return utente != null && utente.getRuolo() == Utente.Ruolo.ADMIN && Boolean.TRUE.equals(utente.getAttivo());
    }

    public void verificaApprovatore(Utente utente) {
        if (!puoApprovare(utente)) {
            throw new org.springframework.security.access.AccessDeniedException(
                    "Solo chi gestisce il Planner può farlo.");
        }
    }
}
