package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import it.edodoc.hq.models.MailingAutomazione;
import it.edodoc.hq.models.MailingAutomazioneEmail;
import it.edodoc.hq.models.MailingCampagna;
import it.edodoc.hq.models.MailingInvio;
import it.edodoc.hq.models.MailingMittente;
import it.edodoc.hq.repositories.MailingAutomazioneEmailRepository;
import it.edodoc.hq.repositories.MailingAutomazioneRepository;
import it.edodoc.hq.repositories.MailingCampagnaRepository;
import jakarta.mail.Message.RecipientType;
import jakarta.mail.MessagingException;
import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeBodyPart;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.nodes.Entities;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.io.UnsupportedEncodingException;
import java.net.URI;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Properties;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Composizione dei messaggi dell'Email Marketing: segnaposto, riscrittura dei link tracciati, pixel, footer legale,
 * versione testo, header (List-Unsubscribe one-click, Message-ID, X-Mailing-Token) e MIME.
 * Usata dal worker di invio, dagli invii di prova e dalla versione web.
 * <p>
 * Ordine sull'HTML salvato dall'editor (che contiene ancora i {@code {{segnaposto}}}):
 * footer (se manca {@code {{link_disiscrizione}}}) → riscrittura link → preheader → segnaposto → pixel.
 * I link si numerano PRIMA dei segnaposto, così la numerazione coincide con quella del frontend (mappa dei click):
 * ogni {@code a[href]} il cui href inizia con http:// o https://, in ordine di apparizione, da 0. Gli href che sono
 * segnaposto ({@code {{link_disiscrizione}}}) non iniziano con http e non contano. Un href http che contiene un
 * segnaposto, o che punta già agli endpoint pubblici del mailing, consuma il suo indice ma non viene riscritto.
 */
@Service
public class MailingComposizioneService {

    private static final Logger logger = LoggerFactory.getLogger(MailingComposizioneService.class);

    public static final String HOME_SITO = "https://edodoc.it";
    public static final String PERCORSO_PUBBLICO = "/api/pubblico/mailing";
    public static final String PREFISSO_TEST = "[TEST] ";

