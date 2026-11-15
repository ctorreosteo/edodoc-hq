package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import it.edodoc.hq.dto.SocialDto;
import it.edodoc.hq.exception.SocialIntegrazioneException;
import it.edodoc.hq.models.SocialPubblicazione;
import it.edodoc.hq.models.SocialPubblicazioneImmagine;
import it.edodoc.hq.repositories.SocialPubblicazioneImmagineRepository;
import it.edodoc.hq.repositories.SocialPubblicazioneRepository;
import it.edodoc.hq.services.SocialAccountService.AccountInterno;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Post creati dalla pagina Meta, subito o programmati (li pubblica {@link it.edodoc.hq.jobs.SocialPubblicazioniJob}).
 *
 * <p>Instagram vuole un URL pubblico di un JPEG: l'immagine si carica prima sulla pagina Facebook come foto non
 * pubblicata, e l'URL della CDN di Meta diventa l'{@code image_url} del container Instagram. Cosi non serve
 * esporre file del gestionale su internet.
 */
@Service
public class SocialPubblicazioniService {

    private static final Logger logger = LoggerFactory.getLogger(SocialPubblicazioniService.class);

    /** 5 MB: sotto il limite generico degli upload (LimiteUploadFilter, 6 MB per richiesta). */
    private static final long MAX_BYTE = 5L * 1024 * 1024;
    private static final int MAX_TESTO_INSTAGRAM = 2200;
    private static final int MAX_TESTO_FACEBOOK = 60000;
    private static final int GIORNI_MAX_PROGRAMMAZIONE = 75;
    private static final int TENTATIVI_CONTAINER = 20;

    private final SocialPubblicazioneRepository repository;
    private final SocialPubblicazioneImmagineRepository immagineRepository;
    private final SocialAccountService accountService;
    private final SocialGraphClient graph;
    private final SocialCache cache;
    private final SocialAzioniService azioni;
    private final SocialRealtimeNotifier notifier;
    private final TransactionTemplate tx;

    public SocialPubblicazioniService(SocialPubblicazioneRepository repository,
                                      SocialPubblicazioneImmagineRepository immagineRepository,
                                      SocialAccountService accountService, SocialGraphClient graph, SocialCache cache,
                                      SocialAzioniService azioni, SocialRealtimeNotifier notifier, TransactionTemplate tx) {
        this.repository = repository;
        this.immagineRepository = immagineRepository;
        this.accountService = accountService;
        this.graph = graph;
        this.cache = cache;
        this.azioni = azioni;
        this.notifier = notifier;
        this.tx = tx;
    }

    // ── Lettura ──

    public List<SocialDto.Pubblicazione> elenco(String pageId) {
        AccountInterno a = accountService.risolvi(pageId);
        List<SocialPubblicazione> righe = repository.findByPageIdOrderByCreatoIlDesc(a.pageId(), PageRequest.of(0, 100));
        Map<Long, String> nomi = azioni.nomiUtenti(righe.stream().map(SocialPubblicazione::getCreatoDaUtenteId).toList());
        return righe.stream().map(p -> dto(p, nomi.get(p.getCreatoDaUtenteId()))).toList();
    }

    public SocialPubblicazioneImmagine immagine(Long id) {
        SocialPubblicazione p = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Pubblicazione non trovata."));
        accountService.risolvi(p.getPageId());
        return immagineRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Questa pubblicazione non ha un'immagine."));
    }

    // ── Creazione ──

