package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import it.edodoc.hq.ai.AiClient;
import it.edodoc.hq.dto.PlannerDto;
import it.edodoc.hq.exception.SocialIntegrazioneException;
import it.edodoc.hq.models.Config;
import it.edodoc.hq.models.PlannerBrand;
import it.edodoc.hq.models.PlannerPost;
import it.edodoc.hq.models.Utente;
import it.edodoc.hq.repositories.ConfigRepository;
import it.edodoc.hq.repositories.PlannerPostRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * AI del Planner social: testi per ogni canale da un'idea, riscritture (più breve, più coinvolgente, …) e le idee che
 * mancano al piano di un periodo, create come idee nel calendario. I prompt stanno in config (AI_PROMPT_PLANNER_*).
 */
@Service
public class PlannerAiService {

    public static final String CONFIG_PROMPT_TESTI = "AI_PROMPT_PLANNER_TESTI_SYSTEM";
    public static final String CONFIG_PROMPT_RISCRIVI = "AI_PROMPT_PLANNER_RISCRIVI_SYSTEM";
    public static final String CONFIG_PROMPT_IDEE = "AI_PROMPT_PLANNER_IDEE_SYSTEM";
    public static final String CONFIG_PROMPT_CONFORMITA = "AI_PROMPT_PLANNER_CONFORMITA_SYSTEM";
    public static final String CONFIG_PROMPT_REPORT = "AI_PROMPT_PLANNER_REPORT_SYSTEM";
    private static final int MAX_TRASCRIZIONE = 8000;

    private static final Map<String, String> CHIAVI = Map.of(
            PlannerCanali.FACEBOOK, "facebook", PlannerCanali.INSTAGRAM, "instagram", PlannerCanali.TIKTOK, "tiktok",
            PlannerCanali.LINKEDIN, "linkedin", PlannerCanali.X, "x", PlannerCanali.THREADS, "threads",
            PlannerCanali.PINTEREST, "pinterest", PlannerCanali.YOUTUBE, "youtube", PlannerCanali.GOOGLE_BUSINESS, "google_business");
    private static final int MAX_IDEE = 30;

    private final AiClient aiClient;
    private final ConfigRepository configRepository;
    private final PlannerPostRepository postRepository;
    private final PlannerPostService postService;
    private final PlannerSpaziService spazi;
    private final PlannerDestinazioniService destinazioni;
    private final PlannerImpostazioniService impostazioni;
    private final ObjectMapper objectMapper;
    private final WhisperTranscriptionService whisper;
    private final PlannerMediaService mediaService;
    private final PlannerAnalisiService analisi;
    /** Il modello che scrive, mostrato sotto i testi (il client di EdoDoc non lo espone). */
    private final String modello;

    public PlannerAiService(AiClient aiClient, ConfigRepository configRepository, PlannerPostRepository postRepository,
                            PlannerPostService postService, PlannerSpaziService spazi, PlannerDestinazioniService destinazioni,
                            PlannerImpostazioniService impostazioni, ObjectMapper objectMapper,
                            WhisperTranscriptionService whisper, PlannerMediaService mediaService,
                            PlannerAnalisiService analisi,
                            @Value("${app.ai.anthropic.model:claude-sonnet-5-5}") String modello) {
        this.aiClient = aiClient;
        this.configRepository = configRepository;
        this.postRepository = postRepository;
        this.postService = postService;
        this.spazi = spazi;
        this.destinazioni = destinazioni;
        this.impostazioni = impostazioni;
        this.objectMapper = objectMapper;
        this.whisper = whisper;
        this.mediaService = mediaService;
        this.analisi = analisi;
        this.modello = modello;
    }

    /** Spento senza ANTHROPIC_API_KEY: nessuna chiamata parte. */
    public boolean isDisponibile() {
        return aiClient.isDisponibile();
    }

