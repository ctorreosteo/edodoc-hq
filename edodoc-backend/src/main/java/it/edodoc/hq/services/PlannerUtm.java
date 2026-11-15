package it.edodoc.hq.services;

import it.edodoc.hq.models.PlannerPost;
import org.springframework.util.StringUtils;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.Locale;
import java.util.Map;

/**
 * UTM automatici del Planner social: il link del post esce con utm_source = canale, utm_medium = social,
 * utm_campaign = titolo del post (in minuscolo con trattini) e utm_content = formato, così le richieste arrivate dai
 * social si riconoscono nell'analisi funnel. Un link che ha già utm_source resta com'è. Il frontend ne ha una copia
 * in {@code src/lib/planner-utm.ts} (per il testo da copiare): vanno cambiati insieme.
 */
public final class PlannerUtm {

    static final Map<String, String> SORGENTI = Map.of(
            PlannerCanali.FACEBOOK, "facebook",
            PlannerCanali.INSTAGRAM, "instagram",
            PlannerCanali.YOUTUBE, "youtube",
            PlannerCanali.GOOGLE_BUSINESS, "google_business",
            PlannerCanali.TIKTOK, "tiktok",
            PlannerCanali.LINKEDIN, "linkedin",
            PlannerCanali.X, "x",
            PlannerCanali.THREADS, "threads",
            PlannerCanali.PINTEREST, "pinterest");

    private PlannerUtm() {
    }

    /** Il link del post per un canale: con UTM se il post li vuole, altrimenti com'è. */
    public static String link(PlannerPost p, String canale, String formato) {
        String link = p.getLink();
        if (!p.isUtm() || !StringUtils.hasText(link)) {
            return link;
        }
        return conUtm(link, SORGENTI.getOrDefault(canale, canale.toLowerCase(Locale.ROOT)), campagna(p),
                formato == null ? null : formato.toLowerCase(Locale.ROOT));
    }

    static String conUtm(String url, String sorgente, String campagna, String contenuto) {
        if (url == null || url.contains("utm_source=")) {
            return url;
        }
        int ancora = url.indexOf('#');
        String base = ancora >= 0 ? url.substring(0, ancora) : url;
        String coda = ancora >= 0 ? url.substring(ancora) : "";
        StringBuilder sb = new StringBuilder(base).append(base.contains("?") ? "&" : "?")
                .append("utm_source=").append(enc(sorgente))
                .append("&utm_medium=social")
                .append("&utm_campaign=").append(enc(campagna));
        if (StringUtils.hasText(contenuto)) {
            sb.append("&utm_content=").append(enc(contenuto));
        }
        return sb.append(coda).toString();
    }

    static String campagna(PlannerPost p) {
        String s = slug(p.getTitolo());
        return s.isEmpty() ? "post-" + p.getId() : s;
    }

    static String slug(String testo) {
        if (testo == null) {
            return "";
        }
        String n = Normalizer.normalize(testo, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT);
        n = n.replaceAll("[^a-z0-9]+", "-").replaceAll("(^-+|-+$)", "");
        return n.length() > 60 ? n.substring(0, 60).replaceAll("-+$", "") : n;
    }

    private static String enc(String v) {
        return URLEncoder.encode(v, StandardCharsets.UTF_8);
    }
}
