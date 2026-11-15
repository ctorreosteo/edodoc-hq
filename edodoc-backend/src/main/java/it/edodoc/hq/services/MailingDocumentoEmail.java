package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.safety.Safelist;

import java.security.SecureRandom;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Documento email a blocchi (§13 della specifica) lato backend: costruzione dei blocchi per i modelli,
 * normalizzazione delle risposte AI e una resa HTML email semplice (tabelle, stili inline, 600px) usata come
 * {@code html} iniziale dei modelli. Il renderer "vero" resta quello del frontend ({@code lib/mailing-render.ts}),
 * che rigenera l'HTML quando l'email viene aperta nell'editor.
 */
public final class MailingDocumentoEmail {

    private static final JsonNodeFactory F = JsonNodeFactory.instance;
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String ALFABETO = "abcdefghijklmnopqrstuvwxyz0123456789";
    private static final Pattern COLORE = Pattern.compile("^#[0-9a-fA-F]{6}$");
    private static final Set<String> ALLINEAMENTI = Set.of("sinistra", "centro", "destra");

    /** Blocchi che l'AI può produrre (§13). */
    public static final Set<String> TIPI_AI = Set.of(
            "intestazione", "titolo", "testo", "immagine", "pulsante", "divisore", "spazio", "recensione", "piedipagina");

    public static final Map<String, Object> IMPOSTAZIONI_DEFAULT = Map.of(
            "larghezza", 600,
            "sfondo", "#f4f5f7",
            "sfondoContenuto", "#ffffff",
            "font", "Helvetica, Arial, sans-serif",
            "colorePrimario", "#1F3A63",
            "coloreTesto", "#1d2433",
            "raggio", 12);

    private static final Safelist TESTO_AMMESSO = new Safelist()
            .addTags("p", "br", "strong", "em", "u", "a", "ul", "ol", "li", "h2", "h3", "b", "i")
            .addAttributes("a", "href")
            .addProtocols("a", "href", "http", "https", "mailto", "tel");

    private MailingDocumentoEmail() {
    }

    public static String nuovoId() {
        StringBuilder sb = new StringBuilder("b_");
        for (int i = 0; i < 6; i++) {
            sb.append(ALFABETO.charAt(RANDOM.nextInt(ALFABETO.length())));
        }
        return sb.toString();
    }

    public static ObjectNode impostazioniDefault() {
        ObjectNode o = F.objectNode();
        o.put("larghezza", 600);
        o.put("sfondo", "#f4f5f7");
        o.put("sfondoContenuto", "#ffffff");
        o.put("font", "Helvetica, Arial, sans-serif");
        o.put("colorePrimario", "#1F3A63");
        o.put("coloreTesto", "#1d2433");
        o.put("raggio", 12);
        return o;
    }

    public static ObjectNode documento(List<ObjectNode> blocchi) {
        ObjectNode doc = F.objectNode();
        doc.put("versione", 1);
        doc.set("impostazioni", impostazioniDefault());
        ArrayNode arr = doc.putArray("blocchi");
        blocchi.forEach(arr::add);
        return doc;
    }

    // ───────────────────────── Costruttori di blocchi ─────────────────────────

    private static ObjectNode blocco(String tipo) {
        ObjectNode b = F.objectNode();
        b.put("id", nuovoId());
        b.put("tipo", tipo);
        b.putObject("props");
        return b;
    }

    private static ObjectNode props(ObjectNode b) {
        return (ObjectNode) b.get("props");
    }

    public static ObjectNode intestazione(String sottotitolo) {
        ObjectNode b = blocco("intestazione");
        props(b).put("allineamento", "centro");
        if (sottotitolo != null) {
            props(b).put("testo", sottotitolo);
        }
        return b;
    }

    public static ObjectNode titolo(String testo, int livello) {
        ObjectNode b = blocco("titolo");
        props(b).put("testo", testo).put("livello", livello).put("allineamento", "sinistra");
        return b;
    }

    public static ObjectNode testo(String html) {
        ObjectNode b = blocco("testo");
        props(b).put("html", html).put("allineamento", "sinistra").put("dimensione", 16);
        return b;
    }

    public static ObjectNode pulsante(String testo, String url) {
        ObjectNode b = blocco("pulsante");
        props(b).put("testo", testo).put("url", url).put("allineamento", "centro")
                .put("larghezzaPiena", false).put("raggio", 10);
        return b;
    }

