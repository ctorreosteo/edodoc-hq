package it.edodoc.hq.services;

import it.edodoc.hq.dto.VisiteDto;
import it.edodoc.hq.exception.ConflittoException;
import it.edodoc.hq.exception.RisorsaNonTrovataException;
import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.models.Percorso;
import it.edodoc.hq.models.Task;
import it.edodoc.hq.models.Visita;
import it.edodoc.hq.repositories.PazienteRepository;
import it.edodoc.hq.repositories.PercorsoRepository;
import it.edodoc.hq.repositories.VisitaRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
public class VisitaService {

    /** Pubblicato quando una visita va riallineata su Google: lo gestisce il calendario dopo il commit. */
    public record VisitaDaSincronizzare(Long visitaId) {
    }

    private static final DateTimeFormatter ORA = DateTimeFormatter.ofPattern("HH:mm");

    private final VisitaRepository visitaRepository;
    private final PazienteRepository pazienteRepository;
    private final PercorsoRepository percorsoRepository;
    private final TaskService taskService;
    private final ApplicationEventPublisher eventi;
    private final MailingEventiGestionaleService mailing;

    public VisitaService(VisitaRepository visitaRepository, PazienteRepository pazienteRepository,
                         PercorsoRepository percorsoRepository, TaskService taskService,
                         ApplicationEventPublisher eventi, MailingEventiGestionaleService mailing) {
        this.mailing = mailing;
        this.visitaRepository = visitaRepository;
        this.pazienteRepository = pazienteRepository;
        this.percorsoRepository = percorsoRepository;
        this.taskService = taskService;
        this.eventi = eventi;
    }

    /** Convenzione dell'agenda: {@code Dottor Bo - nome (n su 6)}. Si legge da qui il trigger del rinnovo. */
    public static String titoloCalendario(Visita v) {
        String nome = v.getPaziente().getNomeCompleto();
        if (v.getTipo() == Visita.Tipo.CHIAMATA_CONOSCITIVA) {
            return "Chiamata conoscitiva - " + nome;
        }
        if (v.getPercorso() != null && v.getNumeroVisita() != null) {
            return "Dottor Bo - " + nome + " (" + v.getNumeroVisita() + " su " + v.getPercorso().getVisiteTotali() + ")";
        }
        return "Dottor Bo - " + nome;
    }

    private static VisiteDto.Riga riga(Visita v) {
        return VisiteDto.Riga.da(v, titoloCalendario(v));
    }

    @Transactional(readOnly = true)
    public List<VisiteDto.Riga> nelPeriodo(LocalDate da, LocalDate a) {
        return visitaRepository.findNelPeriodo(da.atStartOfDay(), a.plusDays(1).atStartOfDay()).stream()
                .map(VisitaService::riga).toList();
    }

    @Transactional(readOnly = true)
    public List<VisiteDto.Riga> delPaziente(Long pazienteId) {
        return visitaRepository.findDelPaziente(pazienteId).stream().map(VisitaService::riga).toList();
    }

    @Transactional
    public VisiteDto.Riga crea(VisiteDto.Salva richiesta) {
        Visita visita = new Visita();
        Paziente paziente = pazienteRepository.findByIdAndAttivoTrue(richiesta.pazienteId())
                .orElseThrow(() -> new RisorsaNonTrovataException("Paziente non trovato"));
        visita.setPaziente(paziente);
        if (richiesta.tipo() != Visita.Tipo.CHIAMATA_CONOSCITIVA) {
            percorsoRepository.findFirstByPazienteIdAndStatoOrderByDataInizioDesc(paziente.getId(), Percorso.Stato.ATTIVO)
                    .ifPresent(percorso -> {
                        if (visitaRepository.findValideDelPercorso(percorso.getId()).size() >= percorso.getVisiteTotali()) {
                            throw new ConflittoException("Il percorso ha già tutte le " + percorso.getVisiteTotali() + " visite");
                        }
                        visita.setPercorso(percorso);
                    });
        }
        applica(visita, richiesta);
        visitaRepository.save(visita);
        dopoLaModifica(visita);
        mailing.visitaCreata(visita.getId());
        return riga(visita);
    }

    @Transactional
    public VisiteDto.Riga aggiorna(Long id, VisiteDto.Salva richiesta) {
        Visita visita = trova(id);
        if (visita.getStato() == Visita.Stato.ANNULLATA) {
            throw new ConflittoException("La visita è annullata");
        }
        if (!visita.getPaziente().getId().equals(richiesta.pazienteId())) {
            throw new IllegalArgumentException("Una visita non può passare a un altro paziente: annullala e creane una nuova");
        }
        applica(visita, richiesta);
        dopoLaModifica(visita);
        return riga(visita);
    }

