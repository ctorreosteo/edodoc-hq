package it.edodoc.hq.services;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import it.edodoc.hq.dto.PlannerDto;
import it.edodoc.hq.models.PlannerBio;
import it.edodoc.hq.models.PlannerBrand;
import it.edodoc.hq.models.PlannerPost;
import it.edodoc.hq.models.PlannerPostCanale;
import it.edodoc.hq.repositories.PlannerBioRepository;
import it.edodoc.hq.repositories.PlannerPostCanaleRepository;
import it.edodoc.hq.repositories.PlannerPostRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Link in bio del Planner social: una pagina pubblica per spazio ({@code /bio/<slug>} del gestionale) con titolo,
 * descrizione, pulsanti e gli ultimi post pubblicati con un'immagine. Gli indirizzi non escono: ogni clic passa da
 * {@code /api/pubblico/planner/bio/<slug>/vai?k=<chiave>}, che lo conta e reindirizza. Visite e clic per giorno.
 * Un post porta al suo link (con utm_source=linkinbio) o, se non ne ha, al post su Instagram o Facebook.
 */
@Service
public class PlannerBioService {

    private static final int MAX_PULSANTI = 12;
    private static final int POST_PAGINA = 12;
    private static final Set<String> STATI_USCITI = Set.of(PlannerPost.STATO_PUBBLICATO, PlannerPost.STATO_DA_COMPLETARE,
            PlannerPost.STATO_PARZIALE);

    private final PlannerBioRepository repository;
    private final PlannerPostRepository postRepository;
    private final PlannerPostCanaleRepository canaleRepository;
    private final PlannerPostService postService;
    private final PlannerSpaziService spazi;
    private final ObjectMapper objectMapper;

    public PlannerBioService(PlannerBioRepository repository, PlannerPostRepository postRepository,
                             PlannerPostCanaleRepository canaleRepository, PlannerPostService postService,
                             PlannerSpaziService spazi, ObjectMapper objectMapper) {
        this.repository = repository;
        this.postRepository = postRepository;
        this.canaleRepository = canaleRepository;
        this.postService = postService;
        this.spazi = spazi;
        this.objectMapper = objectMapper;
    }

    // ── Gestione ──

    /** La pagina dello spazio; se non c'è ancora, una proposta spenta (non salvata). */
    @Transactional
    public PlannerDto.Bio leggi(Long brandId) {
        PlannerBrand b = spazi.risolvi(brandId);
        return repository.findByBrandId(b.getId()).map(this::dto).orElseGet(() -> new PlannerDto.Bio(null,
                slugLibero(PlannerUtm.slug(b.getNome())), b.getNome(), b.getDescrizione(), null, b.getColore(),
                List.of(), true, false, 0, List.of()));
    }

