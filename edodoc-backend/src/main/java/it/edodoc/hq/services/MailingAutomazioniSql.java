package it.edodoc.hq.services;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.MonthDay;
import java.time.Year;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Query native delle automazioni (contatori, report per nodo, candidati dei trigger giornalieri, condizioni).
 * Tutte parametriche. Le date sono ora di Roma (le colonne sono TIMESTAMP senza fuso, scritte in ora di Roma).
 */
@Component
public class MailingAutomazioniSql {

    private final NamedParameterJdbcTemplate jdbc;

    public MailingAutomazioniSql(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** automazioneId → (stato iscrizione → numero), con una sola GROUP BY. */
    public Map<Long, Map<String, Integer>> contatoriPerAutomazione() {
        Map<Long, Map<String, Integer>> out = new HashMap<>();
        jdbc.query("SELECT automazione_id, stato, COUNT(*) AS n FROM mailing_automazioni_iscrizioni GROUP BY automazione_id, stato",
                rs -> {
                    out.computeIfAbsent(rs.getLong("automazione_id"), k -> new HashMap<>())
                            .put(rs.getString("stato"), rs.getInt("n"));
                });
        return out;
    }

    public Map<String, Integer> contatori(long automazioneId) {
        Map<String, Integer> out = new HashMap<>();
        jdbc.query("SELECT stato, COUNT(*) AS n FROM mailing_automazioni_iscrizioni WHERE automazione_id = :id GROUP BY stato",
                new MapSqlParameterSource("id", automazioneId),
                rs -> {
                    out.put(rs.getString("stato"), rs.getInt("n"));
                });
        return out;
    }

    /** Per nodo: quante iscrizioni ci sono passate (dal percorso salvato nel contesto). */
    public Map<String, Integer> entratiPerNodo(long automazioneId) {
        Map<String, Integer> out = new LinkedHashMap<>();
        jdbc.query("""
                SELECT n.nodo, COUNT(DISTINCT i.id) AS n
                FROM mailing_automazioni_iscrizioni i
                CROSS JOIN LATERAL jsonb_array_elements_text(
                    CASE WHEN i.contesto IS NOT NULL AND i.contesto LIKE '{%'
                              AND jsonb_typeof(i.contesto::jsonb -> 'percorso') = 'array'
                         THEN i.contesto::jsonb -> 'percorso' ELSE '[]'::jsonb END) AS n(nodo)
                WHERE i.automazione_id = :id
                GROUP BY n.nodo
                """, new MapSqlParameterSource("id", automazioneId), rs -> {
            out.put(rs.getString("nodo"), rs.getInt("n"));
        });
        return out;
    }

    /** Per nodo corrente: iscrizioni nello stato indicato (es. ATTIVA+IN_ATTESA = "qui ora", USCITA = uscite lì). */
    public Map<String, Integer> perNodoCorrente(long automazioneId, Collection<String> stati) {
        Map<String, Integer> out = new LinkedHashMap<>();
        jdbc.query("""
                SELECT nodo_corrente, COUNT(*) AS n FROM mailing_automazioni_iscrizioni
                WHERE automazione_id = :id AND stato IN (:stati) AND nodo_corrente IS NOT NULL
                GROUP BY nodo_corrente
                """, new MapSqlParameterSource("id", automazioneId).addValue("stati", stati), rs -> {
            out.put(rs.getString("nodo_corrente"), rs.getInt("n"));
        });
        return out;
    }

    /** Ingressi per giorno (yyyy-MM-dd → numero) dal giorno {@code da} compreso. */
    public Map<String, Integer> ingressiGiornalieri(long automazioneId, LocalDate da) {
        Map<String, Integer> out = new LinkedHashMap<>();
        jdbc.query("""
                SELECT CAST(iniziata_il AS date) AS giorno, COUNT(*) AS n FROM mailing_automazioni_iscrizioni
                WHERE automazione_id = :id AND iniziata_il >= :da
                GROUP BY CAST(iniziata_il AS date) ORDER BY 1
                """, new MapSqlParameterSource("id", automazioneId).addValue("da", da.atStartOfDay()), rs -> {
            out.put(rs.getDate("giorno").toLocalDate().toString(), rs.getInt("n"));
        });
        return out;
    }

    /**
     * True se, in questa iscrizione, l'email indicata ha avuto un'apertura (o un click) umana. Le aperture/click
     * automatici (scanner, Apple Mail Privacy Protection) non contano.
     */
    public boolean haInteragito(long iscrizioneId, long automazioneEmailId, boolean click) {
        Boolean r = jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM mailing_eventi e JOIN mailing_invii v ON v.id = e.invio_id
                    WHERE v.iscrizione_id = :isc AND v.automazione_email_id = :email
                      AND e.tipo = :tipo AND e.automatico = FALSE)
                """, new MapSqlParameterSource("isc", iscrizioneId).addValue("email", automazioneEmailId)
                .addValue("tipo", click ? "CLICK" : "APERTURA"), Boolean.class);
        return Boolean.TRUE.equals(r);
    }

    /** Annulla gli invii ancora in coda di un'iscrizione (uscita dal percorso): non devono più partire. */
    public int annullaInviiInCoda(long iscrizioneId) {
        return jdbc.update("""
                UPDATE mailing_invii SET stato = 'ANNULLATO', errore = 'Uscito dall''automazione'
                WHERE iscrizione_id = :id AND stato = 'IN_CODA'
                """, new MapSqlParameterSource("id", iscrizioneId));
    }

    /** Annulla gli invii in coda delle email di un'automazione (eliminazione dell'automazione o di un'email). */
    public int annullaInviiInCodaAutomazione(long automazioneId, Long automazioneEmailId) {
        return jdbc.update("""
                UPDATE mailing_invii SET stato = 'ANNULLATO', errore = 'Email o automazione eliminata'
                WHERE stato = 'IN_CODA' AND automazione_email_id IN (
                    SELECT id FROM mailing_automazioni_email WHERE automazione_id = :aut
                      AND (CAST(:email AS bigint) IS NULL OR id = CAST(:email AS bigint)))
                """, new MapSqlParameterSource("aut", automazioneId).addValue("email", automazioneEmailId));
    }

    /** Serializza le iscrizioni concorrenti dello stesso contatto nella stessa automazione (lock di transazione). */
    public void bloccaIscrizione(long automazioneId, long contattoId) {
        jdbc.queryForObject("SELECT CAST(pg_advisory_xact_lock(CAST(:a AS int), CAST(:b AS int)) AS text)",
                new MapSqlParameterSource("a", (int) (automazioneId % Integer.MAX_VALUE))
                        .addValue("b", (int) (contattoId % Integer.MAX_VALUE)), String.class);
    }

    /** Contatti con un'iscrizione (qualsiasi stato) a questa automazione. */
    public List<Long> contattiGiaIscritti(long automazioneId) {
        return jdbc.queryForList("SELECT DISTINCT contatto_id FROM mailing_automazioni_iscrizioni WHERE automazione_id = :id",
                new MapSqlParameterSource("id", automazioneId), Long.class);
    }

    /**
     * COMPLEANNO: contatti ISCRITTI il cui paziente compie gli anni nel giorno {@code compleanno} (chi è nato il 29
     * febbraio si festeggia il 28 negli anni non bisestili), non iscritti a questa automazione dopo {@code iscrittoDopo}
     * (null = mai iscritti).
     */
    public List<Long> candidatiCompleanno(long automazioneId, LocalDate compleanno, LocalDateTime iscrittoDopo) {
        boolean includi29 = compleanno.getMonthValue() == 2 && compleanno.getDayOfMonth() == 28
                && !Year.isLeap(compleanno.getYear());
        MonthDay md = MonthDay.from(compleanno);
        return jdbc.queryForList("""
                SELECT c.id FROM mailing_contatti c
                JOIN pazienti p ON p.id = c.paziente_id
                WHERE c.stato = 'ISCRITTO' AND p.data_nascita IS NOT NULL
                  AND ((EXTRACT(MONTH FROM p.data_nascita) = :mese AND EXTRACT(DAY FROM p.data_nascita) = :giorno)
                       OR (:includi29 AND EXTRACT(MONTH FROM p.data_nascita) = 2 AND EXTRACT(DAY FROM p.data_nascita) = 29))
                  AND NOT EXISTS (
                      SELECT 1 FROM mailing_automazioni_iscrizioni i
                      WHERE i.automazione_id = :aut AND i.contatto_id = c.id
                        AND (CAST(:dopo AS timestamp) IS NULL OR i.iniziata_il >= CAST(:dopo AS timestamp)))
                ORDER BY c.id
                """, new MapSqlParameterSource("mese", md.getMonthValue()).addValue("giorno", md.getDayOfMonth())
                .addValue("includi29", includi29).addValue("aut", automazioneId)
                .addValue("dopo", iscrittoDopo), Long.class);
    }

    /**
     * INATTIVO_DA_GIORNI: contatti ISCRITTI il cui paziente ha l'ultima visita EFFETTUATA (non la conoscitiva) al più tardi il giorno
     * {@code soglia} (N o più giorni fa) e non prima di {@code ultimaMinima} (null = nessun limite), nessuna visita
     * PROGRAMMATA da {@code oggi} in poi, nessuna iscrizione a questa automazione dopo {@code iscrittoDopo} (null = mai
     * iscritti). I più recenti prima; al massimo {@code limite} (null = tutti).
     */
    public List<Long> candidatiInattivi(long automazioneId, LocalDate soglia, LocalDate ultimaMinima, LocalDate oggi,
                                        LocalDateTime iscrittoDopo, Integer limite) {
        return jdbc.queryForList("""
                SELECT c.id FROM mailing_contatti c
                JOIN (SELECT v.paziente_id, MAX(CAST(v.inizio AS DATE)) AS ultima
                      FROM visite v WHERE v.stato = 'EFFETTUATA' AND v.tipo <> 'CHIAMATA_CONOSCITIVA'
                      GROUP BY v.paziente_id) u
                  ON u.paziente_id = c.paziente_id
                WHERE c.stato = 'ISCRITTO' AND u.ultima <= :soglia
                  AND (CAST(:minima AS date) IS NULL OR u.ultima >= CAST(:minima AS date))
                  AND NOT EXISTS (SELECT 1 FROM visite f WHERE f.paziente_id = c.paziente_id
                                  AND f.inizio >= CAST(:oggi AS date) AND f.stato = 'PROGRAMMATA')
                  AND NOT EXISTS (
                      SELECT 1 FROM mailing_automazioni_iscrizioni i
                      WHERE i.automazione_id = :aut AND i.contatto_id = c.id
                        AND (CAST(:dopo AS timestamp) IS NULL OR i.iniziata_il >= CAST(:dopo AS timestamp)))
                ORDER BY u.ultima DESC, c.id
                LIMIT CAST(:limite AS integer)
                """, new MapSqlParameterSource("soglia", soglia).addValue("minima", ultimaMinima).addValue("oggi", oggi)
                .addValue("aut", automazioneId).addValue("dopo", iscrittoDopo).addValue("limite", limite), Long.class);
    }
}
