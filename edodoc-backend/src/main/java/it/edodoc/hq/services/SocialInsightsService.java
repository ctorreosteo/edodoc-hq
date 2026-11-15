package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import it.edodoc.hq.dto.SocialDto;
import it.edodoc.hq.exception.SocialIntegrazioneException;
import it.edodoc.hq.services.SocialAccountService.AccountInterno;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Statistiche della pagina Meta: panoramica con confronto sul periodo precedente, contenuti con le loro
 * metriche, pubblico Instagram. Tutto letto da Meta al momento (con cache di un minuto).
 *
 * <p>Le metriche Meta cambiano nome spesso (impressions → views): per ogni numero si chiedono piu candidate
 * e si usa la prima disponibile, tramite {@link SocialGraphClient#metricheTolleranti}.
 */
@Service
public class SocialInsightsService {

    private static final Logger logger = LoggerFactory.getLogger(SocialInsightsService.class);

    /** Le statistiche Meta si muovono lentamente: due minuti bastano, e i tre periodi si tengono caldi insieme. */
    private static final Duration TTL_PANORAMICA = Duration.ofMinutes(2);
    private static final Duration TTL_CONTENUTI = Duration.ofMinutes(3);
    private static final Duration TTL_PUBBLICO = Duration.ofHours(1);

    static final List<String> FB_COPERTURA = List.of("page_total_media_view_unique", "page_impressions_unique");
    static final List<String> FB_VISUALIZZAZIONI = List.of("page_media_view", "page_impressions");
    static final List<String> FB_INTERAZIONI = List.of("page_post_engagements");
    static final List<String> FB_NUOVI_FOLLOWER = List.of("page_daily_follows_unique", "page_fan_adds_unique");
    static final List<String> FB_VISITE = List.of("page_views_total");

    static final List<String> FB_POST_COPERTURA = List.of("post_total_media_view_unique", "post_impressions_unique");
    static final List<String> FB_POST_VISUALIZZAZIONI = List.of("post_media_view", "post_impressions");

    private static final List<String> IG_TOTALI = List.of(
            "reach", "views", "accounts_engaged", "total_interactions", "profile_views", "website_clicks");
    private static final List<String> IG_MEDIA = List.of("reach", "views", "saved", "shares", "total_interactions");

    private final SocialAccountService accountService;
    private final SocialGraphClient graph;
    private final SocialCache cache;
    private final SocialCommentiService commentiService;
    private final SocialAzioniService azioniService;

    /**
     * Blocchi paralleli della panoramica (Facebook, Instagram, contenuti, community, e le 4 richieste Instagram).
     * Elastico: i blocchi si aspettano a vicenda e un pool piccolo li bloccherebbe; il numero e fisso per struttura.
     */
    private final ExecutorService esecutore = Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "social-insights");
        t.setDaemon(true);
        return t;
    });

    public SocialInsightsService(SocialAccountService accountService, SocialGraphClient graph, SocialCache cache,
                                 SocialCommentiService commentiService, SocialAzioniService azioniService) {
        this.accountService = accountService;
        this.graph = graph;
        this.cache = cache;
        this.commentiService = commentiService;
        this.azioniService = azioniService;
    }

    @PreDestroy
    void chiudi() {
        esecutore.shutdownNow();
    }

    // ── Panoramica ──

    public SocialDto.Panoramica panoramica(String pageId, int giorniRichiesti) {
        AccountInterno a = accountService.risolvi(pageId);
        int giorni = giorniRichiesti <= 7 ? 7 : giorniRichiesti <= 14 ? 14 : 28;
        return cache.ottieni(a.pageId(), "panoramica:" + giorni, TTL_PANORAMICA, () -> calcolaPanoramica(a, giorni));
    }

    private SocialDto.Panoramica calcolaPanoramica(AccountInterno a, int giorni) {
        LocalDate al = LocalDate.now(SocialTempo.ROMA);
        LocalDate dal = al.minusDays(giorni - 1L);
        LocalDate precAl = dal.minusDays(1);
        LocalDate precDal = precAl.minusDays(giorni - 1L);

        // Quattro blocchi indipendenti, tutti verso Meta: in parallelo, non uno dopo l'altro.
        Map<String, Map<LocalDate, Long>> fbSerie = new java.util.concurrent.ConcurrentHashMap<>();
        Map<String, Map<LocalDate, Long>> igSerie = new java.util.concurrent.ConcurrentHashMap<>();
        CompletableFuture<SocialDto.Piattaforma> fbFuturo = CompletableFuture.supplyAsync(
                () -> facebook(a, dal, al, precDal, precAl, fbSerie), esecutore);
        CompletableFuture<SocialDto.Piattaforma> igFuturo = CompletableFuture.supplyAsync(
                () -> instagram(a, dal, al, precDal, precAl, igSerie), esecutore);
        CompletableFuture<List<SocialDto.Contenuto>> contenutiFuturo = CompletableFuture.supplyAsync(() -> {
            try {
                return contenuti(a.pageId(), "TUTTE", 50);
            } catch (SocialIntegrazioneException e) {
                logger.warn("Social: contenuti per la panoramica non disponibili: {}", e.getMessage());
                return List.<SocialDto.Contenuto>of();
            }
        }, esecutore);
        CompletableFuture<SocialDto.Community> communityFuturo = CompletableFuture.supplyAsync(() -> {
            try {
                return commentiService.elenco(a.pageId(), "TUTTE").community();
            } catch (SocialIntegrazioneException e) {
                logger.warn("Social: community per la panoramica non disponibile: {}", e.getMessage());
                return null;
            }
        }, esecutore);
        SocialDto.Piattaforma facebook = fbFuturo.join();
        SocialDto.Piattaforma instagram = igFuturo.join();

        List<SocialDto.PuntoSerie> serie = new ArrayList<>();
        for (LocalDate g = dal; !g.isAfter(al); g = g.plusDays(1)) {
            serie.add(new SocialDto.PuntoSerie(g.toString(),
                    valore(fbSerie, "copertura", g), valore(fbSerie, "visualizzazioni", g), valore(fbSerie, "interazioni", g),
                    valore(igSerie, "copertura", g), valore(igSerie, "nuoviFollower", g)));
        }

        List<SocialDto.Contenuto> contenuti = contenutiFuturo.join();
        List<SocialDto.CellaOrario> orari = SocialCalcoli.orariMigliori(contenuti, Instant.now().minus(90, ChronoUnit.DAYS));
        List<SocialDto.Contenuto> top = contenuti.stream()
                .filter(c -> c.interazioni() != null)
                .sorted(Comparator.comparing(SocialDto.Contenuto::interazioni).reversed())
                .limit(6)
                .toList();

        SocialDto.Community community = communityFuturo.join();

        return new SocialDto.Panoramica(a.pageId(), giorni, SocialTempo.adesso(), facebook, instagram, serie, orari, top,
                community, azioniService.recenti(a.pageId(), 20));
    }

    private static Long valore(Map<String, Map<LocalDate, Long>> serie, String chiave, LocalDate g) {
        Map<LocalDate, Long> s = serie.get(chiave);
        return s == null ? null : s.get(g);
    }

    private SocialDto.Piattaforma facebook(AccountInterno a, LocalDate dal, LocalDate al, LocalDate precDal, LocalDate precAl,
                                           Map<String, Map<LocalDate, Long>> serieOut) {
        try {
            List<String> tutte = new ArrayList<>();
            List.of(FB_COPERTURA, FB_VISUALIZZAZIONI, FB_INTERAZIONI, FB_NUOVI_FOLLOWER, FB_VISITE).forEach(tutte::addAll);
            Map<String, String> p = new LinkedHashMap<>();
            p.put("period", "day");
            p.put("since", String.valueOf(precDal.atStartOfDay(SocialTempo.ROMA).toEpochSecond()));
            p.put("until", String.valueOf(al.plusDays(1).atStartOfDay(SocialTempo.ROMA).toEpochSecond()));
            Map<String, JsonNode> m = graph.metricheTolleranti(a.pageId(), "fb_page_day", tutte, p, a.token());

            List<SocialDto.Metrica> metriche = new ArrayList<>();
            metricaFb(metriche, serieOut, m, FB_COPERTURA, "copertura", "Copertura",
                    "Persone raggiunte dai contenuti della pagina, sommate giorno per giorno", dal, al, precDal, precAl);
            metricaFb(metriche, serieOut, m, FB_VISUALIZZAZIONI, "visualizzazioni", "Visualizzazioni",
                    "Quante volte i contenuti della pagina sono stati visti", dal, al, precDal, precAl);
            metricaFb(metriche, serieOut, m, FB_INTERAZIONI, "interazioni", "Interazioni",
                    "Reazioni, commenti, condivisioni e clic sui post", dal, al, precDal, precAl);
            metricaFb(metriche, serieOut, m, FB_NUOVI_FOLLOWER, "nuoviFollower", "Nuovi follower",
                    "Persone che hanno iniziato a seguire la pagina", dal, al, precDal, precAl);
            metricaFb(metriche, serieOut, m, FB_VISITE, "visitePagina", "Visite alla pagina",
                    "Visualizzazioni del profilo della pagina", dal, al, precDal, precAl);
            return new SocialDto.Piattaforma(true, null, a.followerFacebook(), metriche);
        } catch (SocialIntegrazioneException e) {
            return new SocialDto.Piattaforma(false, e.getMessage(), a.followerFacebook(), List.of());
        }
    }

    private static void metricaFb(List<SocialDto.Metrica> out, Map<String, Map<LocalDate, Long>> serieOut,
                                  Map<String, JsonNode> m, List<String> candidate, String chiave, String etichetta,
                                  String descrizione, LocalDate dal, LocalDate al, LocalDate precDal, LocalDate precAl) {
        Map<LocalDate, Long> serie = SocialCalcoli.serieGiornaliera(SocialCalcoli.prima(m, candidate));
        serieOut.put(chiave, serie);
        out.add(new SocialDto.Metrica(chiave, etichetta,
                SocialCalcoli.somma(serie, dal, al), SocialCalcoli.somma(serie, precDal, precAl), descrizione));
    }

    private SocialDto.Piattaforma instagram(AccountInterno a, LocalDate dal, LocalDate al, LocalDate precDal, LocalDate precAl,
                                            Map<String, Map<LocalDate, Long>> serieOut) {
        if (!a.haInstagram()) {
            return new SocialDto.Piattaforma(false,
                    "Nessun profilo Instagram professionale è collegato a questa pagina Facebook.", null, List.of());
        }
        try {
            CompletableFuture<Map<String, JsonNode>> serieOraF = CompletableFuture.supplyAsync(() -> graph.metricheTolleranti(
                    a.instagramId(), "ig_user_day", List.of("reach", "follower_count"), periodo(dal, al, false), a.token()), esecutore);
            CompletableFuture<Map<String, JsonNode>> totaliOraF = CompletableFuture.supplyAsync(() -> graph.metricheTolleranti(
                    a.instagramId(), "ig_user_total", IG_TOTALI, periodo(dal, al, true), a.token()), esecutore);
            CompletableFuture<Map<String, JsonNode>> totaliPrimaF = CompletableFuture.supplyAsync(() -> graph.metricheTolleranti(
                    a.instagramId(), "ig_user_total", IG_TOTALI, periodo(precDal, precAl, true), a.token()), esecutore);
            CompletableFuture<Map<String, JsonNode>> seriePrimaF = CompletableFuture.supplyAsync(() -> {
                try {
                    // follower_count copre solo gli ultimi 30 giorni: sul periodo precedente puo mancare
                    return graph.metricheTolleranti(a.instagramId(), "ig_user_day",
                            List.of("follower_count"), periodo(precDal, precAl, false), a.token());
                } catch (SocialIntegrazioneException e) {
                    logger.debug("Social: follower_count del periodo precedente non disponibile: {}", e.getMessage());
                    return Map.<String, JsonNode>of();
                }
            }, esecutore);
            Map<String, JsonNode> serieOra = unisci(serieOraF);
            Map<String, JsonNode> totaliOra = unisci(totaliOraF);
            Map<String, JsonNode> totaliPrima = unisci(totaliPrimaF);
            Map<String, JsonNode> seriePrima = unisci(seriePrimaF);

            Map<LocalDate, Long> reach = SocialCalcoli.serieGiornaliera(serieOra.get("reach"));
            Map<LocalDate, Long> follower = SocialCalcoli.serieGiornaliera(serieOra.get("follower_count"));
            serieOut.put("copertura", reach);
            serieOut.put("nuoviFollower", follower);
            Map<LocalDate, Long> followerPrima = SocialCalcoli.serieGiornaliera(seriePrima.get("follower_count"));

            List<SocialDto.Metrica> metriche = new ArrayList<>();
            metriche.add(totaleIg(totaliOra, totaliPrima, "reach", "copertura", "Copertura",
                    "Account unici che hanno visto i contenuti nel periodo"));
            metriche.add(totaleIg(totaliOra, totaliPrima, "views", "visualizzazioni", "Visualizzazioni",
                    "Quante volte i contenuti sono stati visti, ripetizioni comprese"));
            metriche.add(totaleIg(totaliOra, totaliPrima, "total_interactions", "interazioni", "Interazioni",
                    "Mi piace, commenti, salvataggi, condivisioni e risposte"));
            metriche.add(totaleIg(totaliOra, totaliPrima, "accounts_engaged", "accountCoinvolti", "Account coinvolti",
                    "Account che hanno interagito almeno una volta"));
            metriche.add(totaleIg(totaliOra, totaliPrima, "profile_views", "visiteProfilo", "Visite al profilo",
                    "Visite al profilo Instagram"));
            metriche.add(totaleIg(totaliOra, totaliPrima, "website_clicks", "clicSito", "Clic sul sito",
                    "Tocchi sul link del profilo"));
            metriche.add(new SocialDto.Metrica("nuoviFollower", "Nuovi follower",
                    SocialCalcoli.somma(follower, dal, al), SocialCalcoli.somma(followerPrima, precDal, precAl),
                    "Saldo giornaliero dei follower (nuovi meno persi)"));
            return new SocialDto.Piattaforma(true, null, a.followerInstagram(), metriche);
        } catch (SocialIntegrazioneException e) {
            return new SocialDto.Piattaforma(false, e.getMessage(), a.followerInstagram(), List.of());
        }
    }

    private static SocialDto.Metrica totaleIg(Map<String, JsonNode> ora, Map<String, JsonNode> prima, String metrica,
                                              String chiave, String etichetta, String descrizione) {
        return new SocialDto.Metrica(chiave, etichetta,
                SocialCalcoli.totale(ora.get(metrica)), SocialCalcoli.totale(prima.get(metrica)), descrizione);
    }

    private static Map<String, String> periodo(LocalDate dal, LocalDate al, boolean totale) {
        Map<String, String> p = new LinkedHashMap<>();
        p.put("period", "day");
        if (totale) {
            p.put("metric_type", "total_value");
        }
        p.put("since", String.valueOf(dal.atStartOfDay(SocialTempo.ROMA).toEpochSecond()));
        // Instagram rifiuta un until nel futuro oltre l'adesso
        long fine = Math.min(al.plusDays(1).atStartOfDay(SocialTempo.ROMA).toEpochSecond(), Instant.now().getEpochSecond());
        p.put("until", String.valueOf(fine));
        return p;
    }

    // ── Contenuti ──

    public List<SocialDto.Contenuto> contenuti(String pageId, String piattaforma, int limite) {
        AccountInterno a = accountService.risolvi(pageId);
        int lim = Math.max(1, Math.min(limite <= 0 ? 30 : limite, 50));
        String p = piattaforma == null ? "TUTTE" : piattaforma.toUpperCase(Locale.ROOT);
        return cache.ottieni(a.pageId(), "contenuti:" + p + ":" + lim, TTL_CONTENUTI, () -> {
            List<SocialDto.Contenuto> out = new ArrayList<>();
            if (!"INSTAGRAM".equals(p)) {
                out.addAll(contenutiFacebook(a, lim));
            }
            if (!"FACEBOOK".equals(p) && a.haInstagram()) {
                out.addAll(contenutiInstagram(a, lim));
            }
            out.sort(Comparator.comparing((SocialDto.Contenuto c) -> c.pubblicatoIl() == null ? "" : c.pubblicatoIl()).reversed());
            return List.copyOf(out);
        });
    }

    private List<SocialDto.Contenuto> contenutiFacebook(AccountInterno a, int limite) {
        List<JsonNode> post = graph.getTutti(a.pageId() + "/published_posts", Map.of(
                "fields", "id,message,created_time,full_picture,permalink_url,status_type,shares,"
                        + "reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),attachments{media_type,type}",
                "limit", String.valueOf(limite)), a.token(), limite);
        List<String> metriche = new ArrayList<>(FB_POST_COPERTURA);
        metriche.addAll(FB_POST_VISUALIZZAZIONI);
        Map<String, Map<String, JsonNode>> insights = insightsInBatch(
                post.stream().map(n -> n.path("id").asText()).toList(), "fb_post", metriche, a);
        return post.stream().map(n -> {
            Map<String, JsonNode> m = insights.getOrDefault(n.path("id").asText(), Map.of());
            Long reazioni = numero(n.path("reactions").path("summary").path("total_count"));
            Long commenti = numero(n.path("comments").path("summary").path("total_count"));
            Long condivisioni = n.path("shares").has("count") ? n.path("shares").path("count").asLong() : 0L;
            Long copertura = valoreLifetime(SocialCalcoli.prima(m, FB_POST_COPERTURA));
            Long interazioni = SocialCalcoli.sommaNullable(reazioni, commenti, condivisioni);
            return new SocialDto.Contenuto(n.path("id").asText(), "FACEBOOK", SocialCalcoli.tipoFacebook(n),
                    n.path("message").asText(null), n.path("full_picture").asText(null),
                    n.path("permalink_url").asText(null), SocialTempo.iso(n.path("created_time").asText(null)),
                    reazioni, commenti, condivisioni, null, copertura,
                    valoreLifetime(SocialCalcoli.prima(m, FB_POST_VISUALIZZAZIONI)),
                    interazioni, SocialCalcoli.tasso(interazioni, copertura));
        }).toList();
    }

    private List<SocialDto.Contenuto> contenutiInstagram(AccountInterno a, int limite) {
        List<JsonNode> media = graph.getTutti(a.instagramId() + "/media", Map.of(
                "fields", "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
                "limit", String.valueOf(limite)), a.token(), limite);
        // Le metriche ammesse cambiano per formato (reel, carosello…): un batch per formato.
        Map<String, List<String>> idPerTipo = new LinkedHashMap<>();
        for (JsonNode n : media) {
            idPerTipo.computeIfAbsent(tipoIg(n), k -> new ArrayList<>()).add(n.path("id").asText());
        }
        Map<String, Map<String, JsonNode>> insights = new java.util.concurrent.ConcurrentHashMap<>();
        idPerTipo.entrySet().parallelStream().forEach(e ->
                insights.putAll(insightsInBatch(e.getValue(), "ig_media_" + e.getKey(), IG_MEDIA, a)));
        return media.stream().map(n -> {
            String tipo = tipoIg(n);
            Map<String, JsonNode> m = insights.getOrDefault(n.path("id").asText(), Map.of());
            Long like = numero(n.path("like_count"));
            Long commenti = numero(n.path("comments_count"));
            Long salvati = valoreLifetime(m.get("saved"));
            Long condivisioni = valoreLifetime(m.get("shares"));
            Long copertura = valoreLifetime(m.get("reach"));
            Long interazioni = valoreLifetime(m.get("total_interactions"));
            if (interazioni == null) {
                interazioni = SocialCalcoli.sommaNullable(like, commenti, salvati, condivisioni);
            }
            String immagine = "VIDEO".equals(n.path("media_type").asText())
                    ? n.path("thumbnail_url").asText(null) : n.path("media_url").asText(null);
            return new SocialDto.Contenuto(n.path("id").asText(), "INSTAGRAM", tipo,
                    n.path("caption").asText(null), immagine, n.path("permalink").asText(null),
                    SocialTempo.iso(n.path("timestamp").asText(null)),
                    like, commenti, condivisioni, salvati, copertura, valoreLifetime(m.get("views")),
                    interazioni, SocialCalcoli.tasso(interazioni, copertura));
        }).toList();
    }

    private static String tipoIg(JsonNode n) {
        return SocialCalcoli.tipoInstagram(n.path("media_type").asText(null), n.path("media_product_type").asText(null));
    }

    /**
     * Insights lifetime di molti contenuti con la Batch API: due chiamate HTTP invece di una per post.
     * Se Meta rifiuta una metrica (code 100) si scopre quale su un contenuto solo, con
     * {@link SocialGraphClient#metricheTolleranti}, e si ripete il batch per quelli falliti senza di lei.
     *
     * @return id contenuto → (metrica → nodo dati); i contenuti senza insights (post vecchi, permessi) mancano
     */
    Map<String, Map<String, JsonNode>> insightsInBatch(List<String> ids, String tipo, List<String> metriche, AccountInterno a) {
        Map<String, Map<String, JsonNode>> out = new LinkedHashMap<>();
        List<String> daChiedere = ids;
        for (int tentativo = 0; tentativo < 2 && !daChiedere.isEmpty(); tentativo++) {
            List<String> valide = graph.metricheAncoraValide(tipo, metriche);
            if (valide.isEmpty()) {
                break;
            }
            String query = "/insights?metric=" + String.join(",", valide) + "&period=lifetime";
            List<JsonNode> risposte;
            try {
                risposte = graph.batchGet(daChiedere.stream().map(id -> id + query).toList(), a.token());
            } catch (SocialIntegrazioneException e) {
                logger.warn("Social: batch insights {} non riuscito: {}", tipo, e.getMessage());
                break;
            }
            List<String> metricaRifiutata = new ArrayList<>();
            for (int i = 0; i < daChiedere.size(); i++) {
                JsonNode r = risposte.get(i);
                int codice = SocialGraphClient.codiceErrore(r);
                if (codice == 0) {
                    Map<String, JsonNode> m = new LinkedHashMap<>();
                    r.path("data").forEach(d -> m.put(d.path("name").asText(), d));
                    out.put(daChiedere.get(i), m);
                } else if (codice == SocialGraphClient.CODICE_PARAMETRO_NON_VALIDO) {
                    metricaRifiutata.add(daChiedere.get(i));
                }
            }
            if (metricaRifiutata.isEmpty()) {
                break;
            }
            // Una sola richiesta "tollerante" per imparare quali metriche Meta non vuole piu, poi si riprova.
            out.put(metricaRifiutata.get(0), insightsSicuri(metricaRifiutata.get(0), tipo, metriche, a));
            daChiedere = metricaRifiutata.subList(1, metricaRifiutata.size());
        }
        return out;
    }

    private static Map<String, JsonNode> unisci(CompletableFuture<Map<String, JsonNode>> f) {
        try {
            return f.join();
        } catch (java.util.concurrent.CompletionException e) {
            if (e.getCause() instanceof SocialIntegrazioneException se) {
                throw se;
            }
            throw e;
        }
    }

    /** Insights di un singolo contenuto: se Meta li nega (post vecchio, permesso) il contenuto resta senza. */
    private Map<String, JsonNode> insightsSicuri(String id, String tipo, List<String> metriche, AccountInterno a) {
        try {
            return graph.metricheTolleranti(id, tipo, metriche, Map.of("period", "lifetime"), a.token());
        } catch (Exception e) {
            logger.debug("Social: insights di {} non disponibili: {}", id, e.getMessage());
            return Map.of();
        }
    }

    static Long valoreLifetime(JsonNode metrica) {
        if (metrica == null) {
            return null;
        }
        JsonNode v = metrica.path("values").path(0).path("value");
        if (v.isNumber()) {
            return v.asLong();
        }
        return SocialCalcoli.totale(metrica);
    }

    private static Long numero(JsonNode n) {
        return n != null && n.isNumber() ? n.asLong() : null;
    }

    // ── Pubblico ──

    public SocialDto.Pubblico pubblico(String pageId) {
        AccountInterno a = accountService.risolvi(pageId);
        if (!a.haInstagram()) {
            return new SocialDto.Pubblico(false,
                    "Nessun profilo Instagram professionale è collegato a questa pagina Facebook.",
                    null, List.of(), List.of(), List.of(), List.of());
        }
        return cache.ottieni(a.pageId(), "pubblico", TTL_PUBBLICO, () -> calcolaPubblico(a));
    }

    private SocialDto.Pubblico calcolaPubblico(AccountInterno a) {
        try {
            List<JsonNode> etaGenere = risultatiDemografia(a, "age,gender");
            Map<String, long[]> perEta = new java.util.TreeMap<>();
            long donne = 0, uomini = 0, altro = 0;
            for (JsonNode r : etaGenere) {
                String eta = r.path("dimension_values").path(0).asText("?");
                String genere = r.path("dimension_values").path(1).asText("U");
                long v = r.path("value").asLong();
                long[] acc = perEta.computeIfAbsent(eta, k -> new long[3]);
                switch (genere) {
                    case "F" -> { acc[0] += v; donne += v; }
                    case "M" -> { acc[1] += v; uomini += v; }
                    default -> { acc[2] += v; altro += v; }
                }
            }
            List<SocialDto.FettaEtaGenere> fasce = perEta.entrySet().stream()
                    .map(e -> new SocialDto.FettaEtaGenere(e.getKey(), e.getValue()[0], e.getValue()[1], e.getValue()[2]))
                    .toList();
            List<SocialDto.Fetta> genere = List.of(
                    new SocialDto.Fetta("F", "Donne", donne),
                    new SocialDto.Fetta("M", "Uomini", uomini),
                    new SocialDto.Fetta("U", "Non specificato", altro));
            List<SocialDto.Fetta> citta = top(risultatiDemografia(a, "city"), false);
            List<SocialDto.Fetta> paesi = top(risultatiDemografia(a, "country"), true);
            return new SocialDto.Pubblico(true, null, a.followerInstagram(), fasce, genere, citta, paesi);
        } catch (SocialIntegrazioneException e) {
            String msg = SocialGraphClient.isMetricaNonValida(e)
                    ? "Instagram mostra i dati demografici solo ai profili con almeno 100 follower."
                    : e.getMessage();
            return new SocialDto.Pubblico(false, msg, a.followerInstagram(), List.of(), List.of(), List.of(), List.of());
        }
    }

    private List<JsonNode> risultatiDemografia(AccountInterno a, String breakdown) {
        JsonNode r = graph.get(a.instagramId() + "/insights", Map.of(
                "metric", "follower_demographics",
                "period", "lifetime",
                "metric_type", "total_value",
                "breakdown", breakdown), a.token());
        List<JsonNode> out = new ArrayList<>();
        r.path("data").path(0).path("total_value").path("breakdowns").path(0).path("results").forEach(out::add);
        return out;
    }

    private static List<SocialDto.Fetta> top(List<JsonNode> risultati, boolean paese) {
        return risultati.stream()
                .map(r -> {
                    String chiave = r.path("dimension_values").path(0).asText("");
                    String etichetta = chiave;
                    if (paese && chiave.length() == 2) {
                        String nome = Locale.of("", chiave).getDisplayCountry(Locale.ITALIAN);
                        etichetta = StringUtils.hasText(nome) ? nome : chiave;
                    }
                    return new SocialDto.Fetta(chiave, etichetta, r.path("value").asLong());
                })
                .sorted(Comparator.comparingLong(SocialDto.Fetta::valore).reversed())
                .limit(10)
                .toList();
    }
}
