package it.edodoc.hq.services;

import it.edodoc.hq.dto.PlannerDto;
import it.edodoc.hq.models.Config;
import it.edodoc.hq.models.PlannerEtichetta;
import it.edodoc.hq.models.PlannerHashtag;
import it.edodoc.hq.models.PlannerSlot;
import it.edodoc.hq.repositories.ConfigRepository;
import it.edodoc.hq.repositories.PlannerEtichettaRepository;
import it.edodoc.hq.repositories.PlannerHashtagRepository;
import it.edodoc.hq.repositories.PlannerPostRepository;
import it.edodoc.hq.repositories.PlannerSlotRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/** Impostazioni del Planner social: rubriche, orari della coda, gruppi di hashtag, approvazione obbligatoria. */
@Service
public class PlannerImpostazioniService {

    public static final String CONFIG_APPROVAZIONE = "PLANNER_APPROVAZIONE_OBBLIGATORIA";
    private static final int GIORNI_CODA = 120;

    private final PlannerEtichettaRepository etichettaRepository;
    private final PlannerSlotRepository slotRepository;
    private final PlannerHashtagRepository hashtagRepository;
    private final PlannerPostRepository postRepository;
    private final ConfigRepository configRepository;

    public PlannerImpostazioniService(PlannerEtichettaRepository etichettaRepository, PlannerSlotRepository slotRepository,
                                      PlannerHashtagRepository hashtagRepository, PlannerPostRepository postRepository,
                                      ConfigRepository configRepository) {
        this.etichettaRepository = etichettaRepository;
        this.slotRepository = slotRepository;
        this.hashtagRepository = hashtagRepository;
        this.postRepository = postRepository;
        this.configRepository = configRepository;
    }

    // ── Approvazione ──

    public boolean approvazioneObbligatoria() {
        return configRepository.findByChiave(CONFIG_APPROVAZIONE)
                .map(Config::getValore)
                .map(v -> "true".equalsIgnoreCase(v.trim()))
                .orElse(false);
    }

    @Transactional
    public void salvaApprovazioneObbligatoria(boolean attiva) {
        Config c = configRepository.findByChiave(CONFIG_APPROVAZIONE).orElseGet(() -> {
            Config nuova = new Config();
            nuova.setChiave(CONFIG_APPROVAZIONE);
            nuova.setDescrizione("Planner social: true = i post di chi non approva passano dall'approvazione prima di essere programmati");
            return nuova;
        });
        c.setValore(attiva ? "true" : "false");
        configRepository.save(c);
    }

    // ── Rubriche ──

    @Transactional(readOnly = true)
    public List<PlannerDto.Etichetta> etichette() {
        return etichettaRepository.findAllByOrderByPosizioneAscIdAsc().stream().map(PlannerImpostazioniService::dto).toList();
    }

    @Transactional
    public PlannerDto.Etichetta creaEtichetta(PlannerDto.EtichettaRequest req) {
        PlannerEtichetta e = new PlannerEtichetta();
        applica(e, req);
        e.setPosizione(etichettaRepository.findAllByOrderByPosizioneAscIdAsc().stream()
                .mapToInt(PlannerEtichetta::getPosizione).max().orElse(0) + 1);
        e.setCreatoIl(LocalDateTime.now());
        return dto(etichettaRepository.save(e));
    }

    @Transactional
    public PlannerDto.Etichetta aggiornaEtichetta(Long id, PlannerDto.EtichettaRequest req) {
        PlannerEtichetta e = etichettaRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Rubrica non trovata."));
        applica(e, req);
        return dto(etichettaRepository.save(e));
    }

    /** I post della rubrica restano, senza rubrica (ON DELETE SET NULL). */
    @Transactional
    public void eliminaEtichetta(Long id) {
        etichettaRepository.deleteById(id);
    }

    @Transactional
    public List<PlannerDto.Etichetta> ordinaEtichette(List<Long> ids) {
        List<PlannerEtichetta> tutte = etichettaRepository.findAllByOrderByPosizioneAscIdAsc();
        for (PlannerEtichetta e : tutte) {
            int i = ids == null ? -1 : ids.indexOf(e.getId());
            e.setPosizione(i < 0 ? 1000 + e.getPosizione() : i + 1);
        }
        etichettaRepository.saveAll(tutte);
        return etichette();
    }

    private static void applica(PlannerEtichetta e, PlannerDto.EtichettaRequest req) {
        if (req == null || !StringUtils.hasText(req.nome())) {
            throw new IllegalArgumentException("Dai un nome alla rubrica.");
        }
        String colore = req.colore() == null ? "" : req.colore().trim();
        if (!colore.matches("^#[0-9a-fA-F]{6}$")) {
            throw new IllegalArgumentException("Colore non valido.");
        }
        Integer obiettivo = req.obiettivoSettimanale();
        if (obiettivo != null && (obiettivo < 1 || obiettivo > 50)) {
            throw new IllegalArgumentException("L'obiettivo settimanale va da 1 a 50 post.");
        }
        e.setNome(PlannerUtenti.tronca(req.nome(), 60));
        e.setColore(colore.toLowerCase(Locale.ROOT));
        e.setDescrizione(StringUtils.hasText(req.descrizione()) ? PlannerUtenti.tronca(req.descrizione(), 300) : null);
        e.setObiettivoSettimanale(obiettivo);
    }

    static PlannerDto.Etichetta dto(PlannerEtichetta e) {
        return new PlannerDto.Etichetta(e.getId(), e.getNome(), e.getColore(), e.getDescrizione(),
                e.getObiettivoSettimanale(), e.getPosizione());
    }

    // ── Coda ──

