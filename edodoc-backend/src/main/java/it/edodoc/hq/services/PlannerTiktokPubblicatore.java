package it.edodoc.hq.services;

import it.edodoc.hq.models.PlannerAccount;
import it.edodoc.hq.models.PlannerMedia;
import it.edodoc.hq.models.PlannerPost;
import it.edodoc.hq.repositories.PlannerAccountRepository;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.Set;

/**
 * TikTok per il Planner social: video (caricato dal gestionale) o carosello di foto, sull'account collegato via OAuth.
 * Opzioni: {@code privacy} (PUBLIC_TO_EVERYONE, MUTUAL_FOLLOW_FRIENDS, FOLLOWER_OF_CREATOR, SELF_ONLY),
 * {@code disattivaCommenti}, {@code disattivaDuet}, {@code disattivaStitch}, {@code contenutoSponsorizzato},
 * {@code promuoveIlMioBrand}, {@code musicaAutomatica} (foto).
 */
@Service
public class PlannerTiktokPubblicatore implements PlannerPubblicatore {

    private final PlannerTiktokClient tiktok;
    private final PlannerAccountRepository accountRepository;
    private final PlannerMediaService mediaService;

    public PlannerTiktokPubblicatore(PlannerTiktokClient tiktok, PlannerAccountRepository accountRepository,
                                     PlannerMediaService mediaService) {
        this.tiktok = tiktok;
        this.accountRepository = accountRepository;
        this.mediaService = mediaService;
    }

    @Override
    public Set<String> canali() {
        return Set.of(PlannerCanali.TIKTOK);
    }

    @Override
    public Risultato pubblica(Contesto ctx) throws Exception {
        PlannerAccount a = accountRepository.findByCanaleAndTipo(PlannerCanali.TIKTOK, PlannerAccount.TIPO_OAUTH).stream()
                .filter(x -> x.getAccount() != null && x.getAccount().equals(ctx.canale().getAccount()))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("L'account TikTok non è più collegato."));
        String testo = PlannerMetaPubblicatore.conLink(ctx.testo(), ctx.link());
        String id;
        if ("CAROSELLO".equals(ctx.canale().getFormato())) {
            String titolo = StringUtils.hasText(ctx.canale().getTitolo()) ? ctx.canale().getTitolo() : titolo(ctx.post());
            id = tiktok.pubblicaFoto(a, ctx.media().stream().map(mediaService::urlAssoluto).toList(), titolo, testo, ctx.opzioni());
        } else {
            PlannerMedia v = ctx.media().get(0);
            id = tiktok.pubblicaVideo(a, mediaService.contenuto(v.getId()), v.getMimeType(), testo, ctx.opzioni());
        }
        String profilo = a.getUrlProfilo();
        String link = profilo != null && id != null && id.matches("\\d+") ? profilo + "/video/" + id : profilo;
        return new Risultato(id, link);
    }

    /** Titolo del carosello: quello del post o l'inizio del testo (come PlannerNotificheService.titolo). */
    private static String titolo(PlannerPost p) {
        if (StringUtils.hasText(p.getTitolo())) {
            return p.getTitolo().trim();
        }
        String t = p.getTesto() == null ? "" : p.getTesto().trim();
        return t.isEmpty() ? "Post senza titolo" : SocialAzioniService.tronca(t, 60);
    }
}
