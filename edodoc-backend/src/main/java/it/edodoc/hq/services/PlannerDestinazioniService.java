package it.edodoc.hq.services;

import it.edodoc.hq.dto.PlannerDto;
import it.edodoc.hq.dto.YoutubeDto;
import it.edodoc.hq.models.PlannerAccount;
import it.edodoc.hq.models.PlannerBrand;
import it.edodoc.hq.repositories.PlannerAccountRepository;
import it.edodoc.hq.repositories.PlannerBrandRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Dove può pubblicare uno spazio del Planner social.
 *
 * <p>Gli account integrati si leggono dalle integrazioni che il gestionale ha già: pagine Facebook e profili Instagram
 * del token Meta, il canale di YouTube Studio, la scheda Google dello studio (una sola in EdoDoc). Ognuno sta nello spazio a cui è assegnato
 * ({@link PlannerAccount} INTEGRATO), o in quello predefinito se nessuno l'ha assegnato. A questi si aggiungono gli
 * account TikTok collegati nello spazio (OAuth) e i profili manuali dello spazio. Ogni canale senza un account resta
 * disponibile come canale generico da pubblicare a mano, con l'avviso all'ora.
 */
@Service
public class PlannerDestinazioniService {

    private static final Logger logger = LoggerFactory.getLogger(PlannerDestinazioniService.class);
    private static final Duration TTL = Duration.ofMinutes(5);
    private static final String A_MANO = "Si pubblica a mano: all'ora arriva l'avviso con testo e media pronti.";

    private final SocialConfigService socialConfig;
    private final SocialAccountService socialAccount;
    private final YoutubeGoogleClient youtube;
    private final YoutubeStudioService youtubeStudio;
    private final GoogleBusinessReviewsService googleBusiness;
    private final PlannerAccountRepository accountRepository;
    private final PlannerBrandRepository brandRepository;
    private final PlannerTiktokClient tiktok;

    private volatile Integrati cache;
    private volatile Instant cacheScade = Instant.EPOCH;

    /** Account integrati scoperti e, per i canali che non ne hanno, perché si pubblicano a mano. */
    record Integrati(List<PlannerDto.Destinazione> account, Map<String, String> motiviGenerici) {
    }

    public PlannerDestinazioniService(SocialConfigService socialConfig, SocialAccountService socialAccount,
                                      YoutubeGoogleClient youtube, YoutubeStudioService youtubeStudio,
                                      GoogleBusinessReviewsService googleBusiness,
                                      PlannerAccountRepository accountRepository, PlannerBrandRepository brandRepository,
                                      PlannerTiktokClient tiktok) {
        this.socialConfig = socialConfig;
        this.socialAccount = socialAccount;
        this.youtube = youtube;
        this.youtubeStudio = youtubeStudio;
        this.googleBusiness = googleBusiness;
        this.accountRepository = accountRepository;
        this.brandRepository = brandRepository;
        this.tiktok = tiktok;
    }

