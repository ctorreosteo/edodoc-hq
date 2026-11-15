package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import it.edodoc.hq.models.PlannerMedia;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Google Business per il Planner social: post sulla scheda di EdoDoc (aggiornamento, evento, offerta). EdoDoc ha una
 * sola scheda, quella configurata in {@link GoogleBusinessReviewsService#locationId()}: l'account del canale non conta.
 * Opzioni: {@code pulsante} (BOOK, ORDER, SHOP, LEARN_MORE, SIGN_UP, CALL) e {@code urlPulsante} (se manca, il link
 * del post); per eventi e offerte {@code titoloEvento}, {@code inizio} e {@code fine} (yyyy-MM-dd'T'HH:mm o
 * yyyy-MM-dd); per le offerte {@code codice}, {@code urlOfferta}, {@code condizioni}. Al massimo un'immagine.
 */
@Service
public class PlannerGooglePubblicatore implements PlannerPubblicatore {

    private static final Set<String> PULSANTI = Set.of("BOOK", "ORDER", "SHOP", "LEARN_MORE", "SIGN_UP", "CALL");

    private final GoogleBusinessReviewsService googleBusiness;
    private final PlannerMediaService mediaService;

    public PlannerGooglePubblicatore(GoogleBusinessReviewsService googleBusiness, PlannerMediaService mediaService) {
        this.googleBusiness = googleBusiness;
        this.mediaService = mediaService;
    }

    @Override
    public Set<String> canali() {
        return Set.of(PlannerCanali.GOOGLE_BUSINESS);
    }

    @Override
    public Risultato pubblica(Contesto ctx) {
        String locationId = googleBusiness.locationId();
        if (!StringUtils.hasText(locationId)) {
            throw new IllegalStateException("La scheda Google di EdoDoc non è collegata (GOOGLE_BUSINESS_LOCATION).");
        }
        JsonNode o = ctx.opzioni();
        String formato = ctx.canale().getFormato();
        Map<String, Object> corpo = new LinkedHashMap<>();
        corpo.put("languageCode", "it");
        corpo.put("summary", ctx.testo());
        corpo.put("topicType", switch (formato) {
            case "EVENTO" -> "EVENT";
            case "OFFERTA" -> "OFFER";
            default -> "STANDARD";
        });
        String pulsante = o.path("pulsante").asText("");
        if (PULSANTI.contains(pulsante) && !"OFFERTA".equals(formato)) {
            Map<String, Object> cta = new LinkedHashMap<>();
            cta.put("actionType", pulsante);
            String url = StringUtils.hasText(o.path("urlPulsante").asText(null)) ? o.path("urlPulsante").asText() : ctx.link();
            if (!"CALL".equals(pulsante)) {
                if (!StringUtils.hasText(url)) {
                    throw new IllegalArgumentException("Il pulsante del post Google vuole un link.");
                }
                cta.put("url", url);
            }
            corpo.put("callToAction", cta);
        }
        if (!"AGGIORNAMENTO".equals(formato)) {
            Map<String, Object> evento = new LinkedHashMap<>();
            evento.put("title", o.path("titoloEvento").asText(""));
            evento.put("schedule", programma(o.path("inizio").asText(""), o.path("fine").asText("")));
            corpo.put("event", evento);
        }
        if ("OFFERTA".equals(formato)) {
            Map<String, Object> offerta = new LinkedHashMap<>();
            if (StringUtils.hasText(o.path("codice").asText(null))) {
                offerta.put("couponCode", o.path("codice").asText());
            }
            if (StringUtils.hasText(o.path("urlOfferta").asText(null))) {
                offerta.put("redeemOnlineUrl", o.path("urlOfferta").asText());
            }
            if (StringUtils.hasText(o.path("condizioni").asText(null))) {
                offerta.put("termsConditions", o.path("condizioni").asText());
            }
            if (!offerta.isEmpty()) {
                corpo.put("offer", offerta);
            }
        }
        ctx.media().stream().filter(m -> PlannerMedia.TIPO_IMMAGINE.equals(m.getTipo())).findFirst().ifPresent(m ->
                corpo.put("media", List.of(Map.of("mediaFormat", "PHOTO", "sourceUrl", mediaService.urlAssoluto(m)))));
        JsonNode r = googleBusiness.creaPostLocale(locationId, corpo);
        String link = r.path("searchUrl").asText(null);
        return new Risultato(r.path("name").asText(null), StringUtils.hasText(link) ? link : googleBusiness.linkScheda());
    }

    private static Map<String, Object> programma(String inizio, String fine) {
        Map<String, Object> s = new LinkedHashMap<>();
        LocalDateTime da = istante(inizio, LocalTime.MIDNIGHT);
        LocalDateTime a = istante(fine, LocalTime.of(23, 59));
        if (a.isBefore(da)) {
            throw new IllegalArgumentException("La fine dell'evento è prima dell'inizio.");
        }
        s.put("startDate", data(da.toLocalDate()));
        s.put("endDate", data(a.toLocalDate()));
        if (inizio.contains("T")) {
            s.put("startTime", Map.of("hours", da.getHour(), "minutes", da.getMinute()));
        }
        if (fine.contains("T")) {
            s.put("endTime", Map.of("hours", a.getHour(), "minutes", a.getMinute()));
        }
        return s;
    }

    private static LocalDateTime istante(String v, LocalTime ora) {
        try {
            return v.contains("T") ? LocalDateTime.parse(v) : LocalDate.parse(v).atTime(ora);
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("Data dell'evento non valida: " + v);
        }
    }

    private static Map<String, Object> data(LocalDate d) {
        return Map.of("year", d.getYear(), "month", d.getMonthValue(), "day", d.getDayOfMonth());
    }
}
