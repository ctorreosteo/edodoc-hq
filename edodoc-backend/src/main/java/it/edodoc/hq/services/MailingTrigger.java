package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Trigger e regole d'uscita delle automazioni: corrispondenza con gli eventi del gestionale, descrizione in italiano,
 * finestra degli orari lavorativi. Funzioni pure (testate senza Spring).
 * <p>
 * Trigger e uscita hanno la forma {@code {"tipo": ..., "parametri": {...}}}. Parametri: NUOVO_LEAD {fonte?}
 * (Paziente.Fonte, stringa o elenco), ESITO_CONOSCITIVA {esito?} (Prenotazione.Esito), VISITA_EFFETTUATA {numero?},
 * ACQUISTO {tipoPercorso?} (Percorso.Tipo), TAG_AGGIUNTO {tagId}, COMPLEANNO {giorniPrima},
 * INATTIVO_DA_GIORNI {giorni}, ENTRATA_SEGMENTO {segmentoId}.
 */
public final class MailingTrigger {

    public static final Set<String> TIPI = Set.of("NUOVO_LEAD", "CONOSCITIVA_PRENOTATA", "CONOSCITIVA_SVOLTA",
            "ESITO_CONOSCITIVA", "PRIMA_VISITA_PRENOTATA", "PRIMA_VISITA_EFFETTUATA",
            "VISITA_EFFETTUATA", "ACQUISTO", "TAG_AGGIUNTO", "COMPLEANNO", "INATTIVO_DA_GIORNI", "ENTRATA_SEGMENTO",
            "ISCRIZIONE", "MANUALE");

    /** Trigger valutati dai job e non da un evento del gestionale. */
    public static final Set<String> TIPI_DA_JOB = Set.of("COMPLEANNO", "INATTIVO_DA_GIORNI", "ENTRATA_SEGMENTO");

    public static final LocalTime INIZIO_LAVORO = LocalTime.of(8, 0);
    public static final LocalTime FINE_LAVORO = LocalTime.of(20, 0);

    private MailingTrigger() {
    }

    /** Nomi leggibili per le descrizioni (tag, segmenti). Ritornano null se sconosciuti. */
    public interface Nomi {
        String tag(Long id);

        String segmento(Long id);

        Nomi VUOTI = new Nomi() {
            public String tag(Long id) {
                return null;
            }

            public String segmento(Long id) {
                return null;
            }
        };
    }

    /** Etichette dei valori dei parametri (stesse opzioni del catalogo segmenti). */
    static final Map<String, String> FONTI = Map.of("YOUTUBE", "YouTube", "INSTAGRAM", "Instagram",
            "MASTERCLASS", "la masterclass", "LIBRO", "il libro", "PASSAPAROLA", "passaparola", "SITO", "il sito",
            "ALTRO", "altre fonti");
    static final Map<String, String> ESITI = Map.of("INTERESSATO", "interessato", "CI_PENSA", "ci pensa",
            "ACQUISTATO", "ha acquistato", "NON_ADATTO", "non adatto");
    static final Map<String, String> PERCORSI = Map.of("METODO_BUSSOLA", "il Metodo Bussola", "RINNOVO", "il rinnovo",
            "MANTENIMENTO", "il mantenimento");

    public static String tipo(JsonNode trigger) {
        String t = trigger == null ? null : MailingGrafo.testo(trigger.path("tipo"));
        return t == null ? null : t.toUpperCase(Locale.ROOT);
    }

    /**
     * True se l'evento del gestionale ({@code tipoEvento}, {@code parametri}) fa scattare il trigger (o la regola
     * d'uscita, che ha la stessa forma). I filtri assenti valgono "qualsiasi".
     */
    public static boolean corrisponde(JsonNode trigger, String tipoEvento, Map<String, Object> parametri) {
        String tipo = tipo(trigger);
        if (tipo == null || tipoEvento == null || !tipo.equalsIgnoreCase(tipoEvento)) {
            return false;
        }
        JsonNode p = trigger.path("parametri");
        Map<String, Object> ev = parametri == null ? Map.of() : parametri;
        return switch (tipo) {
            case "NUOVO_LEAD" -> filtroTesto(p.path("fonte"), ev.get("fonte"));
            case "ESITO_CONOSCITIVA" -> filtroTesto(p.path("esito"), ev.get("esito"));
            case "VISITA_EFFETTUATA" -> filtroNumero(p.path("numero"), ev.get("numeroVisite"));
            case "ACQUISTO" -> filtroTesto(p.path("tipoPercorso"), ev.get("tipoPercorso"));
            case "TAG_AGGIUNTO" -> filtroNumero(p.path("tagId"), ev.get("tagId"));
            default -> true;
        };
    }

