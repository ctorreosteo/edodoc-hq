package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import it.edodoc.hq.dto.YoutubeDto;
import it.edodoc.hq.exception.GoogleRifiutoException;
import it.edodoc.hq.exception.RisorsaNonTrovataException;
import it.edodoc.hq.models.YoutubeSnapshot;
import it.edodoc.hq.repositories.YoutubeSnapshotRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * Dati del canale YouTube del dottore per la pagina YouTube (portata da Mobilitas HQ).
 * <p>
 * Due fonti: Data API (contatori pubblici quasi in tempo reale, elenco video, commenti) e Analytics API
 * (metriche del proprietario, con 2-3 giorni di ritardo). Le risposte stanno in cache in memoria per non consumare
 * la quota giornaliera (10.000 unità): contatori 30 s, ultimi video 90 s, report 10-15 min.
 * Le rilevazioni dei contatori finiscono in {@code youtube_snapshot} ogni ora e quando la pagina è aperta.
 * <p>
 * Perché i numeri coincidano con YouTube Studio: i giorni di Analytics sono in ora del Pacifico, i periodi finiscono
 * all'ultimo giorno che Analytics ha già elaborato (altrimenti gli ultimi 2-3 giorni valgono zero e i totali e il
 * confronto col periodo precedente escono più bassi), i ricavi sono chiesti in euro e gli Short li riconosce Analytics.
 */
@Service
public class YoutubeStudioService {

    private static final Logger logger = LoggerFactory.getLogger(YoutubeStudioService.class);
    private static final ZoneId ROMA = ZoneId.of("Europe/Rome");
    /** Fuso dei giorni di YouTube Analytics e di Studio. */
    private static final ZoneId PACIFICO = ZoneId.of("America/Los_Angeles");
    private static final String METRICHE_BASE = "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,"
            + "subscribersGained,subscribersLost,likes,dislikes,comments,shares";
    private static final int MAX_VIDEO = 500;
    private static final Duration SNAPSHOT_OGNI = Duration.ofMinutes(10);

    private final YoutubeGoogleClient google;
    private final YoutubeSnapshotRepository snapshotRepository;
    private final ObjectMapper objectMapper;
    private final Map<String, Voce<?>> cache = new ConcurrentHashMap<>();

    private record Voce<T>(T valore, Instant scade) {
    }

    public YoutubeStudioService(YoutubeGoogleClient google, YoutubeSnapshotRepository snapshotRepository, ObjectMapper objectMapper) {
        this.google = google;
        this.snapshotRepository = snapshotRepository;
        this.objectMapper = objectMapper;
    }

    // ───────────────────────── Stato e canale ─────────────────────────

    public YoutubeDto.Stato stato(boolean puoGestire, boolean puoCollegare) {
        Long obiettivo = parseLong(google.config("YOUTUBE_OBIETTIVO_ISCRITTI"));
        if (!google.collegato()) {
            return new YoutubeDto.Stato(google.clientConfigurato(), false, google.redirectUri(), null,
                    puoGestire, puoCollegare, obiettivo, null);
        }
        try {
            return new YoutubeDto.Stato(true, true, google.redirectUri(), canale(), puoGestire, puoCollegare, obiettivo, null);
        } catch (RuntimeException e) {
            // Token revocato, API spenta, quota: la pagina mostra il motivo invece di cadere
            return new YoutubeDto.Stato(true, true, google.redirectUri(), null, puoGestire, puoCollegare, obiettivo, e.getMessage());
        }
    }

    public void salvaObiettivo(Long iscritti) {
        if (iscritti != null && iscritti < 1) {
            throw new IllegalArgumentException("L'obiettivo deve essere un numero positivo");
        }
        google.salvaConfig("YOUTUBE_OBIETTIVO_ISCRITTI", iscritti == null ? "" : String.valueOf(iscritti),
                "YouTube: obiettivo iscritti mostrato nella pagina.");
    }

    public void scollega() {
        google.scollega();
        cache.clear();
    }

    public void completaConsenso(String code, String state) {
        google.completaConsenso(code, state);
        cache.clear();
    }

    YoutubeDto.Canale canale() {
        JsonNode c = canaleGrezzo();
        JsonNode sn = c.path("snippet");
        JsonNode st = c.path("statistics");
        String banner = c.path("brandingSettings").path("image").path("bannerExternalUrl").asText(null);
        return new YoutubeDto.Canale(
                c.path("id").asText(),
                sn.path("title").asText(""),
                sn.path("description").asText(""),
                sn.path("customUrl").asText(null),
                miniatura(sn.path("thumbnails")),
                banner != null ? banner + "=w2120-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj" : null,
                st.path("subscriberCount").asLong(0),
                st.path("hiddenSubscriberCount").asBoolean(false),
                st.path("viewCount").asLong(0),
                st.path("videoCount").asLong(0),
                sn.path("publishedAt").asText(null),
                sn.path("country").asText(null));
    }

    private JsonNode canaleGrezzo() {
        return inCache("canale", Duration.ofSeconds(30), () -> {
            JsonNode items = google.data("channels", Map.of(
                    "part", "snippet,statistics,brandingSettings,contentDetails",
                    "mine", "true")).path("items");
            if (!items.isArray() || items.isEmpty()) {
                throw new RisorsaNonTrovataException(
                        "L'account Google collegato non ha un canale YouTube: ricollega scegliendo il canale giusto.");
            }
            return items.get(0);
        });
    }

    private String canaleId() {
        return canaleGrezzo().path("id").asText();
    }

    private String playlistCaricamenti() {
        return canaleGrezzo().path("contentDetails").path("relatedPlaylists").path("uploads").asText();
    }

    // ───────────────────────── Live ─────────────────────────

