package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import it.edodoc.hq.dto.SocialDto;
import it.edodoc.hq.services.SocialAccountService.AccountInterno;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.function.Function;

/**
 * Eventi webhook di Meta per pagine ({@code object=page}) e profili Instagram ({@code object=instagram}).
 * Non salva nulla: invalida la cache della pagina interessata e avvisa i client su {@code /topic/social},
 * che rileggono da REST.
 */
@Service
public class SocialWebhookService {

    private final SocialAccountService accountService;
    private final SocialCache cache;
    private final SocialRealtimeNotifier notifier;
    private final SocialPreriscaldamentoService preriscaldamento;

    public SocialWebhookService(SocialAccountService accountService, SocialCache cache, SocialRealtimeNotifier notifier,
                                SocialPreriscaldamentoService preriscaldamento) {
        this.accountService = accountService;
        this.cache = cache;
        this.notifier = notifier;
        this.preriscaldamento = preriscaldamento;
    }

    /** @return eventi pubblicati */
    public int processa(JsonNode payload) {
        List<SocialDto.SocialEvento> eventi = interpreta(payload, accountService::perIdWebhook);
        Set<String> pagine = new LinkedHashSet<>();
        eventi.forEach(e -> pagine.add(e.pageId()));
        pagine.forEach(p -> {
            // Inbox: il dato vecchio e sbagliato, si butta e si ricarica subito, prima di avvisare i client,
            // cosi la loro rilettura si aggancia al calcolo gia partito. Statistiche: si mostrano mentre si aggiornano.
            cache.invalida(p, "commenti:");
            cache.invalida(p, "conversazioni");
            cache.segnaScaduto(p, "panoramica:");
            cache.segnaScaduto(p, "contenuti:");
            preriscaldamento.inbox(p);
        });
        eventi.forEach(notifier::pubblica);
        return eventi.size();
    }

    /**
     * Payload → eventi. Commenti e messaggi scritti dalla pagina stessa (eco, risposte nostre) diventano
     * AGGIORNAMENTO, non "nuovo". Gli id sconosciuti (pagine non collegate) si scartano.
     */
    static List<SocialDto.SocialEvento> interpreta(JsonNode payload, Function<String, AccountInterno> perId) {
        List<SocialDto.SocialEvento> out = new ArrayList<>();
        if (payload == null) {
            return out;
        }
        String object = payload.path("object").asText("");
        boolean instagram = "instagram".equals(object);
        if (!instagram && !"page".equals(object)) {
            return out;
        }
        String piattaforma = instagram ? SocialCommentiService.INSTAGRAM : SocialCommentiService.FACEBOOK;
        for (JsonNode entry : payload.path("entry")) {
            AccountInterno a = perId.apply(entry.path("id").asText(null));
            if (a == null) {
                continue;
            }
            for (JsonNode change : entry.path("changes")) {
                SocialDto.SocialEvento e = daChange(change, instagram, piattaforma, a);
                if (e != null) {
                    out.add(e);
                }
            }
            for (JsonNode m : entry.path("messaging")) {
                out.add(daMessaggio(m, piattaforma, a));
            }
        }
        return out;
    }

    private static SocialDto.SocialEvento daChange(JsonNode change, boolean instagram, String piattaforma, AccountInterno a) {
        String field = change.path("field").asText("");
        JsonNode v = change.path("value");
        if (instagram) {
            if ("comments".equals(field) || "live_comments".equals(field)) {
                String username = v.path("from").path("username").asText(null);
                boolean nostro = username != null && username.equalsIgnoreCase(a.instagramUsername());
                return new SocialDto.SocialEvento(nostro ? SocialRealtimeNotifier.TIPO_AGGIORNAMENTO : SocialRealtimeNotifier.TIPO_COMMENTO,
                        piattaforma, a.pageId(), username, SocialAzioniService.tronca(v.path("text").asText(null), 140),
                        v.path("id").asText(null));
            }
            return new SocialDto.SocialEvento(SocialRealtimeNotifier.TIPO_AGGIORNAMENTO, piattaforma, a.pageId(), null, null, null);
        }
        if ("feed".equals(field)) {
            String item = v.path("item").asText("");
            String verb = v.path("verb").asText("");
            if ("comment".equals(item) && ("add".equals(verb) || "edited".equals(verb))) {
                boolean nostro = a.pageId().equals(v.path("from").path("id").asText(null));
                return new SocialDto.SocialEvento(nostro ? SocialRealtimeNotifier.TIPO_AGGIORNAMENTO : SocialRealtimeNotifier.TIPO_COMMENTO,
                        piattaforma, a.pageId(), v.path("from").path("name").asText(null),
                        SocialAzioniService.tronca(v.path("message").asText(null), 140), v.path("comment_id").asText(null));
            }
        }
        return new SocialDto.SocialEvento(SocialRealtimeNotifier.TIPO_AGGIORNAMENTO, piattaforma, a.pageId(), null, null, null);
    }

    private static SocialDto.SocialEvento daMessaggio(JsonNode m, String piattaforma, AccountInterno a) {
        JsonNode msg = m.path("message");
        if (msg.isMissingNode() || msg.path("is_echo").asBoolean(false)) {
            // letture, consegne, reazioni, eco dei nostri invii
            return new SocialDto.SocialEvento(SocialRealtimeNotifier.TIPO_AGGIORNAMENTO, piattaforma, a.pageId(), null, null, null);
        }
        String testo = msg.path("text").asText(null);
        if (!StringUtils.hasText(testo)) {
            testo = msg.has("attachments") ? "📎 Allegato" : null;
        }
        return new SocialDto.SocialEvento(SocialRealtimeNotifier.TIPO_MESSAGGIO, piattaforma, a.pageId(), null,
                SocialAzioniService.tronca(testo, 140), m.path("sender").path("id").asText(null));
    }
}
