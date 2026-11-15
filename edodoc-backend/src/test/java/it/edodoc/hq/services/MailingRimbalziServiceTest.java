package it.edodoc.hq.services;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MailingRimbalziServiceTest {

    /** DSN di Gmail per indirizzo inesistente (struttura reale: multipart/report con delivery-status e header originali). */
    static final String DSN_GMAIL_511 = """
            Delivered-To: news@edodoc.it
            Return-Path: <>
            From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>
            To: news@edodoc.it
            Auto-Submitted: auto-replied
            Subject: Delivery Status Notification (Failure)
            References: <1761390000000.AbCdEfGhIjKlMnOpQrStUvWx@edodoc.it>
            In-Reply-To: <1761390000000.AbCdEfGhIjKlMnOpQrStUvWx@edodoc.it>
            X-Failed-Recipients: inesistente.davvero@gmail.com
            Message-ID: <6718a9c2.050a0220.1b5c3.0001.GMR@mx.google.com>
            Date: Sat, 25 Oct 2026 03:12:35 -0700 (PDT)
            MIME-Version: 1.0
            Content-Type: multipart/report; boundary="0000000000002f6b9e0625a1c3d4"; report-type=delivery-status

            --0000000000002f6b9e0625a1c3d4
            Content-Type: text/plain; charset="UTF-8"

            ** Address not found **

            Your message wasn't delivered to inesistente.davvero@gmail.com because the address couldn't be found, or is unable to receive mail.

            The response from the remote server was:
            550 5.1.1 The email account that you tried to reach does not exist. Please try double-checking the recipient's email address for typos or unnecessary spaces. https://support.google.com/mail/?p=NoSuchUser

            --0000000000002f6b9e0625a1c3d4
            Content-Type: message/delivery-status

            Reporting-MTA: dns; googlemail.com
            Received-From-MTA: dns; news@edodoc.it
            Arrival-Date: Sat, 25 Oct 2026 03:12:34 -0700 (PDT)
            X-Original-Message-ID: <1761390000000.AbCdEfGhIjKlMnOpQrStUvWx@edodoc.it>

            Final-Recipient: rfc822; inesistente.davvero@gmail.com
            Action: failed
            Status: 5.1.1
            Remote-MTA: dns; gmail-smtp-in.l.google.com. (142.250.27.26, the server for the domain gmail.com.)
            Diagnostic-Code: smtp; 550-5.1.1 The email account that you tried to reach does not exist.
            Last-Attempt-Date: Sat, 25 Oct 2026 03:12:35 -0700 (PDT)

            --0000000000002f6b9e0625a1c3d4
            Content-Type: text/rfc822-headers

            From: Studio Mobilitas <news@edodoc.it>
            To: Inesistente <inesistente.davvero@gmail.com>
            Subject: =?UTF-8?Q?Novit=C3=A0_di_ottobre?=
            Message-ID: <1761390000000.AbCdEfGhIjKlMnOpQrStUvWx@edodoc.it>
            X-Mailing-Token: AbCdEfGhIjKlMnOpQrStUvWx
            List-Unsubscribe-Post: List-Unsubscribe=One-Click

            --0000000000002f6b9e0625a1c3d4--
            """.replace("\n", "\r\n");

    /** DSN di Gmail per casella piena (4.2.2): il messaggio originale è allegato come message/rfc822. */
    static final String DSN_GMAIL_422 = """
            From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>
            To: news@edodoc.it
            Subject: Delivery Status Notification (Failure)
            X-Failed-Recipients: piena@gmail.com
            MIME-Version: 1.0
            Content-Type: multipart/report; boundary="b422"; report-type=delivery-status

            --b422
            Content-Type: text/plain; charset="UTF-8"

            ** Message not delivered **

            Your message couldn't be delivered to piena@gmail.com because the remote server is misconfigured.

            The response was:
            452 4.2.2 The recipient's inbox is out of storage space. Please direct the recipient to https://support.google.com/mail/?p=OverQuotaTemp

            --b422
            Content-Type: message/delivery-status

            Reporting-MTA: dns; googlemail.com

            Final-Recipient: rfc822; piena@gmail.com
            Action: failed
            Status: 4.2.2
            Diagnostic-Code: smtp; 452-4.2.2 The recipient's inbox is out of storage space.

            --b422
            Content-Type: message/rfc822

            From: Studio Mobilitas <news@edodoc.it>
            To: piena@gmail.com
            Subject: Prova
            Message-ID: <1761390000001.ZyXwVuTsRqPoNmLkJiHgFeDc@edodoc.it>
            X-Mailing-Token: ZyXwVuTsRqPoNmLkJiHgFeDc
            Content-Type: text/plain; charset=UTF-8

            Ciao

            --b422--
            """.replace("\n", "\r\n");

    static final String DSN_RITARDO = """
            From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>
            Subject: Delivery Status Notification (Delay)
            MIME-Version: 1.0
            Content-Type: multipart/report; boundary="bd"; report-type=delivery-status

            --bd
            Content-Type: message/delivery-status

            Final-Recipient: rfc822; lento@esempio.it
            Action: delayed
            Status: 4.4.1

            --bd--
            """.replace("\n", "\r\n");

    @Test
    void dsnGmail511PermanenteConTokenEMessageId() {
        MailingRimbalziService.EsitoDsn e = MailingRimbalziService.analizzaDsn(DSN_GMAIL_511.getBytes(StandardCharsets.UTF_8));
        assertEquals(MailingRimbalziService.TipoRimbalzo.PERMANENTE, e.tipo());
        assertEquals("5.1.1", e.codice());
        assertEquals("inesistente.davvero@gmail.com", e.destinatario());
        assertEquals("AbCdEfGhIjKlMnOpQrStUvWx", e.token());
        assertEquals("<1761390000000.AbCdEfGhIjKlMnOpQrStUvWx@edodoc.it>", e.messageIdOriginale());
        assertTrue(e.diagnostica().contains("does not exist"));
    }

    @Test
    void dsnGmail422TemporaneoConTokenDalMessaggioAllegato() {
        MailingRimbalziService.EsitoDsn e = MailingRimbalziService.analizzaDsn(DSN_GMAIL_422.getBytes(StandardCharsets.UTF_8));
        assertEquals(MailingRimbalziService.TipoRimbalzo.TEMPORANEO, e.tipo());
        assertEquals("4.2.2", e.codice());
        assertEquals("piena@gmail.com", e.destinatario());
        assertEquals("ZyXwVuTsRqPoNmLkJiHgFeDc", e.token());
    }

    @Test
    void ritardoNonContaComeRimbalzo() {
        MailingRimbalziService.EsitoDsn e = MailingRimbalziService.analizzaDsn(DSN_RITARDO.getBytes(StandardCharsets.UTF_8));
        assertEquals(MailingRimbalziService.TipoRimbalzo.RITARDO, e.tipo());
        assertNull(e.token());
    }

    @Test
    void dsnInTestoSempliceSenzaDeliveryStatus() {
        String raw = ("From: MAILER-DAEMON@mail.libero.it\r\nSubject: Undelivered Mail\r\nX-Failed-Recipients: Mario@Libero.it\r\n"
                + "Content-Type: text/plain\r\n\r\nThis is the mail system.\r\n<mario@libero.it>: host said: 550 5.7.1 user unknown\r\n");
        MailingRimbalziService.EsitoDsn e = MailingRimbalziService.analizzaDsn(raw.getBytes(StandardCharsets.UTF_8));
        assertEquals(MailingRimbalziService.TipoRimbalzo.PERMANENTE, e.tipo());
        assertEquals("5.7.1", e.codice());
        assertEquals("mario@libero.it", e.destinatario());
    }

    @Test
    void idCitatiDaInReplyToEReferences() {
        List<String> ids = MailingRimbalziService.idCitati("<a.1@x.it>", "<z@y.it> <a.1@x.it>\r\n <b@x.it>");
        assertEquals(List.of("<a.1@x.it>", "<z@y.it>", "<b@x.it>"), ids);
        assertTrue(MailingRimbalziService.idCitati(null, null).isEmpty());
    }

    @Test
    void richiesteDiDisiscrizioneViaEmail() {
        assertTrue(MailingRimbalziService.richiestaDisiscrizione("unsubscribe"));
        assertTrue(MailingRimbalziService.richiestaDisiscrizione(" Unsubscribe "));
        assertTrue(MailingRimbalziService.richiestaDisiscrizione("Re: unsubscribe"));
        assertFalse(MailingRimbalziService.richiestaDisiscrizione("Re: Novità di ottobre"));
        assertFalse(MailingRimbalziService.richiestaDisiscrizione(null));
    }

    @Test
    void punteggioLimitatoTraZeroECento() {
        assertEquals(40, MailingRimbalziService.punteggio(0, 0, 0, 0));
        assertEquals(100, MailingRimbalziService.punteggio(10, 5, 1, 0));
        assertEquals(0, MailingRimbalziService.punteggio(0, 0, 0, 20));
        assertEquals(58, MailingRimbalziService.punteggio(2, 1, 0, 1));
    }
}
