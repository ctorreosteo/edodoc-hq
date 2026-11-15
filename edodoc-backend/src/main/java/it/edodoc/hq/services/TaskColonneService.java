package it.edodoc.hq.services;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import it.edodoc.hq.dto.TaskDto.Colonna;
import it.edodoc.hq.dto.TaskDto.DisposizioneColonne;
import it.edodoc.hq.models.TaskColonneUtente;
import it.edodoc.hq.repositories.TaskColonneUtenteRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Colonne della vista lista dei task, per utente: quali, in che ordine e quanto larghe. Il catalogo delle colonne
 * sta nel gestionale; qui si controlla solo la forma, così una colonna nuova non chiede di toccare il backend.
 */
@Service
public class TaskColonneService {

    private static final Logger logger = LoggerFactory.getLogger(TaskColonneService.class);

    private static final Pattern CONTESTO = Pattern.compile("predefinita|lista:[1-9]\\d{0,17}");
    private static final Pattern ID_COLONNA = Pattern.compile("[a-z][A-Za-z0-9]{0,39}");
    private static final int MAX_COLONNE = 60;
    private static final int MAX_CONTESTI = 300;
    private static final int LARGHEZZA_MIN = 40;
    private static final int LARGHEZZA_MAX = 1200;
    private static final TypeReference<List<Colonna>> TIPO = new TypeReference<>() {
    };

    private final TaskColonneUtenteRepository repository;
    private final ObjectMapper objectMapper;

    public TaskColonneService(TaskColonneUtenteRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    /** Tutte le disposizioni dell'utente: la predefinita (se l'ha cambiata) e quelle su misura delle liste. */
    @Transactional(readOnly = true)
    public List<DisposizioneColonne> elenco(Long utenteId) {
        return repository.findByUtenteId(utenteId).stream()
                .map(this::toDto)
                .filter(Objects::nonNull)
                .sorted(Comparator.comparing(DisposizioneColonne::contesto))
                .toList();
    }

    @Transactional
    public DisposizioneColonne salva(String contesto, List<Colonna> colonne, Long utenteId) {
        verificaContesto(contesto);
        List<Colonna> pulite = valida(colonne);
        TaskColonneUtente riga = repository.findById(new TaskColonneUtente.Chiave(utenteId, contesto))
                .orElseGet(() -> {
                    if (repository.countByUtenteId(utenteId) >= MAX_CONTESTI) {
                        throw new IllegalArgumentException("Troppe liste con colonne su misura");
                    }
                    return new TaskColonneUtente(utenteId, contesto);
                });
        try {
            riga.setColonne(objectMapper.writeValueAsString(pulite));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Colonne non salvate", e);
        }
        riga.setAggiornatoIl(LocalDateTime.now());
        return toDto(repository.save(riga));
    }

    /** Toglie la disposizione: per una lista torna a valere la predefinita, per la predefinita quella del gestionale. */
    @Transactional
    public void ripristina(String contesto, Long utenteId) {
        verificaContesto(contesto);
        repository.deleteById(new TaskColonneUtente.Chiave(utenteId, contesto));
    }

    private static void verificaContesto(String contesto) {
        if (contesto == null || !CONTESTO.matcher(contesto).matches()) {
            throw new IllegalArgumentException("Contesto delle colonne non valido");
        }
    }

    static List<Colonna> valida(List<Colonna> colonne) {
        if (colonne == null) {
            throw new IllegalArgumentException("Colonne mancanti");
        }
        if (colonne.size() > MAX_COLONNE) {
            throw new IllegalArgumentException("Troppe colonne");
        }
        Set<String> viste = new HashSet<>();
        List<Colonna> pulite = new ArrayList<>();
        for (Colonna c : colonne) {
            if (c == null || c.id() == null || !ID_COLONNA.matcher(c.id()).matches()) {
                throw new IllegalArgumentException("Colonna non valida");
            }
            if (!viste.add(c.id())) {
                continue;
            }
            Integer larghezza = c.larghezza() == null ? null
                    : Math.max(LARGHEZZA_MIN, Math.min(LARGHEZZA_MAX, c.larghezza()));
            pulite.add(new Colonna(c.id(), larghezza));
        }
        return pulite;
    }

    private DisposizioneColonne toDto(TaskColonneUtente riga) {
        try {
            return new DisposizioneColonne(riga.getContesto(), objectMapper.readValue(riga.getColonne(), TIPO),
                    riga.getAggiornatoIl());
        } catch (JsonProcessingException e) {
            logger.warn("Task: colonne di {} in {} illeggibili: {}", riga.getUtenteId(), riga.getContesto(), e.getMessage());
            return null;
        }
    }
}
