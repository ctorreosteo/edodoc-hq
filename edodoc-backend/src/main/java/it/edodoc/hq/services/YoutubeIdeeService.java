package it.edodoc.hq.services;

import it.edodoc.hq.dto.YoutubeDto;
import it.edodoc.hq.exception.RisorsaNonTrovataException;
import it.edodoc.hq.models.Utente;
import it.edodoc.hq.models.YoutubeIdea;
import it.edodoc.hq.repositories.UtenteRepository;
import it.edodoc.hq.repositories.YoutubeIdeaRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Piano editoriale YouTube: schede in colonne per stato, ordinate a mano (trascinamento).
 * In EdoDoc lavora solo il dottore: il responsabile è facoltativo e si sceglie tra gli utenti ADMIN attivi.
 */
@Service
public class YoutubeIdeeService {

    private final YoutubeIdeaRepository repository;
    private final UtenteRepository utenteRepository;

    public YoutubeIdeeService(YoutubeIdeaRepository repository, UtenteRepository utenteRepository) {
        this.repository = repository;
        this.utenteRepository = utenteRepository;
    }

    @Transactional(readOnly = true)
    public List<YoutubeDto.Idea> elenco() {
        List<YoutubeIdea> idee = repository.findAllByOrderByPosizioneAscIdAsc();
        Map<Long, String> nomi = nomi(idee.stream().map(YoutubeIdea::getResponsabileUtenteId).filter(Objects::nonNull).toList());
        return idee.stream().map(i -> dto(i, nomi)).toList();
    }

    @Transactional(readOnly = true)
    public List<YoutubeDto.Persona> responsabili() {
        return utenteRepository.findAll().stream()
                .filter(u -> u.getRuolo() == Utente.Ruolo.ADMIN && Boolean.TRUE.equals(u.getAttivo()))
                .sorted(Comparator.comparing((Utente u) -> u.getCognome().toLowerCase(Locale.ROOT))
                        .thenComparing(u -> u.getNome().toLowerCase(Locale.ROOT)))
                .map(u -> new YoutubeDto.Persona(u.getId(), nome(u)))
                .toList();
    }

    @Transactional
    public YoutubeDto.Idea crea(YoutubeDto.IdeaRequest req, Utente autore) {
        YoutubeIdea i = new YoutubeIdea();
        applica(i, req);
        i.setCreataDaUtenteId(autore != null ? autore.getId() : null);
        // In cima alla sua colonna
        i.setPosizione(repository.findAllByOrderByPosizioneAscIdAsc().stream()
                .filter(x -> x.getStato().equals(i.getStato()))
                .mapToInt(YoutubeIdea::getPosizione).min().orElse(1) - 1);
        YoutubeIdea salvata = repository.save(i);
        return dto(salvata, nomi(salvata.getResponsabileUtenteId() == null ? List.of() : List.of(salvata.getResponsabileUtenteId())));
    }

    @Transactional
    public YoutubeDto.Idea aggiorna(Long id, YoutubeDto.IdeaRequest req) {
        YoutubeIdea i = trova(id);
        applica(i, req);
        YoutubeIdea salvata = repository.save(i);
        return dto(salvata, nomi(salvata.getResponsabileUtenteId() == null ? List.of() : List.of(salvata.getResponsabileUtenteId())));
    }

    @Transactional
    public void elimina(Long id) {
        repository.delete(trova(id));
    }

    @Transactional
    public List<YoutubeDto.Idea> riordina(List<YoutubeDto.OrdineVoce> ordine) {
        if (ordine == null || ordine.isEmpty()) {
            return elenco();
        }
        Map<Long, YoutubeIdea> perId = repository.findAllById(ordine.stream().map(YoutubeDto.OrdineVoce::id).toList())
                .stream().collect(Collectors.toMap(YoutubeIdea::getId, Function.identity()));
        for (YoutubeDto.OrdineVoce v : ordine) {
            YoutubeIdea i = perId.get(v.id());
            if (i == null) {
                continue;
            }
            if (v.stato() != null) {
                i.setStato(stato(v.stato()));
            }
            i.setPosizione(v.posizione());
        }
        repository.saveAll(perId.values());
        return elenco();
    }

