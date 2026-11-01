package it.edodoc.hq.services;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class CorpoEmailTest {

    @Test
    void togliScriptEGestoriMaTieneLaFormattazione() {
        CorpoEmail corpo = CorpoEmail.da("<p onclick=\"x()\">Ciao <strong>Giulia</strong><script>alert(1)</script></p>");
        assertThat(corpo.html()).contains("<strong>Giulia</strong>").doesNotContain("script").doesNotContain("onclick");
        assertThat(corpo.testo()).isEqualTo("Ciao Giulia");
    }

    @Test
    void testoSemplice_restaSenzaHtml() {
        CorpoEmail corpo = CorpoEmail.da("Ciao Giulia");
        assertThat(corpo.html()).isNull();
        assertThat(corpo.testo()).isEqualTo("Ciao Giulia");
    }
}
