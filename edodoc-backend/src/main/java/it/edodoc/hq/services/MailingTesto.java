package it.edodoc.hq.services;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.nodes.TextNode;

/** Versione testo delle email di marketing, ricavata dall'HTML. Presa da EmailMime di Mobilitas. */
final class MailingTesto {

    private MailingTesto() {
    }

    /** Testo leggibile da HTML: paragrafi e a capo conservati, spazi normalizzati. */
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
