package it.edodoc.hq.services;

import org.springframework.util.StringUtils;

import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;

/** Date della pagina Meta: Meta scrive {@code 2026-10-24T07:00:00+0000}, il frontend riceve ISO con offset. */
public final class SocialTempo {

    public static final ZoneId ROMA = ZoneId.of("Europe/Rome");
    /** I giorni degli insights Meta si chiudono a mezzanotte del Pacifico. */
    static final ZoneId PACIFICO = ZoneId.of("America/Los_Angeles");

    private static final DateTimeFormatter META = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssZ");
    private static final DateTimeFormatter ISO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX");

    private SocialTempo() {
    }

    /** Istante da una data Meta ({@code +0000}) o ISO standard; null se assente o non valida. */
    public static Instant istante(String testo) {
        if (!StringUtils.hasText(testo)) {
            return null;
        }
        try {
            return OffsetDateTime.parse(testo, META).toInstant();
        } catch (DateTimeParseException e) {
            try {
                return OffsetDateTime.parse(testo).toInstant();
            } catch (DateTimeParseException e2) {
                try {
                    return Instant.parse(testo);
                } catch (DateTimeParseException e3) {
                    return null;
                }
            }
        }
    }

    public static String iso(Instant istante) {
        return istante == null ? null : ISO.format(istante.atZone(ROMA));
    }

    /** Converte la data Meta nel formato ISO del contratto. */
    public static String iso(String dataMeta) {
        return iso(istante(dataMeta));
    }

    public static String adesso() {
        return iso(Instant.now());
    }

    /**
     * Giorno a cui si riferisce un valore giornaliero degli insights: Meta mette come {@code end_time}
     * la fine del giorno (mezzanotte del Pacifico), quindi il giorno e quello precedente.
     */
    public static LocalDate giornoInsight(String endTime) {
        Instant i = istante(endTime);
        if (i == null) {
            return null;
        }
        return i.atZone(PACIFICO).toLocalDate().minusDays(1);
    }
}
