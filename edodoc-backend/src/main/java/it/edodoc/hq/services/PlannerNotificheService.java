package it.edodoc.hq.services;

import it.edodoc.hq.dto.SocialDto;
import it.edodoc.hq.models.PlannerPost;
import it.edodoc.hq.models.Utente;
import it.edodoc.hq.repositories.UtenteRepository;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Avvisi del Planner social: notifica sulla coda utente {@code /queue/planner-social} alle persone giuste (in
 * EdoDoc gli ADMIN), e frame {@value #TIPO_EVENTO} su
 * {@code /topic/social} così chi ha il Planner aperto lo vede aggiornarsi da solo.
 */
@Service
public class PlannerNotificheService {

    public static final String TIPO_EVENTO = "PLANNER";

    public static final String DA_APPROVARE = "DA_APPROVARE";
    public static final String APPROVATO = "APPROVATO";
    public static final String RIFIUTATO = "RIFIUTATO";
    public static final String DA_PUBBLICARE = "DA_PUBBLICARE";
    public static final String ERRORE = "ERRORE";
    public static final String COMMENTO = "COMMENTO";

    private final WebSocketNotificationService webSocket;
    private final SocialRealtimeNotifier realtime;
    private final UtenteRepository utenteRepository;
    private final PlannerUtenti anagrafica;

    public PlannerNotificheService(WebSocketNotificationService webSocket, SocialRealtimeNotifier realtime,
                                   UtenteRepository utenteRepository, PlannerUtenti anagrafica) {
        this.webSocket = webSocket;
        this.realtime = realtime;
        this.utenteRepository = utenteRepository;
        this.anagrafica = anagrafica;
    }

    /** Qualcosa è cambiato nel piano: le pagine aperte rileggono. */
    public void aggiornato(PlannerPost p, String autoreNome) {
        realtime.pubblica(new SocialDto.SocialEvento(TIPO_EVENTO, null, null, autoreNome,
                p == null ? null : PlannerUtenti.tronca(titolo(p), 120), p == null ? null : String.valueOf(p.getId())));
    }

    public void daApprovare(PlannerPost p, Long richiedenteId, String richiedenteNome) {
        // In EdoDoc approva chi è ADMIN
        List<Utente> approvatori = anagrafica.amministratori();
        String chi = StringUtils.hasText(richiedenteNome) ? richiedenteNome : "Qualcuno";
        invia(approvatori.stream().filter(u -> !Objects.equals(u.getId(), richiedenteId)).toList(), p, DA_APPROVARE,
                chi + " chiede di approvare «" + titolo(p) + "»");
    }

    public void approvato(PlannerPost p, Long approvatoreId, String approvatoreNome) {
        invia(autori(p, approvatoreId), p, APPROVATO, approvatoreNome + " ha approvato «" + titolo(p) + "»"
                + (PlannerPost.STATO_PROGRAMMATO.equals(p.getStato()) ? ": è programmato." : ": scegli quando pubblicarlo."));
    }

    public void rifiutato(PlannerPost p, Long approvatoreId, String approvatoreNome, String motivo) {
        invia(autori(p, approvatoreId), p, RIFIUTATO, approvatoreNome + " ha chiesto modifiche a «" + titolo(p) + "»"
                + (StringUtils.hasText(motivo) ? ": " + PlannerUtenti.tronca(motivo, 160) : ""));
    }

    public void daPubblicareAMano(PlannerPost p, Collection<String> canali) {
        invia(autori(p, null), p, DA_PUBBLICARE, "È l'ora di «" + titolo(p) + "»: pubblicalo su "
                + String.join(", ", canali) + ". Testo e media sono pronti nel Planner.");
    }

    public void errore(PlannerPost p, Collection<String> canali) {
        invia(autori(p, null), p, ERRORE, "«" + titolo(p) + "» non è uscito su " + String.join(", ", canali)
                + ": apri il post per vedere il motivo e riprovare.");
    }

    public void commento(PlannerPost p, Long autoreId, String autoreNome, String testo) {
        invia(autori(p, autoreId), p, COMMENTO, autoreNome + " ha commentato «" + titolo(p) + "»: "
                + PlannerUtenti.tronca(testo, 140));
    }

    /** Chi ha creato il post e chi ne è responsabile, tranne chi ha appena agito. */
    private List<Utente> autori(PlannerPost p, Long escluso) {
        Set<Long> ids = new LinkedHashSet<>();
        if (p.getResponsabileUtenteId() != null) {
            ids.add(p.getResponsabileUtenteId());
        }
        if (p.getCreatoDaUtenteId() != null) {
            ids.add(p.getCreatoDaUtenteId());
        }
        if (escluso != null) {
            ids.remove(escluso);
        }
        return ids.isEmpty() ? List.of() : utenteRepository.findAllById(ids).stream()
                .filter(u -> Boolean.TRUE.equals(u.getAttivo()))
                .toList();
    }

    private void invia(List<Utente> destinatari, PlannerPost p, String evento, String messaggio) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("evento", evento);
        payload.put("postId", p.getId());
        payload.put("titolo", titolo(p));
        payload.put("messaggio", messaggio);
        destinatari.forEach(u -> webSocket.notifyPlannerSocial(u, payload));
    }

    static String titolo(PlannerPost p) {
        if (StringUtils.hasText(p.getTitolo())) {
            return p.getTitolo().trim();
        }
        String t = p.getTesto() == null ? "" : p.getTesto().trim();
        return t.isEmpty() ? "Post senza titolo" : PlannerUtenti.tronca(t, 60);
    }
}