    public YoutubeDto.Live live(int giorniStorico) {
        JsonNode c = canaleGrezzo();
        JsonNode st = c.path("statistics");
        long iscritti = st.path("subscriberCount").asLong(0);
        long views = st.path("viewCount").asLong(0);
        long video = st.path("videoCount").asLong(0);
        String id = c.path("id").asText();
        salvaSnapshotSeServe(id, iscritti, views, (int) video, SNAPSHOT_OGNI);

        List<YoutubeDto.VideoLive> ultimi = inCache("ultimi-video", Duration.ofSeconds(90), this::ultimiVideo);
        long[] esatti = inCache("iscritti-esatti", Duration.ofHours(3), () -> iscrittiEsatti(c));

        int giorni = Math.max(1, Math.min(giorniStorico, 365));
        List<YoutubeDto.Punto> storico = snapshotRepository
                .findByCanaleIdAndRilevatoIlAfterOrderByRilevatoIlAsc(id, LocalDateTime.now(ROMA).minusDays(giorni))
                .stream()
                .map(s -> new YoutubeDto.Punto(s.getRilevatoIl().atZone(ROMA).toInstant().toEpochMilli(),
                        s.getIscritti(), s.getVisualizzazioni()))
                .toList();

        return new YoutubeDto.Live(Instant.now().toEpochMilli(), iscritti, st.path("hiddenSubscriberCount").asBoolean(false),
                views, video, esatti == null ? null : esatti[0],
                esatti == null ? null : LocalDate.ofEpochDay(esatti[1]).toString(), ultimi, storico);
    }

    private List<YoutubeDto.VideoLive> ultimiVideo() {
        JsonNode pl = google.data("playlistItems", Map.of(
                "part", "contentDetails", "playlistId", playlistCaricamenti(), "maxResults", 8));
        List<String> ids = new ArrayList<>();
        pl.path("items").forEach(i -> ids.add(i.path("contentDetails").path("videoId").asText()));
        if (ids.isEmpty()) {
            return List.of();
        }
        JsonNode v = google.data("videos", Map.of("part", "snippet,statistics", "id", String.join(",", ids)));
        List<YoutubeDto.VideoLive> out = new ArrayList<>();
        v.path("items").forEach(i -> out.add(new YoutubeDto.VideoLive(
                i.path("id").asText(),
                i.path("snippet").path("title").asText(""),
                miniatura(i.path("snippet").path("thumbnails")),
                i.path("snippet").path("publishedAt").asText(null),
                i.path("statistics").path("viewCount").asLong(0),
                i.path("statistics").path("likeCount").asLong(0),
                i.path("statistics").path("commentCount").asLong(0))));
        out.sort(Comparator.comparing(YoutubeDto.VideoLive::pubblicatoIl, Comparator.nullsLast(Comparator.reverseOrder())));
        return out;
    }

    /** [iscritti netti dalla nascita del canale, epochDay dell'ultimo giorno con dati Analytics]; null se non disponibile. */
    private long[] iscrittiEsatti(JsonNode canale) {
        try {
            LocalDate ultimo = ultimoGiornoConDati();
            YoutubeGoogleClient.Report tot = google.report(nascitaCanale(canale), ultimo.toString(),
                    "subscribersGained,subscribersLost", null, null, null, null);
            if (tot.righe().isEmpty()) {
                return null;
            }
            JsonNode r = tot.righe().get(0);
            long netti = tot.l(r, "subscribersGained") - tot.l(r, "subscribersLost");
            return new long[]{netti, ultimo.toEpochDay()};
        } catch (Exception e) {
            logger.debug("[YOUTUBE] Iscritti esatti non disponibili: {}", e.getMessage());
            return null;
        }
    }

    private static String nascitaCanale(JsonNode canale) {
        return canale.path("snippet").path("publishedAt").asText("2006-01-01").substring(0, 10);
    }

    /**
     * Ultimo giorno (ora del Pacifico) che Analytics ha già elaborato: di solito 2-3 giorni fa. Studio copre i giorni
     * successivi con stime in tempo reale che l'API non espone, quindi i periodi si fermano qui.
     */
    LocalDate ultimoGiornoConDati() {
        return inCache("ultimo-giorno", Duration.ofMinutes(30), () -> {
            LocalDate oggi = LocalDate.now(PACIFICO);
            LocalDate ultimo = oggi.minusDays(3);
            try {
                YoutubeGoogleClient.Report r = google.report(oggi.minusDays(14).toString(), oggi.toString(), "views",
                        "day", null, "day", null);
                LocalDate trovato = null;
                for (JsonNode g : r.righe()) {
                    if (r.l(g, "views") > 0) {
                        trovato = LocalDate.parse(r.s(g, "day"));
                    }
                }
                // Un canale fermo da giorni non deve spostare indietro i periodi: lì gli zeri sono veri
                if (trovato != null && !trovato.isBefore(oggi.minusDays(5))) {
                    ultimo = trovato;
                }
            } catch (Exception e) {
                logger.debug("[YOUTUBE] Ultimo giorno Analytics non disponibile: {}", e.getMessage());
            }
            return ultimo;
        });
    }

    @Scheduled(cron = "0 0 * * * *", zone = "Europe/Rome")
    public void rilevazioneOraria() {
        if (!google.collegato()) {
            return;
        }
        try {
            cache.remove("canale");
            JsonNode c = canaleGrezzo();
            JsonNode st = c.path("statistics");
            salvaSnapshotSeServe(c.path("id").asText(), st.path("subscriberCount").asLong(0), st.path("viewCount").asLong(0),
                    st.path("videoCount").asInt(0), Duration.ofMinutes(5));
        } catch (Exception e) {
            logger.warn("[YOUTUBE] Rilevazione oraria non riuscita: {}", e.getMessage());
        }
    }

