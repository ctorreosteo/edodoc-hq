package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import it.edodoc.hq.dto.MailingDto;
import it.edodoc.hq.models.MailingSegmento;
import it.edodoc.hq.repositories.MailingSegmentoRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Segmenti dinamici: regole JSON valutate al momento sui dati del gestionale (SQL whitelisted di
 * {@link MailingSegmentiSql}). Catalogo dei campi per il costruttore visuale e per l'AI.
 */
@Service
public class MailingSegmentiService {

    private static final Logger logger = LoggerFactory.getLogger(MailingSegmentiService.class);

    private static final int CAMPIONE = 8;
    private static final int RICONTEGGI_PER_ELENCO = 10;

    private final MailingSegmentoRepository segmentoRepository;
    private final MailingContattiService contattiService;
    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public MailingSegmentiService(MailingSegmentoRepository segmentoRepository,
                                  MailingContattiService contattiService,
                                  NamedParameterJdbcTemplate jdbc,
                                  ObjectMapper objectMapper) {
        this.segmentoRepository = segmentoRepository;
        this.contattiService = contattiService;
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    // ───────────────────────── Valutazione ─────────────────────────

    /** Contesto corrente: ora di Roma. */
    public MailingSegmentiSql.Contesto contesto() {
        return new MailingSegmentiSql.Contesto(MailingTempo.adesso());
    }

    public MailingSegmentiSql.Frammento compila(JsonNode regole, String prefisso) {
        return MailingSegmentiSql.compila(regole, contesto(), prefisso);
    }

    /** Id dei contatti (in qualsiasi stato) che soddisfano le regole, ordinati. */
    @Transactional(readOnly = true)
    public List<Long> contattiIds(JsonNode regole) {
        MailingSegmentiSql.Frammento f = compila(regole, "p");
        return jdbc.queryForList("SELECT c.id FROM mailing_contatti c WHERE " + f.sql() + " ORDER BY c.id",
                new MapSqlParameterSource(f.parametri()), Long.class);
    }

    @Transactional(readOnly = true)
    public int conta(JsonNode regole) {
        MailingSegmentiSql.Frammento f = compila(regole, "p");
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM mailing_contatti c WHERE " + f.sql(),
                new MapSqlParameterSource(f.parametri()), Integer.class);
        return n == null ? 0 : n;
    }