    public static ObjectNode divisore() {
        ObjectNode b = blocco("divisore");
        props(b).put("colore", "#e4e0d8").put("spessore", 1).put("margine", 16);
        return b;
    }

    public static ObjectNode spazio(int altezza) {
        ObjectNode b = blocco("spazio");
        props(b).put("altezza", altezza);
        return b;
    }

    public static ObjectNode recensione(String testo, String autore, int stelle) {
        ObjectNode b = blocco("recensione");
        props(b).put("testo", testo).put("autore", autore).put("stelle", stelle).put("fonte", "Google");
        return b;
    }

    public static ObjectNode piedipagina(String testo) {
        ObjectNode b = blocco("piedipagina");
        props(b).put("testo", testo).put("mostraIndirizzo", true).put("mostraPreferenze", true);
        return b;
    }

    public static ObjectNode html(String html) {
        ObjectNode b = blocco("html");
        props(b).put("html", html == null ? "" : html);
        return b;
    }

    /** Documento con un solo blocco HTML grezzo (template e email importati da Mailchimp). */
    public static ObjectNode documentoHtml(String html) {
        return documento(List.of(html(html)));
    }

    // ───────────────────────── Normalizzazione (AI) ─────────────────────────

    /** Esito della normalizzazione: documento pulito e numero di blocchi scartati. */
    public record Normalizzato(ObjectNode documento, int scartati) {
    }

    /**
     * Rende valido un documento arrivato dall'AI: impostazioni complete (default dove mancano o non valide), solo i
     * blocchi in {@code tipiAmmessi} con le props note, id nuovi generati qui. I blocchi non validi (tipo sconosciuto,
     * testo vuoto, pulsante senza url http) vengono scartati.
     */
    public static Normalizzato normalizza(JsonNode grezzo, Set<String> tipiAmmessi, JsonNode impostazioniRichieste) {
        ObjectNode imp = impostazioniDefault();
        unisciImpostazioni(imp, grezzo == null ? null : grezzo.path("impostazioni"));
        unisciImpostazioni(imp, impostazioniRichieste);
        ObjectNode doc = F.objectNode();
        doc.put("versione", 1);
        doc.set("impostazioni", imp);
        ArrayNode out = doc.putArray("blocchi");
        int scartati = 0;
        JsonNode blocchi = grezzo == null ? null : grezzo.path("blocchi");
        if (blocchi != null && blocchi.isArray()) {
            for (JsonNode b : blocchi) {
                ObjectNode pulito = pulisciBlocco(b, tipiAmmessi);
                if (pulito == null) {
                    scartati++;
                } else {
                    out.add(pulito);
                }
            }
        }
        return new Normalizzato(doc, scartati);
    }

    private static void unisciImpostazioni(ObjectNode imp, JsonNode sorgente) {
        if (sorgente == null || !sorgente.isObject()) {
            return;
        }
        for (String k : List.of("sfondo", "sfondoContenuto", "colorePrimario", "coloreTesto")) {
            String c = MailingGrafo.testo(sorgente.path(k));
            if (c != null && COLORE.matcher(c).matches()) {
                imp.put(k, c.toLowerCase(Locale.ROOT));
            }
        }
        String font = MailingGrafo.testo(sorgente.path("font"));
        if (font != null && font.length() <= 120 && !font.contains("<") && !font.contains(";")) {
            imp.put("font", font);
        }
        long larghezza = MailingGrafo.numero(sorgente.path("larghezza"), -1L);
        if (larghezza >= 480 && larghezza <= 800) {
            imp.put("larghezza", larghezza);
        }
        long raggio = MailingGrafo.numero(sorgente.path("raggio"), -1L);
        if (raggio >= 0 && raggio <= 32) {
            imp.put("raggio", raggio);
        }
    }

