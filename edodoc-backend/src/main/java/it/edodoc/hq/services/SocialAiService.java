package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import it.edodoc.hq.ai.AiClient;
import it.edodoc.hq.dto.SocialDto;
import it.edodoc.hq.models.Config;
import it.edodoc.hq.repositories.ConfigRepository;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * AI della pagina Meta: bozza di risposta a commenti e messaggi diretti, didascalie dei post.
 * Il contesto lo recupera il backend dall'id (mai testo arbitrario del client spacciato per commento).
 * I prompt stanno in config (AI_PROMPT_SOCIAL_*), modificabili senza deploy.
 */
@Service
public class SocialAiService {

    public static final String CONFIG_PROMPT_RISPOSTA = "AI_PROMPT_SOCIAL_RISPOSTA_SYSTEM";
    public static final String CONFIG_PROMPT_DIDASCALIA = "AI_PROMPT_SOCIAL_DIDASCALIA_SYSTEM";

    private static final int MESSAGGI_CONTESTO = 15;

    private final AiClient aiClient;
    private final ConfigRepository configRepository;
    private final SocialCommentiService commenti;
    private final SocialMessaggiService messaggi;
    private final SocialAccountService accountService;
    private final ObjectMapper objectMapper;

    public SocialAiService(AiClient aiClient, ConfigRepository configRepository, SocialCommentiService commenti,
                           SocialMessaggiService messaggi, SocialAccountService accountService, ObjectMapper objectMapper) {
        this.aiClient = aiClient;
        this.configRepository = configRepository;
        this.commenti = commenti;
        this.messaggi = messaggi;
        this.accountService = accountService;
        this.objectMapper = objectMapper;
    }

    /** Senza ANTHROPIC_API_KEY i pulsanti AI della pagina restano spenti. */
    public boolean isDisponibile() {
        return aiClient.isDisponibile();
    }

    public SocialDto.RispostaAi risposta(SocialDto.RispostaAiRequest req) {
        verificaDisponibile();
        if (req == null || !StringUtils.hasText(req.oggettoId())) {
            throw new IllegalArgumentException("Manca il commento o la conversazione a cui rispondere.");
        }
        var account = accountService.risolvi(req.account());
        String piattaforma = SocialCommentiService.piattaforma(req.piattaforma());
        boolean messaggio = "MESSAGGIO".equalsIgnoreCase(req.tipo());
        String contesto = messaggio
                ? contestoMessaggi(account.pageId(), req.oggettoId(), piattaforma)
                : contestoCommento(account.pageId(), req.oggettoId(), piattaforma);

        StringBuilder user = new StringBuilder();
        user.append("Pagina: ").append(account.nome()).append('\n');
        user.append("Tipo: ").append(messaggio ? "messaggio diretto privato" : "commento pubblico sotto un post").append('\n');
        user.append("Tono richiesto: ").append(tono(req.tono())).append("\n\n");
        user.append(contesto);
        if (StringUtils.hasText(req.istruzioni())) {
            user.append("\n\nIndicazioni di chi risponde: ").append(req.istruzioni().trim());
        }
        String system = prompt(CONFIG_PROMPT_RISPOSTA)
                .replace("{PIATTAFORMA}", "INSTAGRAM".equals(piattaforma) ? "Instagram" : "Facebook");
        String testo = pulisci(aiClient.generateContent(system, user.toString(), 800));
        if (!StringUtils.hasText(testo)) {
            throw new it.edodoc.hq.exception.SocialIntegrazioneException("L'AI non ha proposto nessuna risposta. Riprova.");
        }
        return new SocialDto.RispostaAi(testo, aiClient.getChatModelDescriptor());
    }

    public SocialDto.DidascaliaAi didascalia(SocialDto.DidascaliaAiRequest req) {
        verificaDisponibile();
        if (req == null || !StringUtils.hasText(req.idea())) {
            throw new IllegalArgumentException("Descrivi l'idea del post.");
        }
        StringBuilder user = new StringBuilder();
        user.append("Idea del post: ").append(req.idea().trim()).append('\n');
        user.append("Piattaforme: ").append(req.piattaforme() == null || req.piattaforme().isEmpty()
                ? "Facebook e Instagram" : String.join(", ", req.piattaforme())).append('\n');
        user.append("Tono: ").append(tono(req.tono())).append('\n');
        user.append("Hashtag: ").append(Boolean.FALSE.equals(req.hashtag()) ? "no, elenco vuoto" : "sì").append('\n');
        user.append("Emoji: ").append(Boolean.FALSE.equals(req.emoji()) ? "nessuna" : "qualcuna, con misura").append('\n');
        String grezzo = aiClient.generateContent(prompt(CONFIG_PROMPT_DIDASCALIA), user.toString(), 1500);
        return interpretaDidascalia(grezzo, objectMapper, aiClient.getChatModelDescriptor());
    }

