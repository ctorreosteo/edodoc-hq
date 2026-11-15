package it.edodoc.hq.services;

import it.edodoc.hq.dto.MailingDto;
import it.edodoc.hq.models.MailingContatto;
import it.edodoc.hq.models.MailingContattoCategoriaEsclusa;
import it.edodoc.hq.models.MailingContattoTag;
import it.edodoc.hq.models.MailingEvento;
import it.edodoc.hq.models.MailingInvio;
import it.edodoc.hq.models.MailingSegmento;
import it.edodoc.hq.models.MailingTag;
import it.edodoc.hq.repositories.MailingAutomazioneEmailRepository;
import it.edodoc.hq.repositories.MailingContattoCategoriaEsclusaRepository;
import it.edodoc.hq.repositories.MailingContattoRepository;
import it.edodoc.hq.repositories.MailingContattoTagRepository;
import it.edodoc.hq.repositories.MailingEventoRepository;
import it.edodoc.hq.repositories.MailingInvioRepository;
import it.edodoc.hq.repositories.MailingSegmentoRepository;
import it.edodoc.hq.repositories.MailingTagRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Contatti dell'Email Marketing: pazienti, lead e contatti importati, con consenso e stato di iscrizione.
 *
 * <p>In EdoDoc ogni lead è già un paziente (stato LEAD o LISTA_ATTESA): il contatto si collega solo al paziente.
 * <p>Regole fisse: la chiave è l'email minuscola (un solo contatto per email, con il paziente collegato);
 * nessun automatismo riporta a ISCRITTO un contatto DISISCRITTO, RIMBALZATO o SEGNALATO_SPAM (né la
 * sincronizzazione, né l'import, né gli hook del gestionale): solo un'azione esplicita e motivata.
 */
@Service
public class MailingContattiService {

    private static final Logger logger = LoggerFactory.getLogger(MailingContattiService.class);

    public static final String TAG_PAZIENTE = "PAZIENTE";
    public static final String TAG_LEAD = "LEAD";
    /** Chiamata conoscitiva prenotata (dal sito o dal gestionale). */
    public static final String TAG_CONOSCITIVA_PRENOTATA = "CONOSCITIVA_PRENOTATA";
    /** Percorso acquistato: PERCORSO_METODO_BUSSOLA, PERCORSO_RINNOVO, PERCORSO_MANTENIMENTO. */
    public static final String PREFISSO_PERCORSO = "PERCORSO_";

    /** Stati del paziente che fanno di lui un lead. */
    static final Set<String> STATI_LEAD = Set.of("LEAD", "LISTA_ATTESA");

    public static final String TIPO_PAZIENTE = "PAZIENTE";
    public static final String TIPO_LEAD = "LEAD";
    public static final String TIPO_ALTRO = "ALTRO";

    /** Prima chiave dell'advisory lock per paziente (la seconda è l'id). */
    static final int LOCK_PAZIENTE = 0x4D41494C;

    static final String FONTE_GESTIONALE = "GESTIONALE";
    static final String FONTE_IMPORT = "IMPORT_CSV";
    static final String FONTE_MANUALE = "MANUALE";

    static final Set<MailingContatto.Stato> STATI_BLOCCATI = Set.of(
            MailingContatto.Stato.DISISCRITTO, MailingContatto.Stato.RIMBALZATO, MailingContatto.Stato.SEGNALATO_SPAM);

    private static final int DIMENSIONE_MAX = 200;
    private static final int BATCH = 1000;
    private static final DateTimeFormatter DATA_NOTA = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");

    /** Ordinamenti ammessi per l'elenco ("campo,direzione"): nome API → colonna. */
    static final Map<String, String> ORDINAMENTI = Map.of(
            "creatoIl", "c.creato_il",
            "aggiornatoIl", "c.aggiornato_il",
            "punteggio", "c.punteggio",
            "ultimaAperturaIl", "c.ultima_apertura_il",
            "ultimoClickIl", "c.ultimo_click_il",
            "cognome", "LOWER(c.cognome)",
            "nome", "LOWER(c.nome)",
            "email", "LOWER(c.email)");

    private final MailingContattoRepository contattoRepository;
    private final MailingTagRepository tagRepository;
    private final MailingContattoTagRepository contattoTagRepository;
    private final MailingContattoCategoriaEsclusaRepository categoriaEsclusaRepository;
    private final MailingEventoRepository eventoRepository;
    private final MailingInvioRepository invioRepository;
    private final MailingAutomazioneEmailRepository automazioneEmailRepository;
    private final MailingSegmentoRepository segmentoRepository;
    private final NamedParameterJdbcTemplate jdbc;
    private final ApplicationEventPublisher eventi;
    private final ObjectProvider<MailingMetricheService> metricheService;
    private final ObjectProvider<MailingCodaService> codaService;
    private final ObjectMapper objectMapper;

    public MailingContattiService(MailingContattoRepository contattoRepository,
                                  MailingTagRepository tagRepository,
                                  MailingContattoTagRepository contattoTagRepository,
                                  MailingContattoCategoriaEsclusaRepository categoriaEsclusaRepository,
                                  MailingEventoRepository eventoRepository,
                                  MailingInvioRepository invioRepository,
                                  MailingAutomazioneEmailRepository automazioneEmailRepository,
                                  MailingSegmentoRepository segmentoRepository,
                                  NamedParameterJdbcTemplate jdbc,
                                  ApplicationEventPublisher eventi,
                                  ObjectProvider<MailingMetricheService> metricheService,
                                  ObjectProvider<MailingCodaService> codaService,
                                  ObjectMapper objectMapper) {
        this.contattoRepository = contattoRepository;
        this.tagRepository = tagRepository;
        this.contattoTagRepository = contattoTagRepository;
        this.categoriaEsclusaRepository = categoriaEsclusaRepository;
        this.eventoRepository = eventoRepository;
        this.invioRepository = invioRepository;
        this.automazioneEmailRepository = automazioneEmailRepository;
        this.segmentoRepository = segmentoRepository;
        this.jdbc = jdbc;
        this.eventi = eventi;
        this.metricheService = metricheService;
        this.codaService = codaService;
        this.objectMapper = objectMapper;
    }

    // ═════════════════════════ Collegamento al gestionale ═════════════════════════

    /**
     * Crea o aggiorna il contatto del paziente (chiave = email) e allinea i tag di sistema LEAD/PAZIENTE allo stato del
     * paziente. Null se il paziente non esiste, è anonimizzato o non ha un'email valida. Non cambia mai lo stato di un
     * contatto esistente. Se l'email del paziente è cambiata, il contatto collegato alla vecchia email viene scollegato
     * (e archiviato se non ha altri riferimenti). Base giuridica dei nuovi: CONSENSO per i lead (hanno lasciato i
     * dati per essere ricontattati), CLIENTE_SOFT_SPAM per chi ha già un percorso.
     */
    @Transactional
    public MailingContatto assicuraPerPaziente(long pazienteId) {
        // Gli agganci dello stesso paziente (paziente e visita creati insieme) girano in parallelo: uno alla volta,
        // così il secondo trova il contatto creato dal primo invece di scontrarsi sull'email unica
        jdbc.queryForObject("SELECT CAST(pg_advisory_xact_lock(:chiave, CAST(:paziente AS int)) AS text)",
                new MapSqlParameterSource("chiave", LOCK_PAZIENTE).addValue("paziente", (int) (pazienteId % Integer.MAX_VALUE)),
                String.class);
        List<Map<String, Object>> righe = jdbc.queryForList(
                "SELECT id, nome, cognome, email, stato, archiviato_il FROM pazienti WHERE id = :id AND anonimizzato_il IS NULL",
                Map.of("id", pazienteId));
        Map<String, Object> p = righe.isEmpty() ? null : righe.get(0);
        String email = p == null || p.get("archiviato_il") != null ? null : MailingCsv.normalizzaEmail((String) p.get("email"));

        for (MailingContatto vecchio : contattoRepository.findByPazienteId(pazienteId)) {
            if (email == null || !email.equalsIgnoreCase(vecchio.getEmail())) {
                vecchio.setPazienteId(null);
                archiviaSeOrfano(vecchio);
                vecchio.setAggiornatoIl(MailingTempo.adesso());
                contattoRepository.save(vecchio);
            }
        }
        if (email == null) {
            return null;
        }
        boolean lead = STATI_LEAD.contains(String.valueOf(p.get("stato")));
        Optional<MailingContatto> esistente = contattoRepository.findByEmailIgnoreCase(email);
        MailingContatto c;
        if (esistente.isPresent()) {
            c = esistente.get();
            boolean cambiato = !Objects.equals(c.getPazienteId(), pazienteId);
            c.setPazienteId(pazienteId);
            cambiato |= completaNome(c, (String) p.get("nome"), (String) p.get("cognome"));
            if (cambiato) {
                c.setAggiornatoIl(MailingTempo.adesso());
                c = contattoRepository.save(c);
            }
        } else {
            c = contattoRepository.save(MailingContatto.builder()
                    .email(email)
                    .nome(breve((String) p.get("nome"), 120))
                    .cognome(breve((String) p.get("cognome"), 120))
                    .pazienteId(pazienteId)
                    .stato(MailingContatto.Stato.ISCRITTO)
                    .baseGiuridica(lead ? MailingContatto.BaseGiuridica.CONSENSO : MailingContatto.BaseGiuridica.CLIENTE_SOFT_SPAM)
                    .consensoIl(lead ? MailingTempo.adesso() : null)
                    .fonte(FONTE_GESTIONALE)
                    .token(MailingToken.nuovo(MailingToken.CONTATTO))
                    .creatoIl(MailingTempo.adesso())
                    .build());
            pubblica(MailingEventoGestionale.ISCRIZIONE, c, Map.of("origine", lead ? "LEAD" : "PAZIENTE"));
        }
        if (lead) {
            aggiungiTag(c.getId(), TAG_LEAD, true, null);
        } else {
            aggiungiTag(c.getId(), TAG_PAZIENTE, true, null);
            long contattoId = c.getId();
            tagRepository.findByNomeIgnoreCase(TAG_LEAD)
                    .ifPresent(t -> contattoTagRepository.deleteByContattoIdAndTagId(contattoId, t.getId()));
        }
        return c;
    }

    @Transactional(readOnly = true)
    public Optional<MailingContatto> perEmail(String email) {
        String e = MailingCsv.normalizzaEmail(email);
        if (e == null) {
            e = email == null ? null : email.trim().toLowerCase(Locale.ROOT);
        }
        return StringUtils.hasText(e) ? contattoRepository.findByEmailIgnoreCase(e) : Optional.empty();
    }

    @Transactional(readOnly = true)
    public Optional<MailingDto.ContattoDettaglio> dettaglioPerPaziente(long pazienteId) {
        return contattoRepository.findByPazienteId(pazienteId).stream()
                .min((a, b) -> Integer.compare(prioritaStato(a.getStato()), prioritaStato(b.getStato())))
                .map(c -> dettaglio(c.getId()));
    }

    // ═════════════════════════ Righe e dettaglio ═════════════════════════

    @Transactional(readOnly = true)
    public MailingDto.ContattoRiga riga(MailingContatto c) {
        return righe(List.of(c)).get(0);
    }

    /** Righe di più contatti con poche query (tag, invii, tipo) invece di una per contatto. */
    @Transactional(readOnly = true)
    public List<MailingDto.ContattoRiga> righe(List<MailingContatto> contatti) {
        if (contatti.isEmpty()) {
            return List.of();
        }
        List<Long> ids = contatti.stream().map(MailingContatto::getId).toList();
        Map<Long, List<MailingDto.Tag>> tag = tagPerContatti(ids);
        Map<Long, Long> inviati = new HashMap<>();
        jdbc.query("""
                SELECT contatto_id, COUNT(*) AS n FROM mailing_invii
                WHERE contatto_id IN (:ids) AND inviato_il IS NOT NULL GROUP BY contatto_id""",
                Map.of("ids", ids), rs -> {
                    inviati.put(rs.getLong("contatto_id"), rs.getLong("n"));
                });
        Set<Long> pazientiIds = contatti.stream().map(MailingContatto::getPazienteId).filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<Long, String> statiPazienti = new HashMap<>();
        if (!pazientiIds.isEmpty()) {
            jdbc.query("SELECT id, stato FROM pazienti WHERE id IN (:ids)", Map.of("ids", pazientiIds),
                    rs -> {
                        statiPazienti.put(rs.getLong("id"), rs.getString("stato"));
                    });
        }
        LocalDateTime adesso = MailingTempo.adesso();
        List<MailingDto.ContattoRiga> out = new ArrayList<>();
        for (MailingContatto c : contatti) {
            String tipo = tipo(c.getPazienteId() == null ? null : statiPazienti.get(c.getPazienteId()));
            out.add(new MailingDto.ContattoRiga(
                    c.getId(), c.getEmail(), c.getNome(), c.getCognome(),
                    c.getStato().name(), c.getBaseGiuridica().name(),
                    c.getPazienteId(), tipo,
                    tag.getOrDefault(c.getId(), List.of()),
                    c.getPunteggio() == null ? 0 : c.getPunteggio(),
                    MailingSegmentiSql.coinvolgimento(c.getUltimaAperturaIl(), inviati.getOrDefault(c.getId(), 0L), adesso),
                    MailingTempo.iso(c.getUltimaAperturaIl()),
                    MailingTempo.iso(c.getUltimoClickIl()),
                    MailingTempo.iso(c.getCreatoIl())));
        }
        return out;
    }

    /** LEAD = paziente in stato LEAD o LISTA_ATTESA; PAZIENTE = negli altri stati; ALTRO = senza scheda paziente. */
    static String tipo(String statoPaziente) {
        if (statoPaziente == null) {
            return TIPO_ALTRO;
        }
        return STATI_LEAD.contains(statoPaziente) ? TIPO_LEAD : TIPO_PAZIENTE;
    }

    @Transactional(readOnly = true)
    public MailingDto.ContattoDettaglio dettaglio(long contattoId) {
        MailingContatto c = trova(contattoId);
        MailingDto.Metriche metriche = metriche(contattoId);
        List<Long> categorie = categoriaEsclusaRepository.findByContattoId(contattoId).stream()
                .map(MailingContattoCategoriaEsclusa::getCategoriaId).sorted().toList();
        return new MailingDto.ContattoDettaglio(
                riga(c),
                c.getFonte(),
                MailingTempo.iso(c.getConsensoIl()),
                MailingTempo.iso(c.getDisiscrittoIl()),
                c.getMotivoDisiscrizione(),
                c.getNote(),
                categorie,
                metriche,
                inviiContatto(contattoId),
                eventiContatto(c),
                iscrizioniContatto(contattoId),
                c.getPazienteId() == null ? null : pazienteBreve(c.getPazienteId()));
    }

    private MailingDto.Metriche metriche(long contattoId) {
        MailingMetricheService m = metricheService.getIfAvailable();
        if (m == null) {
            return null;
        }
        try {
            return m.perContatto(contattoId);
        } catch (Exception e) {
            logger.warn("Mailing: metriche del contatto {} non disponibili: {}", contattoId, e.getMessage());
            return m.vuote();
        }
    }

    private List<MailingDto.InvioContatto> inviiContatto(long contattoId) {
        return jdbc.query("""
                SELECT i.id, i.oggetto, i.campagna_id, mc.nome AS campagna_nome, ae.automazione_id,
                       a.nome AS automazione_nome, i.stato, i.inviato_il, i.prima_apertura_il, i.aperture,
                       i.primo_click_il, i.click, i.risposto_il
                FROM mailing_invii i
                LEFT JOIN mailing_campagne mc ON mc.id = i.campagna_id
                LEFT JOIN mailing_automazioni_email ae ON ae.id = i.automazione_email_id
                LEFT JOIN mailing_automazioni a ON a.id = ae.automazione_id
                WHERE i.contatto_id = :id
                ORDER BY COALESCE(i.inviato_il, i.programmato_per) DESC, i.id DESC
                LIMIT 50""", Map.of("id", contattoId), (rs, n) -> new MailingDto.InvioContatto(
                rs.getLong("id"),
                rs.getString("oggetto"),
                (Long) rs.getObject("campagna_id", Long.class),
                rs.getString("campagna_nome"),
                (Long) rs.getObject("automazione_id", Long.class),
                rs.getString("automazione_nome"),
                rs.getString("stato"),
                MailingTempo.iso(toLocalDateTime(rs.getTimestamp("inviato_il"))),
                MailingTempo.iso(toLocalDateTime(rs.getTimestamp("prima_apertura_il"))),
                rs.getInt("aperture"),
                MailingTempo.iso(toLocalDateTime(rs.getTimestamp("primo_click_il"))),
                rs.getInt("click"),
                MailingTempo.iso(toLocalDateTime(rs.getTimestamp("risposto_il")))));
    }

    private List<MailingDto.Attivita> eventiContatto(MailingContatto c) {
        String nome = nomeCompleto(c.getNome(), c.getCognome());
        return jdbc.query("""
                SELECT e.id, e.tipo, e.avvenuto_il, e.campagna_id, e.automazione_id, e.url, e.dispositivo, e.valore,
                       e.automatico, COALESCE(i.oggetto, mc.oggetto) AS oggetto
                FROM mailing_eventi e
                LEFT JOIN mailing_invii i ON i.id = e.invio_id
                LEFT JOIN mailing_campagne mc ON mc.id = e.campagna_id
                WHERE e.contatto_id = :id
                ORDER BY e.avvenuto_il DESC, e.id DESC
                LIMIT 50""", Map.of("id", c.getId()), (rs, n) -> new MailingDto.Attivita(
                rs.getLong("id"),
                rs.getString("tipo"),
                MailingTempo.iso(toLocalDateTime(rs.getTimestamp("avvenuto_il"))),
                c.getId(),
                nome,
                c.getEmail(),
                (Long) rs.getObject("campagna_id", Long.class),
                (Long) rs.getObject("automazione_id", Long.class),
                messaggioAttivita(rs.getString("tipo"), rs.getString("oggetto"), rs.getBoolean("automatico")),
                rs.getString("url"),
                rs.getString("dispositivo"),
                rs.getBigDecimal("valore")));
    }

    /** Testo breve della voce del feed, es. "Ha aperto «Novità di ottobre»". */
    public static String messaggioAttivita(String tipo, String oggetto, boolean automatico) {
        String suffisso = StringUtils.hasText(oggetto) ? " «" + oggetto.trim() + "»" : "";
        if (tipo == null) {
            return "";
        }
        return switch (tipo) {
            case "INVIATO" -> "Ha ricevuto" + suffisso;
            case "APERTURA" -> (automatico ? "Apertura automatica" : "Ha aperto") + suffisso;
            case "CLICK" -> (automatico ? "Click automatico" : "Ha cliccato") + suffisso;
            case "RISPOSTA" -> "Ha risposto" + suffisso;
            case "DISISCRIZIONE" -> "Si è disiscritto" + suffisso;
            case "RIMBALZO" -> "Email rimbalzata" + suffisso;
            case "SPAM" -> "Ha segnalato come spam" + suffisso;
            case "CONVERSIONE_VISITA" -> "Ha prenotato una visita dopo il click" + suffisso;
            case "CONVERSIONE_ACQUISTO" -> "Ha acquistato dopo il click" + suffisso;
            default -> tipo;
        };
    }

    private List<MailingDto.IscrizioneContatto> iscrizioniContatto(long contattoId) {
        return jdbc.query("""
                SELECT s.id, s.automazione_id, a.nome AS automazione_nome, s.stato, s.nodo_corrente,
                       s.prossima_azione_il, s.iniziata_il
                FROM mailing_automazioni_iscrizioni s
                JOIN mailing_automazioni a ON a.id = s.automazione_id
                WHERE s.contatto_id = :id
                ORDER BY s.iniziata_il DESC
                LIMIT 50""", Map.of("id", contattoId), (rs, n) -> new MailingDto.IscrizioneContatto(
                rs.getLong("id"),
                rs.getLong("automazione_id"),
                rs.getString("automazione_nome"),
                rs.getString("stato"),
                rs.getString("nodo_corrente"),
                MailingTempo.iso(toLocalDateTime(rs.getTimestamp("prossima_azione_il"))),
                MailingTempo.iso(toLocalDateTime(rs.getTimestamp("iniziata_il")))));
    }

    /** Scheda breve del paziente: visite (chiamata conoscitiva esclusa), prossimo appuntamento, spesa. */
    MailingDto.PazienteBreve pazienteBreve(long pazienteId) {
        List<Map<String, Object>> righe = jdbc.queryForList("""
                SELECT p.id, p.nome, p.cognome, p.cellulare, p.stato,
                       (SELECT COUNT(*) FROM visite v WHERE v.paziente_id = p.id AND v.stato = 'EFFETTUATA'
                            AND v.tipo <> 'CHIAMATA_CONOSCITIVA') AS visite,
                       (SELECT MAX(CAST(v.inizio AS DATE)) FROM visite v WHERE v.paziente_id = p.id AND v.stato = 'EFFETTUATA'
                            AND v.tipo <> 'CHIAMATA_CONOSCITIVA') AS ultima,
                       (SELECT MIN(v.inizio) FROM visite v WHERE v.paziente_id = p.id
                            AND v.stato = 'PROGRAMMATA' AND v.inizio >= :ora) AS prossima
                FROM pazienti p WHERE p.id = :id""",
                Map.of("id", pazienteId, "ora", Timestamp.valueOf(MailingTempo.adesso())));
        if (righe.isEmpty()) {
            return null;
        }
        Map<String, Object> p = righe.get(0);
        Object ultima = p.get("ultima");
        return new MailingDto.PazienteBreve(
                pazienteId,
                nomeCompleto((String) p.get("nome"), (String) p.get("cognome")),
                StringUtils.hasText((String) p.get("cellulare")) ? ((String) p.get("cellulare")).trim() : null,
                ((Number) p.get("visite")).intValue(),
                ultima == null ? null : toLocalDate(ultima).toString(),
                MailingTempo.iso(toLocalDateTime(p.get("prossima"))),
                (String) p.get("stato"),
                spesaTotale(pazienteId));
    }

    /** Somma dei pagamenti incassati dal paziente. */
    BigDecimal spesaTotale(long pazienteId) {
        BigDecimal spesa = jdbc.queryForObject(
                "SELECT COALESCE(SUM(importo), 0) FROM pagamenti WHERE paziente_id = :id AND stato = 'PAGATO'",
                Map.of("id", pazienteId), BigDecimal.class);
        return spesa == null ? BigDecimal.ZERO : spesa.setScale(2, java.math.RoundingMode.HALF_UP);
    }

    // ═════════════════════════ Elenco ═════════════════════════

    @Transactional(readOnly = true)
    public MailingDto.Pagina<MailingDto.ContattoRiga> elenco(String q, String stato, Long tagId, Long segmentoId,
                                                             Integer pagina, Integer dimensione, String ordina) {
        int pag = pagina == null || pagina < 0 ? 0 : pagina;
        int dim = dimensione == null || dimensione <= 0 ? 50 : Math.min(dimensione, DIMENSIONE_MAX);
        MapSqlParameterSource par = new MapSqlParameterSource();
        List<String> where = new ArrayList<>();
        if (StringUtils.hasText(q)) {
            String testo = q.trim();
            if (testo.length() > 120) {
                testo = testo.substring(0, 120);
            }
            par.addValue("q", "%" + MailingSegmentiSql.escapeLike(testo) + "%");
            where.add("(c.email ILIKE :q ESCAPE '\\' OR c.nome ILIKE :q ESCAPE '\\' OR c.cognome ILIKE :q ESCAPE '\\'"
                    + " OR CONCAT_WS(' ', c.nome, c.cognome) ILIKE :q ESCAPE '\\'"
                    + " OR CONCAT_WS(' ', c.cognome, c.nome) ILIKE :q ESCAPE '\\')");
        }
        if (StringUtils.hasText(stato)) {
            par.addValue("stato", statoDa(stato).name());
            where.add("c.stato = :stato");
        }
        if (tagId != null) {
            par.addValue("tagId", tagId);
            where.add("EXISTS (SELECT 1 FROM mailing_contatti_tag ct WHERE ct.contatto_id = c.id AND ct.tag_id = :tagId)");
        }
        if (segmentoId != null) {
            MailingSegmento segmento = segmentoRepository.findById(segmentoId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Segmento non trovato"));
            MailingSegmentiSql.Frammento f = MailingSegmentiSql.compila(leggiRegole(segmento.getRegole()),
                    new MailingSegmentiSql.Contesto(MailingTempo.adesso()),
                    "s");
            par.addValues(f.parametri());
            where.add(f.sql());
        }
        String condizione = where.isEmpty() ? "" : " WHERE " + String.join(" AND ", where);
        Long totale = jdbc.queryForObject("SELECT COUNT(*) FROM mailing_contatti c" + condizione, par, Long.class);
        par.addValue("lim", dim);
        par.addValue("off", (long) pag * dim);
        List<Long> ids = jdbc.queryForList("SELECT c.id FROM mailing_contatti c" + condizione + " ORDER BY "
                + ordinamento(ordina) + " LIMIT :lim OFFSET :off", par, Long.class);
        return new MailingDto.Pagina<>(righe(caricaInOrdine(ids)), totale == null ? 0 : totale, pag, dim);
    }

    /** "campo,direzione" whitelisted; default creatoIl,desc. Sempre con id come spareggio stabile. */
    static String ordinamento(String ordina) {
        String campo = "creatoIl";
        String direzione = "DESC";
        if (StringUtils.hasText(ordina)) {
            String[] parti = ordina.trim().split(",");
            String c = parti[0].trim();
            if (c.startsWith("-")) {
                c = c.substring(1);
                direzione = "DESC";
            } else if (parti.length > 1) {
                direzione = "asc".equalsIgnoreCase(parti[1].trim()) ? "ASC" : "DESC";
            } else {
                direzione = "ASC";
            }
            if (ORDINAMENTI.containsKey(c)) {
                campo = c;
            } else {
                direzione = "DESC";
            }
        }
        return ORDINAMENTI.get(campo) + " " + direzione + " NULLS LAST, c.id " + direzione;
    }

    List<MailingContatto> caricaInOrdine(List<Long> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        Map<Long, MailingContatto> perId = contattoRepository.findAllById(ids).stream()
                .collect(Collectors.toMap(MailingContatto::getId, Function.identity()));
        return ids.stream().map(perId::get).filter(Objects::nonNull).toList();
    }

    // ═════════════════════════ Scrittura manuale ═════════════════════════

    @Transactional
    public MailingDto.ContattoDettaglio crea(MailingDto.ContattoInput input) {
        if (input == null) {
            throw new IllegalArgumentException("Dati del contatto mancanti.");
        }
        String email = emailValida(input.email());
        if (contattoRepository.findByEmailIgnoreCase(email).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Esiste già un contatto con questa email.");
        }
        MailingContatto.BaseGiuridica base = StringUtils.hasText(input.baseGiuridica())
                ? baseDa(input.baseGiuridica()) : MailingContatto.BaseGiuridica.MANUALE;
        Long operatore = MailingOperatore.corrente();
        MailingContatto c = contattoRepository.save(MailingContatto.builder()
                .email(email)
                .nome(breve(input.nome(), 120))
                .cognome(breve(input.cognome(), 120))
                .note(breve(input.note(), 5000))
                .stato(MailingContatto.Stato.ISCRITTO)
                .baseGiuridica(base)
                .consensoIl(base == MailingContatto.BaseGiuridica.CONSENSO ? MailingTempo.adesso() : null)
                .fonte(FONTE_MANUALE)
                .token(MailingToken.nuovo(MailingToken.CONTATTO))
                .creatoIl(MailingTempo.adesso())
                .build());
        collegaPerEmail(c);
        if (input.tagIds() != null) {
            impostaTag(c.getId(), input.tagIds(), operatore);
        }
        if (input.categorieEscluse() != null) {
            impostaCategorieEscluse(c.getId(), input.categorieEscluse());
        }
        pubblica(MailingEventoGestionale.ISCRIZIONE, c, Map.of("origine", "MANUALE"));
        return dettaglio(c.getId());
    }

    @Transactional
    public MailingDto.ContattoDettaglio aggiorna(long contattoId, MailingDto.ContattoInput input) {
        if (input == null) {
            throw new IllegalArgumentException("Dati del contatto mancanti.");
        }
        MailingContatto c = trova(contattoId);
        if (input.email() != null) {
            String email = emailValida(input.email());
            if (!email.equalsIgnoreCase(c.getEmail())) {
                contattoRepository.findByEmailIgnoreCase(email).ifPresent(altro -> {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "Esiste già un contatto con questa email.");
                });
                c.setEmail(email);
            }
        }
        if (input.nome() != null) {
            c.setNome(breve(input.nome(), 120));
        }
        if (input.cognome() != null) {
            c.setCognome(breve(input.cognome(), 120));
        }
        if (input.note() != null) {
            c.setNote(breve(input.note(), 5000));
        }
        if (StringUtils.hasText(input.baseGiuridica())) {
            MailingContatto.BaseGiuridica base = baseDa(input.baseGiuridica());
            if (base == MailingContatto.BaseGiuridica.CONSENSO && c.getBaseGiuridica() != base && c.getConsensoIl() == null) {
                c.setConsensoIl(MailingTempo.adesso());
            }
            c.setBaseGiuridica(base);
        }
        c.setAggiornatoIl(MailingTempo.adesso());
        contattoRepository.save(c);
        if (input.tagIds() != null) {
            impostaTag(contattoId, input.tagIds(), MailingOperatore.corrente());
        }
        if (input.categorieEscluse() != null) {
            impostaCategorieEscluse(contattoId, input.categorieEscluse());
        }
        return dettaglio(contattoId);
    }

    /**
     * Cambio di stato manuale. Riportare a ISCRITTO un contatto DISISCRITTO, RIMBALZATO o SEGNALATO_SPAM richiede
     * un motivo esplicito, registrato nelle note con data e operatore.
     */
    @Transactional
    public void cambiaStato(long contattoId, MailingContatto.Stato stato, String motivo) {
        if (stato == null) {
            throw new IllegalArgumentException("Indica il nuovo stato.");
        }
        MailingContatto c = trova(contattoId);
        MailingContatto.Stato prima = c.getStato();
        if (prima == stato) {
            return;
        }
        if (stato == MailingContatto.Stato.DISISCRITTO) {
            disiscrivi(contattoId, StringUtils.hasText(motivo) ? motivo : "Disiscritto dal personale", null);
            return;
        }
        String motivoPulito = StringUtils.hasText(motivo) ? motivo.trim() : null;
        if (stato == MailingContatto.Stato.ISCRITTO && STATI_BLOCCATI.contains(prima)) {
            if (motivoPulito == null || motivoPulito.length() < 5) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Per riscrivere un contatto "
                        + prima.name().toLowerCase(Locale.ROOT).replace('_', ' ')
                        + " serve il motivo (es. \"ha chiesto di ricevere di nuovo le email il 12/10 al telefono\").");
            }
            c.setRimbalziTemporanei(0);
        }
        if (motivoPulito != null || STATI_BLOCCATI.contains(prima)) {
            c.setNote(aggiungiNota(c.getNote(), MailingTempo.adesso(), nomeOperatore(),
                    prima.name() + " → " + stato.name() + (motivoPulito != null ? ": " + motivoPulito : "")));
        }
        c.setStato(stato);
        c.setAggiornatoIl(MailingTempo.adesso());
        contattoRepository.save(c);
        if (stato != MailingContatto.Stato.ISCRITTO) {
            annullaCoda(contattoId);
        }
    }

    /** Nota datata in coda alle note esistenti: "[25/10/2026 09:30 · Mario Rossi] testo". */
    static String aggiungiNota(String note, LocalDateTime quando, String operatore, String testo) {
        String riga = "[" + DATA_NOTA.format(quando) + (StringUtils.hasText(operatore) ? " · " + operatore : "") + "] "
                + testo;
        String risultato = StringUtils.hasText(note) ? note.stripTrailing() + "\n" + riga : riga;
        return risultato.length() > 20_000 ? risultato.substring(risultato.length() - 20_000) : risultato;
    }

    /**
     * Disiscrizione (pagina pubblica, one-click, risposta, scheda): stato DISISCRITTO, evento DISISCRIZIONE,
     * invii in coda annullati, evento gestionale DISISCRITTO. Idempotente.
     */
    @Transactional
    public void disiscrivi(long contattoId, String motivo, Long invioId) {
        MailingContatto c = trova(contattoId);
        LocalDateTime adesso = MailingTempo.adesso();
        boolean giaDisiscritto = c.getStato() == MailingContatto.Stato.DISISCRITTO;
        MailingInvio invio = invioId == null ? null : invioRepository.findById(invioId)
                .filter(i -> Objects.equals(i.getContattoId(), contattoId)).orElse(null);
        if (!giaDisiscritto) {
            c.setStato(MailingContatto.Stato.DISISCRITTO);
            c.setDisiscrittoIl(adesso);
            c.setMotivoDisiscrizione(breve(motivo, 500));
            c.setAggiornatoIl(adesso);
            contattoRepository.save(c);
        }
        if (invio != null && invio.getDisiscrittoIl() == null) {
            invio.setDisiscrittoIl(adesso);
            invioRepository.save(invio);
        }
        annullaCoda(contattoId);
        if (giaDisiscritto) {
            return;
        }
        Long automazioneId = invio == null || invio.getAutomazioneEmailId() == null ? null
                : automazioneEmailRepository.findById(invio.getAutomazioneEmailId())
                .map(it.edodoc.hq.models.MailingAutomazioneEmail::getAutomazioneId).orElse(null);
        MailingEvento evento = eventoRepository.save(MailingEvento.builder()
                .tipo(MailingEvento.Tipo.DISISCRIZIONE)
                .contattoId(contattoId)
                .invioId(invio == null ? null : invio.getId())
                .campagnaId(invio == null ? null : invio.getCampagnaId())
                .automazioneId(automazioneId)
                .avvenutoIl(adesso)
                .build());
        pubblica(MailingEventoGestionale.DISISCRITTO, c, Map.of());
    }

    private void annullaCoda(long contattoId) {
        MailingCodaService coda = codaService.getIfAvailable();
        if (coda != null) {
            coda.annullaInCodaPerContatto(contattoId);
        } else {
            jdbc.update("UPDATE mailing_invii SET stato = 'ANNULLATO' WHERE contatto_id = :id AND stato = 'IN_CODA'",
                    Map.of("id", contattoId));
        }
    }

    // ═════════════════════════ Tag sui contatti ═════════════════════════

    /**
     * Aggiunge il tag (creato se manca, di sistema se {@code sistema}). Pubblica TAG_AGGIUNTO solo se il tag è nuovo
     * sul contatto.
     */
    @Transactional
    public void aggiungiTag(long contattoId, String nomeTag, boolean sistema, Long utenteId) {
        MailingTag tag = tagPerNome(nomeTag, sistema);
        aggiungiTagId(contattoId, tag.getId(), utenteId);
    }

    /** @return true se il tag era nuovo sul contatto */
    @Transactional
    public boolean aggiungiTagId(long contattoId, long tagId, Long utenteId) {
        MailingContatto c = trova(contattoId);
        if (!tagRepository.existsById(tagId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Tag non trovato");
        }
        if (contattoTagRepository.existsByContattoIdAndTagId(contattoId, tagId)) {
            return false;
        }
        contattoTagRepository.save(MailingContattoTag.builder()
                .contattoId(contattoId).tagId(tagId).aggiuntoDaUtenteId(utenteId).aggiuntoIl(MailingTempo.adesso())
                .build());
        pubblica(MailingEventoGestionale.TAG_AGGIUNTO, c, Map.of("tagId", tagId));
        return true;
    }

    @Transactional
    public void rimuoviTag(long contattoId, long tagId) {
        trova(contattoId);
        contattoTagRepository.deleteByContattoIdAndTagId(contattoId, tagId);
    }

    /** Tag esistente per nome (senza distinzione di maiuscole) oppure nuovo. */
    @Transactional
    public MailingTag tagPerNome(String nomeTag, boolean sistema) {
        String nome = MailingTagService.nomeValido(nomeTag);
        Optional<MailingTag> esistente = tagRepository.findByNomeIgnoreCase(nome);
        if (esistente.isPresent()) {
            return esistente.get();
        }
        // Due agganci in parallelo possono creare lo stesso tag: l'indice unico decide, nessuno dei due fallisce
        jdbc.update("INSERT INTO mailing_tag (nome, sistema, creato_il) VALUES (:nome, :sistema, :adesso) ON CONFLICT DO NOTHING",
                new MapSqlParameterSource("nome", sistema ? nome.toUpperCase(Locale.ROOT) : nome).addValue("sistema", sistema)
                        .addValue("adesso", Timestamp.valueOf(MailingTempo.adesso())));
        return tagRepository.findByNomeIgnoreCase(nome)
                .orElseThrow(() -> new IllegalStateException("Tag " + nome + " non creato"));
    }

    private void impostaTag(long contattoId, List<Long> tagIds, Long utenteId) {
        Set<Long> voluti = tagIds.stream().filter(Objects::nonNull).collect(Collectors.toCollection(LinkedHashSet::new));
        Set<Long> attuali = contattoTagRepository.findByContattoId(contattoId).stream()
                .map(MailingContattoTag::getTagId).collect(Collectors.toSet());
        for (Long id : attuali) {
            if (!voluti.contains(id)) {
                contattoTagRepository.deleteByContattoIdAndTagId(contattoId, id);
            }
        }
        for (Long id : voluti) {
            if (!attuali.contains(id)) {
                aggiungiTagId(contattoId, id, utenteId);
            }
        }
    }

    private void impostaCategorieEscluse(long contattoId, List<Long> categorie) {
        categoriaEsclusaRepository.deleteByContattoId(contattoId);
        categoriaEsclusaRepository.flush();
        Set<Long> ids = categorie.stream().filter(Objects::nonNull).collect(Collectors.toCollection(LinkedHashSet::new));
        for (Long id : ids) {
            categoriaEsclusaRepository.save(MailingContattoCategoriaEsclusa.builder()
                    .contattoId(contattoId).categoriaId(id).esclusoIl(MailingTempo.adesso()).build());
        }
    }

    private Map<Long, List<MailingDto.Tag>> tagPerContatti(Collection<Long> ids) {
        Map<Long, List<MailingDto.Tag>> out = new HashMap<>();
        jdbc.query("""
                SELECT ct.contatto_id, t.id, t.nome, t.colore, t.sistema
                FROM mailing_contatti_tag ct JOIN mailing_tag t ON t.id = ct.tag_id
                WHERE ct.contatto_id IN (:ids) ORDER BY t.sistema DESC, LOWER(t.nome)""",
                Map.of("ids", ids), rs -> {
                    out.computeIfAbsent(rs.getLong("contatto_id"), k -> new ArrayList<>()).add(new MailingDto.Tag(
                            rs.getLong("id"), rs.getString("nome"), rs.getString("colore"), rs.getBoolean("sistema"), null));
                });
        return out;
    }

    // ═════════════════════════ Import CSV ═════════════════════════

    /**
     * Import CSV (max {@value MailingCsv#RIGHE_MAX} righe). Nuovi contatti ISCRITTI con la base giuridica indicata;
     * per gli esistenti si completano solo nome e cognome vuoti e si aggiunge il tag. Un contatto DISISCRITTO,
     * RIMBALZATO o SEGNALATO_SPAM non viene mai riattivato (conta tra i saltati).
     */
    @Transactional
    public MailingDto.EsitoImport importa(byte[] file, Long tagId, String baseGiuridica) {
        if (!StringUtils.hasText(baseGiuridica)) {
            throw new IllegalArgumentException("Indica la base giuridica dei contatti importati (consenso, clienti, ...).");
        }
        MailingContatto.BaseGiuridica base = baseDa(baseGiuridica);
        if (tagId != null && !tagRepository.existsById(tagId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Tag non trovato");
        }
        if (file == null || file.length == 0) {
            throw new IllegalArgumentException("Il file è vuoto.");
        }
        MailingCsv.Esito csv = MailingCsv.leggi(decodifica(file));

        Map<String, MailingCsv.Riga> uniche = new LinkedHashMap<>();
        int duplicati = 0;
        for (MailingCsv.Riga r : csv.righe()) {
            if (uniche.putIfAbsent(r.email(), r) != null) {
                duplicati++;
            }
        }
        Map<String, Map<String, Object>> esistenti = new HashMap<>();
        for (List<String> blocco : blocchi(new ArrayList<>(uniche.keySet()))) {
            jdbc.queryForList("SELECT id, LOWER(email) AS email, nome, cognome, stato FROM mailing_contatti "
                    + "WHERE LOWER(email) IN (:emails)", Map.of("emails", blocco))
                    .forEach(m -> esistenti.put((String) m.get("email"), m));
        }
        LocalDateTime adesso = MailingTempo.adesso();
        List<SqlParameterSource> inserimenti = new ArrayList<>();
        List<SqlParameterSource> aggiornamenti = new ArrayList<>();
        List<Long> daTaggare = new ArrayList<>();
        int saltati = duplicati;
        int aggiornati = 0;
        for (MailingCsv.Riga r : uniche.values()) {
            Map<String, Object> e = esistenti.get(r.email());
            if (e == null) {
                inserimenti.add(new MapSqlParameterSource()
                        .addValue("email", r.email())
                        .addValue("nome", r.nome())
                        .addValue("cognome", r.cognome())
                        .addValue("base", base.name())
                        .addValue("consenso", base == MailingContatto.BaseGiuridica.CONSENSO ? Timestamp.valueOf(adesso) : null, java.sql.Types.TIMESTAMP)
                        .addValue("fonte", FONTE_IMPORT)
                        .addValue("token", MailingToken.nuovo(MailingToken.CONTATTO))
                        .addValue("adesso", Timestamp.valueOf(adesso)));
                continue;
            }
            Long id = ((Number) e.get("id")).longValue();
            MailingContatto.Stato stato = MailingContatto.Stato.valueOf((String) e.get("stato"));
            if (STATI_BLOCCATI.contains(stato)) {
                saltati++;
                continue;
            }
            boolean completaNome = !StringUtils.hasText((String) e.get("nome")) && r.nome() != null;
            boolean completaCognome = !StringUtils.hasText((String) e.get("cognome")) && r.cognome() != null;
            if (completaNome || completaCognome) {
                aggiornamenti.add(new MapSqlParameterSource()
                        .addValue("id", id)
                        .addValue("nome", completaNome ? r.nome() : null)
                        .addValue("cognome", completaCognome ? r.cognome() : null)
                        .addValue("adesso", Timestamp.valueOf(adesso)));
            }
            aggiornati++;
            daTaggare.add(id);
        }
        for (List<SqlParameterSource> blocco : blocchi(inserimenti)) {
            jdbc.batchUpdate("""
                    INSERT INTO mailing_contatti (email, nome, cognome, stato, base_giuridica, consenso_il, fonte, token,
                                                  punteggio, rimbalzi_temporanei, creato_il)
                    VALUES (:email, :nome, :cognome, 'ISCRITTO', :base, :consenso, :fonte, :token, 50, 0, :adesso)
                    ON CONFLICT DO NOTHING""", blocco.toArray(SqlParameterSource[]::new));
        }
        for (List<SqlParameterSource> blocco : blocchi(aggiornamenti)) {
            jdbc.batchUpdate("""
                    UPDATE mailing_contatti SET nome = COALESCE(:nome, nome), cognome = COALESCE(:cognome, cognome),
                           aggiornato_il = :adesso WHERE id = :id""", blocco.toArray(SqlParameterSource[]::new));
        }
        if (tagId != null) {
            List<String> nuoveEmail = inserimenti.stream().map(p -> (String) p.getValue("email")).toList();
            for (List<String> blocco : blocchi(nuoveEmail)) {
                daTaggare.addAll(jdbc.queryForList("SELECT id FROM mailing_contatti WHERE LOWER(email) IN (:emails)",
                        Map.of("emails", blocco), Long.class));
            }
            for (List<Long> blocco : blocchi(daTaggare)) {
                jdbc.update("""
                        INSERT INTO mailing_contatti_tag (contatto_id, tag_id, aggiunto_il, aggiunto_da_utente_id)
                        SELECT x, :tag, :adesso, :utente FROM UNNEST(CAST(:ids AS BIGINT[])) AS x
                        ON CONFLICT DO NOTHING""", new MapSqlParameterSource()
                        .addValue("tag", tagId)
                        .addValue("adesso", Timestamp.valueOf(adesso))
                        .addValue("utente", MailingOperatore.corrente(), java.sql.Types.BIGINT)
                        .addValue("ids", blocco.toArray(Long[]::new)));
            }
        }
        int creati = inserimenti.size();
        List<String> errori = new ArrayList<>(csv.errori());
        if (duplicati > 0) {
            errori.add(duplicati + " righe con email ripetuta nel file (considerate una volta sola).");
        }
        return new MailingDto.EsitoImport(csv.righeLette(), creati, aggiornati, saltati, csv.nonValidi(), errori);
    }

    /** UTF-8 (con o senza BOM); se non è UTF-8 valido, Windows-1252 (CSV salvati da Excel). */
    static String decodifica(byte[] file) {
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(file)).toString();
        } catch (CharacterCodingException e) {
            return new String(file, Charset.forName("windows-1252"));
        }
    }

    // ═════════════════════════ Sincronizzazione completa ═════════════════════════

    /**
     * Allinea i contatti ai pazienti con email valida (non archiviati né anonimizzati; deduplica per email minuscola):
     * crea i mancanti, collega il paziente (quello con la visita più recente), assegna i tag di sistema LEAD, PAZIENTE e
     * PERCORSO_*, archivia i contatti dei pazienti spariti. Non cambia mai lo stato degli esistenti (un DISISCRITTO
     * resta DISISCRITTO) e non fa partire automazioni: nessun evento ISCRIZIONE/TAG_AGGIUNTO.
     */
    @Transactional
    public MailingDto.EsitoSincronizzazione sincronizza() {
        LocalDateTime adesso = MailingTempo.adesso();
        Timestamp ts = Timestamp.valueOf(adesso);

        // Pazienti per email: vince quello con la visita più recente, poi il più recente.
        Map<String, Sorgente> pazienti = new HashMap<>();
        jdbc.query("""
                SELECT p.id, p.nome, p.cognome, p.email, p.stato, p.created_at,
                       (SELECT MAX(v.inizio) FROM visite v WHERE v.paziente_id = p.id) AS ultima_visita
                FROM pazienti p
                WHERE p.email IS NOT NULL AND TRIM(p.email) <> '' AND p.archiviato_il IS NULL AND p.anonimizzato_il IS NULL""",
                Map.of(), rs -> {
                    String email = MailingCsv.normalizzaEmail(rs.getString("email"));
                    if (email == null) {
                        return;
                    }
                    Sorgente s = new Sorgente(rs.getLong("id"), rs.getString("nome"), rs.getString("cognome"),
                            toLocalDateTime(rs.getTimestamp("ultima_visita")), toLocalDateTime(rs.getTimestamp("created_at")),
                            rs.getString("stato"));
                    pazienti.merge(email, s, MailingContattiService::piuRecente);
                });

        Map<String, Map<String, Object>> esistenti = new HashMap<>();
        jdbc.queryForList("SELECT id, LOWER(email) AS email, paziente_id, nome, cognome FROM mailing_contatti",
                Map.of()).forEach(m -> esistenti.put((String) m.get("email"), m));

        List<SqlParameterSource> inserimenti = new ArrayList<>();
        List<SqlParameterSource> aggiornamenti = new ArrayList<>();
        int lead = 0;
        for (Map.Entry<String, Sorgente> voce : pazienti.entrySet()) {
            String email = voce.getKey();
            Sorgente p = voce.getValue();
            boolean diLead = STATI_LEAD.contains(p.stato());
            if (diLead) {
                lead++;
            }
            Map<String, Object> e = esistenti.get(email);
            if (e == null) {
                inserimenti.add(new MapSqlParameterSource()
                        .addValue("email", email)
                        .addValue("nome", breve(p.nome(), 120))
                        .addValue("cognome", breve(p.cognome(), 120))
                        .addValue("paziente", p.id())
                        .addValue("base", diLead ? MailingContatto.BaseGiuridica.CONSENSO.name()
                                : MailingContatto.BaseGiuridica.CLIENTE_SOFT_SPAM.name())
                        .addValue("consenso", diLead ? ts : null, java.sql.Types.TIMESTAMP)
                        .addValue("fonte", FONTE_GESTIONALE)
                        .addValue("token", MailingToken.nuovo(MailingToken.CONTATTO))
                        .addValue("adesso", ts));
                continue;
            }
            Long pazienteAttuale = e.get("paziente_id") == null ? null : ((Number) e.get("paziente_id")).longValue();
            String nuovoNome = StringUtils.hasText((String) e.get("nome")) ? null : breve(p.nome(), 120);
            String nuovoCognome = StringUtils.hasText((String) e.get("cognome")) ? null : breve(p.cognome(), 120);
            if (!Objects.equals(p.id(), pazienteAttuale) || nuovoNome != null || nuovoCognome != null) {
                aggiornamenti.add(new MapSqlParameterSource()
                        .addValue("id", ((Number) e.get("id")).longValue())
                        .addValue("paziente", p.id())
                        .addValue("nome", nuovoNome)
                        .addValue("cognome", nuovoCognome)
                        .addValue("adesso", ts));
            }
        }
        for (List<SqlParameterSource> blocco : blocchi(inserimenti)) {
            jdbc.batchUpdate("""
                    INSERT INTO mailing_contatti (email, nome, cognome, paziente_id, stato, base_giuridica,
                                                  consenso_il, fonte, token, punteggio, rimbalzi_temporanei, creato_il)
                    VALUES (:email, :nome, :cognome, :paziente, 'ISCRITTO', :base, :consenso, :fonte, :token,
                            50, 0, :adesso)
                    ON CONFLICT DO NOTHING""", blocco.toArray(SqlParameterSource[]::new));
        }
        for (List<SqlParameterSource> blocco : blocchi(aggiornamenti)) {
            jdbc.batchUpdate("""
                    UPDATE mailing_contatti SET paziente_id = :paziente,
                           nome = COALESCE(nome, :nome), cognome = COALESCE(cognome, :cognome), aggiornato_il = :adesso
                    WHERE id = :id""", blocco.toArray(SqlParameterSource[]::new));
        }

        // Contatti di pazienti archiviati, anonimizzati o spariti: scollegati e, se nati dal gestionale, archiviati.
        jdbc.update("""
                UPDATE mailing_contatti c SET paziente_id = NULL, aggiornato_il = :adesso
                WHERE c.paziente_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pazienti p WHERE p.id = c.paziente_id
                      AND p.archiviato_il IS NULL AND p.anonimizzato_il IS NULL)""", Map.of("adesso", ts));
        int archiviati = jdbc.update("""
                UPDATE mailing_contatti SET stato = 'ARCHIVIATO', aggiornato_il = :adesso
                WHERE stato = 'ISCRITTO' AND paziente_id IS NULL AND fonte = :fonte""",
                Map.of("adesso", ts, "fonte", FONTE_GESTIONALE));

        long tagPaziente = tagPerNome(TAG_PAZIENTE, true).getId();
        long tagLead = tagPerNome(TAG_LEAD, true).getId();
        jdbc.update("""
                INSERT INTO mailing_contatti_tag (contatto_id, tag_id, aggiunto_il)
                SELECT c.id, :tag, :adesso FROM mailing_contatti c JOIN pazienti p ON p.id = c.paziente_id
                WHERE p.stato NOT IN ('LEAD', 'LISTA_ATTESA')
                ON CONFLICT DO NOTHING""", Map.of("tag", tagPaziente, "adesso", ts));
        jdbc.update("""
                DELETE FROM mailing_contatti_tag ct USING mailing_contatti c, pazienti p
                WHERE ct.tag_id = :tag AND ct.contatto_id = c.id AND p.id = c.paziente_id
                  AND p.stato NOT IN ('LEAD', 'LISTA_ATTESA')""", Map.of("tag", tagLead));
        jdbc.update("""
                INSERT INTO mailing_contatti_tag (contatto_id, tag_id, aggiunto_il)
                SELECT c.id, :tag, :adesso FROM mailing_contatti c JOIN pazienti p ON p.id = c.paziente_id
                WHERE p.stato IN ('LEAD', 'LISTA_ATTESA')
                ON CONFLICT DO NOTHING""", Map.of("tag", tagLead, "adesso", ts));
        for (String tipo : jdbc.queryForList("SELECT DISTINCT tipo FROM percorsi WHERE stato <> 'ANNULLATO'", Map.of(),
                String.class)) {
            long tagPercorso = tagPerNome(PREFISSO_PERCORSO + tipo, true).getId();
            jdbc.update("""
                    INSERT INTO mailing_contatti_tag (contatto_id, tag_id, aggiunto_il)
                    SELECT c.id, :tag, :adesso FROM mailing_contatti c
                    WHERE c.paziente_id IN (SELECT pc.paziente_id FROM percorsi pc WHERE pc.tipo = :tipo AND pc.stato <> 'ANNULLATO')
                    ON CONFLICT DO NOTHING""", Map.of("tag", tagPercorso, "adesso", ts, "tipo", tipo));
        }

        logger.info("Mailing: sincronizzazione contatti — pazienti={}, lead={}, creati={}, aggiornati={}, archiviati={}",
                pazienti.size(), lead, inserimenti.size(), aggiornamenti.size(), archiviati);
        return new MailingDto.EsitoSincronizzazione(pazienti.size(), lead, inserimenti.size(),
                aggiornamenti.size(), archiviati);
    }

    /** Paziente candidato per un'email; {@code riferimento} (ultima visita) decide chi vince. */
    record Sorgente(long id, String nome, String cognome, LocalDateTime riferimento, LocalDateTime creata, String stato) {
    }

    static Sorgente piuRecente(Sorgente a, Sorgente b) {
        int cmp = confrontaDate(a.riferimento(), b.riferimento());
        if (cmp == 0) {
            cmp = confrontaDate(a.creata(), b.creata());
        }
        if (cmp == 0) {
            cmp = Long.compare(a.id(), b.id());
        }
        return cmp >= 0 ? a : b;
    }

    private static int confrontaDate(LocalDateTime a, LocalDateTime b) {
        if (a == null && b == null) {
            return 0;
        }
        if (a == null) {
            return -1;
        }
        if (b == null) {
            return 1;
        }
        return a.compareTo(b);
    }

    // ═════════════════════════ Helper ═════════════════════════

    @Transactional(readOnly = true)
    public MailingContatto trova(long contattoId) {
        return contattoRepository.findById(contattoId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Contatto non trovato"));
    }

    /** Contatto senza paziente, nato dal gestionale e ancora iscritto → ARCHIVIATO. */
    void archiviaSeOrfano(MailingContatto c) {
        if (c.getPazienteId() == null && c.getStato() == MailingContatto.Stato.ISCRITTO
                && FONTE_GESTIONALE.equals(c.getFonte())) {
            c.setStato(MailingContatto.Stato.ARCHIVIATO);
            c.setAggiornatoIl(MailingTempo.adesso());
        }
    }

    /**
     * Anonimizzazione del paziente (diritto all'oblio): i suoi contatti perdono email, nome e note, escono dalle
     * automazioni e la coda si svuota; anche l'indirizzo copiato negli invii sparisce. Restano solo i numeri delle
     * campagne. Gira dentro la transazione dell'anonimizzazione.
     */
    @Transactional
    public void anonimizzaPerPaziente(long pazienteId) {
        List<Long> ids = jdbc.queryForList("SELECT id FROM mailing_contatti WHERE paziente_id = :p",
                Map.of("p", pazienteId), Long.class);
        if (ids.isEmpty()) {
            return;
        }
        Timestamp adesso = Timestamp.valueOf(MailingTempo.adesso());
        MapSqlParameterSource par = new MapSqlParameterSource("ids", ids).addValue("adesso", adesso);
        jdbc.update("UPDATE mailing_invii SET stato = 'ANNULLATO' WHERE contatto_id IN (:ids) AND stato IN ('IN_CODA', 'IN_INVIO')", par);
        jdbc.update("UPDATE mailing_invii SET email = 'anonimo-' || contatto_id || '@anonimizzato.invalid' "
                + "WHERE contatto_id IN (:ids)", par);
        jdbc.update("UPDATE mailing_automazioni_iscrizioni SET stato = 'USCITA', conclusa_il = :adesso "
                + "WHERE contatto_id IN (:ids) AND stato IN ('ATTIVA', 'IN_ATTESA')", par);
        jdbc.update("""
                UPDATE mailing_contatti SET email = 'anonimo-' || id || '@anonimizzato.invalid', nome = NULL, cognome = NULL,
                       note = NULL, motivo_disiscrizione = NULL, paziente_id = NULL, stato = 'ARCHIVIATO', aggiornato_il = :adesso
                WHERE id IN (:ids)""", par);
        jdbc.update("DELETE FROM mailing_contatti_tag WHERE contatto_id IN (:ids)", par);
    }

    /** Dopo l'eliminazione di un paziente: contatti rimasti senza riferimenti → ARCHIVIATO. */
    @Transactional
    public void dopoEliminazionePaziente(Collection<Long> contattoIds) {
        for (Long id : contattoIds) {
            contattoRepository.findById(id).ifPresent(c -> {
                if (c.getPazienteId() != null && !esistePaziente(c.getPazienteId())) {
                    c.setPazienteId(null);
                }
                if (c.getPazienteId() == null && c.getStato() == MailingContatto.Stato.ISCRITTO) {
                    c.setStato(MailingContatto.Stato.ARCHIVIATO);
                    c.setAggiornatoIl(MailingTempo.adesso());
                    annullaCoda(c.getId());
                }
                contattoRepository.save(c);
            });
        }
    }

    private boolean esistePaziente(long pazienteId) {
        Boolean e = jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM pazienti WHERE id = :id)", Map.of("id", pazienteId),
                Boolean.class);
        return Boolean.TRUE.equals(e);
    }

    /** Collega a un paziente con la stessa email (contatti creati a mano). */
    private void collegaPerEmail(MailingContatto c) {
        List<Long> paz = jdbc.queryForList("SELECT id FROM pazienti WHERE LOWER(TRIM(email)) = :e "
                + "AND archiviato_il IS NULL AND anonimizzato_il IS NULL ORDER BY id DESC LIMIT 1",
                Map.of("e", c.getEmail()), Long.class);
        if (!paz.isEmpty()) {
            c.setPazienteId(paz.get(0));
            contattoRepository.save(c);
        }
    }

    void pubblica(String tipo, MailingContatto c, Map<String, Object> parametri) {
        eventi.publishEvent(new MailingEventoGestionale(tipo, c.getId(), c.getPazienteId(), parametri));
    }

    public MailingDto.Attivita attivita(MailingEvento e, MailingContatto c, String oggetto) {
        return new MailingDto.Attivita(
                e.getId(), e.getTipo().name(), MailingTempo.iso(e.getAvvenutoIl()),
                c == null ? e.getContattoId() : c.getId(),
                c == null ? null : nomeCompleto(c.getNome(), c.getCognome()),
                c == null ? null : c.getEmail(),
                e.getCampagnaId(), e.getAutomazioneId(),
                messaggioAttivita(e.getTipo().name(), oggetto, Boolean.TRUE.equals(e.getAutomatico())),
                e.getUrl(), e.getDispositivo(), e.getValore());
    }

    JsonNode leggiRegole(String json) {
        try {
            return json == null ? null : objectMapper.readTree(json);
        } catch (Exception e) {
            throw MailingSegmentiSql.errore("JSON del segmento illeggibile.");
        }
    }

    private static boolean completaNome(MailingContatto c, String nome, String cognome) {
        boolean cambiato = false;
        if (!StringUtils.hasText(c.getNome()) && StringUtils.hasText(nome)) {
            c.setNome(breve(nome, 120));
            cambiato = true;
        }
        if (!StringUtils.hasText(c.getCognome()) && StringUtils.hasText(cognome)) {
            c.setCognome(breve(cognome, 120));
            cambiato = true;
        }
        return cambiato;
    }

    private static int prioritaStato(MailingContatto.Stato s) {
        return s == MailingContatto.Stato.ISCRITTO ? 0 : s == MailingContatto.Stato.ARCHIVIATO ? 2 : 1;
    }

    static String emailValida(String email) {
        String e = MailingCsv.normalizzaEmail(email);
        if (e == null) {
            throw new IllegalArgumentException("Email non valida.");
        }
        return e;
    }

    static MailingContatto.Stato statoDa(String stato) {
        try {
            return MailingContatto.Stato.valueOf(stato.trim().toUpperCase(Locale.ROOT));
        } catch (Exception e) {
            throw new IllegalArgumentException("Stato non valido: usa ISCRITTO, DISISCRITTO, RIMBALZATO, SEGNALATO_SPAM o ARCHIVIATO.");
        }
    }

    static MailingContatto.BaseGiuridica baseDa(String base) {
        try {
            return MailingContatto.BaseGiuridica.valueOf(base.trim().toUpperCase(Locale.ROOT));
        } catch (Exception e) {
            throw new IllegalArgumentException("Base giuridica non valida: usa CONSENSO, CLIENTE_SOFT_SPAM o MANUALE.");
        }
    }

    static String nomeCompleto(String nome, String cognome) {
        String n = ((nome == null ? "" : nome.trim()) + " " + (cognome == null ? "" : cognome.trim())).trim();
        return n.isEmpty() ? null : n;
    }

    private static String nomeOperatore() {
        return OperatoreCorrente.operatore();
    }

    static String breve(String s, int max) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        if (t.isEmpty()) {
            return null;
        }
        return t.length() > max ? t.substring(0, max) : t;
    }

    static <T> List<List<T>> blocchi(List<T> lista) {
        List<List<T>> out = new ArrayList<>();
        for (int i = 0; i < lista.size(); i += BATCH) {
            out.add(lista.subList(i, Math.min(lista.size(), i + BATCH)));
        }
        return out;
    }

    static LocalDateTime toLocalDateTime(Object o) {
        if (o == null) {
            return null;
        }
        if (o instanceof Timestamp t) {
            return t.toLocalDateTime();
        }
        if (o instanceof LocalDateTime l) {
            return l;
        }
        if (o instanceof java.sql.Date d) {
            return d.toLocalDate().atStartOfDay();
        }
        if (o instanceof LocalDate d) {
            return d.atStartOfDay();
        }
        return null;
    }

    static LocalDate toLocalDate(Object o) {
        if (o instanceof java.sql.Date d) {
            return d.toLocalDate();
        }
        if (o instanceof LocalDate d) {
            return d;
        }
        LocalDateTime l = toLocalDateTime(o);
        return l == null ? null : l.toLocalDate();
    }

    /** Nome dell'operatore autenticato per le note ("Nome Cognome" o username). */
    static final class OperatoreCorrente {
        private OperatoreCorrente() {
        }

        static String operatore() {
            try {
                org.springframework.security.core.Authentication auth =
                        org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
                if (auth != null && auth.getPrincipal() instanceof it.edodoc.hq.security.UtenteDetails u) {
                    return u.getUsername();
                }
            } catch (Exception ignored) {
                // nessun operatore
            }
            return null;
        }
    }
}
