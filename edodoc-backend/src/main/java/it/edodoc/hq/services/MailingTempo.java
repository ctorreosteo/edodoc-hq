package it.edodoc.hq.services;

import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;

/**
 * Date dell'Email Marketing: nel DB sono {@link LocalDateTime} in ora di Roma, verso il frontend
 * viaggiano come ISO-8601 con offset.
 */
public final class MailingTempo {

    public static final ZoneId ROMA = ZoneId.of("Europe/Rome");

    private static final DateTimeFormatter ISO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX");

    private MailingTempo() {
    }

    /** {@code 2026-10-25T09:30:00+01:00}; null se assente. */
    public static String iso(LocalDateTime data) {
        return data == null ? null : ISO.format(data.atZone(ROMA));
    }

    /**
     * Data ISO con offset ({@code ...+02:00}, {@code ...Z}) convertita all'ora di Roma, oppure senza offset
     * (già intesa come ora di Roma). Null se assente o non valida.
     */
    public static LocalDateTime daIso(String testo) {
        if (!StringUtils.hasText(testo)) {
            return null;
        }
        String t = testo.trim();
        try {
            return OffsetDateTime.parse(t).atZoneSameInstant(ROMA).toLocalDateTime();
        } catch (DateTimeParseException e) {
            try {
                return LocalDateTime.parse(t);
            } catch (DateTimeParseException e2) {
                return null;
            }
        }
    }

    /** Ora corrente di Roma (indipendente dal fuso della JVM). */
    public static LocalDateTime adesso() {
        return LocalDateTime.now(ROMA);
    }
}
