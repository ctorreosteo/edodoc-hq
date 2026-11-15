package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import it.edodoc.hq.models.PlannerMedia;
import it.edodoc.hq.models.PlannerPost;
import it.edodoc.hq.models.PlannerPostCanale;

import java.util.List;
import java.util.Set;

/** Pubblica un canale di un post del Planner su una piattaforma collegata. Un errore è un'eccezione col motivo. */
interface PlannerPubblicatore {

    Set<String> canali();

    Risultato pubblica(Contesto contesto) throws Exception;

    /** testo: quello del canale o del post; link: quello del post con gli UTM del canale; media nell'ordine del post. */
    record Contesto(PlannerPost post, PlannerPostCanale canale, String testo, String link, List<PlannerMedia> media, JsonNode opzioni) {
    }

    record Risultato(String idEsterno, String link) {
    }
}
