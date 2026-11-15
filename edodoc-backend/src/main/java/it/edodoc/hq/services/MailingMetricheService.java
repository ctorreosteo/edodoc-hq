package it.edodoc.hq.services;

import it.edodoc.hq.dto.MailingDto;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Metriche dell'Email Marketing calcolate in SQL (due aggregazioni: invii ed eventi). Aperture e click sono solo
 * "umani": {@code mailing_invii.prima_apertura_il / primo_click_il} li tiene il tracciamento escludendo gli eventi
 * automatici. Tassi in percentuale con un decimale sui consegnati (inviati − rimbalzi), null se il denominatore è 0.
 * Le condizioni SQL sono costanti del codice; i valori passano sempre come parametri.
 */
@Service
public class MailingMetricheService {

    private static final String SELECT_INVII = "SELECT %s AS gruppo, "
            + "COUNT(*) FILTER (WHERE i.stato NOT IN ('ANNULLATO','SALTATO')) AS destinatari, "
            + "COUNT(*) FILTER (WHERE i.stato IN ('INVIATO','RIMBALZATO')) AS inviati, "
            + "COUNT(*) FILTER (WHERE i.stato IN ('IN_CODA','IN_INVIO')) AS in_coda, "
            + "COUNT(*) FILTER (WHERE i.stato = 'ERRORE') AS errori, "
            + "COUNT(*) FILTER (WHERE i.stato = 'RIMBALZATO') AS rimbalzi, "
            + "COUNT(*) FILTER (WHERE i.prima_apertura_il IS NOT NULL) AS aperture, "
            + "COUNT(*) FILTER (WHERE i.primo_click_il IS NOT NULL) AS click, "
            + "COUNT(*) FILTER (WHERE i.risposto_il IS NOT NULL) AS risposte, "
            + "COUNT(*) FILTER (WHERE i.disiscritto_il IS NOT NULL) AS disiscrizioni "
            + "FROM mailing_invii i WHERE %s GROUP BY 1";

    private static final String SELECT_EVENTI = "SELECT %s AS gruppo, "
            + "COUNT(DISTINCT e.invio_id) FILTER (WHERE e.tipo = 'APERTURA' AND e.automatico AND i.prima_apertura_il IS NULL) AS aperture_automatiche, "
            + "COUNT(DISTINCT COALESCE(e.invio_id, -e.id)) FILTER (WHERE e.tipo = 'SPAM') AS spam, "
            + "COUNT(*) FILTER (WHERE e.tipo = 'CONVERSIONE_VISITA') AS visite, "
            + "COALESCE(SUM(e.valore) FILTER (WHERE e.tipo IN ('CONVERSIONE_VISITA','CONVERSIONE_ACQUISTO')), 0) AS fatturato "
            + "FROM mailing_eventi e LEFT JOIN mailing_invii i ON i.id = e.invio_id "
            + "WHERE e.tipo IN ('APERTURA','SPAM','CONVERSIONE_VISITA','CONVERSIONE_ACQUISTO') AND %s GROUP BY 1";

    private final NamedParameterJdbcTemplate jdbc;

    public MailingMetricheService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public MailingDto.Metriche vuote() {
        return costruisci(new long[9], 0, 0, 0, BigDecimal.ZERO);
    }

    public MailingDto.Metriche perCampagna(long campagnaId) {
        return uno(calcola("0", "i.campagna_id = :id", "0", "e.campagna_id = :id", new MapSqlParameterSource("id", campagnaId)));
    }

    public Map<Long, MailingDto.Metriche> perCampagne(Collection<Long> campagnaIds) {
        if (campagnaIds == null || campagnaIds.isEmpty()) {
            return Map.of();
        }
        return calcola("i.campagna_id", "i.campagna_id IN (:ids)", "e.campagna_id", "e.campagna_id IN (:ids)",
                new MapSqlParameterSource("ids", campagnaIds));
    }

    /** Metriche di una variante A/B della campagna (solo gli invii del test con quella variante). */
    public MailingDto.Metriche perVariante(long campagnaId, String variante) {
        return uno(calcola("0", "i.campagna_id = :id AND i.variante = :v", "0",
                "i.campagna_id = :id AND i.variante = :v",
                new MapSqlParameterSource("id", campagnaId).addValue("v", variante)));
    }

    public MailingDto.Metriche perAutomazioneEmail(long automazioneEmailId) {
        return uno(calcola("0", "i.automazione_email_id = :id", "0", "i.automazione_email_id = :id",
                new MapSqlParameterSource("id", automazioneEmailId)));
    }

    public Map<Long, MailingDto.Metriche> perAutomazioniEmail(Collection<Long> automazioneEmailIds) {
        if (automazioneEmailIds == null || automazioneEmailIds.isEmpty()) {
            return Map.of();
        }
        return calcola("i.automazione_email_id", "i.automazione_email_id IN (:ids)", "i.automazione_email_id",
                "i.automazione_email_id IN (:ids)", new MapSqlParameterSource("ids", automazioneEmailIds));
    }

    public MailingDto.Metriche perAutomazione(long automazioneId) {
        return uno(calcola("0",
                "i.automazione_email_id IN (SELECT ae.id FROM mailing_automazioni_email ae WHERE ae.automazione_id = :id)",
                "0", "e.automazione_id = :id", new MapSqlParameterSource("id", automazioneId)));
    }