    @Transactional
    public PlannerDto.Bio salva(Long brandId, PlannerDto.BioRequest req) {
        if (req == null || !StringUtils.hasText(req.titolo())) {
            throw new IllegalArgumentException("Dai un titolo alla pagina.");
        }
        PlannerBrand b = spazi.risolvi(brandId);
        PlannerBio bio = repository.findByBrandId(b.getId()).orElseGet(() -> {
            PlannerBio n = new PlannerBio();
            n.setBrandId(b.getId());
            return n;
        });
        String slug = PlannerUtm.slug(req.slug());
        if (slug.length() < 3) {
            throw new IllegalArgumentException("L'indirizzo della pagina vuole almeno 3 lettere o numeri.");
        }
        if (bio.getId() == null ? repository.existsBySlug(slug) : repository.existsBySlugAndIdNot(slug, bio.getId())) {
            throw new IllegalArgumentException("L'indirizzo «" + slug + "» è già usato da un altro spazio.");
        }
        String colore = req.colore() == null ? "" : req.colore().trim();
        if (!colore.matches("^#[0-9a-fA-F]{6}$")) {
            throw new IllegalArgumentException("Colore non valido.");
        }
        String immagine = StringUtils.hasText(req.immagineUrl()) ? req.immagineUrl().trim() : null;
        if (immagine != null && !immagine.matches("(?i)^https?://\\S+$")) {
            throw new IllegalArgumentException("L'immagine deve essere un indirizzo http:// o https://.");
        }
        List<PlannerDto.BioPulsante> pulsanti = new ArrayList<>();
        Set<String> id = new HashSet<>();
        for (PlannerDto.BioPulsante p : req.pulsanti() == null ? List.<PlannerDto.BioPulsante>of() : req.pulsanti()) {
            if (p == null || !StringUtils.hasText(p.etichetta()) || !StringUtils.hasText(p.url())) {
                continue;
            }
            String url = p.url().trim();
            if (!url.matches("(?i)^(https?://|tel:|mailto:)\\S+$")) {
                throw new IllegalArgumentException("Il pulsante «" + p.etichetta() + "» vuole un link http(s)://, tel: o mailto:.");
            }
            String pid = StringUtils.hasText(p.id()) && p.id().matches("[A-Za-z0-9-]{1,40}") && id.add(p.id())
                    ? p.id() : UUID.randomUUID().toString().substring(0, 8);
            id.add(pid);
            pulsanti.add(new PlannerDto.BioPulsante(pid, PlannerUtenti.tronca(p.etichetta(), 60), url));
        }
        if (pulsanti.size() > MAX_PULSANTI) {
            throw new IllegalArgumentException("Al massimo " + MAX_PULSANTI + " pulsanti.");
        }
        bio.setSlug(slug);
        bio.setTitolo(PlannerUtenti.tronca(req.titolo(), 120));
        bio.setDescrizione(StringUtils.hasText(req.descrizione()) ? PlannerUtenti.tronca(req.descrizione(), 500) : null);
        bio.setImmagineUrl(immagine);
        bio.setColore(colore.toLowerCase(Locale.ROOT));
        try {
            bio.setPulsanti(objectMapper.writeValueAsString(pulsanti));
        } catch (Exception e) {
            throw new IllegalArgumentException("Pulsanti non validi.");
        }
        bio.setMostraPost(req.mostraPost() == null || req.mostraPost());
        bio.setAttiva(Boolean.TRUE.equals(req.attiva()));
        bio.setAggiornataIl(LocalDateTime.now());
        return dto(repository.save(bio));
    }

    // ── Pubblico ──

    @Transactional
    public Optional<PlannerDto.BioPubblica> pubblica(String slug) {
        return attiva(slug).map(bio -> {
            repository.contaVisita(bio.getId(), LocalDate.now(SocialTempo.ROMA));
            List<PlannerDto.BioPubblicaPost> post = !bio.isMostraPost() ? List.of() : ultimiPost(bio.getBrandId()).stream()
                    .filter(p -> !p.media().isEmpty())
                    .limit(POST_PAGINA)
                    .map(p -> new PlannerDto.BioPubblicaPost(p.id(),
                            p.media().get(0).anteprimaUrl() != null ? p.media().get(0).anteprimaUrl() : p.media().get(0).url(),
                            p.titolo(), p.canali().isEmpty() ? null : p.canali().get(0).canale()))
                    .toList();
            return new PlannerDto.BioPubblica(bio.getTitolo(), bio.getDescrizione(), bio.getImmagineUrl(), bio.getColore(),
                    pulsanti(bio).stream().map(x -> new PlannerDto.BioPubblicaPulsante(x.id(), x.etichetta())).toList(), post);
        });
    }

    /** Dove porta un clic (contato); vuoto se la chiave non esiste. */
    @Transactional
    public Optional<String> vai(String slug, String chiave) {
        Optional<PlannerBio> b = attiva(slug);
        if (b.isEmpty() || !StringUtils.hasText(chiave) || chiave.length() > 80) {
            return Optional.empty();
        }
        PlannerBio bio = b.get();
        String url = null;
        if (chiave.startsWith("post:")) {
            Long id;
            try {
                id = Long.valueOf(chiave.substring(5));
            } catch (NumberFormatException e) {
                return Optional.empty();
            }
            url = postRepository.findById(id)
                    .filter(p -> p.getBrandId().equals(bio.getBrandId()) && STATI_USCITI.contains(p.getStato()))
                    .map(this::destinazionePost)
                    .orElse(null);
        } else {
            url = pulsanti(bio).stream().filter(p -> p.id().equals(chiave)).map(PlannerDto.BioPulsante::url).findFirst().orElse(null);
        }
        if (url == null) {
            return Optional.empty();
        }
        repository.contaClic(bio.getId(), chiave, LocalDate.now(SocialTempo.ROMA));
        return Optional.of(url);
    }