    private synchronized void salvaSnapshotSeServe(String canaleId, long iscritti, long views, int video, Duration distanza) {
        LocalDateTime adesso = LocalDateTime.now(ROMA);
        Optional<YoutubeSnapshot> ultimo = snapshotRepository.findFirstByCanaleIdOrderByRilevatoIlDesc(canaleId);
        if (ultimo.isPresent() && ultimo.get().getRilevatoIl().isAfter(adesso.minus(distanza))) {
            return;
        }
        snapshotRepository.save(YoutubeSnapshot.builder()
                .canaleId(canaleId).rilevatoIl(adesso).iscritti(iscritti).visualizzazioni(views).video(video).build());
    }

    // ───────────────────────── Panoramica ─────────────────────────

    public YoutubeDto.Panoramica panoramica(String dal, String al) {
        Periodo p = periodo(dal, al);
        return inCache("panoramica:" + p, Duration.ofMinutes(10), () -> {
            YoutubeDto.Totali corrente = totali(p.dal, p.al, null);
            YoutubeDto.Totali precedente = totali(p.dalPrecedente(), p.alPrecedente(), null);

            YoutubeGoogleClient.Report r = google.report(p.dal.toString(), p.al.toString(), METRICHE_BASE, "day", null, "day", null);
            Map<String, Double> ricavi = ricaviGiornalieri(p.dal, p.al, null);
            List<YoutubeDto.Giorno> serie = serieGiornaliera(r, ricavi, p);

            boolean conRicavi = ricavi != null;
            if (conRicavi) {
                corrente = conRicavi(corrente, ricavi.values().stream().mapToDouble(Double::doubleValue).sum());
                Map<String, Double> ricaviPrec = ricaviGiornalieri(p.dalPrecedente(), p.alPrecedente(), null);
                if (ricaviPrec != null) {
                    precedente = conRicavi(precedente, ricaviPrec.values().stream().mapToDouble(Double::doubleValue).sum());
                }
            }

            List<YoutubeDto.Voce> tipi = classifica(() -> google.report(p.dal.toString(), p.al.toString(),
                    "views,estimatedMinutesWatched", "creatorContentType", null, "-views", null),
                    "creatorContentType", "views", "estimatedMinutesWatched", YoutubeStudioService::etichettaTipoContenuto);

            return new YoutubeDto.Panoramica(p.dal.toString(), p.al.toString(), corrente, precedente, serie, conRicavi, tipi);
        });
    }

    private YoutubeDto.Totali totali(LocalDate dal, LocalDate al, String filtri) {
        YoutubeGoogleClient.Report r = google.report(dal.toString(), al.toString(), METRICHE_BASE, null, filtri, null, null);
        if (r.righe().isEmpty()) {
            return new YoutubeDto.Totali(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, null);
        }
        JsonNode x = r.righe().get(0);
        return new YoutubeDto.Totali(r.l(x, "views"), r.l(x, "estimatedMinutesWatched"), r.d(x, "averageViewDuration"),
                r.d(x, "averageViewPercentage"), r.l(x, "subscribersGained"), r.l(x, "subscribersLost"), r.l(x, "likes"),
                r.l(x, "dislikes"), r.l(x, "comments"), r.l(x, "shares"), null);
    }

    private static YoutubeDto.Totali conRicavi(YoutubeDto.Totali t, double ricavi) {
        return new YoutubeDto.Totali(t.visualizzazioni(), t.minutiVisti(), t.durataMediaSec(), t.percentualeMedia(),
                t.iscrittiGuadagnati(), t.iscrittiPersi(), t.like(), t.dislike(), t.commenti(), t.condivisioni(), ricavi);
    }

    /** null se il canale non è monetizzato o manca il permesso sui ricavi. */
    private Map<String, Double> ricaviGiornalieri(LocalDate dal, LocalDate al, String filtri) {
        try {
            YoutubeGoogleClient.Report r = google.report(dal.toString(), al.toString(), "estimatedRevenue", "day", filtri, "day", null);
            Map<String, Double> out = new LinkedHashMap<>();
            r.righe().forEach(x -> out.put(r.s(x, "day"), r.d(x, "estimatedRevenue")));
            return out;
        } catch (Exception e) {
            return null;
        }
    }

    /** Un punto per ogni giorno del periodo, anche quelli senza dati. */
    private static List<YoutubeDto.Giorno> serieGiornaliera(YoutubeGoogleClient.Report r, Map<String, Double> ricavi, Periodo p) {
        Map<String, JsonNode> perGiorno = new HashMap<>();
        r.righe().forEach(x -> perGiorno.put(r.s(x, "day"), x));
        List<YoutubeDto.Giorno> out = new ArrayList<>();
        for (LocalDate g = p.dal; !g.isAfter(p.al); g = g.plusDays(1)) {
            String k = g.toString();
            JsonNode x = perGiorno.get(k);
            Double ric = ricavi == null ? null : ricavi.getOrDefault(k, 0d);
            if (x == null) {
                out.add(new YoutubeDto.Giorno(k, 0, 0, 0, 0, 0, 0, 0, 0, ric));
            } else {
                out.add(new YoutubeDto.Giorno(k, r.l(x, "views"), r.l(x, "estimatedMinutesWatched"), r.d(x, "averageViewDuration"),
                        r.l(x, "subscribersGained"), r.l(x, "subscribersLost"), r.l(x, "likes"), r.l(x, "comments"),
                        r.l(x, "shares"), ric));
            }
        }
        return out;
    }

    // ───────────────────────── Video ─────────────────────────

    public List<YoutubeDto.Video> video(String dal, String al) {
        Periodo p = periodo(dal, al);
        return inCache("video:" + p, Duration.ofMinutes(5), () -> {
            List<JsonNode> grezzi = tuttiIVideo();
            Map<String, JsonNode> analytics = new HashMap<>();
            YoutubeGoogleClient.Report[] rif = new YoutubeGoogleClient.Report[1];
            try {
                YoutubeGoogleClient.Report r = google.report(p.dal.toString(), p.al.toString(),
                        "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,shares",
                        "video", null, "-views", 200);
                r.righe().forEach(x -> analytics.put(r.s(x, "video"), x));
                rif[0] = r;
            } catch (Exception e) {
                logger.debug("[YOUTUBE] Analytics per video non disponibili: {}", e.getMessage());
            }
            Map<String, Boolean> tipi = tipiVideo();
            List<YoutubeDto.Video> out = new ArrayList<>();
            for (JsonNode v : grezzi) {
                String id = v.path("id").asText();
                out.add(video(v, analytics.get(id), rif[0], tipi.get(id)));
            }
            return out;
        });
    }

