package it.edodoc.hq.services;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MailingTracciamentoServiceTest {

    private static final LocalDateTime INVIATO = LocalDateTime.of(2026, 10, 25, 9, 0, 0);
    private static final String IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
    private static final String GMAIL_PROXY = "Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)";

    @Test
    void aperturaUmanaDaIphoneEGmail() {
        assertFalse(MailingTracciamentoService.aperturaAutomatica(IPHONE, "93.40.1.2", INVIATO, INVIATO.plusMinutes(30)));
        assertFalse(MailingTracciamentoService.aperturaAutomatica(GMAIL_PROXY, "66.249.84.1", INVIATO, INVIATO.plusMinutes(5)));
    }

    @Test
    void aperturaAutomaticaEntroDueSecondiDallInvio() {
        assertTrue(MailingTracciamentoService.aperturaAutomatica(IPHONE, "93.40.1.2", INVIATO, INVIATO.plusNanos(1_500_000_000L)));
        assertTrue(MailingTracciamentoService.aperturaAutomatica(GMAIL_PROXY, "66.249.84.1", INVIATO, INVIATO.plusSeconds(1)));
    }

    @Test
    void aperturaAutomaticaDaScannerEAppleMailPrivacy() {
        assertTrue(MailingTracciamentoService.aperturaAutomatica("Barracuda Sentinel (EE)", "1.2.3.4", INVIATO, INVIATO.plusHours(1)));
        assertTrue(MailingTracciamentoService.aperturaAutomatica("python-requests/2.31", "1.2.3.4", INVIATO, INVIATO.plusHours(1)));
        assertTrue(MailingTracciamentoService.aperturaAutomatica("Mozilla/5.0", "17.58.1.1", INVIATO, INVIATO.plusHours(1)));
        assertTrue(MailingTracciamentoService.aperturaAutomatica("Mozilla/5.0", "104.28.1.1", INVIATO, INVIATO.plusHours(1)));
        assertTrue(MailingTracciamentoService.aperturaAutomatica("", "1.2.3.4", INVIATO, INVIATO.plusHours(1)));
        assertTrue(MailingTracciamentoService.aperturaAutomatica(null, "1.2.3.4", INVIATO, INVIATO.plusHours(1)));
    }

    @Test
    void clickAutomaticoDaScannerORapido() {
        assertTrue(MailingTracciamentoService.clickAutomatico("Mimecast URL Protect", INVIATO, INVIATO.plusHours(1)));
        assertTrue(MailingTracciamentoService.clickAutomatico(IPHONE, INVIATO, INVIATO.plusSeconds(1)));
        assertFalse(MailingTracciamentoService.clickAutomatico(IPHONE, INVIATO, INVIATO.plusMinutes(3)));
    }

    @Test
    void dispositivoEClient() {
        assertEquals("MOBILE", MailingTracciamentoService.dispositivo(IPHONE));
        assertEquals("TABLET", MailingTracciamentoService.dispositivo("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"));
        assertEquals("DESKTOP", MailingTracciamentoService.dispositivo("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120"));
        assertEquals("SCONOSCIUTO", MailingTracciamentoService.dispositivo(null));
        assertEquals("Gmail", MailingTracciamentoService.client(GMAIL_PROXY));
        assertEquals("Apple Mail", MailingTracciamentoService.client(IPHONE));
        assertEquals("Outlook", MailingTracciamentoService.client("Microsoft Office/16.0 (Windows NT 10.0; Microsoft Outlook 16.0.17126)"));
        assertEquals("Chrome", MailingTracciamentoService.client("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36"));
    }

    @Test
    void redirectSoloVersoUrlRegistratiHttp() {
        assertEquals(MailingComposizioneService.HOME_SITO, MailingTracciamentoService.destinazioneSicura(null, null));
        assertEquals(MailingComposizioneService.HOME_SITO, MailingTracciamentoService.destinazioneSicura("javascript:alert(1)", null));
        assertEquals(MailingComposizioneService.HOME_SITO, MailingTracciamentoService.destinazioneSicura("//evil.com", null));
        assertEquals(MailingComposizioneService.HOME_SITO, MailingTracciamentoService.destinazioneSicura("https://", null));
        assertEquals(MailingComposizioneService.HOME_SITO, MailingTracciamentoService.destinazioneSicura("data:text/html,x", null));
        assertEquals("https://www.edodoc.it/blog", MailingTracciamentoService.destinazioneSicura(" https://www.edodoc.it/blog ", null));
        assertEquals("https://a.it/?utm_source=email&utm_medium=email&utm_campaign=ott",
                MailingTracciamentoService.destinazioneSicura("https://a.it/", "ott"));
    }

    @Test
    void emailMascherataENomeBreve() {
        assertEquals("ma***@gmail.com", MailingTracciamentoService.mascheraEmail("maria.rossi@gmail.com"));
        assertEquals("a***@x.it", MailingTracciamentoService.mascheraEmail("a@x.it"));
        assertEquals("Maria R.", MailingTracciamentoService.nomeBreve("Maria", "rossi", "m@x.it"));
        assertEquals("ma***@x.it", MailingTracciamentoService.nomeBreve(null, null, "maria@x.it"));
        assertEquals("Maria R. ha aperto «Novità di ottobre»",
                MailingTracciamentoService.messaggio("APERTURA", "Maria R.", "Novità di ottobre", null));
        assertEquals("Ciao, novità", MailingTracciamentoService.oggettoLeggibile("Ciao{{nome|}}, novità"));
    }

    @Test
    void limitePerIpAlMinuto() {
        MailingRateLimiter r = new MailingRateLimiter();
        long t = 1_000_000L * 60_000L;
        for (int i = 0; i < 10; i++) {
            assertTrue(r.consenti("pref", "1.1.1.1", 10, t + i));
        }
        assertFalse(r.consenti("pref", "1.1.1.1", 10, t + 100));
        assertTrue(r.consenti("pref", "2.2.2.2", 10, t + 100));
        assertTrue(r.consenti("pixel", "1.1.1.1", 10, t + 100));
        assertTrue(r.consenti("pref", "1.1.1.1", 10, t + 60_000));
    }
}
