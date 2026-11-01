package it.edodoc.hq.services;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.nodes.Entities;
import org.jsoup.nodes.TextNode;
import org.jsoup.safety.Safelist;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Corpo di un'email scritta in un popup: testo semplice sempre, HTML se il messaggio è formattato (null altrimenti).
 * L'HTML arriva dall'editor del frontend ma è ridotto qui a ciò che l'editor produce: tag, link e poche proprietà
 * di stile. Gli stili di base sono scritti inline perché i client di posta ignorano quelli esterni.
 */
public record CorpoEmail(String testo, String html) {

    /** L'editor apre sempre con un blocco; il testo di un frontend non ancora aggiornato no. */
    private static final Pattern FORMATTATO = Pattern.compile("^\\s*<(p|h[1-6]|ul|ol|blockquote|hr)[\\s/>]", Pattern.CASE_INSENSITIVE);

    private static final Safelist AMMESSO = new Safelist()
            .addTags("p", "br", "strong", "b", "em", "i", "u", "s", "span", "a", "ul", "ol", "li", "h2", "h3", "blockquote", "hr")
            .addAttributes(":all", "style")
            .addAttributes("a", "href", "target", "rel")
            .addAttributes("ol", "start")
            .addProtocols("a", "href", "http", "https", "mailto", "tel");

    private static final Pattern COLORE = Pattern.compile("#[0-9a-f]{3,8}|rgba?\\([0-9., %]+\\)");
    private static final Map<String, Pattern> STILI_AMMESSI = Map.of(
            "color", COLORE,
            "background-color", COLORE,
            "font-size", Pattern.compile("[0-9]{1,3}(\\.[0-9]+)?(px|pt|em|rem|%)"),
            "font-family", Pattern.compile("[a-z0-9 ,'\"-]{1,100}"),
            "text-align", Pattern.compile("left|center|right|justify"));

    private static final Map<String, String> STILI_BASE = Map.of(
            "p", "margin:0 0 12px",
            "ul", "margin:0 0 12px;padding-left:24px",
            "ol", "margin:0 0 12px;padding-left:24px",
            "h2", "margin:18px 0 8px;font-size:20px;line-height:1.3",
            "h3", "margin:14px 0 6px;font-size:16px;line-height:1.3",
            "blockquote", "margin:0 0 12px;padding-left:12px;border-left:3px solid #d0d7de;color:#57606a",
            "hr", "margin:16px 0;border:0;border-top:1px solid #d0d7de",
            "a", "color:#0b63ce;text-decoration:underline");

    public static CorpoEmail da(String corpo) {
        if (corpo == null) {
            return new CorpoEmail("", null);
        }
        if (!FORMATTATO.matcher(corpo).find()) {
            return new CorpoEmail(corpo.replace("\r\n", "\n").replace('\r', '\n').trim(), null);
        }
        String html = sanifica(corpo);
        return new CorpoEmail(testoDaHtml(html), html);
    }

    static String sanifica(String html) {
        Document.OutputSettings uscita = new Document.OutputSettings().prettyPrint(false).escapeMode(Entities.EscapeMode.base);
        Document d = Jsoup.parseBodyFragment(Jsoup.clean(html, "", AMMESSO, uscita));
        d.outputSettings(uscita);
        for (Element el : d.body().getAllElements()) {
            if (el != d.body()) {
                preparaElemento(el);
            }
        }
        return d.body().html().trim();
    }

    private static void preparaElemento(Element el) {
        String tag = el.normalName();
        // Un paragrafo vuoto è una riga vuota: senza contenuto i client di posta lo fanno sparire
        if (tag.equals("p") && el.childNodeSize() == 0) {
            el.appendElement("br");
        }
        String base = tag.equals("p") && "li".equals(el.parent() == null ? "" : el.parent().normalName())
                ? "margin:0"
                : STILI_BASE.get(tag);
        String stile = stileAmmesso(el.attr("style"));
        if (base != null && !stile.isEmpty()) {
            el.attr("style", base + ";" + stile);
        } else if (base != null) {
            el.attr("style", base);
        } else if (!stile.isEmpty()) {
            el.attr("style", stile);
        } else {
            el.removeAttr("style");
        }
    }

    private static String stileAmmesso(String stile) {
        List<String> tenuti = new ArrayList<>();
        for (String dichiarazione : stile.split(";")) {
            int duePunti = dichiarazione.indexOf(':');
            if (duePunti < 0) {
                continue;
            }
            String nome = dichiarazione.substring(0, duePunti).trim().toLowerCase(Locale.ROOT);
            String valore = dichiarazione.substring(duePunti + 1).trim();
            Pattern ammesso = STILI_AMMESSI.get(nome);
            if (ammesso != null && ammesso.matcher(valore.toLowerCase(Locale.ROOT)).matches()) {
                tenuti.add(nome + ":" + valore);
            }
        }
        return String.join(";", tenuti);
    }

    public static String testoDaHtml(String html) {
        if (html == null || html.isBlank()) {
            return "";
        }
        Document d = Jsoup.parse(html);
        d.select("style, script, head, title").remove();
        for (Element el : d.getAllElements()) {
            if (el.tagName().equals("pre")) {
                continue;
            }
            for (TextNode tn : el.textNodes()) {
                tn.text(tn.getWholeText().replaceAll("\\s+", " "));
            }
        }
        // wholeText() rende già i <br> come a capo.
        for (Element li : d.select("li")) {
            // L'editor mette il testo di ogni voce in un paragrafo: deve restare accanto al punto
            Element primo = li.firstElementChild();
            if (primo != null && primo.nameIs("p")) {
                primo.unwrap();
            }
            Element lista = li.parent();
            boolean numerata = lista != null && lista.nameIs("ol");
            li.prependChild(new TextNode("\n" + (numerata ? (primoNumero(lista) + li.elementSiblingIndex()) + ". " : "• ")));
        }
        for (Element blocco : d.select("p, div, ul, ol, tr, h1, h2, h3, h4, h5, h6, blockquote, table")) {
            blocco.prependChild(new TextNode("\n"));
            blocco.appendChild(new TextNode("\n"));
        }
        String testo = d.body() != null ? d.body().wholeText() : d.wholeText();
        return testo.replaceAll("[ \\t\\x0B\\f\\r]+", " ")
                .replaceAll(" *\n *", "\n")
                .replaceAll("\n{3,}", "\n\n")
                .trim();
    }

    private static int primoNumero(Element lista) {
        try {
            return Integer.parseInt(lista.attr("start").trim());
        } catch (NumberFormatException e) {
            return 1;
        }
    }
}
