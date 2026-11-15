package it.edodoc.hq.services;

import it.edodoc.hq.dto.ConoscitivaDto;
import it.edodoc.hq.dto.PrenotazioniDto;
import it.edodoc.hq.dto.VisiteDto;
import it.edodoc.hq.exception.ConflittoException;
import it.edodoc.hq.exception.RisorsaNonTrovataException;
import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.models.Percorso;
import it.edodoc.hq.models.Prenotazione;
import it.edodoc.hq.models.PrenotazioneEvento;
import it.edodoc.hq.models.Visita;
import it.edodoc.hq.repositories.PazienteRepository;
import it.edodoc.hq.repositories.PercorsoRepository;
import it.edodoc.hq.repositories.PrenotazioneEventoRepository;
import it.edodoc.hq.repositories.PrenotazioneRepository;
import it.edodoc.hq.repositories.VisitaRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

/**
 * Gestione delle prenotazioni arrivate dal sito. Ogni modifica che tocca la chiamata (orario, annullamento,
 * riapertura, email della persona) passa da VisitaService: la sincronizzazione delle visite la porta su Google
 * Calendar e Google avvisa la persona. Qui si tiene la cronologia di tutto.
 */
@Service
public class PrenotazioneService {

    private static final DateTimeFormatter QUANDO = DateTimeFormatter.ofPattern("EEE d MMM 'alle' HH:mm", Locale.ITALIAN);

    private final PrenotazioneRepository prenotazioneRepository;
    private final PrenotazioneEventoRepository eventoRepository;
    private final VisitaRepository visitaRepository;
    private final VisitaService visitaService;
    private final PazienteRepository pazienteRepository;
    private final PercorsoRepository percorsoRepository;
    private final MailingEventiGestionaleService mailing;

    public PrenotazioneService(PrenotazioneRepository prenotazioneRepository, PrenotazioneEventoRepository eventoRepository,
                               VisitaRepository visitaRepository, VisitaService visitaService,
                               PazienteRepository pazienteRepository, PercorsoRepository percorsoRepository,
                               MailingEventiGestionaleService mailing) {
        this.mailing = mailing;
        this.prenotazioneRepository = prenotazioneRepository;
        this.eventoRepository = eventoRepository;
        this.visitaRepository = visitaRepository;
        this.visitaService = visitaService;
        this.pazienteRepository = pazienteRepository;
        this.percorsoRepository = percorsoRepository;
    }

    // ───────────────────────── lettura ─────────────────────────

    @Transactional(readOnly = true)
    public List<PrenotazioniDto.Riga> tutte() {
        List<Prenotazione> prenotazioni = prenotazioneRepository.findTutte();
        Map<Long, LocalDateTime> acquisti = new HashMap<>();
        for (Percorso p : percorsoRepository.findDeiPazienti()) {
            if (p.getStato() != Percorso.Stato.ANNULLATO) acquisti.merge(p.getPaziente().getId(), p.getCreatedAt(), (a, b) -> a.isAfter(b) ? a : b);
        }
        LocalDateTime adesso = LocalDateTime.now();
        return prenotazioni.stream().map(p -> riga(p, acquisti.get(p.getPaziente().getId()), adesso)).toList();
    }

    @Transactional(readOnly = true)
    public PrenotazioniDto.Dettaglio dettaglio(Long id) {
        Prenotazione p = trova(id);
        LocalDateTime acquisto = percorsoRepository.findByPazienteIdOrderByDataInizioDesc(p.getPaziente().getId()).stream()
                .filter(x -> x.getStato() != Percorso.Stato.ANNULLATO).map(Percorso::getCreatedAt).max(LocalDateTime::compareTo).orElse(null);
        long altre = visitaRepository.findDelPaziente(p.getPaziente().getId()).stream()
                .filter(v -> !v.getId().equals(p.getVisita().getId())).count();
        return new PrenotazioniDto.Dettaglio(riga(p, acquisto, LocalDateTime.now()),
                eventoRepository.findByPrenotazioneIdOrderByCreatedAtDescIdDesc(id).stream().map(PrenotazioniDto.Evento::da).toList(),
                altre);
    }

    static PrenotazioniDto.Stato stato(Prenotazione p, LocalDateTime adesso) {
        Visita v = p.getVisita();
        return switch (v.getStato()) {
            case EFFETTUATA -> PrenotazioniDto.Stato.SVOLTA;
            case NON_PRESENTATO -> PrenotazioniDto.Stato.NON_PRESENTATO;
            case ANNULLATA -> p.getDisdettaIl() != null ? PrenotazioniDto.Stato.DISDETTA : PrenotazioniDto.Stato.ANNULLATA;
            case PROGRAMMATA -> v.getFine().isBefore(adesso) ? PrenotazioniDto.Stato.DA_CHIUDERE : PrenotazioniDto.Stato.IN_PROGRAMMA;
        };
    }

