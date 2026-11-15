package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import it.edodoc.hq.dto.PlannerDto;
import it.edodoc.hq.models.PlannerBrand;
import it.edodoc.hq.models.PlannerConcorrente;
import it.edodoc.hq.repositories.PlannerConcorrenteRepository;
import it.edodoc.hq.services.SocialAccountService.AccountInterno;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Concorrenti del Planner social: profili Instagram professionali (business o creator) letti con Business Discovery
 * di Meta, tramite il profilo Instagram collegato allo spazio. Per ognuno follower, post, ritmo (post a settimana
 * sugli ultimi 12), mi piace e commenti medi, tasso di interazione e gli ultimi post; in testa il profilo dello spazio
 * per confronto. Meta non dà copertura né visualizzazioni dei profili altrui. Cache di 3 ore per profilo.
 */
@Service
public class PlannerConcorrentiService {

    private static final Duration TTL = Duration.ofHours(3);
    private static final int MAX_CONCORRENTI = 12;
    private static final String CAMPI = "username,name,biography,profile_picture_url,followers_count,media_count,"
            + "media.limit(12){caption,like_count,comments_count,media_type,media_product_type,timestamp,permalink,media_url,thumbnail_url}";

    private final PlannerConcorrenteRepository repository;
    private final PlannerSpaziService spazi;
    private final PlannerDestinazioniService destinazioni;
    private final SocialAccountService socialAccount;
    private final SocialConfigService socialConfig;
    private final SocialGraphClient graph;

    private record InCache(Instant scade, PlannerDto.ProfiloConcorrente profilo) {
    }

    private final Map<String, InCache> cache = new ConcurrentHashMap<>();

    public PlannerConcorrentiService(PlannerConcorrenteRepository repository, PlannerSpaziService spazi,
                                     PlannerDestinazioniService destinazioni, SocialAccountService socialAccount,
                                     SocialConfigService socialConfig, SocialGraphClient graph) {
        this.repository = repository;
        this.spazi = spazi;
        this.destinazioni = destinazioni;
        this.socialAccount = socialAccount;
        this.socialConfig = socialConfig;
        this.graph = graph;
    }

    @Transactional
    public PlannerDto.Concorrenti elenco(Long brandId, boolean aggiorna) {
        PlannerBrand b = spazi.risolvi(brandId);
        List<PlannerConcorrente> lista = repository.findByBrandIdOrderByUsernameAsc(b.getId());
        AccountInterno ig = profiloDelloSpazio(b);
        if (ig == null) {
            List<PlannerDto.ProfiloConcorrente> vuoti = lista.stream().map(c -> vuoto(c.getId(), c.getUsername(), null)).toList();
            return new PlannerDto.Concorrenti(vuoti,
                    "Per leggere i concorrenti serve un profilo Instagram professionale collegato a questo spazio (pagina Meta).",
                    null);
        }
        if (aggiorna) {
            cache.clear();
        }
        List<PlannerDto.ProfiloConcorrente> out = new ArrayList<>();
        out.add(leggi(ig, null, ig.instagramUsername(), true));
        lista.forEach(c -> out.add(leggi(ig, c.getId(), c.getUsername(), false)));
        return new PlannerDto.Concorrenti(out, null, SocialTempo.adesso());
    }

    @Transactional
    public void aggiungi(Long brandId, String username) {
        PlannerBrand b = spazi.risolvi(brandId);
        String u = username == null ? "" : username.trim().replaceFirst("^@", "")
                .replaceFirst("(?i)^https?://(www\\.)?instagram\\.com/", "").replaceAll("/.*$", "").toLowerCase(Locale.ROOT);
        if (!u.matches("[a-z0-9._]{1,30}")) {
            throw new IllegalArgumentException("Scrivi lo username Instagram (es. @edodoc).");
        }
        if (repository.existsByBrandIdAndUsername(b.getId(), u)) {
            throw new IllegalArgumentException("@" + u + " è già fra i concorrenti.");
        }
        if (repository.findByBrandIdOrderByUsernameAsc(b.getId()).size() >= MAX_CONCORRENTI) {
            throw new IllegalArgumentException("Al massimo " + MAX_CONCORRENTI + " concorrenti per spazio.");
        }
        repository.save(PlannerConcorrente.builder().brandId(b.getId()).username(u).creatoIl(LocalDateTime.now()).build());
    }

    @Transactional
    public void elimina(Long id) {
        repository.deleteById(id);
    }