    /** Filtro su testo: vuoto = qualsiasi; altrimenti il valore dell'evento deve essere tra quelli ammessi. */
    static boolean filtroTesto(JsonNode filtro, Object valore) {
        List<String> ammessi = new ArrayList<>();
        if (filtro.isArray()) {
            filtro.forEach(f -> {
                String s = MailingGrafo.testo(f);
                if (s != null) {
                    ammessi.add(s);
                }
            });
        } else {
            String s = MailingGrafo.testo(filtro);
            if (s != null) {
                ammessi.add(s);
            }
        }
        if (ammessi.isEmpty()) {
            return true;
        }
        if (valore == null) {
            return false;
        }
        String v = valore.toString().trim();
        for (String a : ammessi) {
            if (a.trim().equalsIgnoreCase(v)) {
                return true;
            }
        }
        return false;
    }

    static boolean filtroNumero(JsonNode filtro, Object valore) {
        List<Long> ammessi = new ArrayList<>();
        if (filtro.isArray()) {
            filtro.forEach(f -> {
                long n = MailingGrafo.numero(f, Long.MIN_VALUE);
                if (n != Long.MIN_VALUE) {
                    ammessi.add(n);
                }
            });
        } else {
            long n = MailingGrafo.numero(filtro, Long.MIN_VALUE);
            if (n != Long.MIN_VALUE) {
                ammessi.add(n);
            }
        }
        if (ammessi.isEmpty()) {
            return true;
        }
        Long v = numero(valore);
        return v != null && ammessi.contains(v);
    }