    /**
     * Video → è uno Short, secondo la classificazione di YouTube (creatorContentType) sui 200 video più visti di sempre.
     * Dal 2024 gli Short durano fino a 3 minuti e non serve #shorts: dalla durata non si capisce.
     */
    private Map<String, Boolean> tipiVideo() {
        return sicuro(() -> inCache("tipi-video", Duration.ofHours(6), () -> {
            YoutubeGoogleClient.Report r = google.report(nascitaCanale(canaleGrezzo()), LocalDate.now(PACIFICO).toString(),
                    "views", "video,creatorContentType", null, "-views", 200);
            Map<String, Boolean> out = new HashMap<>();
            r.righe().forEach(x -> out.merge(r.s(x, "video"), "SHORTS".equals(r.s(x, "creatorContentType")), Boolean::logicalOr));
            return out;
        }), Map.of());
    }

    private List<JsonNode> tuttiIVideo() {
        return inCache("tutti-video", Duration.ofMinutes(5), () -> {
            List<String> ids = new ArrayList<>();
            String pagina = null;
            do {
                Map<String, Object> par = new HashMap<>();
                par.put("part", "contentDetails");
                par.put("playlistId", playlistCaricamenti());
                par.put("maxResults", 50);
                par.put("pageToken", pagina);
                JsonNode n = google.data("playlistItems", par);
                n.path("items").forEach(i -> ids.add(i.path("contentDetails").path("videoId").asText()));
                pagina = n.path("nextPageToken").asText(null);
            } while (pagina != null && ids.size() < MAX_VIDEO);

            List<JsonNode> out = new ArrayList<>();
            for (int i = 0; i < ids.size(); i += 50) {
                List<String> blocco = ids.subList(i, Math.min(ids.size(), i + 50));
                google.data("videos", Map.of("part", "snippet,statistics,contentDetails,status", "id", String.join(",", blocco)))
                        .path("items").forEach(out::add);
            }
            out.sort(Comparator.comparing((JsonNode v) -> v.path("snippet").path("publishedAt").asText("")).reversed());
            return out;
        });
    }

    /** {@code short_} è la classificazione di Analytics; se manca (video poco visti) si stima da durata e #shorts. */
    private static YoutubeDto.Video video(JsonNode v, JsonNode a, YoutubeGoogleClient.Report r, Boolean short_) {
        JsonNode sn = v.path("snippet");
        JsonNode st = v.path("statistics");
        long durata = durataSecondi(v.path("contentDetails").path("duration").asText(""));
        String testo = (sn.path("title").asText("") + " " + sn.path("description").asText("")).toLowerCase(Locale.ROOT);
        boolean breve = short_ != null ? short_ : durata > 0 && (durata <= 60 || (durata <= 180 && testo.contains("#short")));
        return new YoutubeDto.Video(
                v.path("id").asText(),
                sn.path("title").asText(""),
                miniatura(sn.path("thumbnails")),
                sn.path("publishedAt").asText(null),
                durata,
                breve,
                v.path("status").path("privacyStatus").asText("public"),
                v.path("status").path("publishAt").asText(null),
                st.path("viewCount").asLong(0),
                st.path("likeCount").asLong(0),
                st.path("commentCount").asLong(0),
                a == null ? null : r.l(a, "views"),
                a == null ? null : r.l(a, "estimatedMinutesWatched"),
                a == null ? null : r.d(a, "averageViewDuration"),
                a == null ? null : r.d(a, "averageViewPercentage"),
                a == null ? null : r.l(a, "subscribersGained"),
                a == null ? null : r.l(a, "shares"));
    }

    public YoutubeDto.VideoDettaglio dettaglioVideo(String videoId, String dal, String al) {
        String id = idValido(videoId);
        JsonNode v = videoGrezzo(id);
        LocalDate pubblicato = dataPubblicazione(v);
        // Di default dal giorno di pubblicazione all'ultimo giorno con dati; l'inizio non va spostato prima dell'uscita
        Periodo p = periodo(dal != null ? dal : pubblicato.toString(), al, dal != null);
        return inCache("dettaglio:" + id + ":" + p, Duration.ofMinutes(10), () -> {
            String filtro = "video==" + id;
            YoutubeDto.Totali tot = sicuro(() -> totali(p.dal, p.al, filtro), null);
            List<YoutubeDto.Giorno> serie = sicuro(() -> serieGiornaliera(
                    google.report(p.dal.toString(), p.al.toString(), METRICHE_BASE, "day", filtro, "day", null), null, p), List.of());
            List<YoutubeDto.PuntoRitenzione> ritenzione = sicuro(() -> {
                YoutubeGoogleClient.Report r = google.report(p.dal.toString(), p.al.toString(),
                        "audienceWatchRatio,relativeRetentionPerformance", "elapsedVideoTimeRatio", filtro, null, null);
                return r.righe().stream().map(x -> new YoutubeDto.PuntoRitenzione(r.d(x, "elapsedVideoTimeRatio"),
                        r.d(x, "audienceWatchRatio"), r.cella(x, "relativeRetentionPerformance").isNumber()
                        ? r.d(x, "relativeRetentionPerformance") : null)).toList();
            }, List.of());
            List<YoutubeDto.Voce> fonti = classifica(() -> google.report(p.dal.toString(), p.al.toString(),
                    "views,estimatedMinutesWatched", "insightTrafficSourceType", filtro, "-views", null),
                    "insightTrafficSourceType", "views", "estimatedMinutesWatched", YoutubeStudioService::etichettaFonte);
            List<YoutubeDto.Voce> ricerche = classifica(() -> google.report(p.dal.toString(), p.al.toString(),
                    "views", "insightTrafficSourceDetail", filtro + ";insightTrafficSourceType==YT_SEARCH", "-views", 25),
                    "insightTrafficSourceDetail", "views", null, s -> s);
            List<YoutubeDto.Voce> dispositivi = classifica(() -> google.report(p.dal.toString(), p.al.toString(),
                    "views,estimatedMinutesWatched", "deviceType", filtro, "-views", null),
                    "deviceType", "views", "estimatedMinutesWatched", YoutubeStudioService::etichettaDispositivo);
            List<YoutubeDto.Voce> paesi = classifica(() -> google.report(p.dal.toString(), p.al.toString(),
                    "views,estimatedMinutesWatched", "country", filtro, "-views", 10),
                    "country", "views", "estimatedMinutesWatched", YoutubeStudioService::etichettaPaese);

            JsonNode sn = v.path("snippet");
            List<String> tag = new ArrayList<>();
            sn.path("tags").forEach(t -> tag.add(t.asText()));
            return new YoutubeDto.VideoDettaglio(video(v, null, null, tipiVideo().get(id)),sn.path("description").asText(""), tag,
                    sn.path("categoryId").asText(null), tot, serie, ritenzione, fonti, ricerche, dispositivi, paesi);
        });
    }