    private static ObjectNode pulisciBlocco(JsonNode b, Set<String> tipiAmmessi) {
        if (b == null || !b.isObject()) {
            return null;
        }
        String tipo = MailingGrafo.testo(b.path("tipo"));
        if (tipo == null) {
            return null;
        }
        tipo = tipo.toLowerCase(Locale.ROOT);
        if (!tipiAmmessi.contains(tipo)) {
            return null;
        }
        JsonNode p = b.path("props").isObject() ? b.path("props") : b;
        ObjectNode out = blocco(tipo);
        ObjectNode q = props(out);
        allineamento(p, q);
        switch (tipo) {
            case "intestazione" -> {
                copiaTesto(p, q, "testo", 200);
                url(p, q, "logoUrl");
                url(p, q, "link");
                numero(p, q, "logoLarghezza", 40, 400);
                colore(p, q, "sfondo");
            }
            case "titolo" -> {
                if (!copiaTesto(p, q, "testo", 300)) {
                    return null;
                }
                long l = MailingGrafo.numero(p.path("livello"), 1L);
                q.put("livello", Math.max(1, Math.min(3, l)));
                colore(p, q, "colore");
            }
            case "testo" -> {
                String html = MailingGrafo.testo(p.path("html"));
                if (html == null) {
                    html = MailingGrafo.testo(p.path("testo"));
                }
                String pulito = sanificaTesto(html);
                if (pulito.isBlank()) {
                    return null;
                }
                q.put("html", pulito);
                numero(p, q, "dimensione", 12, 24);
                colore(p, q, "colore");
            }
            case "immagine" -> {
                if (!url(p, q, "url")) {
                    return null;
                }
                copiaTesto(p, q, "alt", 200);
                url(p, q, "link");
                numero(p, q, "larghezza", 10, 100);
                numero(p, q, "raggio", 0, 32);
            }
            case "pulsante" -> {
                if (!copiaTesto(p, q, "testo", 80)) {
                    return null;
                }
                if (!url(p, q, "url")) {
                    return null;
                }
                colore(p, q, "colore");
                colore(p, q, "coloreTesto");
                if (p.path("larghezzaPiena").isBoolean()) {
                    q.put("larghezzaPiena", p.path("larghezzaPiena").asBoolean());
                }
                numero(p, q, "raggio", 0, 40);
            }
            case "divisore" -> {
                colore(p, q, "colore");
                numero(p, q, "spessore", 1, 8);
                numero(p, q, "margine", 0, 64);
            }
            case "spazio" -> q.put("altezza", Math.max(4, Math.min(120, MailingGrafo.numero(p.path("altezza"), 24L))));
            case "recensione" -> {
                if (!copiaTesto(p, q, "testo", 600)) {
                    return null;
                }
                copiaTesto(p, q, "autore", 120);
                copiaTesto(p, q, "fonte", 60);
                q.put("stelle", Math.max(1, Math.min(5, MailingGrafo.numero(p.path("stelle"), 5L))));
            }
            case "piedipagina" -> {
                String t = MailingGrafo.testo(p.path("testo"));
                if (t != null) {
                    q.put("testo", sanificaTesto(t));
                }
                q.put("mostraIndirizzo", !p.path("mostraIndirizzo").isBoolean() || p.path("mostraIndirizzo").asBoolean());
                q.put("mostraPreferenze", !p.path("mostraPreferenze").isBoolean() || p.path("mostraPreferenze").asBoolean());
            }
            case "html" -> {
                String h = MailingGrafo.testo(p.path("html"));
                if (h == null) {
                    return null;
                }
                q.put("html", h);
            }
            default -> {
                return null;
            }
        }
        return out;
    }

    private static void allineamento(JsonNode p, ObjectNode q) {
        String a = MailingGrafo.testo(p.path("allineamento"));
        if (a != null && ALLINEAMENTI.contains(a.toLowerCase(Locale.ROOT))) {
            q.put("allineamento", a.toLowerCase(Locale.ROOT));
        }
    }

    private static boolean copiaTesto(JsonNode p, ObjectNode q, String campo, int max) {
        String t = MailingGrafo.testo(p.path(campo));
        if (t == null) {
            return false;
        }
        t = Jsoup.parse(t).text();
        if (t.isBlank()) {
            return false;
        }
        q.put(campo, t.length() > max ? t.substring(0, max) : t);
        return true;
    }

    private static boolean url(JsonNode p, ObjectNode q, String campo) {
        String u = MailingGrafo.testo(p.path(campo));
        if (u == null) {
            return false;
        }
        String l = u.toLowerCase(Locale.ROOT);
        // Segnaposto ammessi come destinazione (es. {{link_browser}}) e URL http(s)/mailto/tel.
        if (l.startsWith("http://") || l.startsWith("https://") || l.startsWith("mailto:") || l.startsWith("tel:")
                || (u.startsWith("{{") && u.endsWith("}}"))) {
            q.put(campo, u);
            return true;
        }
        return false;
    }