    public SocialDto.Pubblicazione crea(SocialDto.PubblicazioneRequest req, MultipartFile file) {
        if (req == null) {
            throw new IllegalArgumentException("Mancano i dati della pubblicazione.");
        }
        AccountInterno a = accountService.risolvi(req.account());
        Set<String> piattaforme = piattaforme(req.piattaforme());
        if (piattaforme.contains(SocialCommentiService.INSTAGRAM) && !a.haInstagram()) {
            throw new IllegalArgumentException("Questa pagina non ha un profilo Instagram collegato.");
        }
        String testo = req.testo() == null ? "" : req.testo().trim();
        String link = StringUtils.hasText(req.link()) ? req.link().trim() : null;
        if (link != null && !link.matches("(?i)^https?://\\S+$")) {
            throw new IllegalArgumentException("Il link deve iniziare con http:// o https://.");
        }
        byte[] jpeg = file == null || file.isEmpty() ? null : jpeg(file);
        if (piattaforme.contains(SocialCommentiService.INSTAGRAM) && jpeg == null) {
            throw new IllegalArgumentException("Su Instagram si pubblica solo con un'immagine: aggiungine una.");
        }
        if (piattaforme.contains(SocialCommentiService.INSTAGRAM) && testo.length() > MAX_TESTO_INSTAGRAM) {
            throw new IllegalArgumentException("Su Instagram la didascalia può avere al massimo 2200 caratteri.");
        }
        if (testo.length() > MAX_TESTO_FACEBOOK) {
            throw new IllegalArgumentException("Il testo è troppo lungo.");
        }
        if (jpeg == null && testo.isEmpty() && link == null) {
            throw new IllegalArgumentException("Scrivi un testo o aggiungi un'immagine.");
        }
        LocalDateTime quando = req.programmataAlle();
        LocalDateTime adesso = LocalDateTime.now(SocialTempo.ROMA);
        if (quando != null) {
            if (quando.isBefore(adesso.plusMinutes(1))) {
                quando = null; // nel passato o fra meno di un minuto: si pubblica subito
            } else if (quando.isAfter(adesso.plusDays(GIORNI_MAX_PROGRAMMAZIONE))) {
                throw new IllegalArgumentException("Si può programmare al massimo a " + GIORNI_MAX_PROGRAMMAZIONE + " giorni.");
            }
        }

        LocalDateTime programmata = quando;
        SocialPubblicazione salvata = tx.execute(s -> {
            SocialPubblicazione p = repository.save(SocialPubblicazione.builder()
                    .pageId(a.pageId())
                    .piattaforme(String.join(",", piattaforme))
                    .testo(testo)
                    .link(link)
                    .conImmagine(jpeg != null)
                    .stato(programmata == null ? SocialPubblicazione.STATO_IN_CORSO : SocialPubblicazione.STATO_PROGRAMMATA)
                    .programmataAlle(programmata)
                    .creatoDaUtenteId(azioni.operatoreCorrenteId())
                    .creatoIl(LocalDateTime.now())
                    .build());
            if (jpeg != null) {
                immagineRepository.save(SocialPubblicazioneImmagine.builder()
                        .pubblicazioneId(p.getId())
                        .mimeType("image/jpeg")
                        .contenuto(jpeg)
                        .build());
            }
            return p;
        });
        azioni.registra(SocialAzioniService.PUBBLICAZIONE, String.join(",", piattaforme), a.pageId(),
                String.valueOf(salvata.getId()), null, testo.isEmpty() ? "(immagine)" : testo);
        if (programmata == null) {
            salvata = pubblica(salvata.getId());
        }
        return dto(salvata, azioni.nomeUtente(salvata.getCreatoDaUtenteId()));
    }

    public SocialDto.Pubblicazione annulla(Long id) {
        SocialPubblicazione p = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Pubblicazione non trovata."));
        accountService.risolvi(p.getPageId());
        if (!SocialPubblicazione.STATO_PROGRAMMATA.equals(p.getStato())) {
            throw new IllegalArgumentException("Si possono annullare solo i post ancora programmati.");
        }
        p.setStato(SocialPubblicazione.STATO_ANNULLATA);
        repository.save(p);
        return dto(p, azioni.nomeUtente(p.getCreatoDaUtenteId()));
    }

    // ── Pubblicazione (subito o dal job) ──

    /** Le programmate arrivate all'ora, prese in carico una alla volta (sicuro anche con piu repliche). */
    public int pubblicaScadute() {
        int fatte = 0;
        for (Long id : repository.idProgrammateScadute(LocalDateTime.now(SocialTempo.ROMA))) {
            Integer presa = tx.execute(s -> repository.prendiInCarico(id));
            if (presa != null && presa == 1) {
                pubblica(id);
                fatte++;
            }
        }
        return fatte;
    }