    @Transactional
    public VisiteDto.Riga cambiaStato(Long id, Visita.Stato stato) {
        Visita visita = trova(id);
        boolean eraAnnullata = visita.getStato() == Visita.Stato.ANNULLATA;
        boolean effettuataOra = stato == Visita.Stato.EFFETTUATA && visita.getStato() != Visita.Stato.EFFETTUATA;
        visita.setStato(stato);
        if (effettuataOra) {
            mailing.visitaEffettuata(id);
        }
        // Effettuata o assente non cambiano nulla sull'evento: si tocca Google solo se la visita sparisce o torna
        if (eraAnnullata != (stato == Visita.Stato.ANNULLATA)) {
            dopoLaModifica(visita);
        }
        return riga(visita);
    }

    /** Visita spostata o annullata direttamente su Google Calendar: l'evento è già allineato. */
    @Transactional
    public void applicaModificaDaGoogle(Long id, Visita.Stato stato, LocalDateTime inizio, LocalDateTime fine, String meetUrl) {
        Visita visita = trova(id);
        visita.setStato(stato);
        visita.setInizio(inizio);
        visita.setFine(fine);
        visita.setMeetUrl(meetUrl);
        rinumera(visita);
    }

    private void applica(Visita visita, VisiteDto.Salva r) {
        int minuti = r.durataMinuti() != null ? r.durataMinuti() : r.tipo().minutiPredefiniti;
        if (minuti < 5 || minuti > 240) {
            throw new IllegalArgumentException("La durata deve essere tra 5 e 240 minuti");
        }
        LocalDateTime fine = r.inizio().plusMinutes(minuti);
        visitaRepository.findSovrapposte(r.inizio(), fine, visita.getId()).stream().findFirst().ifPresent(altra -> {
            throw new ConflittoException("Alle " + altra.getInizio().format(ORA) + " c'è già "
                    + altra.getPaziente().getNomeCompleto());
        });
        boolean conMeet = Boolean.TRUE.equals(r.conMeet());
        boolean invita = !Boolean.FALSE.equals(r.invitaPaziente());
        String email = visita.getPaziente().getEmail();
        if (conMeet && invita && (email == null || email.isBlank())) {
            throw new IllegalArgumentException("Aggiungi l'email del paziente per inviargli l'invito Meet");
        }
        visita.setTipo(r.tipo());
        visita.setModalita(r.modalita());
        visita.setInizio(r.inizio());
        visita.setFine(fine);
        visita.setConMeet(conMeet);
        visita.setInvitaPaziente(invita);
        visita.setNote(r.note());
    }

    private void dopoLaModifica(Visita visita) {
        visita.setGoogleSyncStato(Visita.GoogleSync.DA_SINCRONIZZARE);
        rinumera(visita);
        eventi.publishEvent(new VisitaDaSincronizzare(visita.getId()));
    }

    /** I numeri seguono il calendario: spostando o annullando una visita, cambiano anche i titoli delle altre. */
    private void rinumera(Visita visita) {
        Percorso percorso = visita.getPercorso();
        if (percorso == null) {
            return;
        }
        visitaRepository.flush();
        List<Visita> valide = visitaRepository.findValideDelPercorso(percorso.getId());
        for (int i = 0; i < valide.size(); i++) {
            Visita v = valide.get(i);
            int numero = i + 1;
            if (!Integer.valueOf(numero).equals(v.getNumeroVisita())) {
                v.setNumeroVisita(numero);
                if (!v.getId().equals(visita.getId())) {
                    v.setGoogleSyncStato(Visita.GoogleSync.DA_SINCRONIZZARE);
                    eventi.publishEvent(new VisitaDaSincronizzare(v.getId()));
                }
            }
        }
        if (percorso.getTipo() != Percorso.Tipo.MANTENIMENTO && valide.size() >= percorso.getVisiteTotali() - 1) {
            Visita penultima = valide.get(percorso.getVisiteTotali() - 2);
            taskService.creaAutomatico("rinnovo-percorso-" + percorso.getId(), "CONTATTI",
                    "Proporre rinnovo o mantenimento (visita " + (percorso.getVisiteTotali() - 1) + " di " + percorso.getVisiteTotali() + ")",
                    Task.Priorita.ALTA, penultima.getInizio().toLocalDate(), percorso.getPaziente());
        }
    }

    private Visita trova(Long id) {
        return visitaRepository.findConDettagli(id)
                .orElseThrow(() -> new RisorsaNonTrovataException("Visita non trovata"));
    }
}
