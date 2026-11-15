package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import it.edodoc.hq.dto.SocialDto;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** Conti della pagina Meta che non dipendono dalla rete: si testano da soli. */
public final class SocialCalcoli {

    private SocialCalcoli() {
    }

    /** Valori giornalieri di una metrica insights ({@code values[].value} + {@code end_time}). */
    public static Map<LocalDate, Long> serieGiornaliera(JsonNode metrica) {
        Map<LocalDate, Long> out = new TreeMap<>();
        if (metrica == null) {
            return out;
        }
        for (JsonNode v : metrica.path("values")) {
            LocalDate giorno = SocialTempo.giornoInsight(v.path("end_time").asText(null));
            JsonNode valore = v.path("value");
            if (giorno != null && valore.isNumber()) {
                out.merge(giorno, valore.asLong(), Long::sum);
            }
        }
        return out;
    }

    /** Totale di una metrica {@code metric_type=total_value}; null se assente. */
    public static Long totale(JsonNode metrica) {
        if (metrica == null) {
            return null;
        }
        JsonNode v = metrica.path("total_value").path("value");
        return v.isNumber() ? v.asLong() : null;
    }

    /** Somma dei valori di una serie fra due giorni inclusi; null se nessun giorno ha dati. */
    public static Long somma(Map<LocalDate, Long> serie, LocalDate dal, LocalDate al) {
        Long totale = null;
        for (Map.Entry<LocalDate, Long> e : serie.entrySet()) {
            if (!e.getKey().isBefore(dal) && !e.getKey().isAfter(al)) {
                totale = (totale == null ? 0L : totale) + e.getValue();
            }
        }
        return totale;
    }

    /** Prima metrica disponibile fra le candidate (Meta rinomina e depreca spesso). */
    public static JsonNode prima(Map<String, JsonNode> metriche, List<String> candidate) {
        for (String c : candidate) {
            JsonNode n = metriche.get(c);
            if (n != null) {
                return n;
            }
        }
        return null;
    }

    /**
     * Salute della community sui commenti caricati: risposto = c'e una risposta della pagina.
     * I commenti scritti dalla pagina stessa non contano.
     */
    public static SocialDto.Community community(List<SocialDto.Commento> commenti, int conversazioniNonLette) {
        int totali = 0;
        int risposti = 0;
        int daRispondere = 0;
        long sommaMinuti = 0;
        int conTempo = 0;
        for (SocialDto.Commento c : commenti) {
            if (c.daPagina()) {
                continue;
            }
            totali++;
            if (c.risposto()) {
                risposti++;
                Instant creato = SocialTempo.istante(c.creatoIl());
                Instant risposta = SocialTempo.istante(c.rispostoIl());
                if (creato != null && risposta != null && !risposta.isBefore(creato)) {
                    sommaMinuti += Duration.between(creato, risposta).toMinutes();
                    conTempo++;
                }
            } else if (!c.gestito() && !c.nascosto()) {
                daRispondere++;
            }
        }
        return new SocialDto.Community(
                totali,
                daRispondere,
                risposti,
                totali == 0 ? null : (double) risposti / totali,
                conTempo == 0 ? null : sommaMinuti / conTempo,
                conversazioniNonLette);
    }

    /** Da rispondere: di un utente, senza risposta della pagina, non gestito, non nascosto. */
    public static boolean daRispondere(SocialDto.Commento c) {
        return !c.daPagina() && !c.risposto() && !c.gestito() && !c.nascosto();
    }

    /**
     * Quando pubblicare: interazioni medie dei contenuti pubblicati in ciascuna fascia giorno/ora (Europe/Rome)
     * dal giorno indicato in poi. Solo le celle con almeno un contenuto.
     */
    public static List<SocialDto.CellaOrario> orariMigliori(List<SocialDto.Contenuto> contenuti, Instant dal) {
        Map<String, long[]> celle = new LinkedHashMap<>();
        for (SocialDto.Contenuto c : contenuti) {
            Instant quando = SocialTempo.istante(c.pubblicatoIl());
            if (quando == null || quando.isBefore(dal) || c.interazioni() == null) {
                continue;
            }
            ZonedDateTime z = quando.atZone(SocialTempo.ROMA);
            String k = z.getDayOfWeek().getValue() + ":" + z.getHour();
            long[] acc = celle.computeIfAbsent(k, x -> new long[2]);
            acc[0] += c.interazioni();
            acc[1]++;
        }
        List<SocialDto.CellaOrario> out = new ArrayList<>();
        celle.forEach((k, acc) -> {
            String[] p = k.split(":");
            double media = Math.round((double) acc[0] / acc[1] * 10.0) / 10.0;
            out.add(new SocialDto.CellaOrario(Integer.parseInt(p[0]), Integer.parseInt(p[1]), media, (int) acc[1]));
        });
        out.sort(Comparator.comparingInt(SocialDto.CellaOrario::giorno).thenComparingInt(SocialDto.CellaOrario::ora));
        return out;
    }

    /** Interazioni / copertura, arrotondato a 4 decimali; null se manca la copertura. */
    public static Double tasso(Long interazioni, Long copertura) {
        if (interazioni == null || copertura == null || copertura <= 0) {
            return null;
        }
        return Math.round((double) interazioni / copertura * 10000.0) / 10000.0;
    }

    public static Long sommaNullable(Long... valori) {
        Long out = null;
        for (Long v : valori) {
            if (v != null) {
                out = (out == null ? 0L : out) + v;
            }
        }
        return out;
    }

    /** Tipo contenuto Instagram: IMAGE, VIDEO (REELS), CAROUSEL_ALBUM. */
    public static String tipoInstagram(String mediaType, String productType) {
        if ("CAROUSEL_ALBUM".equals(mediaType)) {
            return "CAROSELLO";
        }
        if ("VIDEO".equals(mediaType)) {
            return "REELS".equals(productType) ? "REEL" : "VIDEO";
        }
        return "FOTO";
    }

    /** Tipo contenuto Facebook dal primo allegato del post. */
    public static String tipoFacebook(JsonNode post) {
        JsonNode allegato = post.path("attachments").path("data").path(0);
        String mt = allegato.path("media_type").asText("");
        String tipo = allegato.path("type").asText("");
        if ("album".equals(mt) || tipo.contains("album")) {
            return "CAROSELLO";
        }
        if ("video".equals(mt) || tipo.contains("video") || post.path("status_type").asText("").contains("video")) {
            return "VIDEO";
        }
        if ("photo".equals(mt) || tipo.contains("photo")) {
            return "FOTO";
        }
        if ("link".equals(mt) || tipo.contains("share")) {
            return "LINK";
        }
        return allegato.isMissingNode() ? "TESTO" : "LINK";
    }
}