    public PlannerDto.TestiAi testi(PlannerDto.TestiAiRequest req) {
        verificaDisponibile();
        if (req == null || (!StringUtils.hasText(req.idea()) && !StringUtils.hasText(req.testo()))) {
            throw new IllegalArgumentException("Descrivi l'idea del post.");
        }
        List<String> canali = (req.canali() == null || req.canali().isEmpty() ? List.of(PlannerCanali.INSTAGRAM, PlannerCanali.FACEBOOK)
                : req.canali()).stream().map(PlannerCanali::canale).distinct().toList();
        PlannerBrand brand = spazi.risolvi(req.brandId());
        StringBuilder user = new StringBuilder();
        user.append("Spazio: ").append(brand.getNome());
        if (StringUtils.hasText(brand.getDescrizione())) {
            user.append(" (").append(brand.getDescrizione()).append(')');
        }
        user.append('\n');
        if (StringUtils.hasText(req.idea())) {
            user.append("Idea del post: ").append(req.idea().trim()).append('\n');
        }
        if (StringUtils.hasText(req.testo())) {
            user.append("Bozza già scritta da cui partire:\n").append(PlannerUtenti.tronca(req.testo(), 4000)).append('\n');
        }
        user.append("Canali richiesti: ").append(String.join(", ", canali.stream().map(CHIAVI::get).toList())).append('\n');
        user.append("Tono: ").append(tono(req.tono())).append('\n');
        user.append("Hashtag: ").append(Boolean.FALSE.equals(req.hashtag()) ? "no, elenco vuoto" : "sì").append('\n');
        user.append("Emoji: ").append(Boolean.FALSE.equals(req.emoji()) ? "nessuna" : "qualcuna, con misura").append('\n');
        String grezzo = aiClient.generateContent(prompt(CONFIG_PROMPT_TESTI), user.toString(), 4000);
        JsonNode n = json(grezzo, '{', '}');
        if (n == null || !n.isObject()) {
            throw new SocialIntegrazioneException("L'AI non ha restituito i testi. Riprova.");
        }
        Map<String, String> testi = new LinkedHashMap<>();
        Map<String, String> titoli = new LinkedHashMap<>();
        for (String c : canali) {
            JsonNode v = n.path(CHIAVI.get(c));
            if (v.isObject()) {
                testi.put(c, v.path("testo").asText(""));
                titoli.put(c, v.path("titolo").asText(""));
            } else if (v.isTextual()) {
                testi.put(c, v.asText());
            }
        }
        List<String> hashtag = new ArrayList<>();
        n.path("hashtag").forEach(h -> {
            String s = h.asText("").trim().replaceFirst("^#", "");
            if (!s.isEmpty()) {
                hashtag.add(s);
            }
        });
        return new PlannerDto.TestiAi(testi, titoli, hashtag, modello);
    }

    /**
     * Testo dal video: trascrive quello che si dice nel video della libreria (Whisper, audio estratto con ffmpeg) e
     * scrive i testi per i canali partendo da lì.
     */
    public PlannerDto.TestiVideoAi testiDaVideo(PlannerDto.TestiVideoRequest req) {
        verificaDisponibile();
        if (req == null || req.mediaId() == null) {
            throw new IllegalArgumentException("Scegli il video.");
        }
        it.edodoc.hq.models.PlannerMedia m = mediaService.trova(req.mediaId());
        if (!it.edodoc.hq.models.PlannerMedia.TIPO_VIDEO.equals(m.getTipo())) {
            throw new IllegalArgumentException("Il testo si ricava solo da un video.");
        }
        if (!whisper.configurato()) {
            throw new SocialIntegrazioneException("La trascrizione dei video non è configurata (manca OPENAI_API_KEY).");
        }
        String trascrizione;
        try {
            trascrizione = whisper.trascrivi(mediaService.contenuto(m.getId()),
                    m.getNomeFile() == null ? "video.mp4" : m.getNomeFile());
        } catch (IllegalStateException e) {
            throw new SocialIntegrazioneException("Trascrizione non riuscita: " + e.getMessage());
        }
        if (!StringUtils.hasText(trascrizione) || trascrizione.trim().length() < 15) {
            throw new IllegalArgumentException("Nel video non si sente abbastanza parlato da cui scrivere il testo.");
        }
        String t = PlannerUtenti.tronca(trascrizione.trim(), MAX_TRASCRIZIONE);
        PlannerDto.TestiAi testi = testi(new PlannerDto.TestiAiRequest(req.brandId(),
                "Il post accompagna un video. Ecco cosa si dice nel video (trascrizione automatica, può avere errori):\n" + t,
                null, req.canali(), req.tono(), req.hashtag(), req.emoji()));
        return new PlannerDto.TestiVideoAi(t, testi);
    }