    public YoutubeDto.VideoDettaglio modificaVideo(String videoId, YoutubeDto.ModificaVideo req) {
        String id = idValido(videoId);
        if (req == null || req.titolo() == null || req.titolo().isBlank()) {
            throw new IllegalArgumentException("Il titolo è obbligatorio");
        }
        if (req.titolo().length() > 100) {
            throw new IllegalArgumentException("Il titolo può avere al massimo 100 caratteri");
        }
        if (req.descrizione() != null && req.descrizione().length() > 5000) {
            throw new IllegalArgumentException("La descrizione può avere al massimo 5000 caratteri");
        }
        cache.remove("video-grezzo:" + id);
        JsonNode attuale = videoGrezzo(id);
        JsonNode sn = attuale.path("snippet");

        ObjectNode snippet = objectMapper.createObjectNode();
        snippet.put("title", req.titolo().trim());
        snippet.put("description", req.descrizione() != null ? req.descrizione() : sn.path("description").asText(""));
        snippet.put("categoryId", sn.path("categoryId").asText("22"));
        if (sn.hasNonNull("defaultLanguage")) {
            snippet.put("defaultLanguage", sn.path("defaultLanguage").asText());
        }
        if (sn.hasNonNull("defaultAudioLanguage")) {
            snippet.put("defaultAudioLanguage", sn.path("defaultAudioLanguage").asText());
        }
        ArrayNode tags = snippet.putArray("tags");
        List<String> nuoviTag = req.tag();
        if (nuoviTag == null) {
            sn.path("tags").forEach(tags::add);
        } else {
            nuoviTag.stream().map(String::trim).filter(t -> !t.isEmpty()).distinct().forEach(tags::add);
        }

        // Lo status va rimandato intero (i campi omessi tornano ai default): si parte da quello attuale
        ObjectNode status = attuale.path("status").deepCopy();
        status.remove(List.of("uploadStatus", "failureReason", "rejectionReason", "madeForKids"));
        if (req.privacy() != null && !req.privacy().isBlank()) {
            String privacy = req.privacy().trim();
            if (!List.of("public", "unlisted", "private").contains(privacy)) {
                throw new IllegalArgumentException("Visibilità non valida");
            }
            if (!privacy.equals(status.path("privacyStatus").asText())) {
                status.remove("publishAt");
            }
            status.put("privacyStatus", privacy);
        }

        ObjectNode body = objectMapper.createObjectNode();
        body.put("id", id);
        body.set("snippet", snippet);
        body.set("status", status);
        google.dataScrivi(HttpMethod.PUT, "videos", Map.of("part", "snippet,status"), body);
        logger.info("[YOUTUBE] Video {} aggiornato", id);
        svuotaCacheVideo(id);
        return dettaglioVideo(id, null, null);
    }

    private JsonNode videoGrezzo(String id) {
        return inCache("video-grezzo:" + id, Duration.ofMinutes(2), () -> {
            JsonNode items = google.data("videos", Map.of("part", "snippet,statistics,contentDetails,status", "id", id)).path("items");
            if (items.isEmpty()) {
                throw new RisorsaNonTrovataException("Video non trovato");
            }
            JsonNode v = items.get(0);
            if (!v.path("snippet").path("channelId").asText().equals(canaleId())) {
                throw new GoogleRifiutoException(HttpStatus.FORBIDDEN, "Il video non è del canale collegato", null);
            }
            return v;
        });
    }

    private void svuotaCacheVideo(String id) {
        cache.keySet().removeIf(k -> k.startsWith("video") || k.startsWith("tutti-video") || k.startsWith("ultimi-video")
                || k.startsWith("dettaglio:" + id));
    }

    // ───────────────────────── Pubblico ─────────────────────────

