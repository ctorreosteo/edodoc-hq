package it.edodoc.hq.services;

import it.edodoc.hq.models.Dispositivo;
import it.edodoc.hq.models.Utente;
import it.edodoc.hq.repositories.DispositivoRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/**
 * Notifiche dell'app, direttamente con Apple e Google. Partono dopo il commit e fuori dalla richiesta:
 * una notifica persa non deve far fallire un messaggio, e l'app rilegge comunque i contatori all'apertura.
 */
@Service
public class PushService {

    private static final Logger logger = LoggerFactory.getLogger(PushService.class);

    private final ConfigService configService;
    private final DispositivoRepository dispositivoRepository;
    private final ApnsCanale apns;
    private final FcmCanale fcm;

    public PushService(ConfigService configService, DispositivoRepository dispositivoRepository,
                       ApnsCanale apns, FcmCanale fcm) {
        this.configService = configService;
        this.dispositivoRepository = dispositivoRepository;
        this.apns = apns;
        this.fcm = fcm;
    }

    public boolean isAttivo() {
        return configService.isAttivo(ConfigService.PUSH_ENABLED);
    }

    public boolean isConfigurato() {
        return apns.isConfigurato() || fcm.isConfigurato();
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void recapita(Notifica notifica) {
        if (!isAttivo()) {
            return;
        }
        List<Dispositivo> dispositivi = notifica.pazienteId() != null
                ? dispositivoRepository.findDelPaziente(notifica.pazienteId())
                : dispositivoRepository.findPerRuolo(Utente.Ruolo.ADMIN);
        List<String> disinstallati = new ArrayList<>();
        for (Dispositivo dispositivo : dispositivi) {
            if (invia(dispositivo, notifica) == CanalePush.Esito.TOKEN_NON_VALIDO) {
                disinstallati.add(dispositivo.getPushToken());
            }
        }
        if (!disinstallati.isEmpty()) {
            dispositivoRepository.eliminaToken(disinstallati);
        }
    }

    private CanalePush.Esito invia(Dispositivo dispositivo, Notifica notifica) {
        CanalePush canale = dispositivo.getPiattaforma() == Dispositivo.Piattaforma.IOS ? apns : fcm;
        if (!canale.isConfigurato()) {
            logger.warn("Notifica non inviata: mancano le credenziali per {}", dispositivo.getPiattaforma());
            return CanalePush.Esito.NON_INVIATA;
        }
        try {
            return canale.invia(dispositivo.getPushToken(), notifica);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return CanalePush.Esito.NON_INVIATA;
        } catch (IOException | RuntimeException e) {
            logger.warn("Notifica non inviata: {}", e.getMessage());
            return CanalePush.Esito.NON_INVIATA;
        }
    }
}