    static final Pattern SEGNAPOSTO = Pattern.compile("\\{\\{\\s*([a-zA-Z_]+)\\s*(?:\\|([^{}]*))?}}");
    private static final DateTimeFormatter DATA_VISITA = DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.ITALIAN);
    private static final DateTimeFormatter ORA_VISITA = DateTimeFormatter.ofPattern("HH:mm", Locale.ITALIAN);

    /** Nomi dei segnaposto noti: gli altri restano nel testo così come sono. */
    static final List<String> NOMI = List.of("nome", "cognome", "nome_completo", "email", "prossima_visita",
            "link_disiscrizione", "link_preferenze", "link_browser", "indirizzo_postale", "anno");

    private final NamedParameterJdbcTemplate jdbc;
    private final MailingConfigService config;
    private final MailingCampagnaRepository campagnaRepository;
    private final MailingAutomazioneEmailRepository automazioneEmailRepository;
    private final MailingAutomazioneRepository automazioneRepository;
    private final ObjectMapper objectMapper;

    /** Impronta degli URL già salvati in mailing_link per messaggio ("c:12", "a:7"): si riscrive solo se cambiano. */
    private final Map<String, Integer> linkSalvati = new ConcurrentHashMap<>();

    public MailingComposizioneService(NamedParameterJdbcTemplate jdbc, MailingConfigService config,
                                      MailingCampagnaRepository campagnaRepository,
                                      MailingAutomazioneEmailRepository automazioneEmailRepository,
                                      MailingAutomazioneRepository automazioneRepository,
                                      ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.config = config;
        this.campagnaRepository = campagnaRepository;
        this.automazioneEmailRepository = automazioneEmailRepository;
        this.automazioneRepository = automazioneRepository;
        this.objectMapper = objectMapper;
    }

    // ───────────────────────── Tipi ─────────────────────────

    /** Il contenuto da spedire: una campagna (con la variante già scelta) o un'email di automazione. */
    public record Sorgente(Long campagnaId, Long automazioneEmailId, Long automazioneId, Long categoriaId,
                           String oggetto, String preheader, String html, String utmCampaign) {
    }

    /** Dati del destinatario per i segnaposto. */
    public record DatiContatto(Long contattoId, String nome, String cognome, String email,
                               String prossimaVisita, String tokenContatto) {
    }

    /** Un link trovato nell'HTML: {@code tracciato} = riscritto verso /c/{token}/{indice}. */
    public record LinkTrovato(int indice, String url, String etichetta, boolean tracciato) {
    }

    public record HtmlComposto(String html, List<LinkTrovato> link) {
    }

    /** Messaggio pronto: MIME, Message-ID generato, oggetto e HTML finali. */
    public record Composto(MimeMessage messaggio, String messageId, String oggetto, String html) {
    }

    // ───────────────────────── Sorgenti ─────────────────────────

    /** Contenuto dell'invio: per le campagne con A/B usa oggetto e preheader della variante (o del vincitore). */
    public Sorgente sorgente(MailingInvio invio) {
        if (invio.getCampagnaId() != null) {
            MailingCampagna c = campagnaRepository.findById(invio.getCampagnaId())
                    .orElseThrow(() -> new IllegalStateException("Campagna " + invio.getCampagnaId() + " non trovata"));
            Sorgente base = sorgenteCampagna(c);
            String oggetto = StringUtils.hasText(invio.getOggetto()) ? invio.getOggetto() : base.oggetto();
            String preheader = preheaderVariante(c, invio.getVariante());
            return new Sorgente(base.campagnaId(), null, null, base.categoriaId(), oggetto,
                    preheader != null ? preheader : base.preheader(), base.html(), base.utmCampaign());
        }
        if (invio.getAutomazioneEmailId() != null) {
            MailingAutomazioneEmail e = automazioneEmailRepository.findById(invio.getAutomazioneEmailId())
                    .orElseThrow(() -> new IllegalStateException("Email di automazione " + invio.getAutomazioneEmailId() + " non trovata"));
            MailingAutomazione a = automazioneRepository.findById(e.getAutomazioneId()).orElse(null);
            return new Sorgente(null, e.getId(), e.getAutomazioneId(), a != null ? a.getCategoriaId() : null,
                    StringUtils.hasText(invio.getOggetto()) ? invio.getOggetto() : e.getOggetto(),
                    e.getPreheader(), e.getHtml(), null);
        }
        throw new IllegalStateException("Invio " + invio.getId() + " senza campagna né email di automazione");
    }

    public Sorgente sorgenteCampagna(MailingCampagna c) {
        return new Sorgente(c.getId(), null, null, c.getCategoriaId(), c.getOggetto(), c.getPreheader(),
                c.getHtml(), c.getUtmCampaign());
    }

    /** Preheader della variante dell'invio; per gli invii dopo il test (variante nulla) quello del vincitore. */
    private String preheaderVariante(MailingCampagna c, String variante) {
        if (!StringUtils.hasText(c.getTestAb())) {
            return null;
        }
        try {
            JsonNode ab = objectMapper.readTree(c.getTestAb());
            String chiave = StringUtils.hasText(variante) ? variante : ab.path("vincitore").asText(null);
            if (chiave == null) {
                return null;
            }
            for (JsonNode v : ab.path("varianti")) {
                if (chiave.equals(v.path("chiave").asText())) {
                    String p = v.path("preheader").asText(null);
                    return StringUtils.hasText(p) ? p : null;
                }
            }
        } catch (Exception e) {
            logger.warn("[MAILING] test_ab della campagna {} illeggibile", c.getId());
        }
        return null;
    }

    // ───────────────────────── Composizione ─────────────────────────

    /** Messaggio tracciato per un invio reale: salva anche i link del messaggio in mailing_link. */
    public Composto componi(MailingInvio invio, MailingMittente mittente) {
        Sorgente s = sorgente(invio);
        DatiContatto d = datiContatto(invio.getContattoId());
        String base = config.urlPubblico();
        String token = invio.getToken();
        Map<String, String> valori = valori(d, linkDisiscrizione(base, token), linkPreferenze(d.tokenContatto(), token),
                base + PERCORSO_PUBBLICO + "/web/" + token, config.indirizzoPostale(), MailingTempo.adesso().getYear());
        HtmlComposto h = componiHtml(s.html(), s.preheader(), valori, base, token, pixel(base, token), true);
        salvaLink(s, h.link());
        String oggetto = sostituisci(s.oggetto(), valori, false);
        String messageId = nuovoMessageId(token, mittente.getEmail());
        Map<String, String> header = headerTracciati(base, token, mittente.getEmail(),
                s.campagnaId() != null ? "c" + s.campagnaId() : "a" + s.automazioneId());
        MimeMessage mime = costruisciMime(mittente, d.email(), nomeCompleto(d), oggetto, h.html(), messageId, header);
        return new Composto(mime, messageId, oggetto, h.html());
    }

    /**
     * Header degli invii reali: List-Unsubscribe (URL one-click + mailto) e List-Unsubscribe-Post (RFC 8058, chiesti
     * da Gmail e Yahoo ai mittenti massivi), X-Mailing-Token (per ritrovare l'invio dai rimbalzi), Feedback-ID
     * (Postmaster Tools). Niente "Precedence: bulk": oggi è sconsigliato.
     */
    static Map<String, String> headerTracciati(String base, String token, String emailMittente, String messaggio) {
        Map<String, String> header = new LinkedHashMap<>();
        header.put("List-Unsubscribe", "<" + linkDisiscrizione(base, token) + ">, <mailto:" + emailMittente
                + "?subject=unsubscribe>");
        header.put("List-Unsubscribe-Post", "List-Unsubscribe=One-Click");
        header.put("X-Mailing-Token", token);
        header.put("Feedback-ID", messaggio + ":mailing:edodoc");
        return header;
    }

    /**
     * Invio di prova: oggetto con "[TEST] ", link originali (nessun tracciamento), nessun pixel, segnaposto con il
     * contatto di anteprima o con valori d'esempio.
     */
    public Composto componiTest(Sorgente s, MailingMittente mittente, String destinatario, Long contattoAnteprimaId) {
        DatiContatto d = contattoAnteprimaId != null ? datiContatto(contattoAnteprimaId) : esempio();
        String prefs = d.tokenContatto() != null ? linkPreferenze(d.tokenContatto(), null) : config.urlPreferenze();
        Map<String, String> valori = valori(d, prefs, prefs, "#", config.indirizzoPostale(), MailingTempo.adesso().getYear());
        HtmlComposto h = componiHtml(s.html(), s.preheader(), valori, config.urlPubblico(), null, null, false);
        String oggetto = PREFISSO_TEST + sostituisci(Objects.requireNonNullElse(s.oggetto(), "(senza oggetto)"), valori, false);
        String messageId = nuovoMessageId(MailingToken.nuovo(12), mittente.getEmail());
        MimeMessage mime = costruisciMime(mittente, destinatario, null, oggetto, h.html(), messageId,
                Map.of("X-Mailing-Test", "1"));
        return new Composto(mime, messageId, oggetto, h.html());
    }

    /** Versione web dell'email (link tracciati, senza pixel): pagina /web/{token}. */
    public String versioneWeb(MailingInvio invio) {
        Sorgente s = sorgente(invio);
        DatiContatto d = datiContatto(invio.getContattoId());
        String base = config.urlPubblico();
        Map<String, String> valori = valori(d, linkDisiscrizione(base, invio.getToken()),
                linkPreferenze(d.tokenContatto(), invio.getToken()), "#", config.indirizzoPostale(),
                MailingTempo.adesso().getYear());
        HtmlComposto h = componiHtml(s.html(), s.preheader(), valori, base, invio.getToken(), null, true);
        salvaLink(s, h.link());
        return h.html();
    }

    public static String linkDisiscrizione(String base, String tokenInvio) {
        return base + PERCORSO_PUBBLICO + "/u/" + tokenInvio;
    }

    public String linkPreferenze(String tokenContatto, String tokenInvio) {
        String url = config.urlPreferenze() + "/" + (tokenContatto != null ? tokenContatto : "");
        return tokenInvio != null ? url + "?invio=" + tokenInvio : url;
    }

    static String pixel(String base, String token) {
        return base + PERCORSO_PUBBLICO + "/o/" + token + ".gif";
    }

    static String nomeCompleto(DatiContatto d) {
        String n = ((d.nome() != null ? d.nome().trim() : "") + " " + (d.cognome() != null ? d.cognome().trim() : "")).trim();
        return n.isEmpty() ? null : n;
    }

    /** Valori dei segnaposto (non ancora escapati: lo fa {@link #sostituisci}). */
    static Map<String, String> valori(DatiContatto d, String linkDisiscrizione, String linkPreferenze, String linkBrowser,
                                      String indirizzoPostale, int anno) {
        Map<String, String> v = new HashMap<>();
        v.put("nome", d.nome());
        v.put("cognome", d.cognome());
        v.put("nome_completo", nomeCompleto(d));
        v.put("email", d.email());
        v.put("prossima_visita", d.prossimaVisita());
        v.put("link_disiscrizione", linkDisiscrizione);
        v.put("link_preferenze", linkPreferenze);
        v.put("link_browser", linkBrowser);
        v.put("indirizzo_postale", indirizzoPostale);
        v.put("anno", String.valueOf(anno));
        return v;
    }

    static DatiContatto esempio() {
        return new DatiContatto(null, "Maria", "Rossi", "maria.rossi@esempio.it",
                "mercoledì 28 ottobre alle 15:30", null);
    }

    // ───────────────────────── Funzioni pure (testate) ─────────────────────────

    /** Merge tag di Mailchimp → segnaposto del gestionale (stessa tabella di MERGE_MAILCHIMP in lib/mailing-render.ts). */
    private static final List<Map.Entry<Pattern, String>> MERGE_MAILCHIMP = List.of(
            Map.entry(Pattern.compile("\\*\\|FNAME\\|\\*"), "{{nome}}"),
            Map.entry(Pattern.compile("\\*\\|LNAME\\|\\*"), "{{cognome}}"),
            Map.entry(Pattern.compile("\\*\\|EMAIL\\|\\*"), "{{email}}"),
            Map.entry(Pattern.compile("\\*\\|(UNSUB|UNSUBSCRIBE)\\|\\*"), "{{link_disiscrizione}}"),
            Map.entry(Pattern.compile("\\*\\|UPDATE_PROFILE\\|\\*"), "{{link_preferenze}}"),
            Map.entry(Pattern.compile("\\*\\|ARCHIVE\\|\\*"), "{{link_browser}}"),
            Map.entry(Pattern.compile("\\*\\|CURRENT_YEAR\\|\\*"), "{{anno}}"),
            Map.entry(Pattern.compile("\\*\\|(LIST:ADDRESS|LIST:ADDRESSLINE|HTML:LIST_ADDRESS_HTML|LIST_ADDRESS_HTML)\\|\\*"),
                    "{{indirizzo_postale}}"),
            // Condizionali e merge tag sconosciuti (MMERGE3, MC_PREVIEW_TEXT...): mai far arrivare *|X|* al paziente.
            Map.entry(Pattern.compile("\\*\\|[A-Za-z0-9_:]+(?::[^|]*)?\\|\\*"), ""));

    /** Traduce i merge tag Mailchimp ({@code *|FNAME|*}) dei contenuti importati; null resta null. */
    public static String convertiMergeMailchimp(String html) {
        if (html == null || !html.contains("*|")) {
            return html;
        }
        String out = html;
        for (Map.Entry<Pattern, String> e : MERGE_MAILCHIMP) {
            out = e.getKey().matcher(out).replaceAll(Matcher.quoteReplacement(e.getValue()));
        }
        return out;
    }

    /**
     * Sostituisce i segnaposto noti. Valore vuoto → fallback ({@code {{nome|Ciao}}}) o stringa vuota.
     * Con {@code html} i valori vengono escapati; il fallback no, perché è già testo del documento HTML.
     */
    static String sostituisci(String testo, Map<String, String> valori, boolean html) {
        if (testo == null || testo.indexOf("{{") < 0) {
            return testo;
        }
        Matcher m = SEGNAPOSTO.matcher(testo);
        StringBuilder sb = new StringBuilder();
        while (m.find()) {
            String nome = m.group(1).toLowerCase(Locale.ROOT);
            String sostituto;
            if (!NOMI.contains(nome)) {
                sostituto = m.group();
            } else {
                String valore = valori.get(nome);
                if (StringUtils.hasText(valore)) {
                    sostituto = html ? escape(valore.trim()) : valore.trim();
                } else {
                    String fallback = m.group(2);
                    sostituto = fallback != null ? fallback.trim() : "";
                }
            }
            m.appendReplacement(sb, Matcher.quoteReplacement(sostituto));
        }
        m.appendTail(sb);
        return sb.toString();
    }

    static String escape(String s) {
        StringBuilder sb = new StringBuilder(s.length() + 16);
        for (char c : s.toCharArray()) {
            switch (c) {
                case '&' -> sb.append("&amp;");
                case '<' -> sb.append("&lt;");
                case '>' -> sb.append("&gt;");
                case '"' -> sb.append("&quot;");
                case '\'' -> sb.append("&#39;");
                default -> sb.append(c);
            }
        }
        return sb.toString();
    }

    static boolean hrefHttp(String href) {
        if (href == null) {
            return false;
        }
        String h = href.trim().toLowerCase(Locale.ROOT);
        return h.startsWith("http://") || h.startsWith("https://");
    }

    /** I link dell'HTML con la numerazione condivisa con il frontend. */
    static List<LinkTrovato> estraiLink(String html, String base) {
        Document doc = Jsoup.parse(html != null ? html : "");
        return numera(doc, base, null);
    }

    private static List<LinkTrovato> numera(Document doc, String base, String token) {
        List<LinkTrovato> link = new ArrayList<>();
        String speciale = base != null ? base + PERCORSO_PUBBLICO + "/" : null;
        int indice = 0;
        for (Element a : doc.select("a[href]")) {
            String href = a.attr("href");
            if (!hrefHttp(href)) {
                continue;
            }
            String url = href.trim();
            boolean tracciabile = !url.contains("{{") && (speciale == null || !url.startsWith(speciale));
            link.add(new LinkTrovato(indice, url, etichetta(a), tracciabile && token != null));
            if (tracciabile && token != null) {
                a.attr("href", base + PERCORSO_PUBBLICO + "/c/" + token + "/" + indice);
            }
            indice++;
        }
        return link;
    }

    private static String etichetta(Element a) {
        String t = a.text().trim();
        if (t.isEmpty()) {
            Element img = a.selectFirst("img[alt]");
            t = img != null ? img.attr("alt").trim() : "";
        }
        if (t.isEmpty()) {
            return null;
        }
        return t.length() > 300 ? t.substring(0, 300) : t;
    }

    /** Vero se l'HTML ha già il link di disiscrizione (anche con fallback). */
    static boolean haLinkDisiscrizione(String html) {
        return html != null && Pattern.compile("\\{\\{\\s*link_disiscrizione\\s*(\\|[^{}]*)?}}").matcher(html).find();
    }

    static final String FOOTER = "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" "
            + "data-mailing-footer=\"1\"><tr><td align=\"center\" style=\"padding:24px 16px 32px;font-family:Helvetica,Arial,"
            + "sans-serif;font-size:12px;line-height:18px;color:#8a8f8c\">{{indirizzo_postale}}<br>"
            + "Ricevi questa email perché sei in contatto con il Dr. Edoardo Bo.<br>"
            + "<a href=\"{{link_disiscrizione}}\" style=\"color:#8a8f8c;text-decoration:underline\">Disiscriviti</a>"
            + " &middot; <a href=\"{{link_preferenze}}\" style=\"color:#8a8f8c;text-decoration:underline\">Gestisci le preferenze</a>"
            + "</td></tr></table>";

    /**
     * HTML finale. {@code token} null = nessuna riscrittura dei link (invio di prova); {@code pixelUrl} null = senza pixel.
     */
    static HtmlComposto componiHtml(String html, String preheader, Map<String, String> valori, String base, String token,
                                    String pixelUrl, boolean traccia) {
        html = convertiMergeMailchimp(html);
        Document doc = Jsoup.parse(html != null ? html : "");
        doc.outputSettings().prettyPrint(false).charset(java.nio.charset.StandardCharsets.UTF_8)
                .escapeMode(Entities.EscapeMode.base);
        if (!haLinkDisiscrizione(html)) {
            doc.body().append(FOOTER);
        }
        List<LinkTrovato> link = numera(doc, base, traccia ? token : null);
        // L'editor scrive il preheader in un div [data-mailing-preheader]: per le varianti A/B se ne cambia il testo,
        // senza aggiungerne un secondo.
        Element preheaderEsistente = doc.selectFirst("[data-mailing-preheader]");
        if (StringUtils.hasText(preheader) && preheaderEsistente != null) {
            preheaderEsistente.html(escape(preheader.trim()) + "&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;");
        } else if (StringUtils.hasText(preheader)) {
            doc.body().prepend("<div data-mailing-preheader=\"1\" style=\"display:none;font-size:1px;line-height:1px;"
                    + "max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all\">" + escape(preheader.trim())
                    + "&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>");
        }
        String out = sostituisci(doc.outerHtml(), valori, true);
        if (pixelUrl != null) {
            String img = "<img src=\"" + escape(pixelUrl) + "\" width=\"1\" height=\"1\" alt=\"\" "
                    + "style=\"display:block;width:1px;height:1px;border:0\">";
            int fine = out.toLowerCase(Locale.ROOT).lastIndexOf("</body>");
            out = fine >= 0 ? out.substring(0, fine) + img + out.substring(fine) : out + img;
        }
        return new HtmlComposto(out, link);
    }

    /** Versione text/plain: preheader e pixel esclusi, URL dei link tra parentesi dopo il testo. */
    static String testo(String html) {
        Document doc = Jsoup.parse(html);
        doc.select("[data-mailing-preheader], img[width=1]").remove();
        for (Element a : doc.select("a[href]")) {
            String href = a.attr("href").trim();
            if (hrefHttp(href) && !a.text().trim().equals(href)) {
                a.appendText(" (" + href + ")");
            }
        }
        return MailingTesto.testoDaHtml(doc.outerHtml());
    }

    /** {@code <1730000000000.TOKEN@dominio-mittente>}. */
    static String nuovoMessageId(String token, String emailMittente) {
        String dominio = emailMittente != null && emailMittente.contains("@")
                ? emailMittente.substring(emailMittente.indexOf('@') + 1).trim().toLowerCase(Locale.ROOT) : "edodoc.local";
        return "<" + System.currentTimeMillis() + "." + token + "@" + dominio + ">";
    }

    /** MimeMessage che conserva il Message-ID scelto da noi (jakarta.mail lo rigenera a ogni saveChanges). */
    static final class MessaggioMailing extends MimeMessage {
        private final String messageId;

        MessaggioMailing(Session session, String messageId) {
            super(session);
            this.messageId = messageId;
        }

        @Override
        protected void updateMessageID() throws MessagingException {
            setHeader("Message-ID", messageId);
        }
    }

    static MimeMessage costruisciMime(MailingMittente mittente, String destinatario, String nomeDestinatario,
                                      String oggetto, String html, String messageId, Map<String, String> header) {
        try {
            MimeMessage msg = new MessaggioMailing(Session.getInstance(new Properties()), messageId);
            msg.setFrom(new InternetAddress(mittente.getEmail(), mittente.getNomeVisualizzato(), "UTF-8"));
            InternetAddress to = new InternetAddress(destinatario.trim());
            to.validate();
            if (StringUtils.hasText(nomeDestinatario)) {
                to.setPersonal(nomeDestinatario, "UTF-8");
            }
            msg.setRecipient(RecipientType.TO, to);
            if (StringUtils.hasText(mittente.getRispondiA())) {
                msg.setReplyTo(new InternetAddress[]{new InternetAddress(mittente.getRispondiA().trim())});
            }
            msg.setSubject(oggetto != null ? oggetto : "", "UTF-8");
            msg.setSentDate(new java.util.Date());
            for (Map.Entry<String, String> h : header.entrySet()) {
                msg.setHeader(h.getKey(), h.getValue());
            }
            MimeBodyPart parteTesto = new MimeBodyPart();
            parteTesto.setText(testo(html), "UTF-8");
            MimeBodyPart parteHtml = new MimeBodyPart();
            parteHtml.setContent(html, "text/html; charset=UTF-8");
            MimeMultipart alternative = new MimeMultipart("alternative");
            alternative.addBodyPart(parteTesto);
            alternative.addBodyPart(parteHtml);
            msg.setContent(alternative);
            msg.saveChanges();
            return msg;
        } catch (MessagingException | UnsupportedEncodingException e) {
            throw new IllegalArgumentException("Email non componibile: " + e.getMessage(), e);
        }
    }

    /** URL con i parametri UTM (source=email, medium=email) se la campagna ha utm_campaign e l'URL non li ha già. */
    public static String conUtm(String url, String utmCampaign) {
        if (!StringUtils.hasText(utmCampaign) || url == null || url.contains("utm_source=")) {
            return url;
        }
        String frammento = "";
        String u = url;
        int hash = u.indexOf('#');
        if (hash >= 0) {
            frammento = u.substring(hash);
            u = u.substring(0, hash);
        }
        String sep = u.contains("?") ? "&" : "?";
        return u + sep + "utm_source=email&utm_medium=email&utm_campaign="
                + java.net.URLEncoder.encode(utmCampaign.trim(), java.nio.charset.StandardCharsets.UTF_8) + frammento;
    }

    /** Vero se l'URL è un http(s) assoluto con un host plausibile. */
    public static boolean urlValido(String url) {
        if (!hrefHttp(url)) {
            return false;
        }
        try {
            URI u = URI.create(url.trim().replace(" ", "%20"));
            return u.getHost() != null && u.getHost().contains(".");
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    // ───────────────────────── Link salvati ─────────────────────────

    /** Salva gli URL originali per indice (una volta per messaggio; si riscrive solo se l'HTML è cambiato). */
    void salvaLink(Sorgente s, List<LinkTrovato> link) {
        String chiave = s.campagnaId() != null ? "c:" + s.campagnaId() : "a:" + s.automazioneEmailId();
        int impronta = link.stream().map(l -> l.indice() + "|" + l.url() + "|" + l.etichetta()).toList().hashCode();
        Integer gia = linkSalvati.get(chiave);
        if (gia != null && gia == impronta) {
            return;
        }
        String colonna = s.campagnaId() != null ? "campagna_id" : "automazione_email_id";
        long id = s.campagnaId() != null ? s.campagnaId() : s.automazioneEmailId();
        for (LinkTrovato l : link) {
            jdbc.update("INSERT INTO mailing_link (" + colonna + ", indice, url, etichetta) VALUES (:id, :indice, :url, :etichetta) "
                            + "ON CONFLICT (" + colonna + ", indice) WHERE " + colonna + " IS NOT NULL "
                            + "DO UPDATE SET url = EXCLUDED.url, etichetta = EXCLUDED.etichetta",
                    new MapSqlParameterSource("id", id).addValue("indice", l.indice()).addValue("url", l.url())
                            .addValue("etichetta", l.etichetta()));
        }
        jdbc.update("DELETE FROM mailing_link WHERE " + colonna + " = :id AND indice >= :n",
                new MapSqlParameterSource("id", id).addValue("n", link.size()));
        linkSalvati.put(chiave, impronta);
    }

    // ───────────────────────── Dati del contatto ─────────────────────────

    public DatiContatto datiContatto(long contattoId) {
        List<Map<String, Object>> righe = jdbc.queryForList(
                "SELECT nome, cognome, email, token, paziente_id FROM mailing_contatti WHERE id = :id",
                Map.of("id", contattoId));
        if (righe.isEmpty()) {
            throw new IllegalStateException("Contatto " + contattoId + " non trovato");
        }
        Map<String, Object> r = righe.get(0);
        String prossima = null;
        if (r.get("paziente_id") != null) {
            List<java.sql.Timestamp> futura = jdbc.queryForList(
                    "SELECT v.inizio FROM visite v WHERE v.paziente_id = :p AND v.stato = 'PROGRAMMATA' AND v.inizio >= :ora "
                            + "ORDER BY v.inizio LIMIT 1",
                    new MapSqlParameterSource("p", ((Number) r.get("paziente_id")).longValue())
                            .addValue("ora", java.sql.Timestamp.valueOf(MailingTempo.adesso())), java.sql.Timestamp.class);
            if (!futura.isEmpty() && futura.get(0) != null) {
                java.time.LocalDateTime inizio = futura.get(0).toLocalDateTime();
                prossima = formattaVisita(inizio.toLocalDate(), inizio.toLocalTime());
            }
        }
        return new DatiContatto(contattoId, (String) r.get("nome"), (String) r.get("cognome"), (String) r.get("email"),
                prossima, (String) r.get("token"));
    }

    /** "mercoledì 28 ottobre alle 15:30". */
    static String formattaVisita(LocalDate data, LocalTime ora) {
        String s = DATA_VISITA.format(data);
        return ora != null ? s + " alle " + ORA_VISITA.format(ora) : s;
    }
}