    public YoutubeDto.Pubblico pubblico(String dal, String al) {
        Periodo p = periodo(dal, al);
        String d = p.dal.toString();
        String a = p.al.toString();
        return inCache("pubblico:" + p, Duration.ofMinutes(15), () -> {
            List<YoutubeDto.Demografia> demografia = sicuro(() -> {
                YoutubeGoogleClient.Report r = google.report(d, a, "viewerPercentage", "ageGroup,gender", null, "ageGroup", null);
                Map<String, double[]> perFascia = new TreeMap<>();
                r.righe().forEach(x -> {
                    double[] v = perFascia.computeIfAbsent(r.s(x, "ageGroup"), k -> new double[3]);
                    String g = r.s(x, "gender");
                    v["male".equals(g) ? 0 : "female".equals(g) ? 1 : 2] += r.d(x, "viewerPercentage");
                });
                return perFascia.entrySet().stream()
                        .map(e -> new YoutubeDto.Demografia(etichettaEta(e.getKey()), e.getValue()[0], e.getValue()[1], e.getValue()[2]))
                        .toList();
            }, List.of());
            return new YoutubeDto.Pubblico(
                    demografia,
                    classifica(() -> google.report(d, a, "views,estimatedMinutesWatched", "country", null, "-views", 25),
                            "country", "views", "estimatedMinutesWatched", YoutubeStudioService::etichettaPaese),
                    classifica(() -> google.report(d, a, "views,estimatedMinutesWatched", "deviceType", null, "-views", null),
                            "deviceType", "views", "estimatedMinutesWatched", YoutubeStudioService::etichettaDispositivo),
                    classifica(() -> google.report(d, a, "views,estimatedMinutesWatched", "operatingSystem", null, "-views", 10),
                            "operatingSystem", "views", "estimatedMinutesWatched", YoutubeStudioService::etichettaSistema),
                    classifica(() -> google.report(d, a, "views,estimatedMinutesWatched", "insightTrafficSourceType", null, "-views", null),
                            "insightTrafficSourceType", "views", "estimatedMinutesWatched", YoutubeStudioService::etichettaFonte),
                    classifica(() -> google.report(d, a, "views", "insightTrafficSourceDetail",
                            "insightTrafficSourceType==YT_SEARCH", "-views", 30), "insightTrafficSourceDetail", "views", null, s -> s),
                    classifica(() -> google.report(d, a, "views", "insightTrafficSourceDetail",
                            "insightTrafficSourceType==EXT_URL", "-views", 15), "insightTrafficSourceDetail", "views", null, s -> s),
                    classifica(() -> google.report(d, a, "views,estimatedMinutesWatched", "insightPlaybackLocationType", null, "-views", null),
                            "insightPlaybackLocationType", "views", "estimatedMinutesWatched", YoutubeStudioService::etichettaLuogo),
                    classifica(() -> google.report(d, a, "views,averageViewDuration", "subscribedStatus", null, null, null),
                            "subscribedStatus", "views", "averageViewDuration",
                            s -> "SUBSCRIBED".equals(s) ? "Iscritti" : "Non iscritti"),
                    classifica(() -> google.report(d, a, "shares", "sharingService", null, "-shares", 10),
                            "sharingService", "shares", null, YoutubeStudioService::etichettaCondivisione));
        });
    }

    // ───────────────────────── Commenti ─────────────────────────

    public YoutubeDto.PaginaCommenti commenti(String pagina, String ordine, String videoId, String cerca, String moderazione) {
        Map<String, Object> par = new HashMap<>();
        par.put("part", "snippet,replies");
        par.put("maxResults", 40);
        par.put("textFormat", "plainText");
        par.put("order", "relevance".equals(ordine) ? "relevance" : "time");
        par.put("pageToken", pagina);
        if (cerca != null && !cerca.isBlank()) {
            par.put("searchTerms", cerca.trim());
        }
        if (moderazione != null && List.of("heldForReview", "likelySpam").contains(moderazione)) {
            par.put("moderationStatus", moderazione);
        }
        if (videoId != null && !videoId.isBlank()) {
            par.put("videoId", idValido(videoId));
        } else {
            par.put("allThreadsRelatedToChannelId", canaleId());
        }
        JsonNode n = google.data("commentThreads", par);
        String mioCanale = canaleId();

        Set<String> videoIds = new LinkedHashSet<>();
        n.path("items").forEach(t -> videoIds.add(t.path("snippet").path("videoId").asText()));
        Map<String, String> titoli = titoliVideo(videoIds);

        List<YoutubeDto.Commento> out = new ArrayList<>();
        n.path("items").forEach(t -> {
            JsonNode ts = t.path("snippet");
            JsonNode top = ts.path("topLevelComment");
            JsonNode cs = top.path("snippet");
            List<YoutubeDto.Risposta> risposte = new ArrayList<>();
            boolean risposto = false;
            for (JsonNode r : t.path("replies").path("comments")) {
                boolean delCanale = mioCanale.equals(r.path("snippet").path("authorChannelId").path("value").asText());
                risposto |= delCanale;
                risposte.add(risposta(r, delCanale));
            }
            risposte.sort(Comparator.comparing(YoutubeDto.Risposta::pubblicatoIl, Comparator.nullsLast(Comparator.naturalOrder())));
            String vid = ts.path("videoId").asText();
            out.add(new YoutubeDto.Commento(
                    t.path("id").asText(),
                    top.path("id").asText(),
                    vid,
                    titoli.getOrDefault(vid, ""),
                    cs.path("authorDisplayName").asText(""),
                    cs.path("authorProfileImageUrl").asText(null),
                    cs.path("authorChannelUrl").asText(null),
                    cs.path("textOriginal").asText(cs.path("textDisplay").asText("")),
                    cs.path("likeCount").asLong(0),
                    cs.path("publishedAt").asText(null),
                    ts.path("totalReplyCount").asLong(0),
                    risposto,
                    risposte,
                    cs.path("moderationStatus").asText("published")));
        });
        return new YoutubeDto.PaginaCommenti(out, n.path("nextPageToken").asText(null));
    }

    public YoutubeDto.Risposta rispondi(String commentoId, String testo) {
        if (testo == null || testo.isBlank()) {
            throw new IllegalArgumentException("Scrivi la risposta");
        }
        if (testo.length() > 10_000) {
            throw new IllegalArgumentException("Risposta troppo lunga");
        }
        ObjectNode body = objectMapper.createObjectNode();
        ObjectNode sn = body.putObject("snippet");
        sn.put("parentId", idValido(commentoId));
        sn.put("textOriginal", testo.trim());
        JsonNode r = google.dataScrivi(HttpMethod.POST, "comments", Map.of("part", "snippet"), body);
        return risposta(r, true);
    }