    /** Se la persona ha comprato un percorso dopo la prenotazione e il dottore non ha scelto l'esito, l'esito è "ha acquistato". */
    private static PrenotazioniDto.Riga riga(Prenotazione p, LocalDateTime ultimoAcquisto, LocalDateTime adesso) {
        Visita v = p.getVisita();
        Paziente pz = p.getPaziente();
        boolean automatico = p.getEsito() == null && ultimoAcquisto != null && ultimoAcquisto.isAfter(p.getCreatedAt());
        return new PrenotazioniDto.Riga(p.getId(), v.getId(), pz.getId(), pz.getNome(), pz.getCognome(), pz.getEmail(),
                pz.getCellulare(), p.getObiettivo(), p.getMessaggio(), p.getProfessione(), p.getConosciutoDa(),
                p.getPercorsiPrecedenti(), p.getInvestimento(), p.getPriorita(), p.getPercheOra(), Boolean.TRUE.equals(p.getNuovoContatto()), v.getInizio(),
                v.getFine(), stato(p, adesso), p.getRispostaInvito(), automatico ? Prenotazione.Esito.ACQUISTATO : p.getEsito(),
                automatico, v.getMeetUrl(), v.getGoogleSyncStato(), v.getGoogleSyncErrore(), p.getCreatedAt(),
                p.getDisdettaIl(), p.getDisdettaDa(), p.getDisdettaMotivo(), p.getNoteDottore(), pz.getStato().name());
    }

    // ───────────────────────── nascita dal sito ─────────────────────────

    @Transactional
    public void registra(Long visitaId, Paziente paziente, ConoscitivaDto.Prenota r, boolean nuovoContatto) {
        Prenotazione p = new Prenotazione();
        p.setVisita(visitaRepository.getReferenceById(visitaId));
        p.setPaziente(paziente);
        p.setObiettivo(vuotoNull(r.obiettivo()));
        p.setMessaggio(vuotoNull(r.messaggio()));
        p.setProfessione(vuotoNull(r.professione()));
        p.setConosciutoDa(vuotoNull(r.conosciutoDa()));
        p.setPercorsiPrecedenti(vuotoNull(r.percorsiPrecedenti()));
        p.setInvestimento(vuotoNull(r.investimento()));
        p.setPriorita(vuotoNull(r.priorita()));
        p.setPercheOra(vuotoNull(r.percheOra()));
        p.setNuovoContatto(nuovoContatto);
        prenotazioneRepository.save(p);
        evento(p, PrenotazioneEvento.Tipo.CREATA, nuovoContatto ? "Prenotata dal sito edodoc.it" : "Prenotata dal sito edodoc.it da un paziente già in anagrafica");
    }

    // ───────────────────────── modifiche ─────────────────────────

    /** Il nuovo orario va su Google con l'invito aggiornato: la persona riceve la notifica dello spostamento. */
    @Transactional
    public PrenotazioniDto.Dettaglio sposta(Long id, LocalDateTime inizio) {
        Prenotazione p = trova(id);
        Visita v = p.getVisita();
        if (v.getStato() == Visita.Stato.ANNULLATA) {
            throw new ConflittoException("La chiamata è " + (p.getDisdettaIl() != null ? "disdetta" : "annullata") + ": riaprila prima di spostarla");
        }
        LocalDateTime nuovo = inizio.withSecond(0).withNano(0);
        if (nuovo.equals(v.getInizio())) return dettaglio(id);
        String prima = v.getInizio().format(QUANDO);
        int minuti = (int) java.time.Duration.between(v.getInizio(), v.getFine()).toMinutes();
        visitaService.aggiorna(v.getId(), new VisiteDto.Salva(p.getPaziente().getId(), v.getTipo(), v.getModalita(), nuovo,
                minuti, v.getConMeet(), v.getInvitaPaziente(), v.getNote()));
        if (v.getStato() != Visita.Stato.PROGRAMMATA && nuovo.isAfter(LocalDateTime.now())) {
            visitaService.cambiaStato(v.getId(), Visita.Stato.PROGRAMMATA);
        }
        // Un nuovo orario è un nuovo invito: la risposta precedente non vale più
        p.setRispostaInvito(Prenotazione.RispostaInvito.IN_ATTESA);
        evento(p, PrenotazioneEvento.Tipo.SPOSTATA, "Spostata da " + prima + " a " + nuovo.format(QUANDO) + ". Google invia il nuovo orario alla persona");
        return dettaglio(id);
    }

