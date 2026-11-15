package it.edodoc.hq.services;

import com.openhtmltopdf.outputdevice.helper.BaseRendererBuilder;
import com.openhtmltopdf.pdfboxout.PdfBoxRenderer;
import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import it.edodoc.hq.dto.AccettazioneDto;
import it.edodoc.hq.models.AccettazioneDocumento;
import it.edodoc.hq.models.AccettazioneFirma;
import it.edodoc.hq.models.AccettazioneFirmaEvento;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.List;
import java.util.Map;

/**
 * PDF del modulo firmato, impaginato in HTML e CSS come le diete: dati, sezioni con le dichiarazioni, consensi, firma,
 * prove della firma e, in allegato, informativa ed elenco fornitori nella versione firmata. Il sigillo si applica dopo.
 */
@Service
public class AccettazionePdfService {

    private static final DateTimeFormatter DATA = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final DateTimeFormatter DATA_ORA = DateTimeFormatter.ofPattern("dd/MM/yyyy 'alle' HH:mm");
    private static final DateTimeFormatter ORA_ESATTA = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss");

    private volatile String logo;

    /** Tutto quello che finisce sulla carta, già deciso dal servizio. */
    public record Dati(AccettazioneFirma accettazione, AccettazioneDto.Snapshot snapshot, AccettazioneDto.Scelte scelte,
                       AccettazioneDto.Modulo modulo, AccettazioneDocumento informativa, String informativaHtml,
                       AccettazioneDocumento fornitori, String fornitoriHtml, AccettazioneDocumento moduloDocumento,
                       List<AccettazioneFirmaEvento> eventi, String titolare, String titoliTitolare, String urlVerifica) {
    }

    public byte[] genera(Dati d) {
        PdfRendererBuilder builder = new PdfRendererBuilder();
        builder.withHtmlContent(html(d), null);
        for (Map.Entry<String, Integer> font : Map.of("Light", 300, "Regular", 400, "SemiBold", 600, "Bold", 700).entrySet()) {
            builder.useFont(() -> {
                try {
                    return new ClassPathResource("fonts/Montserrat-" + font.getKey() + ".ttf").getInputStream();
                } catch (IOException e) {
                    throw new UncheckedIOException(e);
                }
            }, "Montserrat", font.getValue(), BaseRendererBuilder.FontStyle.NORMAL, true);
        }
        try (ByteArrayOutputStream uscita = new ByteArrayOutputStream()) {
            builder.toStream(uscita);
            PdfBoxRenderer renderer = builder.buildPdfRenderer();
            try {
                renderer.layout();
                renderer.createPDFWithoutClosing();
                PDDocument documento = renderer.getPdfDocument();
                AccettazioneDto.Persona p = d.snapshot().paziente();
                documento.getDocumentInformation().setTitle("Modulo di accettazione · " + p.nome() + " " + p.cognome());
                documento.getDocumentInformation().setAuthor(d.titolare());
                documento.getDocumentInformation().setSubject("Codice di verifica " + d.accettazione().getCodiceVerifica());
                documento.save(uscita);
            } finally {
                renderer.close();
            }
            return uscita.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("PDF del modulo non generato", e);
        }
    }

    String html(Dati d) {
        AccettazioneFirma a = d.accettazione();
        AccettazioneDto.Persona paziente = d.snapshot().paziente();
        AccettazioneDto.Persona firmatario = d.snapshot().firmatario();
        AccettazioneDto.Scelte scelte = d.scelte();
        StringBuilder h = new StringBuilder(32_000);
        h.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?><html xmlns=\"http://www.w3.org/1999/xhtml\" lang=\"it\"><head>")
                .append("<meta charset=\"UTF-8\"/><style>").append(CSS).append("</style></head><body>");

        h.append("<div id=\"piede\"><table class=\"piede\"><tr><td>").append(esc(d.titolare()))
                .append(" <span class=\"sep\">·</span> Modulo di accettazione <span class=\"sep\">·</span> codice ")
                .append(esc(a.getCodiceVerifica())).append("</td><td class=\"dx\"><span class=\"pag\"></span></td></tr></table></div>");