    /** Le destinazioni dello spazio, nell'ordine dei canali. */
    public List<PlannerDto.Destinazione> elenco(PlannerBrand brand) {
        Integrati integrati = integrati();
        List<PlannerAccount> account = accountRepository.findAllByOrderByIdAsc();
        Map<String, Long> assegnati = account.stream()
                .filter(a -> PlannerAccount.TIPO_INTEGRATO.equals(a.getTipo()))
                .collect(Collectors.toMap(a -> chiave(a.getCanale(), a.getAccount()), PlannerAccount::getBrandId, (x, y) -> x));
        List<PlannerDto.Destinazione> out = new ArrayList<>();
        for (PlannerDto.Destinazione d : integrati.account()) {
            Long b = assegnati.get(chiave(d.canale(), d.account()));
            if (brand.getId().equals(b) || (b == null && brand.isPredefinito())) {
                out.add(d);
            }
        }
        for (PlannerAccount a : account) {
            if (!a.getBrandId().equals(brand.getId())) {
                continue;
            }
            if (PlannerAccount.TIPO_OAUTH.equals(a.getTipo())) {
                boolean ok = tiktok.configurato() && tiktok.collegato(a);
                out.add(new PlannerDto.Destinazione(a.getCanale(), a.getAccount(), a.getNome(), a.getDettaglio(),
                        a.getImmagine(), a.getUrlProfilo(), ok,
                        ok ? null : !tiktok.configurato() ? "App TikTok non configurata sul gestionale: si pubblica a mano."
                                : "Accesso scaduto: ricollega l'account (intanto si pubblica a mano).",
                        PlannerCanali.FORMATI.get(a.getCanale())));
            } else if (PlannerAccount.TIPO_MANUALE.equals(a.getTipo())) {
                out.add(new PlannerDto.Destinazione(a.getCanale(), "m" + a.getId(), a.getNome(), a.getDettaglio(), null,
                        a.getUrlProfilo(), false, A_MANO, PlannerCanali.FORMATI.get(a.getCanale())));
            }
        }
        Set<String> conAccount = out.stream().map(PlannerDto.Destinazione::canale).collect(Collectors.toSet());
        for (String c : PlannerCanali.TUTTI) {
            if (!conAccount.contains(c)) {
                out.add(new PlannerDto.Destinazione(c, null, PlannerCanali.nome(c), null, null, null, false,
                        integrati.motiviGenerici().getOrDefault(c, A_MANO), PlannerCanali.FORMATI.get(c)));
            }
        }
        out.sort((x, y) -> Integer.compare(PlannerCanali.TUTTI.indexOf(x.canale()), PlannerCanali.TUTTI.indexOf(y.canale())));
        return List.copyOf(out);
    }

    public Optional<PlannerDto.Destinazione> trova(PlannerBrand brand, String canale, String account) {
        return elenco(brand).stream()
                .filter(d -> d.canale().equals(canale))
                .filter(d -> d.account() == null ? !StringUtils.hasText(account) : d.account().equals(account))
                .findFirst();
    }

    /** Tutti gli account integrati e lo spazio in cui stanno (per le impostazioni). */
    public List<PlannerDto.AccountIntegrato> integratiConSpazio() {
        Long predefinito = brandRepository.findAllByOrderByPosizioneAscIdAsc().stream()
                .filter(PlannerBrand::isPredefinito).map(PlannerBrand::getId).findFirst().orElse(null);
        Map<String, Long> assegnati = new HashMap<>();
        accountRepository.findAllByOrderByIdAsc().stream()
                .filter(a -> PlannerAccount.TIPO_INTEGRATO.equals(a.getTipo()))
                .forEach(a -> assegnati.put(chiave(a.getCanale(), a.getAccount()), a.getBrandId()));
        return integrati().account().stream().map(d -> {
            Long b = assegnati.get(chiave(d.canale(), d.account()));
            return new PlannerDto.AccountIntegrato(d.canale(), d.account(), d.nome(), d.dettaglio(), d.immagine(),
                    b != null ? b : predefinito, b != null);
        }).toList();
    }

    public void invalida() {
        cacheScade = Instant.EPOCH;
    }

    static String chiave(String canale, String account) {
        return canale + "|" + (account == null ? "" : account);
    }

    // ── Scoperta degli account integrati ──

    private Integrati integrati() {
        Integrati c = cache;
        if (c != null && Instant.now().isBefore(cacheScade)) {
            return c;
        }
        Map<String, String> motivi = new LinkedHashMap<>();
        List<PlannerDto.Destinazione> out = new ArrayList<>();
        meta(out, motivi);
        youtube(out, motivi);
        googleBusiness(out, motivi);
        if (!tiktok.configurato()) {
            motivi.put(PlannerCanali.TIKTOK, "Nessun account TikTok collegato a questo spazio: si pubblica a mano.");
        }
        Integrati nuovi = new Integrati(List.copyOf(out), Map.copyOf(motivi));
        cache = nuovi;
        cacheScade = Instant.now().plus(TTL);
        return nuovi;
    }

