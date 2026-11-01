package it.edodoc.hq.services;

import com.google.api.services.gmail.model.Message;
import com.google.api.services.gmail.model.MessagePart;
import com.google.api.services.gmail.model.MessagePartHeader;
import it.edodoc.hq.dto.CasellaDto;
import jakarta.activation.DataHandler;
import jakarta.mail.Message.RecipientType;
import jakarta.mail.MessagingException;
import jakarta.mail.Session;
import jakarta.mail.internet.ContentType;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeBodyPart;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;
import jakarta.mail.internet.MimeUtility;
import jakarta.mail.util.ByteArrayDataSource;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UnsupportedEncodingException;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Conversione tra i messaggi Gmail e i DTO della pagina Email: lettura (corpo HTML/testo, allegati, immagini
 * inline) e composizione MIME per invio e bozze. Nessuno stato: metodi statici. Portato da Mobilitas.
 */
public final class CasellaMime {

    private CasellaMime() {
    }

    /** Parti scaricate a parte da Gmail (corpi grandi, immagini inline): messaggioId + allegatoId → byte. */
    @FunctionalInterface
    public interface Scaricatore {
        byte[] scarica(String messaggioId, String allegatoId) throws IOException;
    }

    /** Immagini inline incorporate nel corpo oltre questa soglia complessiva restano allegati scaricabili. */
    private static final long LIMITE_INLINE_BYTES = 4L * 1024 * 1024;

    private static final Pattern URL = Pattern.compile("(https?://[^\\s<>\"']+)");

    // ───────────────────────── Lettura ─────────────────────────

    public static String header(Message m, String nome) {
        return m.getPayload() == null ? null : header(m.getPayload().getHeaders(), nome);
    }

    public static String header(List<MessagePartHeader> headers, String nome) {
        if (headers == null) {
            return null;
        }
        for (MessagePartHeader h : headers) {
            if (nome.equalsIgnoreCase(h.getName())) {
                return h.getValue();
            }
        }
        return null;
    }

    public static List<CasellaDto.Indirizzo> indirizzi(String valore) {
        List<CasellaDto.Indirizzo> out = new ArrayList<>();
        if (valore == null || valore.isBlank()) {
            return out;
        }
        try {
            for (InternetAddress a : InternetAddress.parseHeader(valore, false)) {
                if (a.getAddress() != null && !a.getAddress().isBlank()) {
                    out.add(new CasellaDto.Indirizzo(a.getPersonal(), a.getAddress().trim()));
                }
            }
        } catch (MessagingException e) {
            for (String pezzo : valore.split(",")) {
                String s = pezzo.trim();
                if (!s.isEmpty()) {
                    out.add(new CasellaDto.Indirizzo(null, s.replaceAll(".*<|>.*", "")));
                }
            }
        }
        return out;
    }

    public static CasellaDto.Indirizzo primo(String valore) {
        List<CasellaDto.Indirizzo> l = indirizzi(valore);
        return l.isEmpty() ? null : l.get(0);
    }

