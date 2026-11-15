package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import it.edodoc.hq.models.PlannerMedia;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * YouTube per il Planner social: carica il video sul canale collegato in YouTube Studio. Opzioni: {@code privacy}
 * (public, unlisted, private), {@code tag} (separati da virgola), {@code categoria} (id YouTube, di default 27
 * Istruzione), {@code perBambini}. Uno Short è un video verticale fino a 3 minuti: si aggiunge #Shorts se manca.
 */
@Service
public class PlannerYoutubePubblicatore implements PlannerPubblicatore {

    private static final Set<String> PRIVACY = Set.of("public", "unlisted", "private");

    private final YoutubeGoogleClient youtube;
    private final PlannerMediaService mediaService;

    public PlannerYoutubePubblicatore(YoutubeGoogleClient youtube, PlannerMediaService mediaService) {
        this.youtube = youtube;
        this.mediaService = mediaService;
    }

    @Override
    public Set<String> canali() {
        return Set.of(PlannerCanali.YOUTUBE);
    }

    @Override
    public Risultato pubblica(Contesto ctx) {
        PlannerMedia video = ctx.media().get(0);
        JsonNode o = ctx.opzioni();
        boolean short_ = "SHORT".equals(ctx.canale().getFormato());
        String titolo = ctx.canale().getTitolo().trim();
        String descrizione = PlannerMetaPubblicatore.conLink(ctx.testo(), ctx.link());
        if (short_ && !(titolo + " " + descrizione).toLowerCase().contains("#shorts")) {
            descrizione = descrizione.isEmpty() ? "#Shorts" : descrizione + "\n\n#Shorts";
        }
        List<String> tag = new ArrayList<>();
        for (String t : o.path("tag").asText("").split(",")) {
            if (StringUtils.hasText(t) && tag.size() < 30) {
                tag.add(t.trim());
            }
        }
        String privacy = o.path("privacy").asText("public");
        Map<String, Object> snippet = new LinkedHashMap<>();
        snippet.put("title", titolo);
        snippet.put("description", descrizione);
        if (!tag.isEmpty()) {
            snippet.put("tags", tag);
        }
        snippet.put("categoryId", o.path("categoria").asText("27"));
        snippet.put("defaultLanguage", "it");
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("privacyStatus", PRIVACY.contains(privacy) ? privacy : "public");
        status.put("selfDeclaredMadeForKids", o.path("perBambini").asBoolean(false));
        JsonNode r = youtube.caricaVideo(Map.of("snippet", snippet, "status", status),
                mediaService.contenuto(video.getId()), video.getMimeType());
        String id = r.path("id").asText(null);
        if (!StringUtils.hasText(id)) {
            throw new IllegalStateException("YouTube non ha restituito l'id del video.");
        }
        return new Risultato(id, short_ ? "https://www.youtube.com/shorts/" + id : "https://youtu.be/" + id);
    }
}