    private String destinazionePost(PlannerPost p) {
        if (StringUtils.hasText(p.getLink())) {
            return PlannerUtm.conUtm(p.getLink(), "linkinbio", PlannerUtm.campagna(p), null);
        }
        List<PlannerPostCanale> canali = canaleRepository.findByPostIdOrderByIdAsc(p.getId());
        return canali.stream()
                .filter(c -> StringUtils.hasText(c.getLinkEsterno()))
                .sorted((a, b) -> Boolean.compare(!PlannerCanali.INSTAGRAM.equals(a.getCanale()), !PlannerCanali.INSTAGRAM.equals(b.getCanale())))
                .map(PlannerPostCanale::getLinkEsterno)
                .findFirst()
                .orElse(null);
    }

    private Optional<PlannerBio> attiva(String slug) {
        if (slug == null || !slug.matches("[a-z0-9-]{1,60}")) {
            return Optional.empty();
        }
        return repository.findBySlug(slug).filter(PlannerBio::isAttiva);
    }

    /** Gli ultimi usciti (il doppio della pagina: quelli senza immagine si scartano dopo). */
    private List<PlannerDto.Post> ultimiPost(Long brandId) {
        return postService.dto(postRepository.pubblicatiDal(brandId, STATI_USCITI, LocalDateTime.now().minusYears(2)).stream()
                .limit(POST_PAGINA * 2L).toList());
    }

    // ── Supporto ──

    private PlannerDto.Bio dto(PlannerBio bio) {
        LocalDate dal = LocalDate.now(SocialTempo.ROMA).minusDays(29);
        List<PlannerDto.BioPulsante> pulsanti = pulsanti(bio);
        Map<String, String> etichette = new HashMap<>();
        pulsanti.forEach(p -> etichette.put(p.id(), p.etichetta()));
        Map<Long, String> titoli = new HashMap<>();
        List<PlannerDto.BioClic> clic = new ArrayList<>();
        for (Object[] r : repository.clicDal(bio.getId(), dal)) {
            String chiave = (String) r[0];
            long n = ((Number) r[1]).longValue();
            String etichetta = etichette.get(chiave);
            if (etichetta == null && chiave.startsWith("post:")) {
                try {
                    Long id = Long.valueOf(chiave.substring(5));
                    etichetta = titoli.computeIfAbsent(id, k -> postRepository.findById(k)
                            .map(PlannerNotificheService::titolo).orElse("Post eliminato"));
                } catch (NumberFormatException e) {
                    etichetta = chiave;
                }
            }
            clic.add(new PlannerDto.BioClic(chiave, etichetta == null ? "Pulsante tolto" : etichetta, n));
        }
        clic.sort((a, b) -> Long.compare(b.clic(), a.clic()));
        return new PlannerDto.Bio(bio.getId(), bio.getSlug(), bio.getTitolo(), bio.getDescrizione(), bio.getImmagineUrl(),
                bio.getColore(), pulsanti, bio.isMostraPost(), bio.isAttiva(), repository.visiteDal(bio.getId(), dal), clic);
    }

    private List<PlannerDto.BioPulsante> pulsanti(PlannerBio bio) {
        try {
            return objectMapper.readValue(bio.getPulsanti(), new TypeReference<List<PlannerDto.BioPulsante>>() { });
        } catch (Exception e) {
            return List.of();
        }
    }

    private String slugLibero(String base) {
        String b = base.length() < 3 ? "spazio" : base;
        String s = b;
        for (int i = 2; repository.existsBySlug(s); i++) {
            s = b + "-" + i;
        }
        return s;
    }
}