    @Transactional
    public PrenotazioniDto.Dettaglio cambiaStato(Long id, PrenotazioniDto.Stato stato, String motivo) {
        Prenotazione p = trova(id);
        Visita v = p.getVisita();
        PrenotazioniDto.Stato attuale = stato(p, LocalDateTime.now());
        if (attuale == stato) return dettaglio(id);
        if (stato == PrenotazioniDto.Stato.SVOLTA || stato == PrenotazioniDto.Stato.NON_PRESENTATO) {
            if (v.getStato() == Visita.Stato.ANNULLATA) {
                throw new ConflittoException("La chiamata è " + (p.getDisdettaIl() != null ? "disdetta" : "annullata") + ": riaprila prima");
            }
            if (v.getInizio().isAfter(LocalDateTime.now())) {
                throw new ConflittoException("La chiamata non è ancora iniziata: potrai segnarla dopo le " + v.getInizio().format(QUANDO));
            }
        }
        switch (stato) {
            case SVOLTA -> {
                visitaService.cambiaStato(v.getId(), Visita.Stato.EFFETTUATA);
                azzeraDisdetta(p);
                evento(p, PrenotazioneEvento.Tipo.STATO, "Segnata come svolta");
            }
            case NON_PRESENTATO -> {
                visitaService.cambiaStato(v.getId(), Visita.Stato.NON_PRESENTATO);
                azzeraDisdetta(p);
                evento(p, PrenotazioneEvento.Tipo.STATO, "Segnata come non presentato");
            }
            case DISDETTA -> {
                visitaService.cambiaStato(v.getId(), Visita.Stato.ANNULLATA);
                p.setDisdettaIl(LocalDateTime.now());
                p.setDisdettaDa(Prenotazione.DisdettaDa.PERSONA);
                p.setDisdettaMotivo(vuotoNull(motivo));
                evento(p, PrenotazioneEvento.Tipo.DISDETTA, "Disdetta dalla persona" + (vuotoNull(motivo) != null ? ": " + motivo.trim() : "")
                        + ". Evento tolto da Google Calendar, l'orario torna libero sul sito");
            }
            case ANNULLATA -> {
                visitaService.cambiaStato(v.getId(), Visita.Stato.ANNULLATA);
                azzeraDisdetta(p);
                p.setDisdettaMotivo(vuotoNull(motivo));
                evento(p, PrenotazioneEvento.Tipo.STATO, "Annullata dal dottore" + (vuotoNull(motivo) != null ? ": " + motivo.trim() : "")
                        + ". Google avvisa la persona e l'orario torna libero");
            }
            case IN_PROGRAMMA, DA_CHIUDERE -> {
                if (v.getStato() == Visita.Stato.ANNULLATA && v.getInizio().isBefore(LocalDateTime.now())) {
                    throw new ConflittoException("L'orario è già passato: sposta la chiamata a un nuovo orario per riaprirla");
                }
                if (v.getStato() == Visita.Stato.ANNULLATA
                        && !visitaRepository.findSovrapposte(v.getInizio(), v.getFine(), v.getId()).isEmpty()) {
                    throw new ConflittoException("Nel frattempo quell'orario è stato occupato: sposta la chiamata a un nuovo orario");
                }
                boolean eraAnnullata = v.getStato() == Visita.Stato.ANNULLATA;
                visitaService.cambiaStato(v.getId(), Visita.Stato.PROGRAMMATA);
                azzeraDisdetta(p);
                p.setDisdettaMotivo(null);
                if (eraAnnullata) p.setRispostaInvito(Prenotazione.RispostaInvito.IN_ATTESA);
                evento(p, PrenotazioneEvento.Tipo.STATO, eraAnnullata
                        ? "Riaperta: l'evento torna su Google Calendar e la persona riceve di nuovo l'invito" : "Riportata in programma");
            }
        }
        return dettaglio(id);
    }