    private static void colore(JsonNode p, ObjectNode q, String campo) {
        String c = MailingGrafo.testo(p.path(campo));
        if (c != null && COLORE.matcher(c).matches()) {
            q.put(campo, c.toLowerCase(Locale.ROOT));
        }
    }

    private static void numero(JsonNode p, ObjectNode q, String campo, long min, long max) {
        long v = MailingGrafo.numero(p.path(campo), Long.MIN_VALUE);
        if (v != Long.MIN_VALUE) {
            q.put(campo, Math.max(min, Math.min(max, v)));
        }
    }

    /** HTML del blocco testo ridotto al sottoinsieme ammesso (p, br, strong, em, u, a, ul/ol/li, h2, h3). */
    public static String sanificaTesto(String html) {
        if (html == null || html.isBlank()) {
            return "";
        }
        String h = html.contains("<") ? html : "<p>" + html.replace("\n\n", "</p><p>").replace("\n", "<br>") + "</p>";
        Document.OutputSettings out = new Document.OutputSettings().prettyPrint(false);
        return Jsoup.clean(h, "", TESTO_AMMESSO, out).trim();
    }

    // ───────────────────────── Resa HTML semplice ─────────────────────────

    /**
     * HTML email minimale ma ben fatto dal documento: tabella centrale (larghezza delle impostazioni), stili inline,
     * segnaposto lasciati com'erano. Il footer legale lo aggiunge la composizione dell'invio quando manca
     * {{link_disiscrizione}}: il blocco piedipagina qui lo include già.
     */
    public static String render(JsonNode doc) {
        JsonNode imp = doc.path("impostazioni");
        int larghezza = (int) MailingGrafo.numero(imp.path("larghezza"), 600L);
        String sfondo = coloreO(imp.path("sfondo"), "#f4f5f7");
        String sfondoContenuto = coloreO(imp.path("sfondoContenuto"), "#ffffff");
        String primario = coloreO(imp.path("colorePrimario"), "#1F3A63");
        String testo = coloreO(imp.path("coloreTesto"), "#1d2433");
        String font = MailingGrafo.testo(imp.path("font")) == null ? "Helvetica, Arial, sans-serif"
                : MailingGrafo.testo(imp.path("font")).replace("\"", "'");
        int raggio = (int) MailingGrafo.numero(imp.path("raggio"), 12L);

        StringBuilder corpo = new StringBuilder();
        for (JsonNode b : MailingGrafo.iterabile(doc.path("blocchi"))) {
            corpo.append(renderBlocco(b, primario, testo, font));
        }
        return "<!DOCTYPE html><html lang=\"it\"><head><meta charset=\"utf-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
                + "<meta name=\"color-scheme\" content=\"light\"><title></title>"
                + "<style>@media (max-width:620px){.ml-c{width:100%!important;border-radius:0!important}"
                + ".ml-p{padding-left:20px!important;padding-right:20px!important}}</style></head>"
                + "<body style=\"margin:0;padding:0;background:" + sfondo + ";\">"
                + "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"background:"
                + sfondo + ";\"><tr><td align=\"center\" style=\"padding:24px 12px;\">"
                + "<table role=\"presentation\" class=\"ml-c\" width=\"" + larghezza + "\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" "
                + "style=\"width:" + larghezza + "px;max-width:100%;background:" + sfondoContenuto + ";border-radius:" + raggio
                + "px;font-family:" + font + ";color:" + testo + ";\">"
                + corpo
                + "</table></td></tr></table></body></html>";
    }

    private static String riga(String contenuto, String padding) {
        return "<tr><td class=\"ml-p\" style=\"padding:" + padding + ";\">" + contenuto + "</td></tr>";
    }

    private static String align(JsonNode p, String predefinito) {
        String a = MailingGrafo.testo(p.path("allineamento"));
        a = a == null ? predefinito : a;
        return switch (a) {
            case "centro" -> "center";
            case "destra" -> "right";
            default -> "left";
        };
    }

