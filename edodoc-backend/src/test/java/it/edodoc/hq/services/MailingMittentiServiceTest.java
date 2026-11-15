package it.edodoc.hq.services;

import com.google.api.services.gmail.model.SendAs;
import it.edodoc.hq.dto.MailingDto;
import it.edodoc.hq.models.MailingMittente;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.function.Function;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class MailingMittentiServiceTest {

    @Test
    void capacitaMinimoTraQuotaGiornalieraEAlMinuto() {
        assertEquals(20, MailingMittentiService.capacita(1500, 0, 20, 0));
        assertEquals(5, MailingMittentiService.capacita(1500, 1495, 20, 0));
        assertEquals(3, MailingMittentiService.capacita(1500, 100, 20, 17));
        assertEquals(0, MailingMittentiService.capacita(1500, 1500, 20, 0));
        assertEquals(0, MailingMittentiService.capacita(1500, 1600, 20, 0));
        assertEquals(0, MailingMittentiService.capacita(1500, 0, 20, 25));
    }

    private static Function<String, List<String>> dns(Map<String, List<String>> record) {
        return nome -> record.getOrDefault(nome, List.of());
    }

    private static String esito(List<MailingDto.Controllo> c, String chiave) {
        return c.stream().filter(x -> x.chiave().equals(chiave)).findFirst().orElseThrow().esito();
    }

    @Test
    void dnsWorkspaceTuttoOk() {
        List<MailingDto.Controllo> c = MailingMittentiService.controlliDns("studio.it", MailingMittente.Canale.GMAIL_API, dns(Map.of(
                "studio.it", List.of("google-site-verification=abc", "v=spf1 include:_spf.google.com ~all"),
                "google._domainkey.studio.it", List.of("v=DKIM1; k=rsa; p=MIIBIjAN"),
                "_dmarc.studio.it", List.of("v=DMARC1; p=quarantine; rua=mailto:d@studio.it"))));
        assertEquals("OK", esito(c, "spf"));
        assertEquals("OK", esito(c, "dkim"));
        assertEquals("OK", esito(c, "dmarc"));
    }

    @Test
    void aliasConfermatoMancanteOInAttesa() {
        String email = "studio@secondario.it";
        String casella = "studio@principale.it";
        SendAs principale = new SendAs().setSendAsEmail(casella);
        assertEquals("OK", MailingMittentiService.controlloAlias(email, casella,
                List.of(principale, new SendAs().setSendAsEmail("Studio@Secondario.it").setVerificationStatus("accepted"))).esito());
        assertEquals("OK", MailingMittentiService.controlloAlias(email, casella,
                List.of(principale, new SendAs().setSendAsEmail(email))).esito());
        assertEquals("ERRORE", MailingMittentiService.controlloAlias(email, casella,
                List.of(principale, new SendAs().setSendAsEmail(email).setVerificationStatus("pending"))).esito());
        assertEquals("ERRORE", MailingMittentiService.controlloAlias(email, casella, List.of(principale)).esito());
        assertEquals("AVVISO", MailingMittentiService.controlloAlias(email, casella, null).esito());
    }

    @Test
    void dnsSpfConGoogleDentroUnInclude() {
        List<MailingDto.Controllo> c = MailingMittentiService.controlliDns("studio.it", MailingMittente.Canale.GMAIL_API, dns(Map.of(
                "studio.it", List.of("v=spf1 include:dc-abc._spfm.studio.it ~all"),
                "dc-abc._spfm.studio.it", List.of("v=spf1 include:_spf.google.com ~all"))));
        assertEquals("OK", esito(c, "spf"));
    }

    @Test
    void dnsSpfIncludeCircolareNonSiBlocca() {
        List<MailingDto.Controllo> c = MailingMittentiService.controlliDns("studio.it", MailingMittente.Canale.GMAIL_API, dns(Map.of(
                "studio.it", List.of("v=spf1 include:a.studio.it ~all"),
                "a.studio.it", List.of("v=spf1 include:b.studio.it ~all"),
                "b.studio.it", List.of("v=spf1 include:a.studio.it ~all"))));
        assertEquals("ERRORE", esito(c, "spf"));
    }

    @Test
    void dnsSenzaGoogleNelloSpfESenzaDkimEDmarc() {
        List<MailingDto.Controllo> c = MailingMittentiService.controlliDns("studio.it", MailingMittente.Canale.SMTP_RELAY_GOOGLE,
                dns(Map.of("studio.it", List.of("v=spf1 include:spf.aruba.it -all"))));
        assertEquals("ERRORE", esito(c, "spf"));
        assertEquals("ERRORE", esito(c, "dkim"));
        assertEquals("ERRORE", esito(c, "dmarc"));
    }

    @Test
    void dnsDmarcNoneEAvvisoSpfDoppioErrore() {
        List<MailingDto.Controllo> c = MailingMittentiService.controlliDns("studio.it", MailingMittente.Canale.GMAIL_API, dns(Map.of(
                "studio.it", List.of("v=spf1 include:_spf.google.com ~all", "v=spf1 a mx ~all"),
                "_dmarc.studio.it", List.of("v=DMARC1; p=none"))));
        assertEquals("ERRORE", esito(c, "spf"));
        assertEquals("AVVISO", esito(c, "dmarc"));
    }

    @Test
    void dnsSmtpEsternoDkimSoloAvviso() {
        List<MailingDto.Controllo> c = MailingMittentiService.controlliDns("altro.it", MailingMittente.Canale.SMTP, dns(Map.of(
                "altro.it", List.of("v=spf1 include:spf.provider.it ~all"))));
        assertEquals("OK", esito(c, "spf"));
        assertEquals("AVVISO", esito(c, "dkim"));
    }

    @Test
    void txtSpezzatiRiuniti() {
        assertEquals("v=DKIM1; k=rsa; p=MIIBabc", MailingMittentiService.unisciTxt("\"v=DKIM1; k=rsa; \" \"p=MIIBabc\""));
        assertEquals("v=spf1 ~all", MailingMittentiService.unisciTxt("v=spf1 ~all"));
    }

    @Test
    void emailMittenteValidata() {
        assertEquals("news@studio.it", MailingMittentiService.emailValida(" News@Studio.it ", "x"));
        assertThrows(IllegalArgumentException.class, () -> MailingMittentiService.emailValida("non-email", "x"));
    }
}
