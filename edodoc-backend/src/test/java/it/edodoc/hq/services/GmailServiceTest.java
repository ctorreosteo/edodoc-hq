package it.edodoc.hq.services;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

class GmailServiceTest {

    private static String mime(CorpoEmail corpo, byte[] allegato) throws Exception {
        return new String(GmailService.mime("edoardo@edodoc.it", "giulia@esempio.it", "La tua fattura n. 442",
                corpo, allegato != null ? "442_Ferrari.pdf" : null, allegato), StandardCharsets.UTF_8);
    }

    @Test
    void mime_contieneDestinatarioEAllegatoPdf() throws Exception {
        assertThat(mime(CorpoEmail.da("Ciao Giulia"), new byte[]{1, 2, 3}))
                .contains("To: giulia@esempio.it").contains("application/pdf").contains("442_Ferrari.pdf");
    }

    @Test
    void corpoFormattato_viaggiaInHtmlEInTestoAccantoAllAllegato() throws Exception {
        String grezzo = mime(CorpoEmail.da("<p>Ciao <strong>Giulia</strong></p>"), new byte[]{1});
        assertThat(grezzo).contains("multipart/alternative").contains("text/plain").contains("text/html")
                .contains("multipart/mixed").contains("application/pdf");
    }
}