    /** Controllo di conformità di un testo (pubblicità sanitaria): esito, problemi frase per frase, testo corretto. */
    public PlannerDto.ConformitaAi conformita(PlannerDto.ConformitaRequest req) {
        verificaDisponibile();
        if (req == null || !StringUtils.hasText(req.testo())) {
            throw new IllegalArgumentException("Scrivi prima il testo da controllare.");
        }
        StringBuilder user = new StringBuilder();
        if (StringUtils.hasText(req.canale())) {
            user.append("Canale: ").append(PlannerCanali.nome(PlannerCanali.canale(req.canale()))).append('\n');
        }
        user.append("Testo del post:\n").append(PlannerUtenti.tronca(req.testo(), 6000));
        JsonNode n = json(aiClient.generateContent(prompt(CONFIG_PROMPT_CONFORMITA), user.toString(), 4000), '{', '}');
        if (n == null) {
            throw new SocialIntegrazioneException("L'AI non ha restituito il controllo. Riprova.");
        }
        String esito = n.path("esito").asText("ATTENZIONE").toUpperCase(Locale.ROOT);
        if (!List.of("OK", "ATTENZIONE", "RISCHIO").contains(esito)) {
            esito = "ATTENZIONE";
        }
        List<PlannerDto.ProblemaConformita> problemi = new ArrayList<>();
        n.path("problemi").forEach(p -> {
            if (StringUtils.hasText(p.path("motivo").asText(null))) {
                problemi.add(new PlannerDto.ProblemaConformita(p.path("frase").asText(""), p.path("motivo").asText(),
                        p.path("proposta").asText("")));
            }
        });
        if ("OK".equals(esito) && !problemi.isEmpty()) {
            esito = "ATTENZIONE";
        }
        String corretto = n.path("testoCorretto").isTextual() && StringUtils.hasText(n.path("testoCorretto").asText())
                ? n.path("testoCorretto").asText() : null;
        return new PlannerDto.ConformitaAi(esito, problemi, "OK".equals(esito) ? null : corretto, modello);
    }

    /** Commento AI al report del periodo, scritto solo dai numeri dell'analisi. */
    public PlannerDto.ReportAi report(Long brandId, java.time.LocalDate dal, java.time.LocalDate al) {
        verificaDisponibile();
        PlannerDto.Analisi a = analisi.analisi(brandId, dal, al);
        PlannerBrand brand = spazi.risolvi(brandId);
        StringBuilder u = new StringBuilder();
        u.append("Spazio: ").append(brand.getNome()).append("\nPeriodo: dal ").append(dal).append(" al ").append(al).append('\n');
        u.append("\nTotali (periodo / periodo prima):\n");
        u.append("- post usciti: ").append(a.totali().post()).append(" / ").append(a.precedente().post()).append('\n');
        u.append("- pubblicazioni sui canali: ").append(a.totali().pubblicazioni()).append(" / ").append(a.precedente().pubblicazioni()).append('\n');
        u.append("- visualizzazioni: ").append(a.totali().visualizzazioni()).append(" / ").append(a.precedente().visualizzazioni()).append('\n');
        u.append("- copertura: ").append(a.totali().copertura()).append(" / ").append(a.precedente().copertura()).append('\n');
        u.append("- interazioni: ").append(a.totali().interazioni()).append(" / ").append(a.precedente().interazioni()).append('\n');
        u.append("\nCanali (pubblicazioni, visualizzazioni, interazioni):\n");
        a.canali().forEach(c -> u.append("- ").append(PlannerCanali.nome(c.canale())).append(": ").append(c.pubblicazioni())
                .append(", ").append(c.visualizzazioni()).append(", ").append(c.interazioni()).append('\n'));
        long settimane = Math.max(1, java.time.temporal.ChronoUnit.DAYS.between(dal, al) / 7);
        u.append("\nRubriche (post usciti, obiettivo nel periodo, interazioni):\n");
        a.etichette().forEach(e -> u.append("- ").append(e.nome()).append(": ").append(e.post()).append(", ")
                .append(e.obiettivoSettimanale() == null ? "nessun obiettivo" : String.valueOf(e.obiettivoSettimanale() * settimane))
                .append(", ").append(e.interazioni()).append('\n'));
        u.append("\nFasce migliori (giorno 1=lunedì, ora, post, interazioni medie):\n");
        a.orari().stream().sorted((x, y) -> Double.compare(y.interazioniMedie(), x.interazioniMedie())).limit(5)
                .forEach(o -> u.append("- ").append(o.giorno()).append(", ").append(o.ora()).append(":00, ").append(o.post())
                        .append(", ").append(String.format(Locale.ROOT, "%.1f", o.interazioniMedie())).append('\n'));
        u.append("\nPost migliori:\n");
        a.top().stream().limit(5).forEach(t -> u.append("- ").append(PlannerCanali.nome(t.canale())).append(": «")
                .append(PlannerUtenti.tronca(t.titolo() != null ? t.titolo() : t.testo(), 100)).append("», ")
                .append(t.interazioni()).append(" interazioni\n"));
        u.append("\nNota: Google Business, TikTok e i canali pubblicati a mano non hanno numeri, contano solo come pubblicazioni.");
        JsonNode n = json(aiClient.generateContent(prompt(CONFIG_PROMPT_REPORT), u.toString(), 3000), '{', '}');
        if (n == null) {
            throw new SocialIntegrazioneException("L'AI non ha scritto il commento. Riprova.");
        }
        return new PlannerDto.ReportAi(n.path("sintesi").asText(""), elenco(n.path("puntiForti")), elenco(n.path("daMigliorare")),
                elenco(n.path("prossimiPassi")), modello);
    }