    public void modera(String commentoId, String stato) {
        if (!List.of("published", "heldForReview", "rejected").contains(stato)) {
            throw new IllegalArgumentException("Stato di moderazione non valido");
        }
        google.dataScrivi(HttpMethod.POST, "comments/setModerationStatus",
                Map.of("id", idValido(commentoId), "moderationStatus", stato), null);
    }

    private static YoutubeDto.Risposta risposta(JsonNode r, boolean delCanale) {
        JsonNode s = r.path("snippet");
        return new YoutubeDto.Risposta(r.path("id").asText(), s.path("authorDisplayName").asText(""),
                s.path("authorProfileImageUrl").asText(null), s.path("textOriginal").asText(s.path("textDisplay").asText("")),
                s.path("likeCount").asLong(0), s.path("publishedAt").asText(null), delCanale);
    }

    Map<String, String> titoliVideo(Collection<String> ids) {
        Map<String, String> out = new HashMap<>();
        List<String> lista = ids.stream().filter(s -> s != null && !s.isBlank()).distinct().toList();
        for (int i = 0; i < lista.size(); i += 50) {
            google.data("videos", Map.of("part", "snippet", "id", String.join(",", lista.subList(i, Math.min(lista.size(), i + 50)))))
                    .path("items").forEach(v -> out.put(v.path("id").asText(), v.path("snippet").path("title").asText("")));
        }
        return out;
    }

    // ───────────────────────── Utilità ─────────────────────────

    record Periodo(LocalDate dal, LocalDate al) {
        LocalDate dalPrecedente() {
            return dal.minusDays(ChronoUnit.DAYS.between(dal, al) + 1);
        }

        LocalDate alPrecedente() {
            return dal.minusDays(1);
        }
    }

    Periodo periodo(String dal, String al) {
        return periodo(dal, al, true);
    }

    /**
     * Il periodo chiesto, fermato all'ultimo giorno con dati Analytics. Con {@code scorri} mantiene la durata spostando
     * indietro anche l'inizio ("ultimi 28 giorni" = 28 giorni pieni, come in Studio), altrimenti accorcia la fine.
     */
    Periodo periodo(String dal, String al, boolean scorri) {
        return periodo(dal, al, scorri, ultimoGiornoConDati());
    }

    static Periodo periodo(String dal, String al, boolean scorri, LocalDate ultimo) {
        boolean senzaFine = al == null || al.isBlank();
        LocalDate fine = senzaFine ? ultimo : LocalDate.parse(al);
        LocalDate inizio = dal == null || dal.isBlank() ? fine.minusDays(27) : LocalDate.parse(dal);
        if (senzaFine && inizio.isAfter(fine)) {
            // Es. video uscito dopo l'ultimo giorno che Analytics ha elaborato
            inizio = fine;
        }
        if (inizio.isAfter(fine)) {
            throw new IllegalArgumentException("La data di inizio non può essere dopo la fine");
        }
        if (fine.isAfter(ultimo)) {
            long scarto = ChronoUnit.DAYS.between(ultimo, fine);
            fine = ultimo;
            inizio = scorri ? inizio.minusDays(scarto) : inizio;
            if (inizio.isAfter(fine)) {
                inizio = fine;
            }
        }
        if (inizio.isBefore(LocalDate.of(2005, 2, 14))) {
            inizio = LocalDate.of(2005, 2, 14);
        }
        return new Periodo(inizio, fine);
    }

    private static LocalDate dataPubblicazione(JsonNode v) {
        String s = v.path("snippet").path("publishedAt").asText("");
        try {
            return Instant.parse(s).atZone(PACIFICO).toLocalDate();
        } catch (Exception e) {
            return LocalDate.now(PACIFICO).minusDays(27);
        }
    }

    private List<YoutubeDto.Voce> classifica(Supplier<YoutubeGoogleClient.Report> query, String dimensione, String metrica,
                                            String secondaria, java.util.function.UnaryOperator<String> etichetta) {
        return sicuro(() -> {
            YoutubeGoogleClient.Report r = query.get();
            return unisciPerEtichetta(r.righe().stream().map(x -> {
                String k = r.s(x, dimensione);
                return new YoutubeDto.Voce(k, etichetta.apply(k), r.d(x, metrica), secondaria == null ? null : r.d(x, secondaria));
            }).toList(), secondaria != null && secondaria.startsWith("average"));
        }, List.of());
    }

    /**
     * Più chiavi di Analytics possono avere la stessa etichetta (BROWSE e SUBSCRIBER, le varie "Altro"): vanno sommate,
     * altrimenti la stessa voce compare due volte con metà del valore. Le medie si pesano sul valore principale.
     */
    static List<YoutubeDto.Voce> unisciPerEtichetta(List<YoutubeDto.Voce> voci, boolean secondariaMedia) {
        Map<String, YoutubeDto.Voce> perEtichetta = new LinkedHashMap<>();
        for (YoutubeDto.Voce v : voci) {
            perEtichetta.merge(v.etichetta(), v, (a, b) -> {
                double valore = a.valore() + b.valore();
                Double sec = a.secondario() == null || b.secondario() == null ? a.secondario()
                        : secondariaMedia
                        ? (valore == 0 ? 0 : (a.secondario() * a.valore() + b.secondario() * b.valore()) / valore)
                        : a.secondario() + b.secondario();
                return new YoutubeDto.Voce(a.chiave(), a.etichetta(), valore, sec);
            });
        }
        List<YoutubeDto.Voce> out = new ArrayList<>(perEtichetta.values());
        if (out.size() < voci.size()) {
            out.sort(Comparator.comparingDouble(YoutubeDto.Voce::valore).reversed());
        }
        return out;
    }