    private AccountInterno profiloDelloSpazio(PlannerBrand b) {
        if (!socialConfig.isUtilizzabile()) {
            return null;
        }
        return destinazioni.elenco(b).stream()
                .filter(d -> PlannerCanali.INSTAGRAM.equals(d.canale()) && d.automatica() && d.account() != null)
                .findFirst()
                .map(d -> {
                    try {
                        AccountInterno a = socialAccount.risolvi(d.account());
                        return a.haInstagram() ? a : null;
                    } catch (Exception e) {
                        return null;
                    }
                })
                .orElse(null);
    }

    private PlannerDto.ProfiloConcorrente leggi(AccountInterno ig, Long id, String username, boolean proprio) {
        if (!StringUtils.hasText(username)) {
            return vuoto(id, "?", "Username del profilo non disponibile.");
        }
        String chiave = ig.instagramId() + "|" + username;
        InCache c = cache.get(chiave);
        if (c != null && Instant.now().isBefore(c.scade())) {
            return c.profilo();
        }
        PlannerDto.ProfiloConcorrente p;
        try {
            JsonNode n = graph.get(ig.instagramId(), Map.of("fields", "business_discovery.username(" + username + "){" + CAMPI + "}"),
                    ig.token()).path("business_discovery");
            p = profilo(id, username, proprio, n);
        } catch (Exception e) {
            String m = e.getMessage() == null ? "" : e.getMessage();
            p = vuoto(id, username, m.contains("110") || m.toLowerCase(Locale.ROOT).contains("cannot be found")
                    ? "Profilo non trovato o non professionale: Meta legge solo i profili business e creator."
                    : "Meta non ha restituito il profilo: " + PlannerUtenti.tronca(m, 160));
        }
        cache.put(chiave, new InCache(Instant.now().plus(TTL), p));
        return p;
    }

    static PlannerDto.ProfiloConcorrente profilo(Long id, String username, boolean proprio, JsonNode n) {
        Long follower = n.hasNonNull("followers_count") ? n.path("followers_count").asLong() : null;
        List<PlannerDto.PostConcorrente> ultimi = new ArrayList<>();
        long sommaLike = 0;
        long sommaCommenti = 0;
        int conLike = 0;
        int conCommenti = 0;
        Instant primo = null;
        Instant ultimo = null;
        for (JsonNode m : n.path("media").path("data")) {
            Long like = m.hasNonNull("like_count") ? m.path("like_count").asLong() : null;
            Long com = m.hasNonNull("comments_count") ? m.path("comments_count").asLong() : null;
            if (like != null) {
                sommaLike += like;
                conLike++;
            }
            if (com != null) {
                sommaCommenti += com;
                conCommenti++;
            }
            Instant t = SocialTempo.istante(m.path("timestamp").asText(null));
            if (t != null) {
                primo = primo == null || t.isBefore(primo) ? t : primo;
                ultimo = ultimo == null || t.isAfter(ultimo) ? t : ultimo;
            }
            String tipo = SocialCalcoli.tipoInstagram(m.path("media_type").asText(null), m.path("media_product_type").asText(null));
            String img = "VIDEO".equals(m.path("media_type").asText()) ? m.path("thumbnail_url").asText(null) : m.path("media_url").asText(null);
            ultimi.add(new PlannerDto.PostConcorrente(m.path("permalink").asText(null), img, tipo, like, com,
                    t == null ? null : SocialTempo.iso(t), PlannerUtenti.tronca(m.path("caption").asText(null), 160)));
        }
        Double mediaLike = conLike == 0 ? null : (double) sommaLike / conLike;
        Double mediaCom = conCommenti == 0 ? null : (double) sommaCommenti / conCommenti;
        Double tasso = follower == null || follower == 0 || (mediaLike == null && mediaCom == null) ? null
                : ((mediaLike == null ? 0 : mediaLike) + (mediaCom == null ? 0 : mediaCom)) / follower;
        Double ritmo = null;
        if (ultimi.size() >= 2 && primo != null && ultimo != null) {
            double settimane = Math.max(1.0, Duration.between(primo, ultimo).toHours() / 168.0);
            ritmo = (ultimi.size() - 1) / settimane;
        }
        return new PlannerDto.ProfiloConcorrente(id, n.path("username").asText(username), proprio, n.path("name").asText(null),
                n.path("profile_picture_url").asText(null), n.path("biography").asText(null), follower,
                n.hasNonNull("media_count") ? n.path("media_count").asLong() : null, ritmo, mediaLike, mediaCom, tasso, ultimi, null);
    }

    private static PlannerDto.ProfiloConcorrente vuoto(Long id, String username, String errore) {
        return new PlannerDto.ProfiloConcorrente(id, username, false, null, null, null, null, null, null, null, null, null,
                List.of(), errore);
    }
}