        h.append("<table class=\"testa\"><tr><td><div class=\"occhiello arancio\">")
                .append(esc(d.titolare())).append(d.titoliTitolare().isBlank() ? "" : " · " + esc(d.titoliTitolare()))
                .append("</div><div class=\"titolo\">").append(esc(d.modulo().titolo())).append("</div><div class=\"sottotitolo\">")
                .append(esc(d.modulo().sottotitolo())).append("</div></td><td class=\"logo\"><img src=\"").append(logo())
                .append("\"/></td></tr></table><div class=\"tratto\"></div>");

        h.append("<table class=\"dati\"><tr><td><div class=\"et\">").append(firmatario == null ? "Chi firma" : "Persona seguita")
                .append("</div>").append(persona(paziente)).append("</td>");
        if (firmatario != null) {
            h.append("<td><div class=\"et\">Firma come ").append(esc(ruolo(a.getFirmatarioRuolo()))).append("</div>")
                    .append(persona(firmatario)).append("</td>");
        }
        h.append("</tr></table>");

        for (AccettazioneDto.Sezione s : d.modulo().sezioni()) {
            h.append("<div class=\"sezione\"><div class=\"sez-titolo\">").append(esc(s.titolo())).append("</div><p>")
                    .append(esc(s.testo())).append("</p>");
            if (scelte.dichiarazioni().contains(s.id())) {
                h.append(dichiarato(s.dichiarazione()));
            }
            h.append("</div>");
        }
        if (firmatario != null && scelte.rappresentante()) {
            h.append("<div class=\"sezione\">").append(dichiarato(d.modulo().dichiarazioneRappresentante())).append("</div>");
        }

        if (!d.modulo().consensi().isEmpty()) {
            h.append("<div class=\"sezione\"><div class=\"sez-titolo\">Consensi facoltativi</div>");
            for (AccettazioneDto.ConsensoFacoltativo c : d.modulo().consensi()) {
                boolean si = Boolean.TRUE.equals(scelte.consensi().get(c.id()));
                h.append("<table class=\"consenso\"><tr><td><b>").append(esc(c.titolo())).append("</b><br/>")
                        .append(esc(c.testo())).append("</td><td class=\"scelta ").append(si ? "si" : "no").append("\">")
                        .append(si ? "Sì" : "No").append("</td></tr></table>");
            }
            if (d.modulo().notaConsensi() != null) {
                h.append("<p class=\"piccolo\">").append(esc(d.modulo().notaConsensi())).append("</p>");
            }
            h.append("</div>");
        }

        AccettazioneDto.Persona chiFirma = firmatario != null ? firmatario : paziente;
        h.append("<table class=\"firma\"><tr><td class=\"firma-img\"><div class=\"et\">Firma</div><img src=\"data:image/png;base64,")
                .append(Base64.getEncoder().encodeToString(a.getFirmaPng())).append("\"/><div class=\"firma-nome\">")
                .append(esc(chiFirma.nome() + " " + chiFirma.cognome())).append("</div></td><td class=\"firma-info\">")
                .append("Firmato elettronicamente il ").append(esc(DATA_ORA.format(a.getFirmataIl())))
                .append(".<br/>Identità confermata con un codice monouso inviato a ").append(esc(mascheraEmail(a.getEmail())))
                .append(".<br/>Codice di verifica <b>").append(esc(a.getCodiceVerifica())).append("</b>")
                .append(d.urlVerifica() == null ? "" : "<br/>Verifica: " + esc(d.urlVerifica()))
                .append("</td></tr></table>");

