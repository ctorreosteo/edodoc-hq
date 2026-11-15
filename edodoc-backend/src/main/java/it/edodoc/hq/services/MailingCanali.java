package it.edodoc.hq.services;

import it.edodoc.hq.models.MailingMittente;
import jakarta.mail.internet.MimeMessage;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * Smista il messaggio al canale del mittente. È il solo punto da cui parte un'email: qui si applica l'interruttore di
 * sistema {@link MailingConfigService#CONFIG_INVIO_EMAIL_ENABLED}.
 */
@Component
public class MailingCanali {

    public static final String MESSAGGIO_SPENTO = "L'invio delle email è disabilitato a livello di sistema ("
            + MailingConfigService.CONFIG_INVIO_EMAIL_ENABLED + " = false nel database): nessuna email può partire.";

    private final Map<MailingMittente.Canale, MailingCanale> perTipo = new EnumMap<>(MailingMittente.Canale.class);

    private final MailingConfigService config;

    public MailingCanali(List<MailingCanale> canali, MailingConfigService config) {
        this.config = config;
        for (MailingCanale c : canali) {
            perTipo.put(c.tipo(), c);
        }
    }

    public String invia(MailingMittente m, MimeMessage msg) throws MailingCanaleException {
        if (!config.invioEmailDiSistemaAttivo()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, MESSAGGIO_SPENTO);
        }
        MailingCanale c = perTipo.get(m.getCanale() != null ? m.getCanale() : MailingMittente.Canale.GMAIL_API);
        if (c == null) {
            throw new MailingCanaleException.NonConfigurato("canale " + m.getCanale() + " non disponibile.", null);
        }
        return c.invia(m, msg);
    }
}