    @Transactional(readOnly = true)
    public boolean soddisfa(long contattoId, JsonNode regole) {
        MailingSegmentiSql.Frammento f = compila(regole, "p");
        MapSqlParameterSource par = new MapSqlParameterSource(f.parametri()).addValue("contattoId", contattoId);
        Boolean ok = jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM mailing_contatti c WHERE c.id = :contattoId AND "
                + f.sql() + ")", par, Boolean.class);
        return Boolean.TRUE.equals(ok);
    }

    @Transactional(readOnly = true)
    public MailingDto.AnteprimaSegmento anteprima(JsonNode regole) {
        MailingSegmentiSql.Frammento f = compila(regole, "p");
        MapSqlParameterSource par = new MapSqlParameterSource(f.parametri());
        Map<String, Object> conteggi = jdbc.queryForMap("SELECT COUNT(*) AS totale, "
                + "COUNT(*) FILTER (WHERE c.stato = 'ISCRITTO') AS iscritti FROM mailing_contatti c WHERE " + f.sql(), par);
        par.addValue("lim", CAMPIONE);
        List<Long> ids = jdbc.queryForList("SELECT c.id FROM mailing_contatti c WHERE " + f.sql()
                + " ORDER BY (c.stato = 'ISCRITTO') DESC, c.id DESC LIMIT :lim", par, Long.class);
        return new MailingDto.AnteprimaSegmento(
                ((Number) conteggi.get("totale")).intValue(),
                ((Number) conteggi.get("iscritti")).intValue(),
                contattiService.righe(contattiService.caricaInOrdine(ids)));
    }

    // ───────────────────────── CRUD ─────────────────────────

    /** Elenco; i conteggi più vecchi di un'ora si aggiornano (al massimo {@value #RICONTEGGI_PER_ELENCO} per chiamata). */
    @Transactional
    public List<MailingDto.Segmento> elenco() {
        List<MailingSegmento> segmenti = segmentoRepository.findAllByOrderByNomeAsc();
        LocalDateTime soglia = MailingTempo.adesso().minusHours(1);
        int riconteggi = 0;
        for (MailingSegmento s : segmenti) {
            if (riconteggi < RICONTEGGI_PER_ELENCO && (s.getContatoIl() == null || s.getContatoIl().isBefore(soglia))) {
                riconteggi++;
                try {
                    aggiornaConteggio(s);
                } catch (Exception e) {
                    logger.warn("Mailing: conteggio del segmento {} non riuscito: {}", s.getId(), e.getMessage());
                }
            }
        }
        return segmenti.stream().map(this::dto).toList();
    }

    @Transactional(readOnly = true)
    public MailingDto.Segmento dettaglio(long id) {
        return dto(trova(id));
    }

    @Transactional(readOnly = true)
    public JsonNode regoleSegmento(long id) {
        return leggi(trova(id).getRegole());
    }

    @Transactional
    public MailingDto.Segmento crea(MailingDto.SegmentoInput input) {
        MailingSegmento s = new MailingSegmento();
        s.setCreatoDaUtenteId(MailingOperatore.corrente());
        s.setCreatoIl(MailingTempo.adesso());
        applica(s, input);
        s = segmentoRepository.save(s);
        return dto(s);
    }

    @Transactional
    public MailingDto.Segmento aggiorna(long id, MailingDto.SegmentoInput input) {
        MailingSegmento s = trova(id);
        applica(s, input);
        s.setAggiornatoIl(MailingTempo.adesso());
        s = segmentoRepository.save(s);
        return dto(s);
    }

    /** Non si elimina un segmento usato da una campagna non conclusa o da un'automazione non archiviata. */
    @Transactional
    public void elimina(long id) {
        MailingSegmento s = trova(id);
        List<String> usi = new ArrayList<>();
        jdbc.query("""
                SELECT nome, pubblico FROM mailing_campagne
                WHERE stato IN ('BOZZA', 'PROGRAMMATA', 'IN_INVIO', 'TEST_AB', 'IN_PAUSA') AND pubblico IS NOT NULL""",
                Map.of(), rs -> {
                    JsonNode p = leggiSilenzioso(rs.getString("pubblico"));
                    if (p != null && (contieneId(p.get("segmentiIds"), id) || contieneId(p.get("esclusiSegmentiIds"), id))) {
                        usi.add("campagna «" + rs.getString("nome") + "»");
                    }
                });
        jdbc.query("SELECT nome, trigger_config FROM mailing_automazioni WHERE stato <> 'ARCHIVIATA'", Map.of(), rs -> {
            JsonNode t = leggiSilenzioso(rs.getString("trigger_config"));
            JsonNode par = t == null ? null : t.path("parametri");
            if (par != null && par.path("segmentoId").asLong(-1) == id) {
                usi.add("automazione «" + rs.getString("nome") + "»");
            }
        });
        if (!usi.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Il segmento è usato da: " + String.join(", ", usi)
                    + ". Toglilo da lì prima di eliminarlo.");
        }
        segmentoRepository.delete(s);
    }

    private void applica(MailingSegmento s, MailingDto.SegmentoInput input) {
        if (input == null) {
            throw new IllegalArgumentException("Dati del segmento mancanti.");
        }
        if (!StringUtils.hasText(input.nome())) {
            throw new IllegalArgumentException("Il nome del segmento è obbligatorio.");
        }
        String nome = input.nome().trim();
        if (nome.length() > 120) {
            throw new IllegalArgumentException("Il nome del segmento è troppo lungo (massimo 120 caratteri).");
        }
        if (input.regole() == null || input.regole().isNull()) {
            throw new IllegalArgumentException("Il segmento deve avere delle regole.");
        }
        MailingSegmentiSql.valida(input.regole());
        s.setNome(nome);
        s.setDescrizione(input.descrizione() == null ? null
                : MailingContattiService.breve(input.descrizione(), 500));
        s.setColore(MailingTagService.colore(input.colore()));
        try {
            s.setRegole(objectMapper.writeValueAsString(input.regole()));
        } catch (Exception e) {
            throw new IllegalArgumentException("Regole del segmento non leggibili.");
        }
        s.setUltimoConteggio(conta(input.regole()));
        s.setContatoIl(MailingTempo.adesso());
    }

    private void aggiornaConteggio(MailingSegmento s) {
        s.setUltimoConteggio(conta(leggi(s.getRegole())));
        s.setContatoIl(MailingTempo.adesso());
        segmentoRepository.save(s);
    }

    private MailingSegmento trova(long id) {
        return segmentoRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Segmento non trovato"));
    }

    private MailingDto.Segmento dto(MailingSegmento s) {
        return new MailingDto.Segmento(s.getId(), s.getNome(), s.getDescrizione(), s.getColore(),
                leggiSilenzioso(s.getRegole()), s.getUltimoConteggio(), MailingTempo.iso(s.getContatoIl()),
                MailingTempo.iso(s.getAggiornatoIl() != null ? s.getAggiornatoIl() : s.getCreatoIl()));
    }

    private JsonNode leggi(String json) {
        try {
            return json == null ? null : objectMapper.readTree(json);
        } catch (Exception e) {
            throw MailingSegmentiSql.errore("JSON del segmento illeggibile.");
        }
    }

    private JsonNode leggiSilenzioso(String json) {
        try {
            return json == null ? null : objectMapper.readTree(json);
        } catch (Exception e) {
            return null;
        }
    }

    private static boolean contieneId(JsonNode lista, long id) {
        if (lista == null || !lista.isArray()) {
            return false;
        }
        for (JsonNode n : lista) {
            if (n.asLong(-1) == id) {
                return true;
            }
        }
        return false;
    }

    // ───────────────────────── Catalogo ─────────────────────────

    /** Campi del costruttore con etichette italiane, gruppi e opzioni caricate dal DB. */
    @Transactional(readOnly = true)
    public List<MailingDto.CatalogoCampo> catalogo() {
        List<MailingDto.CatalogoCampo> out = new ArrayList<>();
        for (MailingSegmentiSql.Campo campo : MailingSegmentiSql.Campo.values()) {
            out.add(new MailingDto.CatalogoCampo(campo.chiave, campo.etichetta, campo.gruppo, campo.tipoValore,
                    campo.operatori, opzioni(campo), campo.aiuto));
        }
        return out;
    }

    /** Esiti della chiamata conoscitiva (Prenotazione.Esito), anche per i trigger. */
    public static final List<MailingDto.Opzione> ESITI = List.of(
            new MailingDto.Opzione("INTERESSATO", "Interessato"),
            new MailingDto.Opzione("CI_PENSA", "Ci pensa"),
            new MailingDto.Opzione("ACQUISTATO", "Ha acquistato"),
            new MailingDto.Opzione("NON_ADATTO", "Non adatto"));

    /** Tipi di percorso (Percorso.Tipo), anche per i trigger. */
    public static final List<MailingDto.Opzione> PERCORSI = List.of(
            new MailingDto.Opzione("METODO_BUSSOLA", "Metodo Bussola"),
            new MailingDto.Opzione("RINNOVO", "Rinnovo"),
            new MailingDto.Opzione("MANTENIMENTO", "Mantenimento"));

    private List<MailingDto.Opzione> opzioni(MailingSegmentiSql.Campo campo) {
        return switch (campo) {
            case TIPO -> List.of(
                    new MailingDto.Opzione("PAZIENTE", "Paziente"),
                    new MailingDto.Opzione("LEAD", "Lead"),
                    new MailingDto.Opzione("SENZA_SCHEDA", "Senza scheda paziente"));
            case STATO -> List.of(
                    new MailingDto.Opzione("ISCRITTO", "Iscritto"),
                    new MailingDto.Opzione("DISISCRITTO", "Disiscritto"),
                    new MailingDto.Opzione("RIMBALZATO", "Rimbalzato"),
                    new MailingDto.Opzione("SEGNALATO_SPAM", "Segnalato come spam"),
                    new MailingDto.Opzione("ARCHIVIATO", "Archiviato"));
            case TAG -> query("SELECT id, nome FROM mailing_tag ORDER BY LOWER(nome)");
            case STATO_PAZIENTE -> List.of(
                    new MailingDto.Opzione("LEAD", "Lead"),
                    new MailingDto.Opzione("LISTA_ATTESA", "Lista d'attesa"),
                    new MailingDto.Opzione("ATTIVO", "In percorso"),
                    new MailingDto.Opzione("MANTENIMENTO", "Mantenimento"),
                    new MailingDto.Opzione("CONCLUSO", "Concluso"));
            case FONTE -> List.of(
                    new MailingDto.Opzione("YOUTUBE", "YouTube"),
                    new MailingDto.Opzione("INSTAGRAM", "Instagram"),
                    new MailingDto.Opzione("MASTERCLASS", "Masterclass"),
                    new MailingDto.Opzione("LIBRO", "Libro"),
                    new MailingDto.Opzione("PASSAPAROLA", "Passaparola"),
                    new MailingDto.Opzione("SITO", "Sito"),
                    new MailingDto.Opzione("ALTRO", "Altro"));
            case ESITO_CONOSCITIVA -> ESITI;
            case PERCORSO_ACQUISTATO -> PERCORSI;
            case CITTA -> jdbc.query("""
                    SELECT INITCAP(LOWER(TRIM(p.citta))) AS citta, COUNT(*) AS n
                    FROM pazienti p
                    WHERE TRIM(p.citta) <> '' AND p.anonimizzato_il IS NULL
                    GROUP BY INITCAP(LOWER(TRIM(p.citta))) ORDER BY n DESC, citta LIMIT 300""",
                    (rs, n) -> new MailingDto.Opzione(rs.getString("citta"), rs.getString("citta")));
            case COMPLEANNO_MESE -> {
                List<MailingDto.Opzione> mesi = new ArrayList<>();
                mesi.add(new MailingDto.Opzione("CORRENTE", "Mese corrente"));
                for (int m = 1; m <= 12; m++) {
                    String nome = java.time.Month.of(m).getDisplayName(TextStyle.FULL, Locale.ITALIAN);
                    mesi.add(new MailingDto.Opzione(String.valueOf(m), Character.toUpperCase(nome.charAt(0)) + nome.substring(1)));
                }
                yield mesi;
            }
            case APERTURA_CAMPAGNA, CLICK_CAMPAGNA -> query("""
                    SELECT id, nome FROM mailing_campagne
                    WHERE stato IN ('INVIATA', 'IN_INVIO', 'TEST_AB', 'IN_PAUSA')
                    ORDER BY COALESCE(invio_iniziato_il, creato_il) DESC LIMIT 200""");
            case COINVOLGIMENTO -> List.of(
                    new MailingDto.Opzione(MailingSegmentiSql.ATTIVO, "Attivo (aperto negli ultimi 30 giorni)"),
                    new MailingDto.Opzione(MailingSegmentiSql.TIEPIDO, "Tiepido"),
                    new MailingDto.Opzione(MailingSegmentiSql.DORMIENTE, "Dormiente (nessuna apertura da 90 giorni)"),
                    new MailingDto.Opzione(MailingSegmentiSql.MAI, "Mai aperto"));
            case CATEGORIA_ESCLUSA -> query("SELECT id, nome FROM mailing_categorie ORDER BY ordine, id");
            default -> null;
        };
    }

    private List<MailingDto.Opzione> query(String sql) {
        return jdbc.query(sql, (rs, n) -> new MailingDto.Opzione(String.valueOf(rs.getLong("id")), rs.getString("nome")));
    }

    /** Contatti di un segmento salvato (per filtri e pubblico), ordinati per id. */
    @Transactional(readOnly = true)
    public List<Long> contattiIdsSegmento(long segmentoId) {
        return contattiIds(regoleSegmento(segmentoId));
    }
}