        // Prove della firma
        h.append("<div class=\"pagina\"><div class=\"occhiello arancio\">Prove della firma</div>")
                .append("<div class=\"titolo-2\">Come è stato firmato questo documento</div><div class=\"tratto\"></div>")
                .append("<table class=\"prove\">")
                .append(riga("Codice di verifica", a.getCodiceVerifica()))
                .append(riga("Modulo", "v. " + d.moduloDocumento().getVersione() + " · SHA-256 " + d.moduloDocumento().getSha256()))
                .append(riga("Informativa", "v. " + d.informativa().getVersione() + " · SHA-256 " + d.informativa().getSha256()))
                .append(riga("Elenco fornitori", "v. " + d.fornitori().getVersione() + " · SHA-256 " + d.fornitori().getSha256()))
                .append(riga("Link inviato", ORA_ESATTA.format(a.getCreataIl()) + " a " + mascheraEmail(a.getEmail())))
                .append(riga("Dati confermati", a.getDatiConfermatiIl() == null ? "—" : ORA_ESATTA.format(a.getDatiConfermatiIl())))
                .append(riga("Codice monouso verificato", a.getOtpVerificatoIl() == null ? "—" : ORA_ESATTA.format(a.getOtpVerificatoIl())))
                .append(riga("Firma", ORA_ESATTA.format(a.getFirmataIl()) + " (ora italiana)"))
                .append(riga("Indirizzo IP", a.getFirmaIp()))
                .append(riga("Dispositivo", a.getFirmaUserAgent()))
                .append(riga("Conservazione", "fino al " + DATA.format(a.getConservareFinoAl())))
                .append("</table><p class=\"piccolo\">Il documento è sigillato elettronicamente dal titolare e porta una marca ")
                .append("temporale RFC 3161 incorporata nella firma del PDF: qualsiasi modifica successiva invalida il sigillo. ")
                .append("Della firma tracciata si conserva solo l'immagine, nessun dato biometrico.</p>")
                .append("<div class=\"et\" style=\"margin-top:6mm\">Registro degli eventi</div><table class=\"registro\">")
                .append("<tr><th>#</th><th>Quando</th><th>Evento</th><th>IP</th><th>Impronta</th></tr>");
        for (AccettazioneFirmaEvento e : d.eventi()) {
            h.append("<tr><td>").append(e.getSeq()).append("</td><td>").append(esc(ORA_ESATTA.format(e.getIl())))
                    .append("</td><td>").append(esc(evento(e.getTipo()))).append("</td><td>").append(esc(nvl(e.getIp())))
                    .append("</td><td class=\"hash\">").append(esc(e.getHash().substring(0, 16))).append("…</td></tr>");
        }
        h.append("</table><p class=\"piccolo\">Ogni evento contiene l'impronta del precedente: togliere o cambiare una riga ")
                .append("rompe la catena.</p></div>");