    /** Messaggio completo (format=FULL) → DTO, con le immagini inline incorporate come data URI. */
    public static CasellaDto.Messaggio messaggio(Message m, Scaricatore scaricatore) throws IOException {
        Raccolta r = new Raccolta();
        if (m.getPayload() != null) {
            visita(m.getPayload(), r);
        }

        String html = r.html != null ? leggiTesto(m.getId(), r.html, scaricatore) : null;
        String testo = r.testo != null ? leggiTesto(m.getId(), r.testo, scaricatore) : null;
        if (html == null && testo != null) {
            html = htmlDaTesto(testo);
        }
        if (testo == null && html != null) {
            testo = CorpoEmail.testoDaHtml(html);
        }

        List<CasellaDto.Allegato> allegati = new ArrayList<>();
        Map<String, String> cid = new HashMap<>();
        long inlineBytes = 0;
        for (MessagePart p : r.allegati) {
            String contentId = pulisciCid(header(p.getHeaders(), "Content-ID"));
            boolean referenziata = contentId != null && html != null && html.contains("cid:" + contentId);
            long dim = p.getBody() != null && p.getBody().getSize() != null ? p.getBody().getSize() : 0;
            if (referenziata && p.getMimeType() != null && p.getMimeType().startsWith("image/")
                    && inlineBytes + dim <= LIMITE_INLINE_BYTES) {
                byte[] dati = datiParte(m.getId(), p, scaricatore);
                if (dati != null) {
                    inlineBytes += dati.length;
                    cid.put(contentId, "data:" + p.getMimeType() + ";base64," + Base64.getEncoder().encodeToString(dati));
                    continue;
                }
            }
            if (p.getBody() != null && p.getBody().getAttachmentId() != null) {
                allegati.add(new CasellaDto.Allegato(m.getId(), p.getBody().getAttachmentId(), nomeFile(p),
                        p.getMimeType(), dim, referenziata));
            }
        }
        for (Map.Entry<String, String> e : cid.entrySet()) {
            html = html.replace("cid:" + e.getKey(), e.getValue());
        }

        html = sanificaLettura(html);
        List<String> etichette = m.getLabelIds() != null ? m.getLabelIds() : List.of();
        return new CasellaDto.Messaggio(
                m.getId(),
                m.getThreadId(),
                primo(header(m, "From")),
                indirizzi(header(m, "To")),
                indirizzi(header(m, "Cc")),
                indirizzi(header(m, "Bcc")),
                indirizzi(header(m, "Reply-To")),
                header(m, "Subject"),
                m.getInternalDate() != null ? m.getInternalDate() : 0,
                m.getSnippet(),
                html,
                testo,
                allegati,
                etichette,
                etichette.contains("UNREAD"),
                etichette.contains("DRAFT"),
                header(m, "Message-ID"),
                header(m, "References"),
                null);
    }

    private static final class Raccolta {
        MessagePart html;
        MessagePart testo;
        final List<MessagePart> allegati = new ArrayList<>();
    }

    private static void visita(MessagePart p, Raccolta r) {
        String mime = p.getMimeType() != null ? p.getMimeType().toLowerCase(Locale.ROOT) : "";
        // Un messaggio inoltrato come allegato resta un allegato: non se ne legge il corpo.
        if (mime.equals("message/rfc822")) {
            if (p.getBody() != null && p.getBody().getAttachmentId() != null) {
                r.allegati.add(p);
            }
            return;
        }
        if (p.getParts() != null && !p.getParts().isEmpty()) {
            for (MessagePart figlio : p.getParts()) {
                visita(figlio, r);
            }
            return;
        }
        String disposizione = header(p.getHeaders(), "Content-Disposition");
        boolean attachment = disposizione != null && disposizione.toLowerCase(Locale.ROOT).startsWith("attachment");
        boolean conNome = p.getFilename() != null && !p.getFilename().isBlank();
        if (!attachment && !conNome) {
            if (mime.equals("text/html") && r.html == null) {
                r.html = p;
                return;
            }
            if (mime.equals("text/plain") && r.testo == null) {
                r.testo = p;
                return;
            }
        }
        if (p.getBody() != null && p.getBody().getAttachmentId() != null) {
            r.allegati.add(p);
        }
    }

    private static String leggiTesto(String messaggioId, MessagePart p, Scaricatore scaricatore) throws IOException {
        byte[] dati = datiParte(messaggioId, p, scaricatore);
        if (dati == null) {
            return null;
        }
        return new String(dati, charset(header(p.getHeaders(), "Content-Type")));
    }

    private static byte[] datiParte(String messaggioId, MessagePart p, Scaricatore scaricatore) throws IOException {
        if (p.getBody() == null) {
            return null;
        }
        if (p.getBody().getData() != null) {
            return p.getBody().decodeData();
        }
        if (p.getBody().getAttachmentId() != null) {
            return scaricatore.scarica(messaggioId, p.getBody().getAttachmentId());
        }
        return null;
    }