    /** Pubblica una riga gia IN_CORSO su ogni piattaforma richiesta; mai un'eccezione verso il chiamante. */
    SocialPubblicazione pubblica(Long id) {
        SocialPubblicazione p = repository.findById(id).orElseThrow();
        byte[] jpeg = p.isConImmagine() ? immagineRepository.findById(id).map(SocialPubblicazioneImmagine::getContenuto).orElse(null) : null;
        List<String> errori = new ArrayList<>();
        int riuscite = 0;
        Set<String> piattaforme = new LinkedHashSet<>(Arrays.asList(p.getPiattaforme().split(",")));
        AccountInterno a;
        try {
            a = accountService.risolvi(p.getPageId());
        } catch (SocialIntegrazioneException e) {
            return chiudi(p, 0, List.of(e.getMessage()));
        }
        if (piattaforme.contains(SocialCommentiService.FACEBOOK)) {
            try {
                pubblicaFacebook(a, p, jpeg);
                riuscite++;
            } catch (Exception e) {
                errori.add("Facebook: " + e.getMessage());
            }
        }
        if (piattaforme.contains(SocialCommentiService.INSTAGRAM)) {
            try {
                pubblicaInstagram(a, p, jpeg);
                riuscite++;
            } catch (Exception e) {
                errori.add("Instagram: " + e.getMessage());
            }
        }
        cache.segnaScaduto(a.pageId(), "contenuti:");
        cache.segnaScaduto(a.pageId(), "panoramica:");
        cache.invalida(a.pageId(), "commenti:");
        return chiudi(p, riuscite, errori);
    }

    private SocialPubblicazione chiudi(SocialPubblicazione p, int riuscite, List<String> errori) {
        p.setStato(errori.isEmpty() ? SocialPubblicazione.STATO_PUBBLICATA
                : riuscite > 0 ? SocialPubblicazione.STATO_PARZIALE : SocialPubblicazione.STATO_ERRORE);
        p.setErrore(errori.isEmpty() ? null : String.join("\n", errori));
        if (riuscite > 0) {
            p.setPubblicataIl(LocalDateTime.now());
        }
        SocialPubblicazione salvata = repository.save(p);
        if (!errori.isEmpty()) {
            logger.warn("Social: pubblicazione {} {}: {}", p.getId(), salvata.getStato(), p.getErrore());
        }
        notifier.pubblica(new SocialDto.SocialEvento(SocialRealtimeNotifier.TIPO_PUBBLICAZIONE, p.getPiattaforme(),
                p.getPageId(), null, SocialAzioniService.tronca(p.getTesto(), 120), String.valueOf(p.getId())));
        return salvata;
    }

    private void pubblicaFacebook(AccountInterno a, SocialPubblicazione p, byte[] jpeg) {
        String messaggio = testoConLink(p, jpeg != null);
        JsonNode r;
        if (jpeg != null) {
            Map<String, String> params = new LinkedHashMap<>();
            if (StringUtils.hasText(messaggio)) {
                params.put("message", messaggio);
            }
            params.put("published", "true");
            r = graph.postFile(a.pageId() + "/photos", params, jpeg, "post.jpg", "image/jpeg", a.token());
        } else {
            Map<String, String> params = new LinkedHashMap<>();
            if (StringUtils.hasText(p.getTesto())) {
                params.put("message", p.getTesto());
            }
            if (StringUtils.hasText(p.getLink())) {
                params.put("link", p.getLink());
            }
            r = graph.post(a.pageId() + "/feed", params, a.token());
        }
        String postId = StringUtils.hasText(r.path("post_id").asText(null)) ? r.path("post_id").asText() : r.path("id").asText(null);
        p.setIdFacebook(postId);
        p.setLinkFacebook(permalink(postId, "permalink_url", a, "https://www.facebook.com/" + postId));
    }

    private void pubblicaInstagram(AccountInterno a, SocialPubblicazione p, byte[] jpeg) throws InterruptedException {
        if (jpeg == null) {
            throw new SocialIntegrazioneException("manca l'immagine.");
        }
        // 1. foto non pubblicata sulla pagina → URL pubblico della CDN di Meta
        JsonNode foto = graph.postFile(a.pageId() + "/photos", Map.of("published", "false", "temporary", "true"),
                jpeg, "instagram.jpg", "image/jpeg", a.token());
        String fotoId = foto.path("id").asText(null);
        JsonNode dettagli = graph.get(fotoId, Map.of("fields", "images"), a.token());
        String url = dettagli.path("images").path(0).path("source").asText(null);
        if (!StringUtils.hasText(url)) {
            throw new SocialIntegrazioneException("Meta non ha restituito l'indirizzo dell'immagine caricata.");
        }
        // 2. container Instagram, 3. attesa elaborazione, 4. pubblicazione
        Map<String, String> params = new LinkedHashMap<>();
        params.put("image_url", url);
        String caption = testoConLink(p, true);
        if (StringUtils.hasText(caption)) {
            params.put("caption", caption);
        }
        String container = graph.post(a.instagramId() + "/media", params, a.token()).path("id").asText(null);
        for (int i = 0; i < TENTATIVI_CONTAINER; i++) {
            String stato = graph.get(container, Map.of("fields", "status_code"), a.token()).path("status_code").asText("");
            if ("FINISHED".equals(stato)) {
                break;
            }
            if ("ERROR".equals(stato) || "EXPIRED".equals(stato)) {
                throw new SocialIntegrazioneException("Instagram non è riuscito a elaborare l'immagine.");
            }
            Thread.sleep(1500);
        }
        String mediaId = graph.post(a.instagramId() + "/media_publish", Map.of("creation_id", container), a.token())
                .path("id").asText(null);
        p.setIdInstagram(mediaId);
        p.setLinkInstagram(permalink(mediaId, "permalink", a, null));
        try {
            graph.delete(fotoId, Map.of(), a.token());
        } catch (Exception e) {
            logger.debug("Social: foto temporanea {} non rimossa: {}", fotoId, e.getMessage());
        }
    }