    private static List<String> elenco(JsonNode n) {
        List<String> out = new ArrayList<>();
        n.forEach(x -> {
            if (StringUtils.hasText(x.asText(null)) && out.size() < 4) {
                out.add(x.asText().trim());
            }
        });
        return out;
    }

    public PlannerDto.RiscritturaAi riscrivi(PlannerDto.RiscriviRequest req) {
        verificaDisponibile();
        if (req == null || !StringUtils.hasText(req.testo()) || !StringUtils.hasText(req.istruzione())) {
            throw new IllegalArgumentException("Serve il testo e cosa cambiare.");
        }
        StringBuilder user = new StringBuilder();
        if (StringUtils.hasText(req.canale())) {
            String c = PlannerCanali.canale(req.canale());
            user.append("Canale: ").append(PlannerCanali.nome(c)).append(" (al massimo ").append(PlannerCanali.maxTesto(c))
                    .append(" caratteri)\n");
        }
        user.append("Istruzione: ").append(PlannerUtenti.tronca(req.istruzione(), 300)).append("\n\nTesto:\n")
                .append(PlannerUtenti.tronca(req.testo(), 6000));
        String testo = pulisci(aiClient.generateContent(prompt(CONFIG_PROMPT_RISCRIVI), user.toString(), 3000));
        if (!StringUtils.hasText(testo)) {
            throw new SocialIntegrazioneException("L'AI non ha proposto niente. Riprova.");
        }
        return new PlannerDto.RiscritturaAi(testo, modello);
    }