    /** I report secondari non devono far cadere la pagina: se Google li rifiuta restano vuoti. */
    private static <T> T sicuro(Supplier<T> s, T altrimenti) {
        try {
            return s.get();
        } catch (Exception e) {
            logger.debug("[YOUTUBE] Report non disponibile: {}", e.getMessage());
            return altrimenti;
        }
    }

    @SuppressWarnings("unchecked")
    private <T> T inCache(String chiave, Duration durata, Supplier<T> calcolo) {
        Voce<?> v = cache.get(chiave);
        if (v != null && Instant.now().isBefore(v.scade())) {
            return (T) v.valore();
        }
        T valore = calcolo.get();
        cache.put(chiave, new Voce<>(valore, Instant.now().plus(durata)));
        if (cache.size() > 400) {
            Instant adesso = Instant.now();
            cache.entrySet().removeIf(e -> adesso.isAfter(e.getValue().scade()));
        }
        return valore;
    }

    private static String idValido(String id) {
        if (id == null || !id.matches("[A-Za-z0-9_\\-.]{5,120}")) {
            throw new IllegalArgumentException("Identificativo non valido");
        }
        return id;
    }

    private static String miniatura(JsonNode thumbs) {
        for (String k : List.of("maxres", "standard", "high", "medium", "default")) {
            String u = thumbs.path(k).path("url").asText(null);
            if (u != null) {
                return u;
            }
        }
        return null;
    }

    static long durataSecondi(String iso) {
        try {
            return iso == null || iso.isBlank() ? 0 : Duration.parse(iso).getSeconds();
        } catch (Exception e) {
            return 0;
        }
    }

    private static Long parseLong(String s) {
        try {
            return s == null ? null : Long.parseLong(s.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    static String etichettaFonte(String k) {
        return switch (k) {
            case "YT_SEARCH" -> "Ricerca YouTube";
            case "SUGGESTED", "RELATED_VIDEO" -> "Video suggeriti";
            case "BROWSE", "SUBSCRIBER" -> "Home e iscrizioni";
            case "SHORTS" -> "Feed Shorts";
            case "EXT_URL" -> "Siti e app esterni";
            case "NO_LINK_OTHER", "NO_LINK_EMBEDDED" -> "Diretto o sconosciuto";
            case "PLAYLIST", "YT_PLAYLIST_PAGE" -> "Playlist";
            case "YT_CHANNEL" -> "Pagine del canale";
            case "NOTIFICATION" -> "Notifiche";
            case "END_SCREEN" -> "Schermate finali";
            case "ANNOTATION" -> "Schede e annotazioni";
            case "ADVERTISING", "PROMOTED", "CAMPAIGN_CARD" -> "Pubblicità";
            case "HASHTAGS" -> "Hashtag";
            case "YT_OTHER_PAGE" -> "Altre pagine YouTube";
            case "LIVE_REDIRECT" -> "Reindirizzamento live";
            case "SOUND_PAGE" -> "Pagine audio";
            case "VIDEO_REMIXES" -> "Remix";
            case "PRODUCT_PAGE" -> "Pagine prodotto";
            default -> capitalizza(k);
        };
    }

    static String etichettaDispositivo(String k) {
        return switch (k) {
            case "MOBILE" -> "Smartphone";
            case "DESKTOP" -> "Computer";
            case "TABLET" -> "Tablet";
            case "TV" -> "TV";
            case "GAME_CONSOLE" -> "Console";
            default -> "Altro";
        };
    }

    static String etichettaLuogo(String k) {
        return switch (k) {
            case "WATCH" -> "Pagina di visione";
            case "EMBEDDED" -> "Incorporato in siti";
            case "CHANNEL" -> "Pagina del canale";
            case "SHORTS" -> "Feed Shorts";
            case "SEARCH" -> "Risultati di ricerca";
            case "BROWSE" -> "Home e iscrizioni";
            case "EXTERNAL_APP", "MOBILE" -> "App esterne";
            default -> "Altro";
        };
    }

    static String etichettaTipoContenuto(String k) {
        return switch (k) {
            case "VIDEO_ON_DEMAND" -> "Video";
            case "SHORTS" -> "Short";
            case "LIVE_STREAM" -> "Live";
            case "STORY" -> "Storie";
            default -> "Altro";
        };
    }

    static String etichettaSistema(String k) {
        return switch (k) {
            case "ANDROID" -> "Android";
            case "IOS" -> "iOS";
            case "WINDOWS" -> "Windows";
            case "MACINTOSH" -> "macOS";
            case "LINUX" -> "Linux";
            case "CHROMECAST" -> "Chromecast";
            case "SMART_TV" -> "Smart TV";
            case "PLAYSTATION", "XBOX", "NINTENDO" -> capitalizza(k);
            default -> capitalizza(k);
        };
    }

    static String etichettaCondivisione(String k) {
        return switch (k) {
            case "WHATS_APP" -> "WhatsApp";
            case "FACEBOOK", "FACEBOOK_MESSENGER" -> "Facebook";
            case "COPY_PASTE" -> "Link copiato";
            case "TWITTER" -> "X (Twitter)";
            case "TELEGRAM" -> "Telegram";
            case "INSTAGRAM" -> "Instagram";
            case "GMAIL", "MAIL" -> "Email";
            case "ANDROID_MESSENGER", "TEXT_MESSAGE" -> "SMS";
            default -> capitalizza(k);
        };
    }

    static String etichettaPaese(String k) {
        if (k == null || k.length() != 2) {
            return k;
        }
        String nome = Locale.of("", k).getDisplayCountry(Locale.ITALIAN);
        return nome.isBlank() ? k : nome;
    }

    static String etichettaEta(String k) {
        return k.replace("age", "").replace("-", "–").replace("65–", "65+");
    }

    private static String capitalizza(String k) {
        if (k == null || k.isBlank()) {
            return "Altro";
        }
        String s = k.replace('_', ' ').toLowerCase(Locale.ROOT);
        return Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }
}