    private String permalink(String id, String campo, AccountInterno a, String fallback) {
        if (!StringUtils.hasText(id)) {
            return fallback;
        }
        try {
            String l = graph.get(id, Map.of("fields", campo), a.token()).path(campo).asText(null);
            return StringUtils.hasText(l) ? l : fallback;
        } catch (Exception e) {
            return fallback;
        }
    }

    /** Dove il link non e cliccabile come allegato (foto, Instagram) va in fondo al testo. */
    static String testoConLink(SocialPubblicazione p, boolean linkNelTesto) {
        String t = p.getTesto() == null ? "" : p.getTesto();
        if (linkNelTesto && StringUtils.hasText(p.getLink()) && !t.contains(p.getLink())) {
            t = t.isEmpty() ? p.getLink() : t + "\n\n" + p.getLink();
        }
        return t;
    }

    static Set<String> piattaforme(List<String> richieste) {
        Set<String> out = new LinkedHashSet<>();
        if (richieste != null) {
            for (String r : richieste) {
                if (r != null) {
                    out.add(SocialCommentiService.piattaforma(r));
                }
            }
        }
        if (out.isEmpty()) {
            throw new IllegalArgumentException("Scegli almeno una piattaforma.");
        }
        return out;
    }

    /** Valida e converte in JPEG (Instagram accetta solo JPEG). */
    static byte[] jpeg(MultipartFile file) {
        if (file.getSize() > MAX_BYTE) {
            throw new IllegalArgumentException("L'immagine supera i 5 MB.");
        }
        try {
            byte[] dati = file.getBytes();
            BufferedImage img = ImageIO.read(new ByteArrayInputStream(dati));
            if (img == null) {
                throw new IllegalArgumentException("Formato immagine non supportato: usa JPG o PNG.");
            }
            String tipo = file.getContentType() == null ? "" : file.getContentType().toLowerCase(Locale.ROOT);
            if (tipo.contains("jpeg") || tipo.contains("jpg")) {
                return dati;
            }
            BufferedImage rgb = new BufferedImage(img.getWidth(), img.getHeight(), BufferedImage.TYPE_INT_RGB);
            Graphics2D g = rgb.createGraphics();
            g.setColor(Color.WHITE);
            g.fillRect(0, 0, img.getWidth(), img.getHeight());
            g.drawImage(img, 0, 0, null);
            g.dispose();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(rgb, "jpg", out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalArgumentException("Immagine non leggibile.");
        }
    }

    private static SocialDto.Pubblicazione dto(SocialPubblicazione p, String nome) {
        return new SocialDto.Pubblicazione(p.getId(), p.getPageId(), Arrays.asList(p.getPiattaforme().split(",")),
                p.getTesto(), p.getLink(), p.isConImmagine(), p.getStato(),
                p.getProgrammataAlle() == null ? null : SocialTempo.iso(p.getProgrammataAlle().atZone(SocialTempo.ROMA).toInstant()),
                p.getPubblicataIl() == null ? null : SocialTempo.iso(p.getPubblicataIl().atZone(SocialTempo.ROMA).toInstant()),
                p.getIdFacebook(), p.getIdInstagram(), p.getLinkFacebook(), p.getLinkInstagram(), p.getErrore(),
                p.getCreatoDaUtenteId(), nome, SocialTempo.iso(p.getCreatoIl().atZone(SocialTempo.ROMA).toInstant()));
    }
}