    static SocialDto.DidascaliaAi interpretaDidascalia(String grezzo, ObjectMapper om, String modello) {
        String t = grezzo == null ? "" : grezzo.trim();
        int inizio = t.indexOf('{');
        int fine = t.lastIndexOf('}');
        if (inizio >= 0 && fine > inizio) {
            try {
                JsonNode n = om.readTree(t.substring(inizio, fine + 1));
                List<String> hashtag = new ArrayList<>();
                n.path("hashtag").forEach(h -> {
                    String s = h.asText("").trim().replaceFirst("^#", "");
                    if (!s.isEmpty()) {
                        hashtag.add(s);
                    }
                });
                return new SocialDto.DidascaliaAi(n.path("facebook").asText(""), n.path("instagram").asText(""),
                        hashtag, modello);
            } catch (Exception ignored) {
                // non JSON: si usa il testo cosi com'e
            }
        }
        return new SocialDto.DidascaliaAi(t, t, List.of(), modello);
    }

    private String contestoCommento(String pageId, String id, String piattaforma) {
        SocialDto.Commento c = commenti.trova(pageId, piattaforma, id);
        StringBuilder sb = new StringBuilder();
        if (StringUtils.hasText(c.postTesto())) {
            sb.append("Testo del post: ").append(SocialAzioniService.tronca(c.postTesto(), 1500)).append('\n');
        }
        sb.append("Commento di ").append(c.autoreNome() == null ? "un utente" : c.autoreNome()).append(": ")
                .append(c.testo()).append('\n');
        if (!c.risposte().isEmpty()) {
            sb.append("\nRisposte già presenti:\n");
            c.risposte().forEach(r -> sb.append("- ").append(r.daPagina() ? "Pagina" : r.autoreNome())
                    .append(": ").append(r.testo()).append('\n'));
        }
        return sb.toString();
    }

    private String contestoMessaggi(String pageId, String conversazioneId, String piattaforma) {
        SocialDto.ThreadConversazione t = messaggi.thread(pageId, conversazioneId, piattaforma);
        List<SocialDto.Messaggio> m = t.messaggi();
        List<SocialDto.Messaggio> ultimi = m.subList(Math.max(0, m.size() - MESSAGGI_CONTESTO), m.size());
        StringBuilder sb = new StringBuilder("Conversazione (dal più vecchio):\n");
        for (SocialDto.Messaggio x : ultimi) {
            sb.append(x.daPagina() ? "Pagina" : (t.conversazione().contattoNome() == null ? "Contatto" : t.conversazione().contattoNome()))
                    .append(": ")
                    .append(StringUtils.hasText(x.testo()) ? x.testo() : "[allegato]")
                    .append('\n');
        }
        sb.append("\nScrivi il prossimo messaggio della pagina.");
        return sb.toString();
    }

    private static String tono(String tono) {
        return switch (tono == null ? "" : tono.toUpperCase(Locale.ROOT)) {
            case "PROFESSIONALE" -> "professionale e preciso";
            case "BREVE" -> "brevissimo, una frase";
            case "EMPATICO" -> "empatico e accogliente";
            default -> "cordiale e caloroso";
        };
    }

    private String prompt(String chiave) {
        return configRepository.findByChiave(chiave)
                .map(Config::getValore)
                .filter(StringUtils::hasText)
                .orElseThrow(() -> new IllegalStateException(
                        "Config " + chiave + " assente o vuota. Eseguire la migration Flyway corrispondente."));
    }

    private void verificaDisponibile() {
        if (!isDisponibile()) {
            throw new it.edodoc.hq.exception.SocialIntegrazioneException("L'AI non è configurata su questo gestionale.");
        }
    }

    static String pulisci(String testo) {
        if (testo == null) {
            return null;
        }
        String t = testo.trim();
        if (t.length() >= 2 && (t.startsWith("\"") && t.endsWith("\"") || t.startsWith("«") && t.endsWith("»"))) {
            t = t.substring(1, t.length() - 1).trim();
        }
        return t;
    }
}
