package it.edodoc.hq.services;

import com.google.api.client.util.Base64;
import com.google.api.services.gmail.model.Message;
import com.google.api.services.gmail.model.MessagePart;
import com.google.api.services.gmail.model.MessagePartBody;
import com.google.api.services.gmail.model.MessagePartHeader;
import it.edodoc.hq.dto.CasellaDto;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Properties;

import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;

import static org.assertj.core.api.Assertions.assertThat;

class CasellaMimeTest {

    private static MessagePartHeader header(String nome, String valore) {
        return new MessagePartHeader().setName(nome).setValue(valore);
    }

    private static MessagePart parte(String mime, String testo) {
        return new MessagePart().setMimeType(mime)
                .setHeaders(List.of(header("Content-Type", mime + "; charset=utf-8")))
                .setBody(new MessagePartBody().setData(Base64.encodeBase64URLSafeString(testo.getBytes(StandardCharsets.UTF_8))));
    }

    private static Message messaggio(MessagePart corpo, List<String> etichette) {
        corpo.setHeaders(new java.util.ArrayList<>(corpo.getHeaders() != null ? corpo.getHeaders() : List.of()));
        corpo.getHeaders().add(header("From", "Marta Verdi <marta@esempio.it>"));
        corpo.getHeaders().add(header("To", "edoardo@edodoc.it, \"Rossi, Anna\" <anna@esempio.it>"));
        corpo.getHeaders().add(header("Subject", "Visita"));
        return new Message().setId("m1").setThreadId("t1").setInternalDate(1000L).setLabelIds(etichette).setPayload(corpo);
    }

    @Test
    void multipart_sceglieHtmlEIndirizzi() throws Exception {
        MessagePart radice = new MessagePart().setMimeType("multipart/alternative")
                .setParts(List.of(parte("text/plain", "Ciao"), parte("text/html", "<p>Ciao <b>Edoardo</b></p>")));
        CasellaDto.Messaggio m = CasellaMime.messaggio(messaggio(radice, List.of("INBOX", "UNREAD")), (a, b) -> new byte[0]);
        assertThat(m.html()).contains("<b>Edoardo</b>");
        assertThat(m.testo()).isEqualTo("Ciao");
        assertThat(m.da().nome()).isEqualTo("Marta Verdi");
        assertThat(m.a()).hasSize(2);
        assertThat(m.a().get(1).nome()).isEqualTo("Rossi, Anna");
        assertThat(m.nonLetto()).isTrue();
    }

    @Test
    void soloTesto_diventaHtmlConLink() throws Exception {
        CasellaDto.Messaggio m = CasellaMime.messaggio(messaggio(parte("text/plain", "Vedi https://esempio.it <ok>"), List.of()), (a, b) -> new byte[0]);
        assertThat(m.html()).contains("href=\"https://esempio.it\"").contains("&lt;ok&gt;");
    }

    @Test
    void allegato_vieneElencatoEImmagineInlineSiIncorpora() throws Exception {
        MessagePart allegato = new MessagePart().setMimeType("application/pdf").setFilename("esami.pdf")
                .setBody(new MessagePartBody().setAttachmentId("a1").setSize(10));
        MessagePart immagine = new MessagePart().setMimeType("image/png").setFilename("logo.png")
                .setHeaders(List.of(header("Content-ID", "<img1>")))
                .setBody(new MessagePartBody().setAttachmentId("a2").setSize(3));
        MessagePart radice = new MessagePart().setMimeType("multipart/mixed")
                .setParts(List.of(parte("text/html", "<img src=\"cid:img1\">"), allegato, immagine));
        CasellaDto.Messaggio m = CasellaMime.messaggio(messaggio(radice, List.of()), (a, b) -> new byte[]{1, 2, 3});
        assertThat(m.html()).contains("data:image/png;base64,");
        assertThat(m.allegati()).extracting(CasellaDto.Allegato::nome).containsExactly("esami.pdf");
    }

    @Test
    void lettura_togliScriptEGestoriMaTieneStiliELink() {
        String pulito = CasellaMime.sanificaLettura("<style>p{color:red}</style><p onclick=\"x()\">Ciao</p><script>x()</script>"
                + "<iframe src=\"https://x\"></iframe><form action=\"https://x\"><input></form><a href=\"javascript:x()\">a</a>"
                + "<a href=\" JavaScript:x()\">b</a><a href=\"https://ok.it\">c</a><img src=\"data:image/png;base64,AA\">");
        assertThat(pulito).contains("<style>").contains(">Ciao<").contains("https://ok.it").contains("data:image/png")
                .doesNotContain("<script").doesNotContain("onclick").doesNotContain("iframe").doesNotContain("<form")
                .doesNotContainIgnoringCase("javascript:");
    }

    @Test
    void risposta_portaIntestazioniDelThreadEAllegato() throws Exception {
        CasellaDto.Composizione c = new CasellaDto.Composizione(List.of("Marta Verdi <marta@esempio.it>"), List.of(), List.of(), "Re: Visita",
                "<p>Va bene</p>", "t1", "<id1@x>", "<id0@x>", List.of(), null);
        String raw = CasellaMime.componi("edoardo@edodoc.it", "Dott. Edoardo Bo", c,
                List.of(new CasellaMime.FileAllegato("nota.txt", "text/plain", new byte[]{65})));
        MimeMessage letto = new MimeMessage(Session.getInstance(new Properties()),
                new ByteArrayInputStream(java.util.Base64.getUrlDecoder().decode(raw)));
        assertThat(letto.getHeader("In-Reply-To", null)).isEqualTo("<id1@x>");
        assertThat(letto.getHeader("References", null)).isEqualTo("<id0@x> <id1@x>");
        assertThat(letto.getSubject()).isEqualTo("Re: Visita");
        assertThat(letto.getContentType()).startsWith("multipart/mixed");
    }
}