    public Map<Long, MailingDto.Metriche> perAutomazioni(Collection<Long> automazioneIds) {
        if (automazioneIds == null || automazioneIds.isEmpty()) {
            return Map.of();
        }
        return calcola("(SELECT ae.automazione_id FROM mailing_automazioni_email ae WHERE ae.id = i.automazione_email_id)",
                "i.automazione_email_id IN (SELECT ae.id FROM mailing_automazioni_email ae WHERE ae.automazione_id IN (:ids))",
                "e.automazione_id", "e.automazione_id IN (:ids)", new MapSqlParameterSource("ids", automazioneIds));
    }

    public MailingDto.Metriche perContatto(long contattoId) {
        return uno(calcola("0", "i.contatto_id = :id", "0", "e.contatto_id = :id", new MapSqlParameterSource("id", contattoId)));
    }

    /** Messaggi spediti nel periodo [da, a) e i loro esiti; conversioni avvenute nel periodo. */
    public MailingDto.Metriche perPeriodo(LocalDateTime da, LocalDateTime a) {
        return uno(calcola("0", "i.inviato_il >= :da AND i.inviato_il < :a", "0",
                "((e.tipo IN ('CONVERSIONE_VISITA','CONVERSIONE_ACQUISTO') AND e.avvenuto_il >= :da AND e.avvenuto_il < :a) "
                        + "OR (e.tipo IN ('APERTURA','SPAM') AND i.inviato_il >= :da AND i.inviato_il < :a))",
                new MapSqlParameterSource("da", da).addValue("a", a)));
    }

    // ───────────────────────── Calcolo ─────────────────────────

    private MailingDto.Metriche uno(Map<Long, MailingDto.Metriche> m) {
        return m.getOrDefault(0L, vuote());
    }

    private Map<Long, MailingDto.Metriche> calcola(String gruppoInvii, String whereInvii, String gruppoEventi,
                                                    String whereEventi, MapSqlParameterSource p) {
        Map<Long, long[]> invii = new HashMap<>();
        jdbc.query(String.format(SELECT_INVII, gruppoInvii, whereInvii), p, rs -> {
            long g = rs.getLong("gruppo");
            invii.put(g, new long[]{rs.getLong("destinatari"), rs.getLong("inviati"), rs.getLong("in_coda"),
                    rs.getLong("errori"), rs.getLong("rimbalzi"), rs.getLong("aperture"), rs.getLong("click"),
                    rs.getLong("risposte"), rs.getLong("disiscrizioni")});
        });
        Map<Long, Object[]> eventi = new HashMap<>();
        jdbc.query(String.format(SELECT_EVENTI, gruppoEventi, whereEventi), p, rs -> {
            long g = rs.getLong("gruppo");
            if (rs.wasNull()) {
                return;
            }
            eventi.put(g, new Object[]{rs.getLong("aperture_automatiche"), rs.getLong("spam"), rs.getLong("visite"),
                    rs.getBigDecimal("fatturato")});
        });
        Map<Long, MailingDto.Metriche> out = new HashMap<>();
        java.util.Set<Long> gruppi = new java.util.HashSet<>(invii.keySet());
        gruppi.addAll(eventi.keySet());
        for (Long g : gruppi) {
            long[] i = invii.getOrDefault(g, new long[9]);
            Object[] e = eventi.getOrDefault(g, new Object[]{0L, 0L, 0L, BigDecimal.ZERO});
            out.put(g, costruisci(i, (Long) e[0], (Long) e[1], (Long) e[2], (BigDecimal) e[3]));
        }
        return out;
    }

    /** i = [destinatari, inviati, inCoda, errori, rimbalzi, aperture, click, risposte, disiscrizioni]. */
    static MailingDto.Metriche costruisci(long[] i, long apertureAutomatiche, long spam, long visite, BigDecimal fatturato) {
        long inviati = i[1];
        long rimbalzi = i[4];
        long consegnati = Math.max(0, inviati - rimbalzi);
        return new MailingDto.Metriche((int) i[0], (int) inviati, (int) i[2], (int) i[3], (int) rimbalzi, (int) i[5],
                (int) apertureAutomatiche, (int) i[6], (int) i[7], (int) i[8], (int) spam,
                tasso(i[5], consegnati), tasso(i[6], consegnati), tasso(i[6], i[5]), tasso(i[8], consegnati),
                tasso(rimbalzi, inviati), (int) visite, fatturato != null ? fatturato : BigDecimal.ZERO);
    }

    static Double tasso(long numeratore, long denominatore) {
        if (denominatore <= 0) {
            return null;
        }
        return Math.round(numeratore * 1000.0 / denominatore) / 10.0;
    }

    /** Somma di due metriche (es. per aggregare più email), ricalcolando i tassi. */
    public static MailingDto.Metriche somma(List<MailingDto.Metriche> lista) {
        long[] i = new long[9];
        long aut = 0;
        long spam = 0;
        long visite = 0;
        BigDecimal fatt = BigDecimal.ZERO;
        for (MailingDto.Metriche m : lista) {
            i[0] += m.destinatari();
            i[1] += m.inviati();
            i[2] += m.inCoda();
            i[3] += m.errori();
            i[4] += m.rimbalzi();
            i[5] += m.apertureUniche();
            i[6] += m.clickUnici();
            i[7] += m.risposte();
            i[8] += m.disiscrizioni();
            aut += m.apertureAutomatiche();
            spam += m.spam();
            visite += m.visiteGenerate();
            fatt = fatt.add(m.fatturatoGenerato() != null ? m.fatturatoGenerato() : BigDecimal.ZERO);
        }
        return costruisci(i, aut, spam, visite, fatt);
    }
}
