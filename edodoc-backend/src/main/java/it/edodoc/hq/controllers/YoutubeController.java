package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.ApiResponseDto;
import it.edodoc.hq.dto.YoutubeDto;
import it.edodoc.hq.models.Utente;
import it.edodoc.hq.repositories.UtenteRepository;
import it.edodoc.hq.security.UtenteDetails;
import it.edodoc.hq.services.YoutubeAiService;
import it.edodoc.hq.services.YoutubeGoogleClient;
import it.edodoc.hq.services.YoutubeIdeeService;
import it.edodoc.hq.services.YoutubeStudioService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * YouTube (portata da Mobilitas HQ): canale collegato via OAuth, statistiche live e Analytics, video (anche modifica),
 * pubblico, commenti (risposta e moderazione), piano editoriale e AI.
 * <p>
 * Solo il dottore: {@code /api/youtube/**} ricade in {@code anyRequest().hasRole("ADMIN")} di SecurityConfig, quindi
 * PAZIENTE e REVISORE (l'account di revisione di Apple e Google) ricevono 403 e non leggono mai il canale vero.
 * Per questo chi arriva qui può sia gestire sia collegare: in Mobilitas i due permessi dipendevano dal ruolo.
 */
@RestController
@RequestMapping("/api/youtube")
public class YoutubeController {

    private final YoutubeStudioService studio;
    private final YoutubeIdeeService idee;
    private final YoutubeAiService ai;
    private final YoutubeGoogleClient google;
    private final UtenteRepository utenteRepository;

    public YoutubeController(YoutubeStudioService studio, YoutubeIdeeService idee, YoutubeAiService ai,
                             YoutubeGoogleClient google, UtenteRepository utenteRepository) {
        this.studio = studio;
        this.idee = idee;
        this.ai = ai;
        this.google = google;
        this.utenteRepository = utenteRepository;
    }

    @GetMapping("/stato")
    public ApiResponseDto<YoutubeDto.Stato> stato() {
        return ApiResponseDto.success(studio.stato(true, true));
    }

    @GetMapping("/oauth/url")
    public ApiResponseDto<YoutubeDto.OauthUrl> urlConsenso() {
        return ApiResponseDto.success(new YoutubeDto.OauthUrl(google.urlConsenso(), google.redirectUri()));
    }

    @PostMapping("/oauth/callback")
    public ApiResponseDto<YoutubeDto.Stato> callback(@RequestBody YoutubeDto.CallbackRequest req) {
        studio.completaConsenso(req.code(), req.state());
        return ApiResponseDto.success("Canale collegato", studio.stato(true, true));
    }

    @DeleteMapping("/oauth")
    public ApiResponseDto<Void> scollega() {
        studio.scollega();
        return ApiResponseDto.success("Canale scollegato", null);
    }

    @PutMapping("/obiettivo")
    public ApiResponseDto<Void> obiettivo(@RequestBody YoutubeDto.ObiettivoRequest req) {
        studio.salvaObiettivo(req.iscritti());
        return ApiResponseDto.success("Obiettivo salvato", null);
    }

    @GetMapping("/live")
    public ApiResponseDto<YoutubeDto.Live> live(@RequestParam(defaultValue = "7") int giorni) {
        return ApiResponseDto.success(studio.live(giorni));
    }

    @GetMapping("/panoramica")
    public ApiResponseDto<YoutubeDto.Panoramica> panoramica(
            @RequestParam(required = false) String dal, @RequestParam(required = false) String al) {
        return ApiResponseDto.success(studio.panoramica(dal, al));
    }

    @GetMapping("/video")
    public ApiResponseDto<List<YoutubeDto.Video>> video(
            @RequestParam(required = false) String dal, @RequestParam(required = false) String al) {
        return ApiResponseDto.success(studio.video(dal, al));
    }

    @GetMapping("/video/{id}")
    public ApiResponseDto<YoutubeDto.VideoDettaglio> dettaglio(
            @PathVariable String id, @RequestParam(required = false) String dal, @RequestParam(required = false) String al) {
        return ApiResponseDto.success(studio.dettaglioVideo(id, dal, al));
    }

    @PutMapping("/video/{id}")
    public ApiResponseDto<YoutubeDto.VideoDettaglio> modifica(@PathVariable String id, @RequestBody YoutubeDto.ModificaVideo req) {
        return ApiResponseDto.success("Video aggiornato su YouTube", studio.modificaVideo(id, req));
    }

    @GetMapping("/pubblico")
    public ApiResponseDto<YoutubeDto.Pubblico> pubblico(
            @RequestParam(required = false) String dal, @RequestParam(required = false) String al) {
        return ApiResponseDto.success(studio.pubblico(dal, al));
    }

    @GetMapping("/commenti")
    public ApiResponseDto<YoutubeDto.PaginaCommenti> commenti(
            @RequestParam(required = false) String pagina,
            @RequestParam(required = false) String ordine,
            @RequestParam(required = false) String videoId,
            @RequestParam(required = false) String cerca,
            @RequestParam(required = false) String moderazione) {
        return ApiResponseDto.success(studio.commenti(pagina, ordine, videoId, cerca, moderazione));
    }

    @PostMapping("/commenti/{id}/risposta")
    public ApiResponseDto<YoutubeDto.Risposta> rispondi(@PathVariable String id, @RequestBody YoutubeDto.RispostaRequest req) {
        return ApiResponseDto.success("Risposta pubblicata", studio.rispondi(id, req.testo()));
    }

    @PostMapping("/commenti/{id}/moderazione")
    public ApiResponseDto<Void> modera(@PathVariable String id, @RequestBody YoutubeDto.ModerazioneRequest req) {
        studio.modera(id, req.stato());
        return ApiResponseDto.success("Commento aggiornato", null);
    }

    // ───────────────────────── Piano editoriale ─────────────────────────

    @GetMapping("/idee")
    public ApiResponseDto<List<YoutubeDto.Idea>> idee() {
        return ApiResponseDto.success(idee.elenco());
    }

    @GetMapping("/idee/responsabili")
    public ApiResponseDto<List<YoutubeDto.Persona>> responsabili() {
        return ApiResponseDto.success(idee.responsabili());
    }

    @PostMapping("/idee")
    public ApiResponseDto<YoutubeDto.Idea> creaIdea(@RequestBody YoutubeDto.IdeaRequest req, @AuthenticationPrincipal UtenteDetails utente) {
        Utente autore = utente == null ? null : utenteRepository.findById(utente.getId()).orElse(null);
        return ApiResponseDto.success("Scheda creata", idee.crea(req, autore));
    }

    @PutMapping("/idee/{id}")
    public ApiResponseDto<YoutubeDto.Idea> aggiornaIdea(@PathVariable Long id, @RequestBody YoutubeDto.IdeaRequest req) {
        return ApiResponseDto.success("Scheda aggiornata", idee.aggiorna(id, req));
    }

    @DeleteMapping("/idee/{id}")
    public ApiResponseDto<Void> eliminaIdea(@PathVariable Long id) {
        idee.elimina(id);
        return ApiResponseDto.success("Scheda eliminata", null);
    }

    @PutMapping("/idee/ordine")
    public ApiResponseDto<List<YoutubeDto.Idea>> riordina(@RequestBody List<YoutubeDto.OrdineVoce> ordine) {
        return ApiResponseDto.success("Ordine salvato", idee.riordina(ordine));
    }

    // ───────────────────────── AI ─────────────────────────

    @PostMapping("/ai/pacchetto")
    public ApiResponseDto<YoutubeDto.AiPacchetto> pacchetto(@RequestBody YoutubeDto.AiPacchettoRequest req) {
        return ApiResponseDto.success(ai.pacchetto(req));
    }

    @PostMapping("/ai/analisi")
    public ApiResponseDto<YoutubeDto.AiAnalisi> analisi(@RequestBody YoutubeDto.AiAnalisiRequest req) {
        return ApiResponseDto.success(ai.analisi(req));
    }

    @PostMapping("/ai/risposta")
    public ApiResponseDto<YoutubeDto.AiRisposta> rispostaAi(@RequestBody YoutubeDto.AiRispostaRequest req) {
        return ApiResponseDto.success(ai.risposta(req));
    }
}