        h.append("<div class=\"pagina allegato\"><div class=\"occhiello arancio\">Allegato 1</div>").append(d.informativaHtml()).append("</div>");
        h.append("<div class=\"pagina allegato\"><div class=\"occhiello arancio\">Allegato 2</div>").append(d.fornitoriHtml()).append("</div>");
        h.append("</body></html>");
        return h.toString();
    }

    private static String persona(AccettazioneDto.Persona p) {
        StringBuilder s = new StringBuilder("<div class=\"nome\">").append(esc(p.nome() + " " + p.cognome())).append("</div><div class=\"det\">");
        if (notBlank(p.dataNascita())) {
            s.append("Nato/a il ").append(esc(dataIt(p.dataNascita())));
            if (notBlank(p.luogoNascita())) s.append(" a ").append(esc(p.luogoNascita()));
            s.append("<br/>");
        }
        if (notBlank(p.codiceFiscale())) s.append("Codice fiscale ").append(esc(p.codiceFiscale())).append("<br/>");
        String residenza = residenza(p);
        if (residenza != null) s.append("Residenza ").append(esc(residenza)).append("<br/>");
        if (notBlank(p.email())) s.append(esc(p.email())).append("<br/>");
        if (notBlank(p.cellulare())) s.append(esc(p.cellulare()));
        return s.append("</div>").toString();
    }

    static String residenza(AccettazioneDto.Persona p) {
        if (!notBlank(p.indirizzo())) return null;
        StringBuilder s = new StringBuilder(p.indirizzo().strip());
        if (notBlank(p.cap()) || notBlank(p.citta())) s.append(",");
        if (notBlank(p.cap())) s.append(' ').append(p.cap().strip());
        if (notBlank(p.citta())) s.append(' ').append(p.citta().strip());
        if (notBlank(p.provincia())) s.append(" (").append(p.provincia().strip()).append(')');
        return s.toString();
    }

    private static String dichiarato(String testo) {
        return "<table class=\"dich\"><tr><td class=\"box\"><div></div></td><td>" + esc(testo) + "</td></tr></table>";
    }

    private static String riga(String etichetta, String valore) {
        return "<tr><td class=\"k\">" + esc(etichetta) + "</td><td>" + esc(nvl(valore)) + "</td></tr>";
    }

    static String ruolo(AccettazioneFirma.Ruolo r) {
        return switch (r) {
            case GENITORE -> "genitore";
            case TUTORE -> "tutore";
            case PAZIENTE -> "persona seguita";
        };
    }

    static String evento(AccettazioneFirmaEvento.Tipo t) {
        return switch (t) {
            case CREATA -> "Richiesta creata";
            case EMAIL_INVIATA -> "Link inviato per email";
            case EMAIL_NON_INVIATA -> "Email con il link non partita";
            case LINK_RIGENERATO -> "Nuovo link";
            case APERTA -> "Link aperto";
            case DATI_CONFERMATI -> "Dati confermati";
            case DOCUMENTO_APERTO -> "Documento aperto";
            case CODICE_INVIATO -> "Codice inviato";
            case CODICE_ERRATO -> "Codice errato";
            case CODICE_VERIFICATO -> "Codice verificato";
            case FIRMATA -> "Firma";
            case PDF_SIGILLATO -> "PDF sigillato";
            case MARCA_NON_DISPONIBILE -> "Marca temporale non disponibile";
            case COPIA_INVIATA -> "Copia inviata";
            case COPIA_NON_INVIATA -> "Copia non inviata";
            case COPIA_SCARICATA -> "Copia scaricata";
            case ANNULLATA -> "Annullata";
        };
    }

    public static String mascheraEmail(String e) {
        if (e == null || !e.contains("@")) return e;
        int at = e.indexOf('@');
        String nome = e.substring(0, at);
        return (nome.length() <= 2 ? nome.charAt(0) + "*" : nome.charAt(0) + "*".repeat(Math.min(6, nome.length() - 2))
                + nome.charAt(nome.length() - 1)) + e.substring(at);
    }

    static String dataIt(String iso) {
        try {
            return DATA.format(LocalDate.parse(iso));
        } catch (RuntimeException e) {
            return iso;
        }
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    private static String nvl(String s) {
        return s == null ? "" : s;
    }

    private static String esc(String s) {
        return DietaPdfService.esc(s);
    }

    private String logo() {
        if (logo == null) {
            try (InputStream in = new ClassPathResource("pdf/logo.png").getInputStream()) {
                logo = "data:image/png;base64," + Base64.getEncoder().encodeToString(in.readAllBytes());
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }
        return logo;
    }

    static String quando(LocalDateTime t) {
        return t == null ? null : DATA_ORA.format(t);
    }

    private static final String CSS = """
            @page { size: A4; margin: 18mm 17mm 20mm 17mm;
              @bottom-left { content: element(piede); vertical-align: top; padding-top: 6mm; } }
            body { font-family: 'Montserrat'; font-weight: 400; color: #2B3545; font-size: 8.6pt; line-height: 1.45; margin: 0; }
            b { font-weight: 600; }
            #piede { position: running(piede); width: 176mm; }
            table.piede { width: 176mm; border-collapse: collapse; font-size: 7pt; color: #8A94A4; }
            table.piede td { padding: 0; }
            table.piede td.dx { text-align: right; }
            .sep { color: #F0944E; }
            .pag::after { content: counter(page) " di " counter(pages); color: #1F3A63; font-weight: 600; }
            .occhiello { font-size: 7pt; font-weight: 600; letter-spacing: 2pt; text-transform: uppercase; }
            .arancio { color: #F0944E; }
            .et { font-size: 6.8pt; font-weight: 600; letter-spacing: 1.4pt; text-transform: uppercase; color: #3A6098; margin-bottom: 1.5mm; }
            .piccolo { font-size: 7.4pt; color: #6B7788; }
            table.testa { width: 100%; border-collapse: collapse; }
            table.testa td { vertical-align: top; padding: 0; }
            table.testa td.logo { text-align: right; width: 40mm; }
            table.testa td.logo img { height: 11mm; }
            .titolo { font-size: 22pt; font-weight: 300; color: #1F3A63; line-height: 1.1; margin-top: 2mm; }
            .titolo-2 { font-size: 16pt; font-weight: 300; color: #1F3A63; line-height: 1.15; margin-top: 2mm; }
            .sottotitolo { font-size: 8.6pt; color: #6B7788; margin-top: 2mm; }
            .tratto { width: 14mm; height: 1mm; background: #F0944E; margin: 4mm 0 5mm 0; border-radius: 1mm; }
            table.dati { width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 4mm; }
            table.dati td { vertical-align: top; background: #F5F7FB; padding: 4mm 5mm; border-radius: 3mm; width: 50%; }
            .nome { font-size: 11pt; font-weight: 600; color: #1F3A63; }
            .det { margin-top: 1mm; color: #4A5566; }
            .sezione { margin-top: 3.5mm; page-break-inside: avoid; }
            .sez-titolo { font-size: 9.6pt; font-weight: 600; color: #1F3A63; margin-bottom: 1mm; }
            .sezione p { margin: 0 0 1.5mm 0; text-align: justify; }
            table.dich { border-collapse: collapse; margin-top: 1mm; }
            table.dich td { vertical-align: top; padding: 0; font-weight: 600; color: #1F3A63; }
            table.dich td.box { width: 5.5mm; padding-top: 0.6mm; }
            table.dich td.box div { width: 3mm; height: 3mm; background: #F0944E; border-radius: 0.6mm; }
            table.consenso { width: 100%; border-collapse: collapse; margin-top: 2mm; }
            table.consenso td { vertical-align: top; padding: 2.5mm 3mm; border-top: 0.5pt solid #DCE3EE; }
            td.scelta { width: 14mm; text-align: center; font-weight: 700; font-size: 10pt; }
            td.scelta.si { color: #2E7D4F; }
            td.scelta.no { color: #B23B3B; }
            table.firma { width: 100%; border-collapse: collapse; margin-top: 6mm; page-break-inside: avoid; }
            table.firma td { vertical-align: top; padding: 4mm 5mm; border: 0.6pt solid #DCE3EE; }
            td.firma-img { width: 72mm; }
            td.firma-img img { width: 62mm; }
            .firma-nome { margin-top: 1mm; font-weight: 600; color: #1F3A63; }
            td.firma-info { color: #4A5566; line-height: 1.6; }
            .pagina { page-break-before: always; }
            table.prove { width: 100%; border-collapse: collapse; }
            table.prove td { padding: 1.6mm 2mm; border-bottom: 0.5pt solid #E6EBF2; vertical-align: top; word-wrap: break-word; }
            table.prove td.k { width: 42mm; font-weight: 600; color: #1F3A63; }
            table.registro { width: 100%; border-collapse: collapse; font-size: 7.2pt; }
            table.registro th { text-align: left; color: #3A6098; font-weight: 600; padding: 1.2mm 1.5mm; border-bottom: 0.6pt solid #C9D3E2; }
            table.registro td { padding: 1.2mm 1.5mm; border-bottom: 0.4pt solid #EEF1F6; }
            td.hash { color: #8A94A4; }
            .allegato h1 { font-size: 15pt; font-weight: 300; color: #1F3A63; margin: 2mm 0 3mm 0; line-height: 1.15; }
            .allegato h2 { font-size: 9.6pt; font-weight: 600; color: #1F3A63; margin: 4mm 0 1mm 0; }
            .allegato p { margin: 0 0 2mm 0; text-align: justify; }
            .allegato ul { margin: 0 0 2mm 0; padding-left: 5mm; }
            .allegato li { margin-bottom: 1mm; }
            .allegato em { color: #6B7788; font-style: normal; }
            .allegato strong { font-weight: 600; }
            .allegato table { width: 100%; border-collapse: collapse; margin: 2mm 0 3mm 0; font-size: 7.8pt; }
            .allegato th { text-align: left; color: #3A6098; font-weight: 600; padding: 1.5mm; border-bottom: 0.6pt solid #C9D3E2; }
            .allegato td { padding: 1.5mm; border-bottom: 0.4pt solid #EEF1F6; vertical-align: top; }
            """;
}
