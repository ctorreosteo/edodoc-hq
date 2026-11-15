package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import it.edodoc.hq.models.PlannerPostCanale;
import it.edodoc.hq.repositories.PlannerPostCanaleRepository;
import it.edodoc.hq.services.SocialAccountService.AccountInterno;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Numeri dei post pubblicati dal Planner social, riletti dalle piattaforme (ogni ora, ultimi 30 giorni): Instagram
 * (insights del media), Facebook (reazioni, commenti, condivisioni, copertura), YouTube (statistiche del video).
 * Google Business e TikTok non danno i numeri del singolo post a questa integrazione: restano senza.
 */
@Service
public class PlannerMetricheService {

    private static final Logger logger = LoggerFactory.getLogger(PlannerMetricheService.class);
    private static final int GIORNI = 30;
    private static final List<String> IG_METRICHE = List.of("reach", "views", "likes", "comments", "saved", "shares");

    private final PlannerPostCanaleRepository canaleRepository;
    private final SocialAccountService accountService;
    private final SocialConfigService socialConfig;
    private final SocialGraphClient graph;
    private final SocialInsightsService insights;
    private final YoutubeGoogleClient youtube;

    public PlannerMetricheService(PlannerPostCanaleRepository canaleRepository, SocialAccountService accountService,
                                  SocialConfigService socialConfig, SocialGraphClient graph, SocialInsightsService insights,
                                  YoutubeGoogleClient youtube) {
        this.canaleRepository = canaleRepository;
        this.accountService = accountService;
        this.socialConfig = socialConfig;
        this.graph = graph;
        this.insights = insights;
        this.youtube = youtube;
    }

    public int aggiorna() {
        List<PlannerPostCanale> canali = canaleRepository.pubblicatiAutomaticiDal(LocalDateTime.now().minusDays(GIORNI));
        Map<String, List<PlannerPostCanale>> perCanale = canali.stream().collect(Collectors.groupingBy(PlannerPostCanale::getCanale));
        int aggiornati = 0;
        if (socialConfig.isUtilizzabile()) {
            aggiornati += meta(perCanale.getOrDefault(PlannerCanali.INSTAGRAM, List.of()), true);
            aggiornati += meta(perCanale.getOrDefault(PlannerCanali.FACEBOOK, List.of()), false);
        }
        if (youtube.collegato()) {
            aggiornati += youtube(perCanale.getOrDefault(PlannerCanali.YOUTUBE, List.of()));
        }
        return aggiornati;
    }

    private int meta(List<PlannerPostCanale> canali, boolean instagram) {
        int n = 0;
        Map<String, List<PlannerPostCanale>> perPagina = canali.stream().collect(Collectors.groupingBy(PlannerPostCanale::getAccount));
        for (Map.Entry<String, List<PlannerPostCanale>> e : perPagina.entrySet()) {
            AccountInterno a;
            try {
                a = accountService.risolvi(e.getKey());
            } catch (Exception ex) {
                continue;
            }
            List<String> ids = e.getValue().stream().map(PlannerPostCanale::getIdEsterno).toList();
            if (instagram) {
                Map<String, Map<String, JsonNode>> m = new LinkedHashMap<>();
                // Le metriche ammesse cambiano per formato: un batch per formato
                e.getValue().stream().collect(Collectors.groupingBy(PlannerPostCanale::getFormato)).forEach((formato, righe) ->
                        m.putAll(insights.insightsInBatch(righe.stream().map(PlannerPostCanale::getIdEsterno).toList(),
                                "ig_media_planner_" + formato, IG_METRICHE, a)));
                for (PlannerPostCanale c : e.getValue()) {
                    Map<String, JsonNode> v = m.get(c.getIdEsterno());
                    if (v == null || v.isEmpty()) {
                        continue;
                    }
                    c.setCopertura(SocialInsightsService.valoreLifetime(v.get("reach")));
                    c.setVisualizzazioni(SocialInsightsService.valoreLifetime(v.get("views")));
                    c.setMiPiace(SocialInsightsService.valoreLifetime(v.get("likes")));
                    c.setCommenti(SocialInsightsService.valoreLifetime(v.get("comments")));
                    c.setSalvataggi(SocialInsightsService.valoreLifetime(v.get("saved")));
                    c.setCondivisioni(SocialInsightsService.valoreLifetime(v.get("shares")));
                    c.setMetricheIl(LocalDateTime.now());
                    canaleRepository.save(c);
                    n++;
                }
            } else {
                List<String> metriche = new ArrayList<>(SocialInsightsService.FB_POST_COPERTURA);
                metriche.addAll(SocialInsightsService.FB_POST_VISUALIZZAZIONI);
                Map<String, Map<String, JsonNode>> m = insights.insightsInBatch(ids, "fb_post", metriche, a);
                for (PlannerPostCanale c : e.getValue()) {
                    try {
                        JsonNode d = graph.get(c.getIdEsterno(), Map.of("fields",
                                "reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares"), a.token());
                        c.setMiPiace(d.path("reactions").path("summary").path("total_count").asLong(0));
                        c.setCommenti(d.path("comments").path("summary").path("total_count").asLong(0));
                        c.setCondivisioni(d.path("shares").path("count").asLong(0));
                    } catch (Exception ex) {
                        // Reel e storie non hanno questi campi: restano i soli insights
                        logger.debug("Planner: campi del post {} non letti: {}", c.getIdEsterno(), ex.getMessage());
                    }
                    Map<String, JsonNode> v = m.getOrDefault(c.getIdEsterno(), Map.of());
                    c.setCopertura(SocialInsightsService.valoreLifetime(SocialCalcoli.prima(v, SocialInsightsService.FB_POST_COPERTURA)));
                    c.setVisualizzazioni(SocialInsightsService.valoreLifetime(SocialCalcoli.prima(v, SocialInsightsService.FB_POST_VISUALIZZAZIONI)));
                    c.setMetricheIl(LocalDateTime.now());
                    canaleRepository.save(c);
                    n++;
                }
            }
        }
        return n;
    }

    private int youtube(List<PlannerPostCanale> canali) {
        int n = 0;
        for (int i = 0; i < canali.size(); i += 50) {
            List<PlannerPostCanale> blocco = canali.subList(i, Math.min(canali.size(), i + 50));
            Map<String, PlannerPostCanale> perId = blocco.stream().collect(Collectors.toMap(PlannerPostCanale::getIdEsterno, c -> c, (x, y) -> x));
            try {
                JsonNode r = youtube.data("videos", Map.of("part", "statistics", "id", String.join(",", perId.keySet())));
                for (JsonNode v : r.path("items")) {
                    PlannerPostCanale c = perId.get(v.path("id").asText());
                    if (c == null) {
                        continue;
                    }
                    JsonNode s = v.path("statistics");
                    c.setVisualizzazioni(s.path("viewCount").asLong(0));
                    c.setMiPiace(s.path("likeCount").asLong(0));
                    c.setCommenti(s.path("commentCount").asLong(0));
                    c.setMetricheIl(LocalDateTime.now());
                    canaleRepository.save(c);
                    n++;
                }
            } catch (Exception e) {
                logger.warn("Planner: statistiche YouTube non lette: {}", e.getMessage());
            }
        }
        return n;
    }
}
