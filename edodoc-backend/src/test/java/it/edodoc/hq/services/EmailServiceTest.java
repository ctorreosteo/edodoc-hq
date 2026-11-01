package it.edodoc.hq.services;

import it.edodoc.hq.dto.EmailDto;
import it.edodoc.hq.exception.ConflittoException;
import it.edodoc.hq.models.Fattura;
import it.edodoc.hq.models.Pagamento;
import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.repositories.FatturaRepository;
import it.edodoc.hq.repositories.PagamentoRepository;
import it.edodoc.hq.repositories.PazienteRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class EmailServiceTest {

    private final PazienteRepository pazienti = mock(PazienteRepository.class);
    private final PagamentoRepository pagamenti = mock(PagamentoRepository.class);
    private final FatturaRepository fatture = mock(FatturaRepository.class);
    private final ConfigService config = mock(ConfigService.class);
    private final FatturaPdfService pdf = mock(FatturaPdfService.class);
    private final GmailService gmail = mock(GmailService.class);
    private final EmailService service = new EmailService(pazienti, pagamenti, fatture, config, pdf, gmail);
    private final Paziente paziente = new Paziente();

    @BeforeEach
    void prepara() {
        paziente.setId(1L);
        paziente.setNome("Giulia");
        paziente.setCognome("Ferrari");
        paziente.setEmail("giulia@esempio.it");
        when(pazienti.findByIdAndAttivoTrue(1L)).thenReturn(Optional.of(paziente));
        when(config.get("EMAIL_SOLLECITO_OGGETTO")).thenReturn("Promemoria");
        when(config.get("EMAIL_SOLLECITO_TESTO")).thenReturn("Ciao {nome}: {dettaglio} Totale {totale}, IBAN {iban}");
        when(config.get("EMITTENTE_IBAN")).thenReturn("IT00");
        when(config.get("FATTURA_EMAIL_OGGETTO")).thenReturn("Fattura {numero}");
        when(config.get("FATTURA_EMAIL_TESTO")).thenReturn("Ciao {nome}");
    }

    private Pagamento pagamento(String importo, LocalDate scadenza) {
        Pagamento p = new Pagamento();
        p.setId(5L);
        p.setPaziente(paziente);
        p.setDescrizione("Rata");
        p.setImporto(new BigDecimal(importo));
        p.setScadenza(scadenza);
        return p;
    }

    private Fattura fattura() {
        Fattura f = new Fattura();
        f.setId(9L);
        f.setNumero(442);
        f.setPaziente(paziente);
        return f;
    }

    private static EmailDto.Richiesta richiesta(EmailDto.Tipo tipo, Long pazienteId, Long pagamentoId, Long fatturaId) {
        return new EmailDto.Richiesta(tipo, pazienteId, pagamentoId, fatturaId);
    }

    @Test
    void sollecitoDelPaziente_preferisceLeRateScadute() {
        when(pagamenti.findDelPaziente(1L)).thenReturn(List.of(
                pagamento("700", LocalDate.now().minusDays(3)), pagamento("100", LocalDate.now().plusDays(30))));
        EmailDto.Bozza bozza = service.bozza(richiesta(EmailDto.Tipo.SOLLECITO_PAGAMENTO, 1L, null, null));
        assertThat(bozza.destinatario()).isEqualTo("giulia@esempio.it");
        assertThat(bozza.testo()).contains("Ciao Giulia").contains("700,00 €").contains("IT00").doesNotContain("100,00 €");
        assertThat(bozza.allegato()).isNull();
    }

    @Test
    void sollecitoSenzaRateAperte_vieneRifiutato() {
        when(pagamenti.findDelPaziente(1L)).thenReturn(List.of());
        assertThatThrownBy(() -> service.bozza(richiesta(EmailDto.Tipo.SOLLECITO_PAGAMENTO, 1L, null, null)))
                .isInstanceOf(ConflittoException.class);
    }

    @Test
    void invio_usaIlTestoModificatoEAllegaLaFattura() throws Exception {
        Fattura fattura = fattura();
        when(fatture.findConDettagli(9L)).thenReturn(Optional.of(fattura));
        when(pdf.genera(fattura)).thenReturn(new byte[]{1});

        service.invia(new EmailDto.Invia(EmailDto.Tipo.FATTURA, 1L, null, 9L, "altro@esempio.it", "Oggetto\r\nmio", "<p>Testo mio</p>"));

        ArgumentCaptor<CorpoEmail> corpo = ArgumentCaptor.forClass(CorpoEmail.class);
        verify(gmail).invia(eq("altro@esempio.it"), eq("Oggetto mio"), corpo.capture(), eq(fattura.getNomeFile()), any());
        assertThat(corpo.getValue().testo()).isEqualTo("Testo mio");
        assertThat(fattura.getEmailDestinatario()).isEqualTo("altro@esempio.it");
        assertThat(fattura.getEmailInviataIl()).isNotNull();
    }

    @Test
    void invioFallito_nonSegnaLaFatturaComeInviata() throws Exception {
        Fattura fattura = fattura();
        when(fatture.findConDettagli(9L)).thenReturn(Optional.of(fattura));
        when(pdf.genera(fattura)).thenReturn(new byte[]{1});
        org.mockito.Mockito.doThrow(new IllegalStateException("no")).when(gmail).invia(anyString(), anyString(), any(), any(), any());

        assertThatThrownBy(() -> service.invia(new EmailDto.Invia(EmailDto.Tipo.FATTURA, null, null, 9L, "a@b.it", "Ogg", "<p>x</p>")))
                .isInstanceOf(IllegalStateException.class);
        assertThat(fattura.getEmailInviataIl()).isNull();
    }

    @Test
    void fatturaAnnullata_nonSiInvia() {
        Fattura fattura = fattura();
        fattura.setStato(Fattura.Stato.ANNULLATA);
        when(fatture.findConDettagli(9L)).thenReturn(Optional.of(fattura));
        assertThatThrownBy(() -> service.bozza(richiesta(EmailDto.Tipo.FATTURA, null, null, 9L)))
                .isInstanceOf(ConflittoException.class);
        verify(gmail, never()).invia(any(), any(), any(), any(), any());
    }
}