    private static Charset charset(String contentType) {
        if (contentType != null) {
            try {
                String cs = new ContentType(contentType).getParameter("charset");
                if (cs != null) {
                    return Charset.forName(MimeUtility.javaCharset(cs.trim()));
                }
            } catch (Exception ignored) {
                // charset illeggibile o sconosciuto: UTF-8
            }
        }
        return StandardCharsets.UTF_8;
    }

    private static String pulisciCid(String cid) {
        if (cid == null) {
            return null;
        }
        String c = cid.trim();
        if (c.startsWith("<") && c.endsWith(">")) {
            c = c.substring(1, c.length() - 1);
        }
        return c.isEmpty() ? null : c;
    }

    private static String nomeFile(MessagePart p) {
        if (p.getFilename() != null && !p.getFilename().isBlank()) {
            return p.getFilename();
        }
        String mime = p.getMimeType() != null ? p.getMimeType() : "";
        return mime.equals("message/rfc822") ? "messaggio.eml" : "allegato";
    }

    // ───────────────────────── HTML ↔ testo ─────────────────────────

    /**
     * HTML di un'email ricevuta, prima di arrivare al browser: niente script, form, frame né gestori di evento.
     * Il frontend lo mostra comunque in un iframe sandbox, questa è una seconda barriera.
     */
    public static String sanificaLettura(String html) {
        if (html == null) {
            return null;
        }
        Document d = Jsoup.parse(html);
        d.outputSettings().prettyPrint(false);
        d.select("script, noscript, iframe, frame, frameset, object, embed, applet, form, base, meta, link").remove();
        for (Element el : d.getAllElements()) {
            for (org.jsoup.nodes.Attribute attr : new ArrayList<>(el.attributes().asList())) {
                String nome = attr.getKey().toLowerCase(Locale.ROOT);
                String valore = attr.getValue().replaceAll("\\s", "").toLowerCase(Locale.ROOT);
                boolean pericoloso = nome.startsWith("on") || valore.startsWith("javascript:") || valore.startsWith("vbscript:")
                        || (valore.startsWith("data:text/html"));
                if (pericoloso) {
                    el.removeAttr(attr.getKey());
                }
            }
        }
        return d.html();
    }

    /** Testo semplice → HTML con link cliccabili e a capo conservati. */
    public static String htmlDaTesto(String testo) {
        String escaped = testo
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
        Matcher m = URL.matcher(escaped);
        String conLink = m.replaceAll("<a href=\"$1\">$1</a>");
        return "<div style=\"white-space:pre-wrap;word-break:break-word\">" + conLink + "</div>";
    }

    // ───────────────────────── Composizione ─────────────────────────

    /** Allegato pronto da inserire nel MIME. */
    public record FileAllegato(String nome, String mimeType, byte[] dati) {
    }

    private static final Pattern DATA_URI = Pattern.compile("^data:([\\w./+-]+);base64,(.+)$", Pattern.DOTALL);

