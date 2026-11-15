package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import it.edodoc.hq.dto.MailingDto;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/**
 * Pubblico di una campagna: unione di segmenti, tag e regole inline (o tutti), meno segmenti e tag esclusi, poi il
 * filtro finale (ISCRITTO, email valida, categoria non esclusa). Una sola query restituisce ogni contatto del
 * pubblico con lo stato e i due controlli, così si contano anche gli esclusi.
 */
@Service
public class MailingPubblicoService {

    /** Stessa regola di {@link MailingCsv#EMAIL}, in sintassi POSIX di Postgres (sull'email minuscola). */
    static final String EMAIL_VALIDA_REGEX =
            "^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*\\.[a-z]{2,}$";

    public record Risoluzione(List<Long> destinatari, int disiscritti, int rimbalzati, int categoriaEsclusa,
                              int senzaEmailValida) {
    }

    private final MailingSegmentiService segmentiService;
    private final NamedParameterJdbcTemplate jdbc;

    public MailingPubblicoService(MailingSegmentiService segmentiService, NamedParameterJdbcTemplate jdbc) {
        this.segmentiService = segmentiService;
        this.jdbc = jdbc;
    }

    /** Destinatari idonei (senza duplicati, ordinati per id) e conteggio di chi resta fuori e perché. */
    @Transactional(readOnly = true)
    public Risoluzione risolvi(MailingDto.Pubblico pubblico, Long categoriaId) {
        if (pubblico == null) {
            return new Risoluzione(List.of(), 0, 0, 0, 0);
        }
        MapSqlParameterSource par = new MapSqlParameterSource();
        String inclusione = inclusione(pubblico, par);
        String esclusione = esclusione(pubblico, par);
        par.addValue("regexEmail", EMAIL_VALIDA_REGEX);
        par.addValue("categoriaId", categoriaId, java.sql.Types.BIGINT);
        String sql = "SELECT c.id, c.stato, (LOWER(TRIM(c.email)) ~ :regexEmail) AS email_ok, "
                + (categoriaId == null ? "FALSE" : "EXISTS (SELECT 1 FROM mailing_contatti_categorie_escluse ce "
                + "WHERE ce.contatto_id = c.id AND ce.categoria_id = :categoriaId)") + " AS categoria_esclusa "
                + "FROM mailing_contatti c WHERE " + inclusione + " AND NOT " + esclusione + " ORDER BY c.id";
        List<Long> destinatari = new ArrayList<>();
        int[] conteggi = new int[4]; // disiscritti, rimbalzati, categoria, email
        jdbc.query(sql, par, rs -> {
            String stato = rs.getString("stato");
            switch (stato) {
                case "ISCRITTO" -> {
                    if (!rs.getBoolean("email_ok")) {
                        conteggi[3]++;
                    } else if (rs.getBoolean("categoria_esclusa")) {
                        conteggi[2]++;
                    } else {
                        destinatari.add(rs.getLong("id"));
                    }
                }
                case "DISISCRITTO", "SEGNALATO_SPAM" -> conteggi[0]++;
                case "RIMBALZATO" -> conteggi[1]++;
                default -> {
                    // ARCHIVIATO: fuori senza contarlo
                }
            }
        });
        return new Risoluzione(destinatari, conteggi[0], conteggi[1], conteggi[2], conteggi[3]);
    }

    /** Controllo finale prima dell'invio: ISCRITTO, email valida, categoria non esclusa. */
    @Transactional(readOnly = true)
    public boolean idoneo(long contattoId, Long categoriaId) {
        MapSqlParameterSource par = new MapSqlParameterSource()
                .addValue("id", contattoId)
                .addValue("regexEmail", EMAIL_VALIDA_REGEX)
                .addValue("categoriaId", categoriaId, java.sql.Types.BIGINT);
        Boolean ok = jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM mailing_contatti c WHERE c.id = :id "
                + "AND c.stato = 'ISCRITTO' AND LOWER(TRIM(c.email)) ~ :regexEmail"
                + (categoriaId == null ? "" : " AND NOT EXISTS (SELECT 1 FROM mailing_contatti_categorie_escluse ce "
                + "WHERE ce.contatto_id = c.id AND ce.categoria_id = :categoriaId)") + ")", par, Boolean.class);
        return Boolean.TRUE.equals(ok);
    }

    private String inclusione(MailingDto.Pubblico p, MapSqlParameterSource par) {
        if (p.tutti()) {
            return "TRUE";
        }
        List<String> parti = new ArrayList<>();
        int i = 0;
        for (Long segmentoId : ids(p.segmentiIds())) {
            parti.add(segmento(segmentoId, "si" + (i++) + "_", par));
        }
        Set<Long> tag = ids(p.tagIds());
        if (!tag.isEmpty()) {
            par.addValue("tagInclusi", tag);
            parti.add("EXISTS (SELECT 1 FROM mailing_contatti_tag ct WHERE ct.contatto_id = c.id AND ct.tag_id IN (:tagInclusi))");
        }
        if (haRegole(p.regole())) {
            MailingSegmentiSql.Frammento f = segmentiService.compila(p.regole(), "ri");
            par.addValues(f.parametri());
            parti.add(f.sql());
        }
        return parti.isEmpty() ? "FALSE" : "(" + String.join(" OR ", parti) + ")";
    }

    private String esclusione(MailingDto.Pubblico p, MapSqlParameterSource par) {
        List<String> parti = new ArrayList<>();
        int i = 0;
        for (Long segmentoId : ids(p.esclusiSegmentiIds())) {
            parti.add(segmento(segmentoId, "se" + (i++) + "_", par));
        }
        Set<Long> tag = ids(p.esclusiTagIds());
        if (!tag.isEmpty()) {
            par.addValue("tagEsclusi", tag);
            parti.add("EXISTS (SELECT 1 FROM mailing_contatti_tag ct WHERE ct.contatto_id = c.id AND ct.tag_id IN (:tagEsclusi))");
        }
        return parti.isEmpty() ? "FALSE" : "(" + String.join(" OR ", parti) + ")";
    }

    private String segmento(long segmentoId, String prefisso, MapSqlParameterSource par) {
        JsonNode regole;
        try {
            regole = segmentiService.regoleSegmento(segmentoId);
        } catch (ResponseStatusException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Il pubblico usa un segmento che non esiste più (id " + segmentoId + "): aggiornalo.");
        }
        MailingSegmentiSql.Frammento f = segmentiService.compila(regole, prefisso);
        par.addValues(f.parametri());
        return f.sql();
    }

    /** Regole inline vuote (gruppo senza condizioni) = nessuna regola, non "tutti". */
    static boolean haRegole(JsonNode regole) {
        if (regole == null || regole.isNull() || regole.isMissingNode() || !regole.isObject()) {
            return false;
        }
        JsonNode c = regole.get("condizioni");
        return c != null && c.isArray() && !c.isEmpty();
    }

    private static Set<Long> ids(List<Long> lista) {
        Set<Long> out = new LinkedHashSet<>();
        if (lista != null) {
            lista.stream().filter(Objects::nonNull).forEach(out::add);
        }
        return out;
    }
}
