package it.edodoc.hq.services;

import it.edodoc.hq.models.MailingMittente;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MailingComposizioneServiceTest {

    private static final String BASE = "https://link.studio.it";
    private static final String TOKEN = "AbCdEfGhIjKlMnOpQrStUvWx";

    private static Map<String, String> valori() {
        MailingComposizioneService.DatiContatto d = new MailingComposizioneService.DatiContatto(1L, "Maria", "Rossi",
                "maria@esempio.it", "mercoledì 28 ottobre alle 15:30", "TOKCONTATTO");
        return MailingComposizioneService.valori(d, BASE + "/api/pubblico/mailing/u/" + TOKEN,
                "https://hq.studio.it/preferenze-email/TOKCONTATTO?invio=" + TOKEN, BASE + "/api/pubblico/mailing/web/" + TOKEN,
                "Dr. Edoardo Bo, Via Roma 1, Milano", 2026);
    }

    @Test
    void segnapostoSostituitiConValoriDelContatto() {
        String out = MailingComposizioneService.sostituisci("Ciao {{nome}} {{ cognome }}, ti aspetto {{prossima_visita}} © {{anno}}",
                valori(), true);
        assertEquals("Ciao Maria Rossi, ti aspetto mercoledì 28 ottobre alle 15:30 © 2026", out);
    }

    @Test
    void fallbackUsatoSoloSeIlValoreManca() {
        Map<String, String> v = new HashMap<>(valori());
        assertEquals("Ciao Maria", MailingComposizioneService.sostituisci("Ciao {{nome|amico}}", v, true));
        v.put("nome", "  ");
        assertEquals("Ciao amico", MailingComposizioneService.sostituisci("Ciao {{nome|amico}}", v, true));
        v.put("nome", null);
        assertEquals("Ciao ", MailingComposizioneService.sostituisci("Ciao {{nome}}", v, true));
    }

    @Test
    void valoriEscapatiInHtmlMaNonNellOggetto() {
        Map<String, String> v = new HashMap<>(valori());
        v.put("nome", "<b>Anna</b> & \"Co\"");
        assertEquals("Ciao &lt;b&gt;Anna&lt;/b&gt; &amp; &quot;Co&quot;", MailingComposizioneService.sostituisci("Ciao {{nome}}", v, true));
        assertEquals("Ciao <b>Anna</b> & \"Co\"", MailingComposizioneService.sostituisci("Ciao {{nome}}", v, false));
    }

    @Test
    void segnapostoSconosciutiRestanoComeSono() {
        assertEquals("{{sconosciuto}} *|FNAME|*", MailingComposizioneService.sostituisci("{{sconosciuto}} *|FNAME|*", valori(), true));
    }

    @Test
    void numerazioneLinkComeIlFrontend() {
        String html = "<p><a href=\"https://a.it\">A</a> <a href=\"{{link_preferenze}}\">pref</a> "
                + "<a href=\"mailto:x@y.it\">mail</a> <a href=\"HTTP://b.it/x\">B</a> "
                + "<a href=\"https://c.it/?n={{nome}}\">C</a> <a href=\"#\">vuoto</a> "
                + "<a href=\"" + BASE + "/api/pubblico/mailing/web/zzz\">web</a> <a href=\"https://d.it\"><img alt=\"Logo\" src=\"x\"></a></p>";
        List<MailingComposizioneService.LinkTrovato> link = MailingComposizioneService.estraiLink(html, BASE);
        assertEquals(5, link.size());
        assertEquals("https://a.it", link.get(0).url());
        assertEquals(0, link.get(0).indice());
        assertEquals("HTTP://b.it/x", link.get(1).url());
        assertEquals(1, link.get(1).indice());
        assertEquals("https://c.it/?n={{nome}}", link.get(2).url());
        assertEquals(BASE + "/api/pubblico/mailing/web/zzz", link.get(3).url());
        assertEquals("https://d.it", link.get(4).url());
        assertEquals("Logo", link.get(4).etichetta());
    }

    @Test
    void riscritturaLinkConIndiciSaltandoSegnapostoESpeciali() {
        String html = "<html><body><a href=\"https://a.it\">A</a><a href=\"{{link_browser}}\">web</a>"
                + "<a href=\"https://c.it/?n={{nome}}\">C</a><a href=\"https://d.it\">D</a></body></html>";
        MailingComposizioneService.HtmlComposto h = MailingComposizioneService.componiHtml(html, null, valori(), BASE, TOKEN,
                null, true);
        String out = h.html();
        assertTrue(out.contains("href=\"" + BASE + "/api/pubblico/mailing/c/" + TOKEN + "/0\""));
        assertTrue(out.contains("href=\"" + BASE + "/api/pubblico/mailing/c/" + TOKEN + "/2\""), out);
        // http con segnaposto: consuma l'indice 1 ma resta il link originale (con il segnaposto sostituito)
        assertTrue(out.contains("href=\"https://c.it/?n=Maria\""), out);
        assertFalse(out.contains("/c/" + TOKEN + "/3"));
        // link_browser sostituito dopo la numerazione: non tracciato
        assertTrue(out.contains("href=\"" + BASE + "/api/pubblico/mailing/web/" + TOKEN + "\""));
        assertEquals(3, h.link().size());
        assertTrue(h.link().get(0).tracciato());
        assertFalse(h.link().get(1).tracciato());
        assertTrue(h.link().get(2).tracciato());
    }

    @Test
    void mergeTagMailchimpTradottiEMaiInviatiGrezzi() {
        assertEquals("Ciao {{nome}} {{cognome}}, <a href=\"{{link_disiscrizione}}\">esci</a> © {{anno}} ",
                MailingComposizioneService.convertiMergeMailchimp(
                        "Ciao *|FNAME|* *|LNAME|*, <a href=\"*|UNSUB|*\">esci</a> © *|CURRENT_YEAR|* *|MMERGE3|*"));
        String out = MailingComposizioneService.componiHtml("<html><body><p>Ciao *|FNAME|*</p>*|IF:FNAME|*x*|END:IF|*"
                + "<a href=\"*|UNSUB|*\">esci</a></body></html>", null, valori(), BASE, TOKEN, null, true).html();
        assertFalse(out.contains("*|"), out);
        assertTrue(out.contains("Ciao Maria"), out);
        assertNull(MailingComposizioneService.convertiMergeMailchimp(null));
    }

    @Test
    void preheaderDellEditorSostituitoDallaVarianteSenzaDuplicarlo() {
        String html = "<html><body><!--mx-preheader--><div data-mailing-preheader=\"1\" style=\"display:none\">Variante A</div>"
                + "<!--/mx-preheader--><p>Ciao</p>{{link_disiscrizione}}</body></html>";
        String out = MailingComposizioneService.componiHtml(html, "Variante B", valori(), BASE, TOKEN, null, true).html();
        assertEquals(1, out.split("data-mailing-preheader", -1).length - 1, out);
        assertTrue(out.contains("Variante B"), out);
        assertFalse(out.contains("Variante A"), out);
    }

    @Test
    void pixelInFondoAlBody() {
        String pixel = MailingComposizioneService.pixel(BASE, TOKEN);
        MailingComposizioneService.HtmlComposto h = MailingComposizioneService.componiHtml(
                "<html><body><p>Ciao</p>{{link_disiscrizione}}</body></html>", null, valori(), BASE, TOKEN, pixel, true);
        String out = h.html();
        int img = out.indexOf("<img src=\"" + BASE + "/api/pubblico/mailing/o/" + TOKEN + ".gif\" width=\"1\" height=\"1\" alt=\"\"");
        assertTrue(img > 0, out);
        assertTrue(img > out.indexOf("Ciao"));
        assertTrue(img < out.indexOf("</body>"));
    }

    @Test
    void invioDiProvaSenzaPixelNeTracciamento() {
        MailingComposizioneService.HtmlComposto h = MailingComposizioneService.componiHtml(
                "<a href=\"https://a.it\">A</a>", null, valori(), BASE, null, null, false);
        assertTrue(h.html().contains("href=\"https://a.it\""));
        assertFalse(h.html().contains("/api/pubblico/mailing/o/"));
        assertFalse(h.link().get(0).tracciato());
    }

    @Test
    void footerAggiuntoSoloSeMancaIlLinkDiDisiscrizione() {
        String senza = MailingComposizioneService.componiHtml("<p>Ciao</p>", null, valori(), BASE, TOKEN, null, true).html();
        assertTrue(senza.contains("data-mailing-footer"));
        assertTrue(senza.contains("Dr. Edoardo Bo, Via Roma 1, Milano"));
        assertTrue(senza.contains("href=\"" + BASE + "/api/pubblico/mailing/u/" + TOKEN + "\""));
        assertTrue(senza.contains("preferenze-email/TOKCONTATTO?invio=" + TOKEN));

        String con = MailingComposizioneService.componiHtml("<p>Ciao <a href=\"{{link_disiscrizione}}\">esci</a></p>", null,
                valori(), BASE, TOKEN, null, true).html();
        assertFalse(con.contains("data-mailing-footer"));
        assertTrue(con.contains("href=\"" + BASE + "/api/pubblico/mailing/u/" + TOKEN + "\""));
        assertTrue(MailingComposizioneService.haLinkDisiscrizione("x {{ link_disiscrizione|Esci }} y"));
    }

    @Test
    void preheaderNascostoInCima() {
        String out = MailingComposizioneService.componiHtml("<p>Corpo</p>{{link_disiscrizione}}", "Anteprima <breve>", valori(),
                BASE, TOKEN, null, true).html();
        int pre = out.indexOf("data-mailing-preheader");
        assertTrue(pre > 0 && pre < out.indexOf("Corpo"));
        assertTrue(out.contains("Anteprima &lt;breve&gt;"));
    }

    @Test
    void mimeConHeaderListUnsubscribeEMessageIdDelMittente() throws Exception {
        MailingMittente m = MailingMittente.builder().email("news@studio.it").nomeVisualizzato("Dr. Edoardo Bo")
                .rispondiA("info@studio.it").build();
        String messageId = MailingComposizioneService.nuovoMessageId(TOKEN, m.getEmail());
        assertTrue(messageId.matches("<\\d+\\." + TOKEN + "@studio\\.it>"));
        Map<String, String> header = MailingComposizioneService.headerTracciati(BASE, TOKEN, m.getEmail(), "c12");
        String html = MailingComposizioneService.componiHtml("<p>Ciao <a href=\"https://a.it\">sito</a></p>", "pre", valori(),
                BASE, TOKEN, MailingComposizioneService.pixel(BASE, TOKEN), true).html();
        MimeMessage msg = MailingComposizioneService.costruisciMime(m, "maria@esempio.it", "Maria Rossi",
                "Novità di ottobre è qui", html, messageId, header);
        msg.saveChanges();

        assertEquals(messageId, msg.getMessageID());
        assertEquals("<" + BASE + "/api/pubblico/mailing/u/" + TOKEN + ">, <mailto:news@studio.it?subject=unsubscribe>",
                msg.getHeader("List-Unsubscribe", null));
        assertEquals("List-Unsubscribe=One-Click", msg.getHeader("List-Unsubscribe-Post", null));
        assertEquals(TOKEN, msg.getHeader("X-Mailing-Token", null));
        assertNull(msg.getHeader("Precedence"));
        assertEquals("info@studio.it", msg.getReplyTo()[0].toString());
        assertEquals("Novità di ottobre è qui", msg.getSubject());
        assertTrue(msg.getHeader("Subject", null).startsWith("=?UTF-8?"));

        MimeMultipart alt = (MimeMultipart) msg.getContent();
        assertTrue(alt.getContentType().startsWith("multipart/alternative"));
        assertTrue(alt.getBodyPart(0).isMimeType("text/plain"));
        assertTrue(alt.getBodyPart(1).isMimeType("text/html"));
        String testo = (String) alt.getBodyPart(0).getContent();
        assertTrue(testo.contains("sito (" + BASE + "/api/pubblico/mailing/c/" + TOKEN + "/0)"), testo);
        assertFalse(testo.contains(".gif"));
        assertFalse(testo.contains("pre "));

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        msg.writeTo(out);
        assertTrue(out.toString(StandardCharsets.UTF_8).contains("Message-ID: " + messageId));
    }

    @Test
    void utmAggiunteSoloSeServono() {
        assertEquals("https://a.it/x?utm_source=email&utm_medium=email&utm_campaign=ottobre+2026#top",
                MailingComposizioneService.conUtm("https://a.it/x#top", "ottobre 2026"));
        assertEquals("https://a.it/?p=1&utm_source=email&utm_medium=email&utm_campaign=c",
                MailingComposizioneService.conUtm("https://a.it/?p=1", "c"));
        assertEquals("https://a.it/?utm_source=x", MailingComposizioneService.conUtm("https://a.it/?utm_source=x", "c"));
        assertEquals("https://a.it", MailingComposizioneService.conUtm("https://a.it", null));
    }

    @Test
    void prossimaVisitaInItaliano() {
        assertEquals("mercoledì 28 ottobre alle 15:30",
                MailingComposizioneService.formattaVisita(LocalDate.of(2026, 10, 28), LocalTime.of(15, 30)));
        assertNotNull(MailingComposizioneService.esempio().nome());
    }
}