    /**
     * Costruisce il messaggio RFC 822 (base64url, come vuole Gmail): alternative testo/HTML, immagini incollate
     * nel corpo (data URI) trasformate in parti inline cid:, allegati in coda.
     */
    public static String componi(String mittenteEmail, String mittenteNome, CasellaDto.Composizione c,
                                 List<FileAllegato> allegati) {
        try {
            MimeMessage msg = new MimeMessage(Session.getInstance(new Properties()));
            msg.setFrom(new InternetAddress(mittenteEmail, mittenteNome, "UTF-8"));
            destinatari(msg, RecipientType.TO, c.a());
            destinatari(msg, RecipientType.CC, c.cc());
            destinatari(msg, RecipientType.BCC, c.ccn());
            msg.setSubject(c.oggetto() != null ? c.oggetto() : "", "UTF-8");
            if (c.inReplyTo() != null && !c.inReplyTo().isBlank()) {
                msg.setHeader("In-Reply-To", c.inReplyTo().trim());
                String refs = c.references() != null && !c.references().isBlank()
                        ? c.references().trim() + " " + c.inReplyTo().trim()
                        : c.inReplyTo().trim();
                msg.setHeader("References", refs);
            }

            // Immagini incollate: data URI → parti inline.
            Document doc = Jsoup.parseBodyFragment(c.html() != null ? c.html() : "");
            doc.outputSettings().prettyPrint(false);
            List<MimeBodyPart> inline = new ArrayList<>();
            for (Element img : doc.select("img[src^=data:]")) {
                Matcher dm = DATA_URI.matcher(img.attr("src"));
                if (!dm.matches()) {
                    continue;
                }
                String cid = UUID.randomUUID() + "@edodoc-hq";
                MimeBodyPart parte = new MimeBodyPart();
                parte.setDataHandler(new DataHandler(new ByteArrayDataSource(
                        Base64.getMimeDecoder().decode(dm.group(2)), dm.group(1))));
                parte.setContentID("<" + cid + ">");
                parte.setDisposition(MimeBodyPart.INLINE);
                inline.add(parte);
                img.attr("src", "cid:" + cid);
            }
            String html = "<div dir=\"ltr\">" + doc.body().html() + "</div>";

            MimeBodyPart parteTesto = new MimeBodyPart();
            parteTesto.setText(CorpoEmail.testoDaHtml(html), "UTF-8");
            MimeBodyPart parteHtml = new MimeBodyPart();
            parteHtml.setContent(html, "text/html; charset=UTF-8");

            MimeBodyPart corpoHtml = parteHtml;
            if (!inline.isEmpty()) {
                MimeMultipart related = new MimeMultipart("related");
                related.addBodyPart(parteHtml);
                for (MimeBodyPart p : inline) {
                    related.addBodyPart(p);
                }
                corpoHtml = new MimeBodyPart();
                corpoHtml.setContent(related);
            }

            MimeMultipart alternative = new MimeMultipart("alternative");
            alternative.addBodyPart(parteTesto);
            alternative.addBodyPart(corpoHtml);

            if (allegati == null || allegati.isEmpty()) {
                msg.setContent(alternative);
            } else {
                MimeMultipart mixed = new MimeMultipart("mixed");
                MimeBodyPart corpo = new MimeBodyPart();
                corpo.setContent(alternative);
                mixed.addBodyPart(corpo);
                for (FileAllegato f : allegati) {
                    MimeBodyPart parte = new MimeBodyPart();
                    String tipo = f.mimeType() != null && !f.mimeType().isBlank() ? f.mimeType() : "application/octet-stream";
                    parte.setDataHandler(new DataHandler(new ByteArrayDataSource(f.dati(), tipo)));
                    parte.setFileName(MimeUtility.encodeText(f.nome() != null ? f.nome() : "allegato", "UTF-8", null));
                    parte.setDisposition(MimeBodyPart.ATTACHMENT);
                    mixed.addBodyPart(parte);
                }
                msg.setContent(mixed);
            }
            msg.saveChanges();

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            msg.writeTo(out);
            return Base64.getUrlEncoder().encodeToString(out.toByteArray());
        } catch (MessagingException | IOException e) {
            throw new IllegalArgumentException("Email non valida: " + e.getMessage(), e);
        }
    }

    private static void destinatari(MimeMessage msg, RecipientType tipo, List<String> indirizzi)
            throws MessagingException, UnsupportedEncodingException {
        if (indirizzi == null || indirizzi.isEmpty()) {
            return;
        }
        List<InternetAddress> lista = new ArrayList<>();
        for (String s : indirizzi) {
            if (s == null || s.isBlank()) {
                continue;
            }
            InternetAddress[] parsed = InternetAddress.parse(s.trim(), true);
            for (InternetAddress a : parsed) {
                a.validate();
                if (a.getPersonal() != null) {
                    a.setPersonal(a.getPersonal(), "UTF-8");
                }
                lista.add(a);
            }
        }
        msg.setRecipients(tipo, lista.toArray(InternetAddress[]::new));
    }
}