    private void meta(List<PlannerDto.Destinazione> out, Map<String, String> motivi) {
        String motivo = null;
        List<SocialAccountService.AccountInterno> pagine = List.of();
        if (!socialConfig.isUtilizzabile()) {
            motivo = socialConfig.motivoIndisponibilita();
        } else {
            try {
                pagine = socialAccount.account();
                if (pagine.isEmpty()) {
                    motivo = "il token Meta non gestisce nessuna pagina";
                }
            } catch (Exception e) {
                motivo = e.getMessage();
            }
        }
        if (pagine.isEmpty()) {
            String m = "Meta non collegata" + (StringUtils.hasText(motivo) ? " (" + motivo + ")" : "") + ": si pubblica a mano.";
            motivi.put(PlannerCanali.FACEBOOK, m);
            motivi.put(PlannerCanali.INSTAGRAM, m);
            return;
        }
        for (SocialAccountService.AccountInterno a : pagine) {
            out.add(new PlannerDto.Destinazione(PlannerCanali.FACEBOOK, a.pageId(), a.nome(), a.categoria(), a.immagine(),
                    a.linkFacebook(), true, null, PlannerCanali.FORMATI.get(PlannerCanali.FACEBOOK)));
            if (a.haInstagram()) {
                out.add(new PlannerDto.Destinazione(PlannerCanali.INSTAGRAM, a.pageId(),
                        StringUtils.hasText(a.instagramUsername()) ? "@" + a.instagramUsername() : a.nome(),
                        a.nome(), a.instagramImmagine(), a.dto().linkInstagram(), true, null,
                        PlannerCanali.FORMATI.get(PlannerCanali.INSTAGRAM)));
            }
        }
    }

    private void youtube(List<PlannerDto.Destinazione> out, Map<String, String> motivi) {
        if (!youtube.collegato()) {
            motivi.put(PlannerCanali.YOUTUBE, "Canale non collegato (Marketing > YouTube): si pubblica a mano.");
            return;
        }
        String nome = "YouTube";
        String dettaglio = null;
        String avatar = null;
        String url = null;
        try {
            YoutubeDto.Canale c = youtubeStudio.canale();
            nome = StringUtils.hasText(c.titolo()) ? c.titolo() : nome;
            dettaglio = c.handle();
            avatar = c.avatar();
            url = "https://www.youtube.com/channel/" + c.id();
        } catch (Exception e) {
            logger.debug("Planner: canale YouTube non letto: {}", e.getMessage());
        }
        out.add(new PlannerDto.Destinazione(PlannerCanali.YOUTUBE, null, nome, dettaglio, avatar, url, true, null,
                PlannerCanali.FORMATI.get(PlannerCanali.YOUTUBE)));
    }

    /**
     * EdoDoc ha una sola scheda Google: l'account della destinazione è l'id della scheda
     * ({@link GoogleBusinessReviewsService#locationId()}), ed è quello che il pubblicatore Google riceve in
     * {@code canale.account}.
     */
    private void googleBusiness(List<PlannerDto.Destinazione> out, Map<String, String> motivi) {
        boolean scheda;
        boolean auth;
        try {
            scheda = googleBusiness.schedaConfigurata();
            auth = scheda && googleBusiness.autenticazioneDisponibile();
        } catch (Exception e) {
            scheda = false;
            auth = false;
        }
        if (!scheda) {
            motivi.put(PlannerCanali.GOOGLE_BUSINESS, "Scheda Google non collegata: si pubblica a mano.");
            return;
        }
        out.add(new PlannerDto.Destinazione(PlannerCanali.GOOGLE_BUSINESS, googleBusiness.locationId(), "Google · EdoDoc",
                null, null, googleBusiness.linkScheda(), auth,
                auth ? null : "Autenticazione Google Business non configurata: si pubblica a mano.",
                PlannerCanali.FORMATI.get(PlannerCanali.GOOGLE_BUSINESS)));
    }
}