    @Transactional(readOnly = true)
    public List<PlannerDto.Slot> slot() {
        return slotRepository.findAllByOrderByGiornoAscOraAsc().stream()
                .map(s -> new PlannerDto.Slot(s.getId(), s.getGiorno(), s.getOra().toString()))
                .toList();
    }

    /** Sostituisce tutti gli orari della coda. */
    @Transactional
    public List<PlannerDto.Slot> salvaSlot(List<PlannerDto.SlotRequest> richiesti) {
        Set<String> visti = new HashSet<>();
        List<PlannerSlot> nuovi = new java.util.ArrayList<>();
        for (PlannerDto.SlotRequest r : richiesti == null ? List.<PlannerDto.SlotRequest>of() : richiesti) {
            if (r.giorno() < 1 || r.giorno() > 7) {
                throw new IllegalArgumentException("Giorno non valido.");
            }
            LocalTime ora;
            try {
                ora = LocalTime.parse(r.ora()).truncatedTo(ChronoUnit.MINUTES);
            } catch (DateTimeParseException | NullPointerException e) {
                throw new IllegalArgumentException("Orario non valido: " + r.ora());
            }
            if (visti.add(r.giorno() + "|" + ora)) {
                nuovi.add(PlannerSlot.builder().giorno((short) r.giorno()).ora(ora).build());
            }
        }
        slotRepository.deleteAllInBatch();
        slotRepository.flush();
        slotRepository.saveAll(nuovi);
        return slot();
    }

    /** Il primo orario della coda libero (nessun post già lì) da adesso in avanti, o dal giorno indicato. */
    @Transactional(readOnly = true)
    public PlannerDto.ProssimoSlot prossimoSlot(Long brandId, LocalDate dal) {
        List<PlannerSlot> slot = slotRepository.findAllByOrderByGiornoAscOraAsc();
        if (slot.isEmpty()) {
            throw new IllegalArgumentException("La coda non ha orari: aggiungili nelle impostazioni del Planner.");
        }
        LocalDateTime adesso = LocalDateTime.now(SocialTempo.ROMA);
        LocalDateTime inizio = dal == null || dal.atStartOfDay().isBefore(adesso) ? adesso : dal.atStartOfDay();
        LocalDateTime fine = inizio.plusDays(GIORNI_CODA);
        Set<LocalDateTime> occupati = postRepository.orariOccupati(brandId, inizio.minusMinutes(1), fine).stream()
                .map(t -> t.truncatedTo(ChronoUnit.MINUTES))
                .collect(Collectors.toCollection(LinkedHashSet::new));
        for (LocalDate g = inizio.toLocalDate(); !g.atStartOfDay().isAfter(fine); g = g.plusDays(1)) {
            int giorno = g.getDayOfWeek().getValue();
            for (PlannerSlot s : slot) {
                if (s.getGiorno() != giorno) {
                    continue;
                }
                LocalDateTime t = g.atTime(s.getOra());
                if (t.isAfter(adesso.plusMinutes(4)) && !t.isBefore(inizio) && !occupati.contains(t)) {
                    return new PlannerDto.ProssimoSlot(t.toString());
                }
            }
        }
        throw new IllegalArgumentException("Nessun orario libero nella coda per i prossimi " + GIORNI_CODA + " giorni.");
    }

    // ── Hashtag ──

    @Transactional(readOnly = true)
    public List<PlannerDto.Hashtag> hashtag() {
        return hashtagRepository.findAllByOrderByUsiDescNomeAsc().stream().map(PlannerImpostazioniService::dto).toList();
    }

    @Transactional
    public PlannerDto.Hashtag creaHashtag(PlannerDto.HashtagRequest req) {
        PlannerHashtag h = new PlannerHashtag();
        applica(h, req);
        h.setCreatoIl(LocalDateTime.now());
        return dto(hashtagRepository.save(h));
    }

    @Transactional
    public PlannerDto.Hashtag aggiornaHashtag(Long id, PlannerDto.HashtagRequest req) {
        PlannerHashtag h = hashtagRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Gruppo di hashtag non trovato."));
        applica(h, req);
        return dto(hashtagRepository.save(h));
    }

    @Transactional
    public void eliminaHashtag(Long id) {
        hashtagRepository.deleteById(id);
    }

    @Transactional
    public void usoHashtag(Long id) {
        hashtagRepository.findById(id).ifPresent(h -> {
            h.setUsi(h.getUsi() + 1);
            hashtagRepository.save(h);
        });
    }

    private static void applica(PlannerHashtag h, PlannerDto.HashtagRequest req) {
        if (req == null || !StringUtils.hasText(req.nome())) {
            throw new IllegalArgumentException("Dai un nome al gruppo.");
        }
        String tag = normalizzaHashtag(req.hashtag());
        if (tag.isEmpty()) {
            throw new IllegalArgumentException("Aggiungi almeno un hashtag.");
        }
        h.setNome(PlannerUtenti.tronca(req.nome(), 60));
        h.setHashtag(tag);
    }

    /** «#Nutrizione, alimentazione #salute» → «nutrizione alimentazione salute» (senza #, minuscolo, senza doppioni). */
    static String normalizzaHashtag(String testo) {
        if (testo == null) {
            return "";
        }
        return Arrays.stream(testo.split("[\\s,;]+"))
                .map(t -> t.replaceFirst("^#+", "").replaceAll("[^\\p{L}\\p{N}_]", "").toLowerCase(Locale.ROOT))
                .filter(t -> !t.isEmpty())
                .distinct()
                .limit(60)
                .collect(Collectors.joining(" "));
    }

    static PlannerDto.Hashtag dto(PlannerHashtag h) {
        return new PlannerDto.Hashtag(h.getId(), h.getNome(), h.getHashtag(), h.getUsi());
    }
}
