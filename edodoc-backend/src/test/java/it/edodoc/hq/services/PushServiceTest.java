package it.edodoc.hq.services;

import it.edodoc.hq.models.Dispositivo;
import it.edodoc.hq.models.Utente;
import it.edodoc.hq.repositories.DispositivoRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class PushServiceTest {

    private static final Notifica AL_PAZIENTE = new Notifica(7L, "EdoDoc", "Messaggio", Map.of("tipo", "MESSAGGIO"));

    private final ConfigService config = mock(ConfigService.class);
    private final DispositivoRepository dispositivi = mock(DispositivoRepository.class);
    private final ApnsCanale apns = mock(ApnsCanale.class);
    private final FcmCanale fcm = mock(FcmCanale.class);
    private final PushService service = new PushService(config, dispositivi, apns, fcm);

    @BeforeEach
    void prepara() throws Exception {
        when(config.isAttivo(ConfigService.PUSH_ENABLED)).thenReturn(true);
        when(apns.isConfigurato()).thenReturn(true);
        when(fcm.isConfigurato()).thenReturn(true);
        when(apns.invia(any(), any())).thenReturn(CanalePush.Esito.INVIATA);
        when(fcm.invia(any(), any())).thenReturn(CanalePush.Esito.INVIATA);
    }

    private static Dispositivo telefono(String token, Dispositivo.Piattaforma piattaforma) {
        Dispositivo dispositivo = new Dispositivo();
        dispositivo.setPushToken(token);
        dispositivo.setPiattaforma(piattaforma);
        return dispositivo;
    }

    @Test
    void spenta_nonToccaNulla() {
        when(config.isAttivo(ConfigService.PUSH_ENABLED)).thenReturn(false);
        service.recapita(AL_PAZIENTE);
        verifyNoInteractions(dispositivi, apns, fcm);
    }

    @Test
    void ilCanaleDipendeDallaPiattaforma() throws Exception {
        when(dispositivi.findDelPaziente(7L)).thenReturn(List.of(
                telefono("iphone", Dispositivo.Piattaforma.IOS), telefono("android", Dispositivo.Piattaforma.ANDROID)));

        service.recapita(AL_PAZIENTE);

        verify(apns).invia("iphone", AL_PAZIENTE);
        verify(fcm).invia("android", AL_PAZIENTE);
        verify(dispositivi, never()).eliminaToken(any());
    }

    @Test
    void senzaPaziente_vaAlDottore() throws Exception {
        Notifica alDottore = new Notifica(null, "EdoDoc", "Messaggio", Map.of());
        when(dispositivi.findPerRuolo(Utente.Ruolo.ADMIN)).thenReturn(List.of(telefono("d", Dispositivo.Piattaforma.IOS)));

        service.recapita(alDottore);

        verify(apns).invia("d", alDottore);
    }

    @Test
    void appDisinstallata_ilTokenSiCancella() throws Exception {
        when(dispositivi.findDelPaziente(7L)).thenReturn(List.of(
                telefono("buono", Dispositivo.Piattaforma.IOS), telefono("vecchio", Dispositivo.Piattaforma.ANDROID)));
        when(fcm.invia("vecchio", AL_PAZIENTE)).thenReturn(CanalePush.Esito.TOKEN_NON_VALIDO);

        service.recapita(AL_PAZIENTE);

        verify(dispositivi).eliminaToken(List.of("vecchio"));
    }

    @Test
    void senzaCredenziali_saltaSoloQuellaPiattaforma() throws Exception {
        when(apns.isConfigurato()).thenReturn(false);
        when(dispositivi.findDelPaziente(7L)).thenReturn(List.of(
                telefono("iphone", Dispositivo.Piattaforma.IOS), telefono("android", Dispositivo.Piattaforma.ANDROID)));

        service.recapita(AL_PAZIENTE);

        verify(apns, never()).invia(any(), any());
        verify(fcm).invia("android", AL_PAZIENTE);
        verify(dispositivi, never()).eliminaToken(any());
    }

    @Test
    void servizioGiu_nonFaEsplodereNullaESiProvaIlTelefonoDopo() throws Exception {
        when(dispositivi.findDelPaziente(7L)).thenReturn(List.of(
                telefono("iphone", Dispositivo.Piattaforma.IOS), telefono("android", Dispositivo.Piattaforma.ANDROID)));
        when(apns.invia("iphone", AL_PAZIENTE)).thenThrow(new IOException("connessione caduta"));

        service.recapita(AL_PAZIENTE);

        verify(fcm).invia("android", AL_PAZIENTE);
        verify(dispositivi, never()).eliminaToken(any());
    }
}