    private static String renderBlocco(JsonNode b, String primario, String coloreTesto, String font) {
        String tipo = MailingGrafo.testo(b.path("tipo"));
        JsonNode p = b.path("props");
        if (tipo == null) {
            return "";
        }
        return switch (tipo) {
            case "intestazione" -> {
                String logo = MailingGrafo.testo(p.path("logoUrl"));
                String sotto = MailingGrafo.testo(p.path("testo"));
                StringBuilder s = new StringBuilder();
                if (logo != null) {
                    s.append("<img src=\"").append(esc(logo)).append("\" width=\"")
                            .append(MailingGrafo.numero(p.path("logoLarghezza"), 140L))
                            .append("\" alt=\"Dr. Edoardo Bo\" style=\"display:inline-block;border:0;\">");
                } else {
                    s.append("<div style=\"font-size:20px;font-weight:700;letter-spacing:.5px;color:").append(primario)
                            .append(";\">Dr. Edoardo Bo</div>");
                }
                if (sotto != null) {
                    s.append("<div style=\"font-size:13px;color:#6b726e;margin-top:4px;\">").append(esc(sotto)).append("</div>");
                }
                yield riga("<div style=\"text-align:" + align(p, "centro") + ";\">" + s + "</div>", "28px 40px 8px");
            }
            case "titolo" -> {
                long livello = MailingGrafo.numero(p.path("livello"), 1L);
                int dim = livello == 1 ? 28 : livello == 2 ? 22 : 18;
                String colore = coloreO(p.path("colore"), coloreTesto);
                yield riga("<h" + livello + " style=\"margin:0;font-size:" + dim + "px;line-height:1.25;font-weight:700;color:"
                        + colore + ";text-align:" + align(p, "sinistra") + ";font-family:" + font + ";\">"
                        + esc(MailingGrafo.testo(p.path("testo"))) + "</h" + livello + ">", "16px 40px 4px");
            }
            case "testo" -> {
                long dim = MailingGrafo.numero(p.path("dimensione"), 16L);
                String html = sanificaTesto(MailingGrafo.testo(p.path("html")))
                        .replace("<p>", "<p style=\"margin:0 0 14px;\">")
                        .replace("<a href", "<a style=\"color:" + primario + ";\" href")
                        .replace("<li>", "<li style=\"margin:0 0 6px;\">");
                yield riga("<div style=\"font-size:" + dim + "px;line-height:1.6;color:" + coloreO(p.path("colore"), coloreTesto)
                        + ";text-align:" + align(p, "sinistra") + ";\">" + html + "</div>", "8px 40px");
            }
            case "immagine" -> {
                String url = MailingGrafo.testo(p.path("url"));
                if (url == null) {
                    yield "";
                }
                long perc = MailingGrafo.numero(p.path("larghezza"), 100L);
                String img = "<img src=\"" + esc(url) + "\" alt=\"" + esc(MailingGrafo.testo(p.path("alt")))
                        + "\" style=\"display:inline-block;width:" + perc + "%;max-width:100%;height:auto;border:0;border-radius:"
                        + MailingGrafo.numero(p.path("raggio"), 8L) + "px;\">";
                String link = MailingGrafo.testo(p.path("link"));
                yield riga("<div style=\"text-align:" + align(p, "centro") + ";\">"
                        + (link == null ? img : "<a href=\"" + esc(link) + "\">" + img + "</a>") + "</div>", "12px 40px");
            }
            case "pulsante" -> {
                String sfondoBtn = coloreO(p.path("colore"), primario);
                String coloreBtn = coloreO(p.path("coloreTesto"), "#ffffff");
                boolean pieno = p.path("larghezzaPiena").asBoolean(false);
                long r = MailingGrafo.numero(p.path("raggio"), 10L);
                String a = "<a href=\"" + esc(MailingGrafo.testo(p.path("url"))) + "\" style=\"display:"
                        + (pieno ? "block" : "inline-block") + ";background:" + sfondoBtn + ";color:" + coloreBtn
                        + ";text-decoration:none;font-weight:700;font-size:16px;padding:14px 28px;border-radius:" + r
                        + "px;font-family:" + font + ";\">" + esc(MailingGrafo.testo(p.path("testo"))) + "</a>";
                yield riga("<div style=\"text-align:" + align(p, "centro") + ";\">" + a + "</div>", "16px 40px");
            }
            case "divisore" -> riga("<div style=\"border-top:" + MailingGrafo.numero(p.path("spessore"), 1L) + "px solid "
                    + coloreO(p.path("colore"), "#e4e0d8") + ";font-size:0;line-height:0;\">&nbsp;</div>",
                    MailingGrafo.numero(p.path("margine"), 16L) + "px 40px");
            case "spazio" -> "<tr><td style=\"height:" + MailingGrafo.numero(p.path("altezza"), 24L)
                    + "px;font-size:0;line-height:0;\">&nbsp;</td></tr>";
            case "recensione" -> {
                int stelle = (int) Math.max(1, Math.min(5, MailingGrafo.numero(p.path("stelle"), 5L)));
                String autore = MailingGrafo.testo(p.path("autore"));
                String fonte = MailingGrafo.testo(p.path("fonte"));
                yield riga("<div style=\"background:#f7f5f0;border-radius:10px;padding:18px 20px;\">"
                        + "<div style=\"color:#e0a526;font-size:18px;letter-spacing:2px;\">" + "★".repeat(stelle) + "</div>"
                        + "<div style=\"font-size:16px;line-height:1.55;font-style:italic;margin:8px 0;\">«"
                        + esc(MailingGrafo.testo(p.path("testo"))) + "»</div>"
                        + (autore == null ? "" : "<div style=\"font-size:13px;color:#6b726e;\">— " + esc(autore)
                        + (fonte == null ? "" : ", " + esc(fonte)) + "</div>")
                        + "</div>", "12px 40px");
            }
            case "html" -> riga(MailingGrafo.testo(p.path("html")) == null ? "" : p.path("html").asText(), "0");
            case "piedipagina" -> {
                String t = MailingGrafo.testo(p.path("testo"));
                StringBuilder s = new StringBuilder();
                if (t != null) {
                    s.append("<div style=\"margin-bottom:8px;\">").append(sanificaTesto(t)
                            .replace("<p>", "<p style=\"margin:0 0 6px;\">")).append("</div>");
                }
                if (!p.path("mostraIndirizzo").isBoolean() || p.path("mostraIndirizzo").asBoolean()) {
                    s.append("<div>{{indirizzo_postale}}</div>");
                }
                s.append("<div style=\"margin-top:8px;\">");
                if (!p.path("mostraPreferenze").isBoolean() || p.path("mostraPreferenze").asBoolean()) {
                    s.append("<a href=\"{{link_preferenze}}\" style=\"color:#6b726e;\">Preferenze email</a> · ");
                }
                s.append("<a href=\"{{link_disiscrizione}}\" style=\"color:#6b726e;\">Disiscriviti</a></div>");
                yield riga("<div style=\"border-top:1px solid #ece8e0;padding-top:18px;font-size:12px;line-height:1.5;color:#6b726e;text-align:center;\">"
                        + s + "</div>", "24px 40px 32px");
            }
            default -> "";
        };
    }