    static Long numero(Object v) {
        if (v instanceof Number n) {
            return n.longValue();
        }
        if (v != null) {
            try {
                return Long.parseLong(v.toString().trim());
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return null;
    }

    /** Giorni di anticipo del trigger COMPLEANNO (0–60). */
    public static int giorniPrima(JsonNode trigger) {
        JsonNode p = trigger.path("parametri");
        long g = MailingGrafo.numero(p.path("giorniPrima"), MailingGrafo.numero(p.path("giorni"), 0L));
        return (int) Math.max(0, Math.min(60, g));
    }

    /** Giorni di inattività del trigger INATTIVO_DA_GIORNI (almeno 1, default 180). */
    public static int giorniInattivita(JsonNode trigger) {
        long g = MailingGrafo.numero(trigger.path("parametri").path("giorni"), 180L);
        return (int) Math.max(1, g);
    }

    /** INATTIVO_DA_GIORNI: se true entrano anche i pazienti già oltre la soglia all'attivazione (default false). */
    public static boolean includiGiaInattivi(JsonNode trigger) {
        JsonNode v = trigger.path("parametri").path("includiGiaInattivi");
        return v.isBoolean() ? v.asBoolean() : "true".equalsIgnoreCase(v.asText(""));
    }

    public static final int MAX_INIZIALI_PREDEFINITO = 300;

    /** INATTIVO_DA_GIORNI: tetto giornaliero di iscrizioni quando si includono i già inattivi (default 300, 1–5000). */
    public static int maxIniziali(JsonNode trigger) {
        long v = MailingGrafo.numero(trigger.path("parametri").path("maxIniziali"), MAX_INIZIALI_PREDEFINITO);
        return (int) Math.max(1, Math.min(5000, v));
    }

    /**
     * Finestra dei candidati INATTIVO_DA_GIORNI per oggi: l'ultima visita deve cadere entro {@code soglia} (oggi − N)
     * e, salvo {@code includiGiaInattivi}, non prima di {@code attivataIl − N}: entra solo chi supera la soglia
     * dall'attivazione in poi (alla prima esecuzione: esattamente oggi − N). Con {@code includiGiaInattivi} non c'è
     * limite inferiore ma al massimo {@code maxIniziali} al giorno, i più recenti prima.
     */
    public record FinestraInattivi(java.time.LocalDate soglia, java.time.LocalDate ultimaMinima, Integer limite) {
    }

    public static FinestraInattivi finestraInattivi(JsonNode trigger, java.time.LocalDate oggi, LocalDateTime attivataIl) {
        int giorni = giorniInattivita(trigger);
        java.time.LocalDate soglia = oggi.minusDays(giorni);
        if (includiGiaInattivi(trigger)) {
            return new FinestraInattivi(soglia, null, maxIniziali(trigger));
        }
        java.time.LocalDate attivazione = attivataIl == null ? oggi : attivataIl.toLocalDate();
        java.time.LocalDate minima = attivazione.minusDays(giorni);
        return new FinestraInattivi(soglia, minima.isAfter(soglia) ? soglia : minima, null);
    }

    public static Long segmentoId(JsonNode trigger) {
        long v = MailingGrafo.numero(trigger.path("parametri").path("segmentoId"), -1L);
        return v > 0 ? v : null;
    }

    // ───────────────────────── Descrizioni ─────────────────────────

    /** Il trigger in una frase italiana (coerente con {@code descriviTrigger} della tela). */
    public static String descrizione(JsonNode trigger, Nomi nomi) {
        String tipo = tipo(trigger);
        if (tipo == null) {
            return "Trigger da scegliere";
        }
        Nomi n = nomi == null ? Nomi.VUOTI : nomi;
        JsonNode p = trigger.path("parametri");
        return switch (tipo) {
            case "NUOVO_LEAD" -> {
                String fonte = elenco(p.path("fonte"), x -> FONTI.getOrDefault(x.toUpperCase(Locale.ROOT), x));
                yield "Quando arriva un nuovo lead" + (fonte == null ? "" : " da " + fonte);
            }
            case "CONOSCITIVA_PRENOTATA" -> "Quando qualcuno prenota la chiamata conoscitiva";
            case "CONOSCITIVA_SVOLTA" -> "Quando la chiamata conoscitiva è stata fatta";
            case "ESITO_CONOSCITIVA" -> {
                String esito = elenco(p.path("esito"), x -> ESITI.getOrDefault(x.toUpperCase(Locale.ROOT), x));
                yield esito == null ? "Quando scrivi l'esito della chiamata conoscitiva"
                        : "Quando l'esito della chiamata conoscitiva è «" + esito + "»";
            }
            case "PRIMA_VISITA_PRENOTATA" -> "Quando un paziente prenota la prima visita";
            case "PRIMA_VISITA_EFFETTUATA" -> "Quando un paziente ha fatto la prima visita";
            case "VISITA_EFFETTUATA" -> {
                long num = MailingGrafo.numero(p.path("numero"), 0L);
                yield num > 0 ? "Quando un paziente ha fatto la " + num + "ª visita" : "Dopo ogni visita fatta";
            }
            case "ACQUISTO" -> {
                String t = elenco(p.path("tipoPercorso"), x -> PERCORSI.getOrDefault(x.toUpperCase(Locale.ROOT), x));
                yield t == null ? "Quando un paziente acquista un percorso" : "Quando un paziente acquista " + t;
            }
            case "TAG_AGGIUNTO" -> {
                String t = elencoId(p.path("tagId"), n::tag);
                yield t == null ? "Quando un contatto riceve un tag" : "Quando un contatto riceve il tag «" + t + "»";
            }
            case "COMPLEANNO" -> {
                int g = giorniPrima(trigger);
                yield g == 0 ? "Il giorno del compleanno" : (g == 1 ? "Il giorno" : g + " giorni") + " prima del compleanno";
            }
            case "INATTIVO_DA_GIORNI" -> includiGiaInattivi(trigger)
                    ? "Pazienti senza visite da " + giorniInattivita(trigger) + " giorni (anche quelli già inattivi, "
                    + maxIniziali(trigger) + " al giorno)"
                    : "Quando un paziente non viene da " + giorniInattivita(trigger) + " giorni";
            case "ENTRATA_SEGMENTO" -> {
                Long id = segmentoId(trigger);
                String s = id == null ? null : n.segmento(id);
                yield s != null ? "Quando un contatto entra nel segmento «" + s + "»"
                        : "Quando un contatto entra in un segmento";
            }
            case "ISCRIZIONE" -> "Quando qualcuno si iscrive alla newsletter";
            case "MANUALE" -> "Quando lo iscrivi tu (o un'altra automazione)";
            default -> "Trigger sconosciuto (" + tipo + ")";
        };
    }

    private static String elenco(JsonNode n, java.util.function.Function<String, String> etichetta) {
        List<String> voci = new ArrayList<>();
        if (n.isArray()) {
            n.forEach(x -> {
                String s = MailingGrafo.testo(x);
                if (s != null) {
                    voci.add(etichetta.apply(s));
                }
            });
        } else {
            String s = MailingGrafo.testo(n);
            if (s != null) {
                voci.add(etichetta.apply(s));
            }
        }
        return voci.isEmpty() ? null : unisci(voci);
    }

    private static String elencoId(JsonNode n, java.util.function.Function<Long, String> nome) {
        List<String> voci = new ArrayList<>();
        List<JsonNode> valori = new ArrayList<>();
        if (n.isArray()) {
            n.forEach(valori::add);
        } else if (!n.isMissingNode() && !n.isNull()) {
            valori.add(n);
        }
        for (JsonNode v : valori) {
            long id = MailingGrafo.numero(v, -1L);
            if (id > 0) {
                String s = nome.apply(id);
                voci.add(s != null ? s : "#" + id);
            }
        }
        return voci.isEmpty() ? null : unisci(voci);
    }

    private static String unisci(List<String> voci) {
        if (voci.size() == 1) {
            return voci.get(0);
        }
        return String.join(", ", voci.subList(0, voci.size() - 1)) + " o " + voci.get(voci.size() - 1);
    }

    // ───────────────────────── Orari ─────────────────────────

    /** {@code t} se cade tra le 8:00 e le 20:00 (ora di Roma), altrimenti le 8:00 successive. */
    public static LocalDateTime finestraLavorativa(LocalDateTime t) {
        Objects.requireNonNull(t);
        LocalTime ora = t.toLocalTime();
        if (ora.isBefore(INIZIO_LAVORO)) {
            return t.toLocalDate().atTime(INIZIO_LAVORO);
        }
        if (!ora.isBefore(FINE_LAVORO)) {
            return t.toLocalDate().plusDays(1).atTime(INIZIO_LAVORO);
        }
        return t;
    }
}
