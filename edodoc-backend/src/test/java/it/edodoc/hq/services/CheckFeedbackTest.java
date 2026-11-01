package it.edodoc.hq.services;

import it.edodoc.hq.dto.CheckDto;
import it.edodoc.hq.exception.ConflittoException;
import it.edodoc.hq.exception.RisorsaNonTrovataException;
import it.edodoc.hq.models.CheckSettimanale;
import it.edodoc.hq.models.FeedbackAudio;
import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.repositories.CheckSettimanaleRepository;
import it.edodoc.hq.repositories.ContattoSettimanaRepository;
import it.edodoc.hq.repositories.FeedbackAudioRepository;
import it.edodoc.hq.repositories.PazienteRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CheckFeedbackTest {

    private static final byte[] M4A = "\0\0\0 ftypM4A ...audio...".getBytes(StandardCharsets.ISO_8859_1);

    private final CheckSettimanaleRepository checkRepository = mock(CheckSettimanaleRepository.class);
    private final FeedbackAudioRepository audioRepository = mock(FeedbackAudioRepository.class);
    private final EmailService emailService = mock(EmailService.class);
    private final ApplicationEventPublisher eventi = mock(ApplicationEventPublisher.class);
    private final CheckService service = new CheckService(checkRepository, mock(ContattoSettimanaRepository.class),
            mock(PazienteRepository.class), mock(ConfigService.class), eventi, audioRepository, emailService);

    private final Paziente paziente = new Paziente();
    private final CheckSettimanale check = new CheckSettimanale();

    @BeforeEach
    void prepara() {
        paziente.setId(7L);
        check.setId(3L);
        check.setPaziente(paziente);
        when(checkRepository.findById(3L)).thenReturn(Optional.of(check));
    }

    private static MockMultipartFile file(byte[] dati) {
        return new MockMultipartFile("file", "vocale.m4a", "application/octet-stream", dati);
    }

    @Test
    void soloVocale_contaComeFeedback() {
        CheckService.FeedbackInviato esito = service.rispondiConVocale(3L, file(M4A), 42, "  ", false);

        assertThat(check.haFeedback()).isTrue();
        assertThat(check.getFeedback()).isNull();
        assertThat(esito.check().feedbackAudioId()).isNotNull();
        assertThat(esito.check().feedbackAudioSecondi()).isEqualTo(42);
        assertThat(esito.check().feedbackIl()).isNotNull();
        assertThat(esito.check().feedbackLettoIl()).isNull();
        verify(eventi).publishEvent(any(Notifica.class));
    }

    @Test
    void soloVocale_bloccaLeModificheDelPaziente() {
        service.rispondiConVocale(3L, file(M4A), 42, null, false);

        assertThatThrownBy(() -> CheckService.verificaModificabile(check, CheckSettimanale.Fonte.APP))
                .isInstanceOf(ConflittoException.class);
    }

    @Test
    void soloVocale_ilPazientePuoSegnarloLetto() {
        check.setFeedbackAudioId(UUID.randomUUID());
        when(checkRepository.findByIdAndPazienteId(3L, 7L)).thenReturn(Optional.of(check));

        service.segnaFeedbackLetto(7L, 3L);

        assertThat(check.getFeedbackLettoIl()).isNotNull();
    }

    @Test
    void ilTestoSostituisceIlVocale_eLoCancella() {
        UUID vecchio = UUID.randomUUID();
        check.setFeedbackAudioId(vecchio);
        check.setFeedbackAudioSecondi(10);
        check.setFeedbackEmailIl(LocalDateTime.now());
        check.setFeedbackLettoIl(LocalDateTime.now());

        CheckService.FeedbackInviato esito = service.rispondi(3L, new CheckDto.Feedback(" Bravo ", null));

        assertThat(esito.check().feedback()).isEqualTo("Bravo");
        assertThat(esito.check().feedbackAudioId()).isNull();
        assertThat(esito.check().feedbackAudioSecondi()).isNull();
        assertThat(esito.check().feedbackEmailIl()).isNull();
        assertThat(esito.check().feedbackLettoIl()).isNull();
        assertThat(esito.messaggio()).isEqualTo("Feedback inviato");
        verify(audioRepository).deleteById(vecchio);
    }

    @Test
    void ilVocaleSostituisceIlVocale_eIlTesto() {
        UUID vecchio = UUID.randomUUID();
        check.setFeedback("Prima");
        check.setFeedbackAudioId(vecchio);

        service.rispondiConVocale(3L, file(M4A), 5, null, false);

        assertThat(check.getFeedback()).isNull();
        assertThat(check.getFeedbackAudioId()).isNotEqualTo(vecchio);
        verify(audioRepository).deleteById(vecchio);
    }

    @Test
    void senzaInviaEmail_nessunaEmail() {
        service.rispondi(3L, new CheckDto.Feedback("Bravo", null));
        verify(emailService, never()).inviaFeedback(any(), any(), anyBoolean());
    }

    @Test
    void conEmail_siRegistraLInvio() {
        CheckService.FeedbackInviato esito = service.rispondi(3L, new CheckDto.Feedback("Bravo", true));

        verify(emailService).inviaFeedback(paziente, "Bravo", false);
        assertThat(esito.check().feedbackEmailIl()).isNotNull();
    }

    @Test
    void perUnVocale_lEmailAvvisaSoltanto() {
        service.rispondiConVocale(3L, file(M4A), 5, "Ascolta", true);

        verify(emailService).inviaFeedback(paziente, "Ascolta", true);
    }

    @Test
    void emailFallita_ilFeedbackResta_eIlMessaggioLoDice() {
        doThrow(new ConflittoException("il paziente non ha un indirizzo email"))
                .when(emailService).inviaFeedback(any(), anyString(), anyBoolean());

        CheckService.FeedbackInviato esito = service.rispondi(3L, new CheckDto.Feedback("Bravo", true));

        assertThat(esito.check().feedback()).isEqualTo("Bravo");
        assertThat(esito.check().feedbackEmailIl()).isNull();
        assertThat(esito.messaggio()).contains("il paziente non ha un indirizzo email");
        verify(checkRepository).saveAndFlush(check);
        verify(eventi).publishEvent(any(Notifica.class));
    }

    @Test
    void fileCheNonEUnM4a_rifiutato_eNullaCambia() {
        assertThatThrownBy(() -> service.rispondiConVocale(3L, file("non sono audio".getBytes()), 5, null, false))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(check.haFeedback()).isFalse();
        verify(audioRepository, never()).save(any());
    }

    @Test
    void vocaleOltreICinqueMega_rifiutato() {
        byte[] troppoGrande = new byte[(int) CheckService.MASSIMO_BYTE_VOCALE + 1];
        System.arraycopy(M4A, 0, troppoGrande, 0, M4A.length);

        assertThatThrownBy(() -> service.rispondiConVocale(3L, file(troppoGrande), 5, null, false))
                .isInstanceOf(MaxUploadSizeExceededException.class);
        verify(audioRepository, never()).save(any());
    }

    @Test
    void durataNonValida_rifiutata() {
        assertThatThrownBy(() -> service.rispondiConVocale(3L, file(M4A), 0, null, false))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void testoTroppoLungoSulVocale_rifiutato() {
        assertThatThrownBy(() -> service.rispondiConVocale(3L, file(M4A), 5, "x".repeat(4001), false))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void vocaleDiUnAltroPaziente_nonEsiste() {
        when(checkRepository.findByIdAndPazienteId(3L, 8L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.vocaleDelFeedback(8L, 3L)).isInstanceOf(RisorsaNonTrovataException.class);
        verify(audioRepository, never()).findById(any());
    }

    @Test
    void vocaleDelPaziente_siLegge() {
        FeedbackAudio audio = new FeedbackAudio();
        audio.setId(UUID.randomUUID());
        audio.setDati(M4A);
        check.setFeedbackAudioId(audio.getId());
        when(checkRepository.findByIdAndPazienteId(3L, 7L)).thenReturn(Optional.of(check));
        when(audioRepository.findById(eq(audio.getId()))).thenReturn(Optional.of(audio));

        assertThat(service.vocaleDelFeedback(7L, 3L)).isEqualTo(M4A);
    }

    @Test
    void checkSenzaVocale_404() {
        assertThatThrownBy(() -> service.vocaleDelFeedback(3L)).isInstanceOf(RisorsaNonTrovataException.class);
    }

    @Test
    void rispondere_segnaIlCheckComeLetto() {
        ArgumentCaptor<CheckSettimanale> salvato = ArgumentCaptor.forClass(CheckSettimanale.class);
        service.rispondi(3L, new CheckDto.Feedback("Bravo", false));
        verify(checkRepository).saveAndFlush(salvato.capture());
        assertThat(salvato.getValue().getLettoIl()).isNotNull();
    }
}