    private static String coloreO(JsonNode n, String predefinito) {
        String c = MailingGrafo.testo(n);
        return c != null && COLORE.matcher(c).matches() ? c : predefinito;
    }

    static String esc(String s) {
        if (s == null) {
            return "";
        }
        StringBuilder sb = new StringBuilder(s.length());
        for (char c : s.toCharArray()) {
            switch (c) {
                case '<' -> sb.append("&lt;");
                case '>' -> sb.append("&gt;");
                case '&' -> sb.append("&amp;");
                case '"' -> sb.append("&quot;");
                default -> sb.append(c);
            }
        }
        return sb.toString();
    }

    /** Testo semplice del documento (per dare all'AI il contenuto di un'email senza markup). */
    public static String testoSemplice(JsonNode doc) {
        StringBuilder sb = new StringBuilder();
        for (JsonNode b : MailingGrafo.iterabile(doc.path("blocchi"))) {
            JsonNode p = b.path("props");
            for (Iterator<String> it = List.of("testo", "html").iterator(); it.hasNext(); ) {
                String campo = it.next();
                String v = MailingGrafo.testo(p.path(campo));
                if (v != null) {
                    sb.append(Jsoup.parse(v).text()).append('\n');
                }
            }
        }
        return sb.toString().trim();
    }
}
