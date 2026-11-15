package it.edodoc.hq.services;

import it.edodoc.hq.models.Utente;
import it.edodoc.hq.repositories.UtenteRepository;
import it.edodoc.hq.security.UtenteDetails;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Le persone del Planner social. EdoDoc ha un solo studio e un solo ruolo di gestione: chi apre il Planner, chi ne
 * è responsabile e chi approva sono gli utenti ADMIN attivi. In Mobilitas questi aiuti stavano in
 * SocialAzioniService (nomi) e nei ruoli: qui il Planner non dipende dalla pagina Social.
 */
@Service
public class PlannerUtenti {

    private final UtenteRepository utenteRepository;

    public PlannerUtenti(UtenteRepository utenteRepository) {
        this.utenteRepository = utenteRepository;
    }

    /** L'entity dell'utente autenticato (il principal di EdoDoc tiene solo gli id). */
    public Utente utente(UtenteDetails principal) {
        if (principal == null || principal.getId() == null) {
            return null;
        }
        return utenteRepository.findById(principal.getId()).orElse(null);
    }

    /** Id di chi sta facendo la richiesta, null fuori da una richiesta (job). */
    public Long operatoreCorrenteId() {
        Authentication a = SecurityContextHolder.getContext().getAuthentication();
        return a != null && a.getPrincipal() instanceof UtenteDetails u ? u.getId() : null;
    }

    /** Gli ADMIN attivi, per cognome e nome: possono aprire il Planner, esserne responsabili e approvare. */
    public List<Utente> amministratori() {
        return utenteRepository.findAll().stream()
                .filter(u -> u.getRuolo() == Utente.Ruolo.ADMIN && Boolean.TRUE.equals(u.getAttivo()))
                .sorted(Comparator.comparing((Utente u) -> minuscolo(u.getCognome())).thenComparing(u -> minuscolo(u.getNome())))
                .toList();
    }

    public Map<Long, String> nomiUtenti(Collection<Long> ids) {
        Set<Long> unici = ids.stream().filter(Objects::nonNull).collect(Collectors.toSet());
        if (unici.isEmpty()) {
            return Map.of();
        }
        Map<Long, String> out = new HashMap<>();
        for (Utente u : utenteRepository.findAllById(unici)) {
            out.put(u.getId(), nomeUtente(u));
        }
        return out;
    }

    public String nomeUtente(Long utenteId) {
        if (utenteId == null) {
            return null;
        }
        return utenteRepository.findById(utenteId).map(PlannerUtenti::nomeUtente).orElse(null);
    }

    public static String nomeUtente(Utente u) {
        String nome = ((u.getNome() == null ? "" : u.getNome().trim()) + " "
                + (u.getCognome() == null ? "" : u.getCognome().trim())).trim();
        return nome.isEmpty() ? u.getUsername() : nome;
    }

    public static String tronca(String s, int max) {
        if (s == null) {
            return null;
        }
        String t = s.replaceAll("\\s+", " ").trim();
        return t.length() <= max ? t : t.substring(0, max - 1) + "…";
    }

    private static String minuscolo(String s) {
        return s == null ? "" : s.toLowerCase(java.util.Locale.ROOT);
    }
}