    private void applica(YoutubeIdea i, YoutubeDto.IdeaRequest req) {
        if (req == null || req.titolo() == null || req.titolo().isBlank()) {
            throw new IllegalArgumentException("Il titolo è obbligatorio");
        }
        String titolo = req.titolo().trim();
        i.setTitolo(titolo.length() > 200 ? titolo.substring(0, 200) : titolo);
        i.setNote(req.note() == null || req.note().isBlank() ? null : req.note());
        i.setStato(req.stato() == null ? (i.getStato() == null ? "IDEA" : i.getStato()) : stato(req.stato()));
        i.setFormato(valore(req.formato(), YoutubeIdea.FORMATI, "VIDEO", "Formato"));
        i.setPriorita(valore(req.priorita(), YoutubeIdea.PRIORITA, "MEDIA", "Priorità"));
        try {
            i.setDataUscita(req.dataUscita() == null || req.dataUscita().isBlank() ? null : LocalDate.parse(req.dataUscita()));
        } catch (Exception e) {
            throw new IllegalArgumentException("Data di uscita non valida");
        }
        String video = req.videoId() == null ? null : estraiVideoId(req.videoId().trim());
        i.setVideoId(video == null || video.isBlank() ? null : video);
        if (req.responsabileId() != null && utenteRepository.findById(req.responsabileId())
                .filter(u -> u.getRuolo() == Utente.Ruolo.ADMIN).isEmpty()) {
            throw new IllegalArgumentException("Responsabile non trovato");
        }
        i.setResponsabileUtenteId(req.responsabileId());
    }

    /** Accetta l'ID o un link YouTube (watch?v=, youtu.be/, shorts/). */
    static String estraiVideoId(String s) {
        if (s.isEmpty()) {
            return null;
        }
        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("(?:v=|youtu\\.be/|shorts/|embed/|live/)([A-Za-z0-9_-]{11})").matcher(s);
        if (m.find()) {
            return m.group(1);
        }
        if (s.matches("[A-Za-z0-9_-]{11}")) {
            return s;
        }
        throw new IllegalArgumentException("Link o ID del video YouTube non valido");
    }

    private static String stato(String s) {
        return valore(s, YoutubeIdea.STATI, "IDEA", "Stato");
    }

    private static String valore(String s, List<String> ammessi, String predefinito, String nome) {
        if (s == null || s.isBlank()) {
            return predefinito;
        }
        String v = s.trim().toUpperCase(Locale.ROOT);
        if (!ammessi.contains(v)) {
            throw new IllegalArgumentException(nome + " non valido");
        }
        return v;
    }

    private YoutubeIdea trova(Long id) {
        return repository.findById(id).orElseThrow(() -> new RisorsaNonTrovataException("Scheda non trovata"));
    }

    private Map<Long, String> nomi(Collection<Long> ids) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        return utenteRepository.findAllById(new HashSet<>(ids)).stream().collect(Collectors.toMap(Utente::getId, YoutubeIdeeService::nome));
    }

    /** «Nome Cognome»; l'username se mancano. */
    private static String nome(Utente u) {
        String n = ((u.getNome() == null ? "" : u.getNome().trim()) + " " + (u.getCognome() == null ? "" : u.getCognome().trim())).trim();
        return n.isEmpty() ? u.getUsername() : n;
    }

    private static YoutubeDto.Idea dto(YoutubeIdea i, Map<Long, String> nomi) {
        return new YoutubeDto.Idea(i.getId(), i.getTitolo(), i.getNote(), i.getStato(), i.getFormato(), i.getPriorita(),
                i.getDataUscita() == null ? null : i.getDataUscita().toString(), i.getVideoId(), i.getResponsabileUtenteId(),
                i.getResponsabileUtenteId() == null ? null : nomi.get(i.getResponsabileUtenteId()), i.getPosizione(),
                i.getCreataIl() == null ? null : i.getCreataIl().toString(),
                i.getAggiornataIl() == null ? null : i.getAggiornataIl().toString());
    }
}