    /** Cambiare l'email rimanda l'invito al nuovo indirizzo: la sincronizzazione aggiorna gli invitati dell'evento. */
    @Transactional
    public PrenotazioniDto.Dettaglio contatto(Long id, PrenotazioniDto.Contatto r) {
        Prenotazione p = trova(id);
        Paziente pz = p.getPaziente();
        String email = r.email().trim().toLowerCase(Locale.ROOT);
        boolean emailCambiata = !email.equalsIgnoreCase(Objects.toString(pz.getEmail(), ""));
        if (emailCambiata) {
            pazienteRepository.findConEmailIn(List.of(email)).stream().filter(a -> !a.getId().equals(pz.getId())).findFirst().ifPresent(a -> {
                throw new ConflittoException("Questa email è già di " + a.getNomeCompleto());
            });
        }
        String prima = pz.getNomeCompleto() + " · " + Objects.toString(pz.getEmail(), "—") + " · " + Objects.toString(pz.getCellulare(), "—");
        pz.setNome(r.nome().trim());
        pz.setCognome(r.cognome().trim());
        pz.setEmail(email);
        pz.setCellulare(vuotoNull(r.cellulare()));
        Visita v = p.getVisita();
        // Il nome è nel titolo dell'evento e l'email tra gli invitati: con la chiamata ancora in piedi si riallinea Google
        if (v.getStato() != Visita.Stato.ANNULLATA) {
            pazienteRepository.flush();
            int minuti = (int) java.time.Duration.between(v.getInizio(), v.getFine()).toMinutes();
            visitaService.aggiorna(v.getId(), new VisiteDto.Salva(pz.getId(), v.getTipo(), v.getModalita(), v.getInizio(), minuti,
                    v.getConMeet(), v.getInvitaPaziente(), v.getNote()));
            if (emailCambiata) p.setRispostaInvito(Prenotazione.RispostaInvito.IN_ATTESA);
        }
        String dopo = pz.getNomeCompleto() + " · " + pz.getEmail() + " · " + Objects.toString(pz.getCellulare(), "—");
        if (!prima.equals(dopo)) {
            evento(p, PrenotazioneEvento.Tipo.CONTATTO, "Contatto aggiornato: " + dopo + (emailCambiata && v.getStato() != Visita.Stato.ANNULLATA
                    ? ". L'invito parte verso la nuova email" : ""));
        }
        return dettaglio(id);
    }

    @Transactional
    public PrenotazioniDto.Dettaglio esito(Long id, PrenotazioniDto.Esito r) {
        Prenotazione p = trova(id);
        if (p.getEsito() != r.esito()) {
            p.setEsito(r.esito());
            mailing.esitoConoscitiva(id);
            evento(p, PrenotazioneEvento.Tipo.ESITO, r.esito() == null ? "Esito tolto" : "Esito: " + etichetta(r.esito()));
        }
        String note = vuotoNull(r.noteDottore());
        if (!Objects.equals(note, p.getNoteDottore())) {
            boolean prime = p.getNoteDottore() == null;
            p.setNoteDottore(note);
            evento(p, PrenotazioneEvento.Tipo.NOTA, note == null ? "Note tolte" : prime ? "Note aggiunte" : "Note aggiornate");
        }
        return dettaglio(id);
    }

    // ───────────────────────── da Google ─────────────────────────

    /**
     * La persona ha risposto all'invito su Google. Il rifiuto vale come disdetta: la chiamata si annulla,
     * l'evento sparisce dal calendario del dottore e l'orario torna prenotabile dal sito.
     */
    @Transactional
    public void rispostaInvito(Long visitaId, Prenotazione.RispostaInvito risposta) {
        prenotazioneRepository.findByVisitaId(visitaId).ifPresent(p -> {
            if (p.getRispostaInvito() == risposta) return;
            p.setRispostaInvito(risposta);
            switch (risposta) {
                case ACCETTATO -> evento(p, PrenotazioneEvento.Tipo.INVITO, "Ha accettato l'invito di Google Calendar");
                case FORSE -> evento(p, PrenotazioneEvento.Tipo.INVITO, "Ha risposto «forse» all'invito");
                case RIFIUTATO -> {
                    evento(p, PrenotazioneEvento.Tipo.INVITO, "Ha rifiutato l'invito di Google Calendar");
                    Visita v = p.getVisita();
                    if (v.getStato() == Visita.Stato.PROGRAMMATA && v.getInizio().isAfter(LocalDateTime.now())) {
                        visitaService.cambiaStato(v.getId(), Visita.Stato.ANNULLATA);
                        p.setDisdettaIl(LocalDateTime.now());
                        p.setDisdettaDa(Prenotazione.DisdettaDa.INVITO);
                        evento(p, PrenotazioneEvento.Tipo.DISDETTA, "Disdetta automatica: invito rifiutato. L'orario torna libero sul sito");
                    }
                }
                case IN_ATTESA -> { }
            }
        });
    }

    // ───────────────────────── supporto ─────────────────────────

    private static void azzeraDisdetta(Prenotazione p) {
        p.setDisdettaIl(null);
        p.setDisdettaDa(null);
    }

    private void evento(Prenotazione p, PrenotazioneEvento.Tipo tipo, String testo) {
        eventoRepository.save(PrenotazioneEvento.di(p.getId(), tipo, testo));
    }

    private static String etichetta(Prenotazione.Esito e) {
        return switch (e) {
            case INTERESSATO -> "interessato al percorso";
            case CI_PENSA -> "ci pensa";
            case ACQUISTATO -> "ha acquistato";
            case NON_ADATTO -> "non adatto";
        };
    }

    private Prenotazione trova(Long id) {
        return prenotazioneRepository.findConDettagli(id).orElseThrow(() -> new RisorsaNonTrovataException("Prenotazione non trovata"));
    }

    private static String vuotoNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