    /** Propone le idee che mancano al piano del periodo e le crea come idee nel calendario dello spazio. */
    @Transactional
    public PlannerDto.IdeeAi idee(PlannerDto.IdeeAiRequest req, Utente utente) {
        verificaDisponibile();
        if (req == null || req.dal() == null || req.al() == null || req.al().isBefore(req.dal())
                || ChronoUnit.DAYS.between(req.dal(), req.al()) > 62) {
            throw new IllegalArgumentException("Scegli un periodo di al massimo due mesi.");
        }
        PlannerBrand brand = spazi.risolvi(req.brandId());
        int quante = Math.max(1, Math.min(MAX_IDEE, req.quante() == null ? 12 : req.quante()));
        List<PlannerDto.Destinazione> dest = destinazioni.elenco(brand);
        List<String> canaliScelti = req.canali() == null || req.canali().isEmpty()
                ? List.of(PlannerCanali.INSTAGRAM, PlannerCanali.FACEBOOK)
                : req.canali().stream().map(PlannerCanali::canale).distinct().toList();
        List<PlannerDto.Etichetta> rubriche = impostazioni.etichette();
        List<PlannerPost> esistenti = postRepository.nelPeriodo(brand.getId(), req.dal().atStartOfDay(), req.al().plusDays(1).atStartOfDay());

        StringBuilder user = new StringBuilder();
        user.append("Spazio: ").append(brand.getNome());
        if (StringUtils.hasText(brand.getDescrizione())) {
            user.append(" (").append(brand.getDescrizione()).append(')');
        }
        user.append("\nPeriodo: dal ").append(req.dal()).append(" al ").append(req.al()).append('\n');
        user.append("Idee da proporre: ").append(quante).append('\n');
        user.append("Canali su cui pubblicare: ").append(String.join(", ", canaliScelti)).append('\n');
        user.append("\nRubriche:\n");
        rubriche.forEach(r -> user.append("- ").append(r.nome())
                .append(r.descrizione() == null ? "" : ": " + r.descrizione())
                .append(r.obiettivoSettimanale() == null ? "" : " (obiettivo " + r.obiettivoSettimanale() + " a settimana)")
                .append('\n'));
        if (req.giornate() != null && !req.giornate().isEmpty()) {
            user.append("\nGiornate del periodo:\n");
            req.giornate().stream().limit(40).forEach(g -> user.append("- ").append(PlannerUtenti.tronca(g, 120)).append('\n'));
        }
        if (!esistenti.isEmpty()) {
            user.append("\nGià in calendario:\n");
            esistenti.stream().limit(60).forEach(p -> user.append("- ").append(p.getProgrammatoAlle().toLocalDate()).append(": ")
                    .append(PlannerNotificheService.titolo(p)).append('\n'));
        }
        if (StringUtils.hasText(req.indicazioni())) {
            user.append("\nIndicazioni: ").append(PlannerUtenti.tronca(req.indicazioni(), 1500)).append('\n');
        }
        String grezzo = aiClient.generateContent(prompt(CONFIG_PROMPT_IDEE), user.toString(), 6000);
        JsonNode n = json(grezzo, '[', ']');
        if (n == null || !n.isArray() || n.isEmpty()) {
            throw new SocialIntegrazioneException("L'AI non ha proposto idee. Riprova.");
        }
        LocalTime ora = LocalTime.of(12, 30);
        List<PlannerDto.Post> create = new ArrayList<>();
        for (JsonNode i : n) {
            if (create.size() >= quante) {
                break;
            }
            String titolo = i.path("titolo").asText("").trim();
            if (titolo.isEmpty()) {
                continue;
            }
            LocalDate giorno;
            try {
                giorno = LocalDate.parse(i.path("giorno").asText(""));
            } catch (DateTimeParseException e) {
                giorno = null;
            }
            if (giorno != null && (giorno.isBefore(req.dal()) || giorno.isAfter(req.al()))) {
                giorno = null;
            }
            String formato = i.path("formato").asText("POST").toUpperCase(Locale.ROOT);
            List<PlannerDto.CanaleRequest> canali = new ArrayList<>();
            List<String> proposti = new ArrayList<>();
            i.path("canali").forEach(c -> proposti.add(c.asText("").toUpperCase(Locale.ROOT)));
            for (String c : proposti.isEmpty() ? canaliScelti : proposti) {
                if (!canaliScelti.contains(c)) {
                    continue;
                }
                PlannerDto.Destinazione d = dest.stream().filter(x -> x.canale().equals(c))
                        .sorted((x, y) -> Boolean.compare(y.automatica(), x.automatica())).findFirst().orElse(null);
                if (d == null) {
                    continue;
                }
                String f = PlannerCanali.FORMATI.get(c).contains(formato) ? formato : PlannerCanali.FORMATI.get(c).get(0);
                canali.add(new PlannerDto.CanaleRequest(c, d.account(), f, null, null, null, null));
            }
            String rubrica = i.path("rubrica").asText("");
            Long etichetta = rubriche.stream().filter(r -> r.nome().equalsIgnoreCase(rubrica.trim())).map(PlannerDto.Etichetta::id)
                    .findFirst().orElse(null);
            String idea = i.path("idea").asText("").trim();
            create.add(postService.crea(new PlannerDto.PostRequest(brand.getId(), PlannerUtenti.tronca(titolo, 200),
                    null, null, null, etichetta, idea.isEmpty() ? null : "Idea AI: " + idea, null,
                    giorno == null ? null : giorno.atTime(ora), PlannerPostService.AZIONE_IDEA, canali, List.of(), null), utente));
        }
        return new PlannerDto.IdeeAi(create, modello);
    }

    private JsonNode json(String grezzo, char apre, char chiude) {
        String t = grezzo == null ? "" : grezzo.trim();
        int inizio = t.indexOf(apre);
        int fine = t.lastIndexOf(chiude);
        if (inizio < 0 || fine <= inizio) {
            return null;
        }
        try {
            return objectMapper.readTree(t.substring(inizio, fine + 1));
        } catch (Exception e) {
            return null;
        }
    }

    /** Toglie le virgolette che l'AI a volte mette intorno al testo riscritto. */
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

    private static String tono(String tono) {
        return switch (tono == null ? "" : tono.toUpperCase(Locale.ROOT)) {
            case "PROFESSIONALE" -> "professionale e preciso";
            case "IRONICO" -> "leggero e ironico, senza sminuire la salute";
            case "EMPATICO" -> "empatico e accogliente";
            case "DIRETTO" -> "diretto e sintetico";
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
            throw new SocialIntegrazioneException("L'AI non è configurata su questo gestionale.");
        }
    }
}
