package it.edodoc.hq.services;

import com.openhtmltopdf.pdfboxout.PdfBoxRenderer;
import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import it.edodoc.hq.dto.DietaDto;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.graphics.state.PDExtendedGraphicsState;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.text.Collator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;

/**
 * Dieta in PDF. Le pagine si compongono in XHTML e CSS (openhtmltopdf su PDFBox 2, come le parcelle);
 * le forme della copertina, il triangolo della D e la O del logo, si disegnano poi in vettoriale sotto il testo.
 * Ogni sezione vuota sparisce: un piano con soli pasti resta pulito quanto uno completo.
 */
@Service
public class DietaPdfService {

    private static final Color NOTTE = new Color(0x1F, 0x3A, 0x63);
    private static final Color BLU = new Color(0x3A, 0x60, 0x98);
    private static final Color ARANCIONE = new Color(0xF0, 0x94, 0x4E);
    private static final float CERCHIO = 0.5523f;
    private static final DateTimeFormatter DATA = DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.ITALIAN);
    private static final DateTimeFormatter DATA_ORA = DateTimeFormatter.ofPattern("d/MM/yyyy 'alle' HH:mm", Locale.ITALIAN);
    private static final String[] LETTERE = {"A", "B", "C", "D", "E", "F", "G", "H"};

    private final ConfigService configService;
    private volatile String logo;

    static {
        // A ogni PDF openhtmltopdf scrive righe INFO sui font: nel log restano solo avvisi ed errori
        for (String logger : com.openhtmltopdf.util.XRLog.listRegisteredLoggers()) {
            com.openhtmltopdf.util.XRLog.setLevel(logger, java.util.logging.Level.WARNING);
        }
    }

    public DietaPdfService(ConfigService configService) {
        this.configService = configService;
    }

    /** Quello che finisce sulla carta: la dieta corrente o una sua versione passata. */
    public record Documento(String titolo, String paziente, LocalDate dataInizio, LocalDateTime aggiornata, DietaDto.Contenuto contenuto) {
    }

    public byte[] genera(Documento d) throws IOException {
        String html = html(d);
        PdfRendererBuilder builder = new PdfRendererBuilder();
        builder.withHtmlContent(html, null);
        for (Map.Entry<String, Integer> font : Map.of("Light", 300, "Regular", 400, "SemiBold", 600, "Bold", 700).entrySet()) {
            builder.useFont(() -> {
                try {
                    return new ClassPathResource("fonts/Montserrat-" + font.getKey() + ".ttf").getInputStream();
                } catch (IOException e) {
                    throw new UncheckedIOException(e);
                }
            }, "Montserrat", font.getValue(), com.openhtmltopdf.outputdevice.helper.BaseRendererBuilder.FontStyle.NORMAL, true);
        }
        try (ByteArrayOutputStream uscita = new ByteArrayOutputStream()) {
            builder.toStream(uscita);
            PdfBoxRenderer renderer = builder.buildPdfRenderer();
            try {
                renderer.layout();
                renderer.createPDFWithoutClosing();
                PDDocument documento = renderer.getPdfDocument();
                documento.getDocumentInformation().setTitle(d.paziente() == null ? d.titolo() : d.titolo() + " · " + d.paziente());
                documento.getDocumentInformation().setAuthor(configService.get("EMITTENTE_NOME"));
                decora(documento);
                documento.save(uscita);
            } finally {
                renderer.close();
            }
            return uscita.toByteArray();
        }
    }

    // ---------------------------------------------------------------- forme vettoriali

    private void decora(PDDocument documento) throws IOException {
        for (int i = 0; i < documento.getNumberOfPages(); i++) {
            PDPage pagina = documento.getPage(i);
            float l = pagina.getMediaBox().getWidth();
            float a = pagina.getMediaBox().getHeight();
            try (PDPageContentStream c = new PDPageContentStream(documento, pagina, PDPageContentStream.AppendMode.PREPEND, true, true)) {
                if (i == 0) {
                    copertina(c, l, a);
                } else {
                    c.setNonStrokingColor(ARANCIONE);
                    c.addRect(0, a - 4, l, 4);
                    c.fill();
                    // la O del logo, appena accennata nell'angolo in basso
                    trasparenza(c, 0.07f);
                    c.setNonStrokingColor(BLU);
                    c.saveGraphicsState();
                    c.addRect(0, 0, l, a);
                    c.clip();
                    anello(c, l + 10, -10, 120, 46);
                    c.fill();
                    c.restoreGraphicsState();
                    trasparenza(c, 1f);
                }
            }
        }
    }

    private static void copertina(PDPageContentStream c, float l, float a) throws IOException {
        c.setNonStrokingColor(NOTTE);
        c.addRect(0, 0, l, a);
        c.fill();
        c.saveGraphicsState();
        c.addRect(0, 0, l, a);
        c.clip();
        // il triangolo della D, grande e trasparente, dall'alto a destra
        trasparenza(c, 0.55f);
        c.setNonStrokingColor(BLU);
        c.moveTo(l * 0.38f, a);
        c.lineTo(l, a);
        c.lineTo(l, a * 0.46f);
        c.closePath();
        c.fill();
        // la O del logo, anello arancione in basso a destra
        trasparenza(c, 0.16f);
        c.setNonStrokingColor(ARANCIONE);
        anello(c, l - 40, 150, 210, 120);
        c.fill();
        trasparenza(c, 1f);
        c.restoreGraphicsState();
        c.setNonStrokingColor(ARANCIONE);
        c.addRect(0, 0, l, 6);
        c.fill();
    }

    private static void trasparenza(PDPageContentStream c, float valore) throws IOException {
        PDExtendedGraphicsState stato = new PDExtendedGraphicsState();
        stato.setNonStrokingAlphaConstant(valore);
        c.setGraphicsStateParameters(stato);
    }

    /** Anello con il foro ovale, come la O del logo: esterno orario e interno antiorario, riempimento non-zero. */
    private static void anello(PDPageContentStream c, float x, float y, float r, float foro) throws IOException {
        cerchio(c, x, y, r);
        float rx = foro * 1.25f;
        float ry = foro * 0.72f;
        float kx = rx * CERCHIO;
        float ky = ry * CERCHIO;
        c.moveTo(x - rx, y);
        c.curveTo(x - rx, y - ky, x - kx, y - ry, x, y - ry);
        c.curveTo(x + kx, y - ry, x + rx, y - ky, x + rx, y);
        c.curveTo(x + rx, y + ky, x + kx, y + ry, x, y + ry);
        c.curveTo(x - kx, y + ry, x - rx, y + ky, x - rx, y);
        c.closePath();
    }

    private static void cerchio(PDPageContentStream c, float x, float y, float r) throws IOException {
        float k = r * CERCHIO;
        c.moveTo(x - r, y);
        c.curveTo(x - r, y + k, x - k, y + r, x, y + r);
        c.curveTo(x + k, y + r, x + r, y + k, x + r, y);
        c.curveTo(x + r, y - k, x + k, y - r, x, y - r);
        c.curveTo(x - k, y - r, x - r, y - k, x - r, y);
        c.closePath();
    }

    // ---------------------------------------------------------------- pagine

    String html(Documento d) throws IOException {
        DietaDto.Contenuto c = d.contenuto();
        String medico = configService.get("EMITTENTE_NOME");
        String titoli = configService.get("EMITTENTE_TITOLI");
        StringBuilder h = new StringBuilder(32_000);
        h.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?><html xmlns=\"http://www.w3.org/1999/xhtml\" lang=\"it\"><head><meta charset=\"UTF-8\"/><style>")
                .append(CSS).append("</style></head><body>");

        // piede in tutte le pagine dopo la copertina
        h.append("<div id=\"piede\"><table class=\"piede\"><tr><td>").append(esc(medico));
        if (d.paziente() != null) h.append(" <span class=\"sep\">·</span> Piano alimentare di ").append(esc(d.paziente()));
        h.append("</td><td class=\"dx\">Aggiornato il ").append(esc(d.aggiornata().format(DATA_ORA)))
                .append(" <span class=\"sep\">·</span> <span class=\"pag\"></span></td></tr></table></div>");

        copertina(h, d, medico, titoli);
        sintesi(h, d, medico);
        for (DietaDto.Giornata g : c.giornate()) {
            giornata(h, g, c.giornate().size());
        }
        indicazioni(h, c);
        listaSpesa(h, c);
        h.append("</body></html>");
        return h.toString();
    }

    private void copertina(StringBuilder h, Documento d, String medico, String titoli) throws IOException {
        DietaDto.Contenuto c = d.contenuto();
        h.append("<div class=\"copertina\">")
                .append("<img class=\"logo\" src=\"").append(logo()).append("\"/>")
                .append("<div class=\"cop-centro\">")
                .append("<div class=\"occhiello arancio\">Piano alimentare personalizzato</div>")
                .append("<div class=\"cop-titolo\">").append(esc(d.titolo())).append("</div>");
        if (d.paziente() != null) {
            h.append("<div class=\"cop-per\">per <b>").append(esc(d.paziente())).append("</b></div>");
        }
        h.append("<div class=\"cop-tratto\"></div></div>");

        List<String[]> dati = new ArrayList<>();
        if (d.dataInizio() != null) dati.add(new String[]{"Dal", d.dataInizio().format(DATA)});
        Integer kcal = kcal(c);
        if (kcal != null) dati.add(new String[]{"Energia", numero(kcal) + " kcal al giorno"});
        if (piena(c.obiettivo())) dati.add(new String[]{"Obiettivo", c.obiettivo()});
        if (!dati.isEmpty()) {
            h.append("<table class=\"cop-dati\"><tr>");
            for (String[] dato : dati) {
                h.append("<td><div class=\"cop-et\">").append(esc(dato[0])).append("</div><div class=\"cop-val\">")
                        .append(esc(dato[1])).append("</div></td>");
            }
            h.append("</tr></table>");
        }
        h.append("<div class=\"cop-firma\"><div class=\"cop-medico\">").append(esc(medico)).append("</div><div class=\"cop-titoli\">")
                .append(esc(titoli)).append("</div></div></div>");
    }

    private void sintesi(StringBuilder h, Documento d, String medico) {
        DietaDto.Contenuto c = d.contenuto();
        Integer kcal = kcal(c);
        boolean macro = c.proteine() != null || c.carboidrati() != null || c.grassi() != null;
        boolean acqua = c.acquaLitri() != null && c.acquaLitri().signum() > 0;
        if (!piena(c.introduzione()) && kcal == null && !macro && !acqua) {
            return;
        }
        h.append("<div class=\"pagina\">");
        h.append(intestazione("Il tuo piano", "Prima di iniziare", null));
        if (piena(c.introduzione())) {
            h.append("<div class=\"lettera\">");
            for (String paragrafo : c.introduzione().trim().split("\\n\\s*\\n|\\n")) {
                if (!paragrafo.isBlank()) h.append("<p>").append(esc(paragrafo.trim())).append("</p>");
            }
            h.append("<div class=\"firma\">").append(esc(medico)).append("</div></div>");
        }
        if (kcal != null || macro || acqua) {
            h.append("<table class=\"numeri\"><tr>");
            if (kcal != null) {
                h.append("<td class=\"kcal\"><div class=\"et\">Energia giornaliera</div><div class=\"grande\">").append(numero(kcal))
                        .append("<span class=\"unita\"> kcal</span></div></td>");
            }
            if (acqua) {
                if (kcal != null) h.append("<td class=\"spazio\"></td>");
                h.append("<td class=\"acqua\"><div class=\"et\">Acqua</div><div class=\"grande\">").append(litri(c.acquaLitri()))
                        .append("<span class=\"unita\"> litri</span></div><div class=\"piccolo\">al giorno, lontano dai pasti</div></td>");
            }
            h.append("</tr></table>");
            if (macro) macro(h, c);
        }
        h.append("</div>");
    }

    private static void macro(StringBuilder h, DietaDto.Contenuto c) {
        int p = c.proteine() == null ? 0 : c.proteine();
        int g = c.carboidrati() == null ? 0 : c.carboidrati();
        int f = c.grassi() == null ? 0 : c.grassi();
        double totale = p * 4.0 + g * 4.0 + f * 9.0;
        if (totale <= 0) return;
        String[][] voci = {
                {"Proteine", String.valueOf(p), pct(p * 4.0, totale), "m-p"},
                {"Carboidrati", String.valueOf(g), pct(g * 4.0, totale), "m-c"},
                {"Grassi", String.valueOf(f), pct(f * 9.0, totale), "m-g"}};
        h.append("<div class=\"macro\"><div class=\"et\">Ripartizione dei macronutrienti</div><table class=\"barra\"><tr>");
        for (String[] v : voci) {
            if (!"0".equals(v[2])) h.append("<td class=\"").append(v[3]).append("\" style=\"width:").append(v[2]).append("%\"></td>");
        }
        h.append("</tr></table><table class=\"macro-voci\"><tr>");
        for (String[] v : voci) {
            h.append("<td><span class=\"punto ").append(v[3]).append("\"></span><span class=\"m-nome\">").append(v[0])
                    .append("</span><div class=\"m-g\">").append(v[1]).append("<span class=\"unita\"> g</span></div><div class=\"piccolo\">")
                    .append(v[2]).append("% dell'energia</div></td>");
        }
        h.append("</tr></table></div>");
    }

    private static void giornata(StringBuilder h, DietaDto.Giornata g, int quante) {
        List<DietaDto.Pasto> pasti = g.pasti().stream().filter(DietaPdfService::pastoPieno).toList();
        if (pasti.isEmpty()) return;
        h.append("<div class=\"pagina\">");
        h.append(intestazione(quante > 1 ? "La giornata" : "I tuoi pasti", piena(g.nome()) ? g.nome() : "Giornata tipo", g.nota()));
        int n = 1;
        for (DietaDto.Pasto pasto : pasti) {
            pasto(h, pasto, n++);
        }
        h.append("</div>");
    }

    private static void pasto(StringBuilder h, DietaDto.Pasto pasto, int n) {
        List<DietaDto.Opzione> opzioni = pasto.opzioni().stream()
                .filter(o -> o.alimenti().stream().anyMatch(a -> piena(a.nome())) || piena(o.nota())).toList();
        h.append("<table class=\"pasto\"><tr><td class=\"pasto-lato\"><div class=\"pasto-n\">").append(String.format("%02d", n)).append("</div>")
                .append("<div class=\"pasto-nome\">").append(esc(piena(pasto.nome()) ? pasto.nome() : "Pasto")).append("</div>");
        if (piena(pasto.orario())) h.append("<div class=\"pasto-ora\">").append(esc(pasto.orario())).append("</div>");
        if (opzioni.size() > 1) h.append("<div class=\"pasto-scelta\">").append(opzioni.size()).append(" alternative a scelta</div>");
        h.append("</td><td class=\"pasto-corpo\">");
        for (int i = 0; i < opzioni.size(); i++) {
            DietaDto.Opzione o = opzioni.get(i);
            if (i > 0) h.append("<div class=\"oppure\"><span>oppure</span></div>");
            h.append("<div class=\"opzione\">");
            if (opzioni.size() > 1 || piena(o.nome())) {
                h.append("<div class=\"op-testa\">");
                if (opzioni.size() > 1) h.append("<span class=\"lettera-op\">").append(LETTERE[Math.min(i, LETTERE.length - 1)]).append("</span>");
                if (piena(o.nome())) h.append("<span class=\"op-nome\">").append(esc(o.nome())).append("</span>");
                h.append("</div>");
            }
            List<DietaDto.Alimento> alimenti = o.alimenti().stream().filter(a -> piena(a.nome())).toList();
            if (!alimenti.isEmpty()) {
                h.append("<table class=\"alimenti\">");
                for (DietaDto.Alimento a : alimenti) {
                    h.append("<tr><td class=\"al-nome\">").append(esc(a.nome()));
                    if (piena(a.nota())) h.append("<div class=\"al-nota\">").append(esc(a.nota())).append("</div>");
                    h.append("</td><td class=\"al-q\">").append(piena(a.quantita()) ? esc(a.quantita()) : "").append("</td></tr>");
                }
                h.append("</table>");
            }
            if (piena(o.nota())) h.append("<div class=\"op-nota\">").append(esc(o.nota())).append("</div>");
            h.append("</div>");
        }
        if (piena(pasto.nota())) h.append("<div class=\"pasto-nota\">").append(esc(pasto.nota())).append("</div>");
        h.append("</td></tr></table>");
    }

    private static void indicazioni(StringBuilder h, DietaDto.Contenuto c) {
        List<String> liberi = c.liberi().stream().filter(DietaPdfService::piena).toList();
        List<String> limitare = c.limitare().stream().filter(DietaPdfService::piena).toList();
        List<DietaDto.Integratore> integrazione = c.integrazione().stream().filter(i -> piena(i.nome())).toList();
        List<DietaDto.Consiglio> consigli = c.consigli().stream().filter(k -> piena(k.titolo()) || piena(k.testo())).toList();
        if (liberi.isEmpty() && limitare.isEmpty() && integrazione.isEmpty() && consigli.isEmpty()) return;

        h.append("<div class=\"pagina\">");
        h.append(intestazione("Indicazioni", "Le regole del gioco", null));
        if (!consigli.isEmpty()) {
            h.append("<table class=\"consigli\">");
            for (int i = 0; i < consigli.size(); i += 2) {
                h.append("<tr>");
                for (int j = i; j < i + 2; j++) {
                    if (j < consigli.size()) {
                        DietaDto.Consiglio k = consigli.get(j);
                        h.append("<td class=\"consiglio\"><div class=\"cons-n\">").append(String.format("%02d", j + 1)).append("</div>");
                        if (piena(k.titolo())) h.append("<div class=\"cons-titolo\">").append(esc(k.titolo())).append("</div>");
                        if (piena(k.testo())) h.append("<div class=\"cons-testo\">").append(esc(k.testo())).append("</div>");
                        h.append("</td>");
                    } else {
                        h.append("<td class=\"vuota\"></td>");
                    }
                }
                h.append("</tr>");
            }
            h.append("</table>");
        }
        if (!liberi.isEmpty() || !limitare.isEmpty()) {
            h.append("<table class=\"due\"><tr>");
            if (!liberi.isEmpty()) gettoni(h, "liberi", "Liberi", "Quando vuoi, nelle quantità che ti servono", liberi);
            if (!liberi.isEmpty() && !limitare.isEmpty()) h.append("<td class=\"spazio\"></td>");
            if (!limitare.isEmpty()) gettoni(h, "limitare", "Da limitare", "Occasionali, non abituali", limitare);
            h.append("</tr></table>");
        }
        if (!integrazione.isEmpty()) {
            h.append("<div class=\"blocco\"><div class=\"occhiello blu\">Integrazione</div><table class=\"integrazione\">")
                    .append("<tr><th>Prodotto</th><th>Dose</th><th>Quando</th></tr>");
            for (DietaDto.Integratore i : integrazione) {
                h.append("<tr><td class=\"int-nome\">").append(esc(i.nome())).append("</td><td>").append(esc(testo(i.dose())))
                        .append("</td><td>").append(esc(testo(i.quando()))).append("</td></tr>");
            }
            h.append("</table></div>");
        }
        h.append("</div>");
    }

    private static void gettoni(StringBuilder h, String classe, String titolo, String sottotitolo, List<String> voci) {
        h.append("<td class=\"riquadro ").append(classe).append("\"><div class=\"riq-titolo\">").append(titolo)
                .append("</div><div class=\"riq-sotto\">").append(sottotitolo).append("</div><div class=\"gettoni\">");
        for (String v : voci) h.append("<span class=\"gettone\">").append(esc(v.trim())).append("</span> ");
        h.append("</div></td>");
    }

    /** Tutti gli alimenti del piano, una volta sola e in ordine alfabetico, con la casella da spuntare. */
    private static void listaSpesa(StringBuilder h, DietaDto.Contenuto c) {
        if (!Boolean.TRUE.equals(c.listaSpesa())) return;
        Collator collator = Collator.getInstance(Locale.ITALIAN);
        collator.setStrength(Collator.PRIMARY);
        Map<String, String> unici = new TreeMap<>(collator);
        for (DietaDto.Giornata g : c.giornate()) {
            for (DietaDto.Pasto p : g.pasti()) {
                for (DietaDto.Opzione o : p.opzioni()) {
                    for (DietaDto.Alimento a : o.alimenti()) {
                        if (piena(a.nome())) unici.putIfAbsent(a.nome().trim(), maiuscola(a.nome().trim()));
                    }
                }
            }
        }
        if (unici.size() < 3) return;
        List<String> voci = new ArrayList<>(unici.values());
        int colonne = 3;
        int perColonna = (voci.size() + colonne - 1) / colonne;
        h.append("<div class=\"pagina\">");
        h.append(intestazione("Da portare al supermercato", "Lista della spesa", "Tutto quello che compare nel piano, una volta sola."));
        h.append("<table class=\"spesa\"><tr>");
        for (int col = 0; col < colonne; col++) {
            h.append("<td>");
            for (int i = col * perColonna; i < Math.min(voci.size(), (col + 1) * perColonna); i++) {
                h.append("<div class=\"spesa-voce\"><span class=\"casella\"></span>").append(esc(voci.get(i))).append("</div>");
            }
            h.append("</td>");
        }
        h.append("</tr></table></div>");
    }

    private static String intestazione(String occhiello, String titolo, String nota) {
        StringBuilder h = new StringBuilder("<div class=\"testa\"><div class=\"occhiello arancio\">").append(esc(occhiello))
                .append("</div><div class=\"testa-titolo\">").append(esc(titolo)).append("</div>");
        if (piena(nota)) h.append("<div class=\"testa-nota\">").append(esc(nota)).append("</div>");
        return h.append("<div class=\"tratto\"></div></div>").toString();
    }

    // ---------------------------------------------------------------- utilità

    private String logo() throws IOException {
        if (logo == null) {
            try (InputStream in = new ClassPathResource("pdf/logo.png").getInputStream()) {
                logo = "data:image/png;base64," + Base64.getEncoder().encodeToString(in.readAllBytes());
            }
        }
        return logo;
    }

    static Integer kcal(DietaDto.Contenuto c) {
        if (c.kcal() != null && c.kcal() > 0) return c.kcal();
        int stima = (c.proteine() == null ? 0 : c.proteine() * 4) + (c.carboidrati() == null ? 0 : c.carboidrati() * 4)
                + (c.grassi() == null ? 0 : c.grassi() * 9);
        return stima > 0 ? stima : null;
    }

    private static boolean pastoPieno(DietaDto.Pasto p) {
        return p.opzioni().stream().anyMatch(o -> o.alimenti().stream().anyMatch(a -> piena(a.nome())) || piena(o.nota()))
                || piena(p.nota());
    }

    private static String pct(double parte, double totale) {
        return String.valueOf(Math.round(parte * 100 / totale));
    }

    private static String numero(int n) {
        return new DecimalFormat("#,##0", DecimalFormatSymbols.getInstance(Locale.ITALY)).format(n);
    }

    private static String litri(BigDecimal l) {
        return new DecimalFormat("0.#", DecimalFormatSymbols.getInstance(Locale.ITALY)).format(l);
    }

    private static boolean piena(String s) {
        return s != null && !s.isBlank();
    }

    private static String testo(String s) {
        return piena(s) ? s.trim() : "—";
    }

    private static String maiuscola(String s) {
        return s.isEmpty() ? s : s.substring(0, 1).toUpperCase(Locale.ITALIAN) + s.substring(1);
    }

    /** XHTML: ogni testo del dottore passa da qui. I caratteri di controllo romperebbero il parser. */
    static String esc(String s) {
        if (s == null) return "";
        StringBuilder out = new StringBuilder(s.length() + 16);
        s.codePoints().forEach(cp -> {
            switch (cp) {
                case '&' -> out.append("&amp;");
                case '<' -> out.append("&lt;");
                case '>' -> out.append("&gt;");
                case '"' -> out.append("&quot;");
                case '\'' -> out.append("&#39;");
                default -> {
                    if (cp == '\n' || cp == '\t' || cp == '\r') out.append(' ');
                    else if (cp >= 0x20 && cp != 0x7F && !(cp >= 0xD800 && cp <= 0xDFFF) && cp != 0xFFFE && cp != 0xFFFF) out.appendCodePoint(cp);
                }
            }
        });
        return out.toString();
    }

    private static final String CSS = """
            @page { size: A4; margin: 20mm 17mm 20mm 17mm;
              @bottom-left { content: element(piede); vertical-align: top; padding-top: 6mm; } }
            @page :first { margin: 0 17mm; @bottom-left { content: none; } }
            body { font-family: 'Montserrat'; font-weight: 400; color: #2B3545; font-size: 9.5pt; line-height: 1.45; margin: 0; }
            b { font-weight: 600; }
            #piede { position: running(piede); width: 176mm; }
            table.piede { width: 176mm; border-collapse: collapse; font-size: 7pt; color: #8A94A4; }
            table.piede td { padding: 0; }
            table.piede td.dx { text-align: right; }
            .sep { color: #F0944E; }
            .pag::after { content: counter(page) " di " counter(pages); color: #1F3A63; font-weight: 600; }

            .occhiello { font-size: 7.5pt; font-weight: 600; letter-spacing: 2.4pt; text-transform: uppercase; }
            .arancio { color: #F0944E; }
            .blu { color: #3A6098; }
            .et { font-size: 7pt; font-weight: 600; letter-spacing: 1.6pt; text-transform: uppercase; color: #3A6098; }
            .piccolo { font-size: 7.5pt; color: #6B7788; }
            .unita { font-size: 11pt; font-weight: 400; color: #6B7788; letter-spacing: 0; }

            /* copertina */
            .copertina { position: relative; width: 176mm; height: 296mm; color: #FFFFFF; page-break-after: always; }
            .copertina .logo { position: absolute; top: 22mm; left: 3mm; height: 13mm; }
            .cop-centro { position: absolute; top: 92mm; left: 3mm; width: 150mm; }
            .cop-titolo { font-size: 38pt; font-weight: 300; line-height: 1.08; margin-top: 7mm; color: #FFFFFF; }
            .cop-per { font-size: 15pt; font-weight: 300; color: #C9D6E8; margin-top: 6mm; }
            .cop-per b { color: #FFFFFF; font-weight: 600; }
            .cop-tratto { width: 18mm; height: 1.2mm; background: #F0944E; margin-top: 9mm; border-radius: 1mm; }
            table.cop-dati { position: absolute; top: 196mm; left: 3mm; width: 170mm; border-collapse: collapse; }
            table.cop-dati td { vertical-align: top; padding: 4mm 6mm 0 0; border-top: 0.6pt solid #4E6E9E; width: 33%; }
            .cop-et { font-size: 7pt; font-weight: 600; letter-spacing: 2pt; text-transform: uppercase; color: #F0944E; }
            .cop-val { font-size: 11pt; font-weight: 600; color: #FFFFFF; margin-top: 1.5mm; line-height: 1.3; }
            .cop-firma { position: absolute; bottom: 20mm; left: 3mm; }
            .cop-medico { font-size: 11pt; font-weight: 700; color: #FFFFFF; }
            .cop-titoli { font-size: 8.5pt; color: #C9D6E8; margin-top: 1mm; }

            /* pagine interne */
            .pagina { page-break-before: always; }
            .copertina + .pagina { page-break-before: auto; }
            .testa { margin-bottom: 8mm; }
            .testa-titolo { font-size: 26pt; font-weight: 300; color: #1F3A63; line-height: 1.1; margin-top: 2mm; }
            .testa-nota { font-size: 9.5pt; color: #6B7788; margin-top: 2.5mm; width: 140mm; }
            .tratto { width: 14mm; height: 1mm; background: #F0944E; margin-top: 5mm; border-radius: 1mm; }

            .lettera { background: #F5F7FB; border-radius: 4mm; padding: 8mm 10mm; font-size: 10.5pt; line-height: 1.65; color: #2B3545; margin-bottom: 8mm; }
            .lettera p { margin: 0 0 3.5mm 0; }
            .firma { font-weight: 700; color: #1F3A63; margin-top: 5mm; }
            .firma::before { content: ""; display: block; width: 10mm; height: 0.6mm; background: #F0944E; margin-bottom: 3mm; }

            table.numeri { width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 6mm; }
            table.numeri td { vertical-align: top; padding: 7mm 8mm; border-radius: 4mm; }
            td.kcal { background: #1F3A63; color: #FFFFFF; width: 60%; }
            td.kcal .et { color: #F0944E; }
            td.kcal .grande { color: #FFFFFF; }
            td.kcal .unita { color: #C9D6E8; }
            td.acqua { background: #EEF3FA; }
            table.numeri td.spazio { width: 4%; padding: 0; }
            .grande { font-size: 34pt; font-weight: 300; color: #1F3A63; line-height: 1.1; margin-top: 2mm; }

            .macro { border: 0.6pt solid #E3E8F0; border-radius: 4mm; padding: 7mm 8mm; }
            table.barra { width: 100%; border-collapse: collapse; margin: 4mm 0 5mm 0; height: 3.2mm; }
            table.barra td { height: 3.2mm; padding: 0; }
            .m-p { background: #1F3A63; }
            .m-c { background: #6F95C8; }
            .m-g { background: #F0944E; }
            table.macro-voci { width: 100%; border-collapse: collapse; }
            table.macro-voci td { width: 33%; vertical-align: top; padding-right: 4mm; }
            .punto { display: inline-block; width: 2.4mm; height: 2.4mm; border-radius: 1.2mm; margin-right: 1.8mm; }
            .m-nome { font-size: 8.5pt; font-weight: 600; color: #1F3A63; }
            .m-g { }
            div.m-g { background: none; font-size: 20pt; font-weight: 300; color: #1F3A63; margin-top: 1mm; }

            /* pasti */
            table.pasto { width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 4.5mm; page-break-inside: avoid;
              border: 0.6pt solid #E3E8F0; border-radius: 4mm; }
            td.pasto-lato { width: 42mm; vertical-align: top; background: #F5F7FB; padding: 6mm 5mm 6mm 6mm;
              border-top-left-radius: 4mm; border-bottom-left-radius: 4mm; }
            .pasto-n { font-size: 8pt; font-weight: 600; color: #F0944E; letter-spacing: 1.5pt; }
            .pasto-nome { font-size: 14pt; font-weight: 700; color: #1F3A63; line-height: 1.15; margin-top: 1.5mm; }
            .pasto-ora { font-size: 9pt; color: #3A6098; font-weight: 600; margin-top: 1.5mm; }
            .pasto-scelta { font-size: 7pt; color: #6B7788; margin-top: 4mm; }
            td.pasto-corpo { vertical-align: top; padding: 5mm 6mm 5mm 6mm; }
            .op-testa { margin-bottom: 2mm; }
            .lettera-op { display: inline-block; width: 5mm; height: 5mm; line-height: 5mm; border-radius: 2.5mm; background: #1F3A63; color: #FFFFFF;
              font-size: 7pt; font-weight: 700; text-align: center; margin-right: 2mm; }
            .op-nome { font-size: 8.5pt; font-weight: 600; color: #1F3A63; letter-spacing: 0.4pt; }
            table.alimenti { width: 100%; border-collapse: collapse; }
            table.alimenti td { padding: 1.7mm 0; border-bottom: 0.5pt solid #E9EDF3; vertical-align: top; }
            table.alimenti tr:last-child td { border-bottom: none; }
            td.al-nome { font-size: 9.5pt; color: #2B3545; padding-right: 4mm; }
            td.al-q { font-size: 9.5pt; font-weight: 600; color: #1F3A63; text-align: right; white-space: nowrap; width: 30mm; }
            .al-nota { font-size: 7.5pt; color: #6B7788; margin-top: 0.4mm; }
            .op-nota { font-size: 8pt; color: #6B7788; margin-top: 1.5mm; font-style: normal; }
            .oppure { text-align: center; margin: 3mm 0; border-top: 0.5pt solid #E3E8F0; height: 0; }
            .oppure span { position: relative; top: -2.2mm; background: #FFFFFF; padding: 0 3mm; font-size: 7pt; font-weight: 600;
              letter-spacing: 2pt; text-transform: uppercase; color: #F0944E; }
            .pasto-nota { margin-top: 3.5mm; padding: 2.5mm 3.5mm; background: #FDF3EA; border-radius: 2mm; font-size: 8pt; color: #7A4A22; }

            /* indicazioni */
            table.consigli { width: 100%; border-collapse: separate; border-spacing: 0 0; margin-bottom: 6mm; }
            td.consiglio { width: 50%; vertical-align: top; padding: 0 6mm 6mm 0; page-break-inside: avoid; }
            .cons-n { font-size: 20pt; font-weight: 300; color: #F0944E; line-height: 1; }
            .cons-titolo { font-size: 10.5pt; font-weight: 700; color: #1F3A63; margin-top: 2mm; }
            .cons-testo { font-size: 9pt; color: #4A5566; margin-top: 1.2mm; line-height: 1.5; }
            table.due { width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 6mm; page-break-inside: avoid; }
            table.due td.spazio { width: 4%; }
            td.riquadro { vertical-align: top; border-radius: 4mm; padding: 6mm 6mm 4mm 6mm; width: 48%; }
            td.liberi { background: #EEF3FA; }
            td.limitare { background: #FDF3EA; }
            .riq-titolo { font-size: 12pt; font-weight: 700; color: #1F3A63; }
            td.limitare .riq-titolo { color: #9A5520; }
            .riq-sotto { font-size: 7.5pt; color: #6B7788; margin: 0.8mm 0 3.5mm 0; }
            .gettone { display: inline-block; background: #FFFFFF; border-radius: 3mm; padding: 1.1mm 3mm; margin: 0 1.2mm 1.8mm 0; font-size: 8.5pt; color: #2B3545; }
            .blocco { page-break-inside: avoid; }
            table.integrazione { width: 100%; border-collapse: collapse; margin-top: 3mm; }
            table.integrazione th { text-align: left; font-size: 7pt; font-weight: 600; letter-spacing: 1.4pt; text-transform: uppercase; color: #6B7788;
              padding: 0 0 2mm 0; border-bottom: 0.8pt solid #1F3A63; }
            table.integrazione td { padding: 2.6mm 4mm 2.6mm 0; border-bottom: 0.5pt solid #E3E8F0; font-size: 9pt; vertical-align: top; }
            td.int-nome { font-weight: 600; color: #1F3A63; }

            /* spesa */
            table.spesa { width: 100%; border-collapse: collapse; }
            table.spesa td { width: 33%; vertical-align: top; padding-right: 5mm; }
            .spesa-voce { font-size: 9.5pt; padding: 2mm 0; border-bottom: 0.5pt solid #E3E8F0; }
            .casella { display: inline-block; width: 3.2mm; height: 3.2mm; border: 0.8pt solid #3A6098; border-radius: 0.8mm; margin-right: 2.5mm; }
            """;
}
