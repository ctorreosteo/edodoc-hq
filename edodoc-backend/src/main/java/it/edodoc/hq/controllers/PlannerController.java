package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.PlannerDto;
import it.edodoc.hq.dto.ApiResponseDto;
import it.edodoc.hq.models.Utente;
import it.edodoc.hq.security.UtenteDetails;
import it.edodoc.hq.services.PlannerUtenti;
import it.edodoc.hq.services.PlannerAccessService;
import it.edodoc.hq.services.PlannerAiService;
import it.edodoc.hq.services.PlannerAnalisiService;
import it.edodoc.hq.services.PlannerBioService;
import it.edodoc.hq.services.PlannerConcorrentiService;
import it.edodoc.hq.services.PlannerModelliService;
import it.edodoc.hq.services.PlannerDestinazioniService;
import it.edodoc.hq.services.PlannerImpostazioniService;
import it.edodoc.hq.services.PlannerMediaService;
import it.edodoc.hq.services.PlannerPostService;
import it.edodoc.hq.services.PlannerPubblicazioneService;
import it.edodoc.hq.services.PlannerSpaziService;
import it.edodoc.hq.services.PlannerTiktokClient;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * Planner social (Marketing > Planner): piano editoriale e pubblicazione su tutti i canali, diviso in spazi.
 * In EdoDoc lo apre solo l'ADMIN (SecurityConfig: tutto ciò che non è pubblico vuole ROLE_ADMIN), che è anche chi
 * approva e cambia le impostazioni ({@link PlannerAccessService}). {@code brandId} assente = spazio predefinito.
 */
@RestController
@RequestMapping("/api/planner")
public class PlannerController {

    private final PlannerPostService post;
    private final PlannerPubblicazioneService pubblicazione;
    private final PlannerMediaService media;
    private final PlannerImpostazioniService impostazioni;
    private final PlannerSpaziService spazi;
    private final PlannerDestinazioniService destinazioni;
    private final PlannerTiktokClient tiktok;
    private final PlannerAnalisiService analisi;
    private final PlannerAiService ai;
    private final PlannerAccessService access;
    private final PlannerModelliService modelli;
    private final PlannerBioService bio;
    private final PlannerConcorrentiService concorrenti;
    private final PlannerUtenti anagrafica;

    public PlannerController(PlannerPostService post, PlannerPubblicazioneService pubblicazione, PlannerMediaService media,
                             PlannerImpostazioniService impostazioni, PlannerSpaziService spazi,
                             PlannerDestinazioniService destinazioni, PlannerTiktokClient tiktok,
                             PlannerAnalisiService analisi, PlannerAiService ai, PlannerAccessService access,
                             PlannerModelliService modelli, PlannerBioService bio, PlannerConcorrentiService concorrenti,
                             PlannerUtenti anagrafica) {
        this.post = post;
        this.pubblicazione = pubblicazione;
        this.media = media;
        this.impostazioni = impostazioni;
        this.spazi = spazi;
        this.destinazioni = destinazioni;
        this.tiktok = tiktok;
        this.analisi = analisi;
        this.ai = ai;
        this.access = access;
        this.modelli = modelli;
        this.bio = bio;
        this.concorrenti = concorrenti;
        this.anagrafica = anagrafica;
    }

    @GetMapping("/stato")
    public ResponseEntity<ApiResponseDto<PlannerDto.Stato>> stato(@RequestParam(required = false) Long brandId,
                                                                 @AuthenticationPrincipal UtenteDetails io) {
        return ok("Stato", post.stato(utente(io), ai.isDisponibile(), brandId));
    }

    // ── Post ──

    @GetMapping("/calendario")
    public ResponseEntity<ApiResponseDto<PlannerDto.Calendario>> calendario(
            @RequestParam(required = false) Long brandId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dal,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate al) {
        return ok("Calendario", post.calendario(brandId, dal, al));
    }

    @GetMapping("/board")
    public ResponseEntity<ApiResponseDto<List<PlannerDto.Post>>> board(@RequestParam(required = false) Long brandId) {
        return ok("Idee", post.board(brandId));
    }

    @GetMapping("/post/{id}")
    public ResponseEntity<ApiResponseDto<PlannerDto.PostDettaglio>> dettaglio(@PathVariable Long id) {
        return ok("Post", post.dettaglio(id));
    }

    @PostMapping("/post")
    public ResponseEntity<ApiResponseDto<PlannerDto.Post>> crea(@RequestBody PlannerDto.PostRequest req,
                                                               @AuthenticationPrincipal UtenteDetails io) {
        return ok("Post salvato", pubblicaSeServe(post.crea(req, utente(io)), req));
    }

    @PutMapping("/post/{id}")
    public ResponseEntity<ApiResponseDto<PlannerDto.Post>> aggiorna(@PathVariable Long id, @RequestBody PlannerDto.PostRequest req,
                                                                   @AuthenticationPrincipal UtenteDetails io) {
        return ok("Post salvato", pubblicaSeServe(post.aggiorna(id, req, utente(io)), req));
    }

    @PatchMapping("/post/{id}/sposta")
    public ResponseEntity<ApiResponseDto<PlannerDto.Post>> sposta(@PathVariable Long id, @RequestBody PlannerDto.SpostaRequest req,
                                                                 @AuthenticationPrincipal UtenteDetails io) {
        return ok("Post spostato", post.sposta(id, req.programmatoAlle(), utente(io)));
    }

    @PostMapping("/post/ordine")
    public ResponseEntity<ApiResponseDto<Void>> ordine(@RequestBody List<PlannerDto.OrdineVoce> ordine,
                                                       @AuthenticationPrincipal UtenteDetails io) {
        post.riordina(ordine, utente(io));
        return ok("Ordine salvato", null);
    }

    @PostMapping("/post/{id}/duplica")
    public ResponseEntity<ApiResponseDto<PlannerDto.Post>> duplica(@PathVariable Long id, @AuthenticationPrincipal UtenteDetails io) {
        return ok("Post duplicato", post.duplica(id, utente(io)));
    }

    @PostMapping("/post/{id}/ripeti")
    public ResponseEntity<ApiResponseDto<List<PlannerDto.Post>>> ripeti(@PathVariable Long id, @RequestBody PlannerDto.RipetiRequest req,
                                                                       @AuthenticationPrincipal UtenteDetails io) {
        return ok("Serie creata", post.ripeti(id, req == null ? null : req.ogniGiorni(), req == null ? null : req.volte(), utente(io)));
    }

    @DeleteMapping("/post/{id}")
    public ResponseEntity<ApiResponseDto<Void>> elimina(@PathVariable Long id, @AuthenticationPrincipal UtenteDetails io) {
        post.elimina(id, utente(io));
        return ok("Post eliminato", null);
    }

    @PostMapping("/post/{id}/annulla")
    public ResponseEntity<ApiResponseDto<PlannerDto.Post>> annulla(@PathVariable Long id, @AuthenticationPrincipal UtenteDetails io) {
        return ok("Programmazione annullata", post.annullaProgrammazione(id, utente(io)));
    }

    @PostMapping("/post/{id}/approva")
    public ResponseEntity<ApiResponseDto<PlannerDto.Post>> approva(@PathVariable Long id, @AuthenticationPrincipal UtenteDetails io) {
        return ok("Post approvato", post.approva(id, utente(io)));
    }

    @PostMapping("/post/{id}/rifiuta")
    public ResponseEntity<ApiResponseDto<PlannerDto.Post>> rifiuta(@PathVariable Long id, @RequestBody PlannerDto.RifiutoRequest req,
                                                                  @AuthenticationPrincipal UtenteDetails io) {
        return ok("Modifiche richieste", post.rifiuta(id, req == null ? null : req.motivo(), utente(io)));
    }

    @PostMapping("/post/{id}/riprova")
    public ResponseEntity<ApiResponseDto<PlannerDto.Post>> riprova(@PathVariable Long id, @AuthenticationPrincipal UtenteDetails io) {
        return ok("Nuovo tentativo avviato", pubblicazione.riprova(id, utente(io)));
    }

    @PostMapping("/post/{id}/canali/{canaleId}/pubblicato")
    public ResponseEntity<ApiResponseDto<PlannerDto.Post>> pubblicatoAMano(@PathVariable Long id, @PathVariable Long canaleId,
                                                                          @RequestBody(required = false) PlannerDto.ManualeRequest req,
                                                                          @AuthenticationPrincipal UtenteDetails io) {
        return ok("Segnato come pubblicato", pubblicazione.segnaPubblicato(id, canaleId, req == null ? null : req.link(), utente(io)));
    }

    @PostMapping("/post/{id}/commenti")
    public ResponseEntity<ApiResponseDto<PlannerDto.Commento>> commenta(@PathVariable Long id, @RequestBody PlannerDto.CommentoRequest req,
                                                                       @AuthenticationPrincipal UtenteDetails io) {
        return ok("Commento aggiunto", post.commenta(id, req == null ? null : req.testo(), utente(io)));
    }

    @DeleteMapping("/post/{id}/commenti/{commentoId}")
    public ResponseEntity<ApiResponseDto<Void>> eliminaCommento(@PathVariable Long id, @PathVariable Long commentoId,
                                                                @AuthenticationPrincipal UtenteDetails io) {
        post.eliminaCommento(id, commentoId, utente(io));
        return ok("Commento eliminato", null);
    }

    // ── Media ──

    @GetMapping("/media")
    public ResponseEntity<ApiResponseDto<List<PlannerDto.Media>>> media(@RequestParam(required = false) String tipo,
                                                                       @RequestParam(required = false) String cerca) {
        return ok("Media", media.elenco(tipo, cerca));
    }

    @PostMapping(value = "/media", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponseDto<PlannerDto.Media>> carica(
            @RequestPart("file") MultipartFile file,
            @RequestPart(value = "anteprima", required = false) MultipartFile anteprima,
            @RequestParam(required = false) Double durata,
            @RequestParam(required = false) Integer larghezza,
            @RequestParam(required = false) Integer altezza,
            @RequestParam(required = false) String tag) {
        return ok("Media caricato", media.carica(file, anteprima, durata, larghezza, altezza, tag));
    }

    @PutMapping("/media/{id}")
    public ResponseEntity<ApiResponseDto<PlannerDto.Media>> tagMedia(@PathVariable Long id, @RequestBody Map<String, String> corpo) {
        return ok("Media aggiornato", media.aggiornaTag(id, corpo == null ? null : corpo.get("tag")));
    }

    @DeleteMapping("/media/{id}")
    public ResponseEntity<ApiResponseDto<Void>> eliminaMedia(@PathVariable Long id) {
        media.elimina(id);
        return ok("Media eliminato", null);
    }

    // ── Rubriche, coda, hashtag, impostazioni ──

    @PostMapping("/etichette")
    public ResponseEntity<ApiResponseDto<PlannerDto.Etichetta>> creaEtichetta(@RequestBody PlannerDto.EtichettaRequest req,
                                                                             @AuthenticationPrincipal UtenteDetails io) {
        access.verificaApprovatore(utente(io));
        return ok("Rubrica creata", impostazioni.creaEtichetta(req));
    }

    @PutMapping("/etichette/{id}")
    public ResponseEntity<ApiResponseDto<PlannerDto.Etichetta>> aggiornaEtichetta(@PathVariable Long id, @RequestBody PlannerDto.EtichettaRequest req,
                                                                                 @AuthenticationPrincipal UtenteDetails io) {
        access.verificaApprovatore(utente(io));
        return ok("Rubrica aggiornata", impostazioni.aggiornaEtichetta(id, req));
    }

    @DeleteMapping("/etichette/{id}")
    public ResponseEntity<ApiResponseDto<Void>> eliminaEtichetta(@PathVariable Long id, @AuthenticationPrincipal UtenteDetails io) {
        access.verificaApprovatore(utente(io));
        impostazioni.eliminaEtichetta(id);
        return ok("Rubrica eliminata", null);
    }

    @PostMapping("/etichette/ordine")
    public ResponseEntity<ApiResponseDto<List<PlannerDto.Etichetta>>> ordinaEtichette(@RequestBody List<Long> ids,
                                                                                     @AuthenticationPrincipal UtenteDetails io) {
        access.verificaApprovatore(utente(io));
        return ok("Ordine salvato", impostazioni.ordinaEtichette(ids));
    }

    @GetMapping("/slot")
    public ResponseEntity<ApiResponseDto<List<PlannerDto.Slot>>> slot() {
        return ok("Orari della coda", impostazioni.slot());
    }

    @PutMapping("/slot")
    public ResponseEntity<ApiResponseDto<List<PlannerDto.Slot>>> salvaSlot(@RequestBody List<PlannerDto.SlotRequest> slot,
                                                                          @AuthenticationPrincipal UtenteDetails io) {
        access.verificaApprovatore(utente(io));
        return ok("Orari salvati", impostazioni.salvaSlot(slot));
    }

    @GetMapping("/slot/prossimo")
    public ResponseEntity<ApiResponseDto<PlannerDto.ProssimoSlot>> prossimoSlot(
            @RequestParam(required = false) Long brandId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dal) {
        return ok("Prossimo orario libero", impostazioni.prossimoSlot(spazi.risolvi(brandId).getId(), dal));
    }

    @GetMapping("/hashtag")
    public ResponseEntity<ApiResponseDto<List<PlannerDto.Hashtag>>> hashtag() {
        return ok("Hashtag", impostazioni.hashtag());
    }

    @PostMapping("/hashtag")
    public ResponseEntity<ApiResponseDto<PlannerDto.Hashtag>> creaHashtag(@RequestBody PlannerDto.HashtagRequest req) {
        return ok("Gruppo creato", impostazioni.creaHashtag(req));
    }

    @PutMapping("/hashtag/{id}")
    public ResponseEntity<ApiResponseDto<PlannerDto.Hashtag>> aggiornaHashtag(@PathVariable Long id, @RequestBody PlannerDto.HashtagRequest req) {
        return ok("Gruppo aggiornato", impostazioni.aggiornaHashtag(id, req));
    }

    @DeleteMapping("/hashtag/{id}")
    public ResponseEntity<ApiResponseDto<Void>> eliminaHashtag(@PathVariable Long id) {
        impostazioni.eliminaHashtag(id);
        return ok("Gruppo eliminato", null);
    }

    @PostMapping("/hashtag/{id}/uso")
    public ResponseEntity<ApiResponseDto<Void>> usoHashtag(@PathVariable Long id) {
        impostazioni.usoHashtag(id);
        return ok("Registrato", null);
    }

    @PutMapping("/impostazioni")
    public ResponseEntity<ApiResponseDto<Void>> impostazioni(@RequestBody PlannerDto.ImpostazioniRequest req,
                                                             @AuthenticationPrincipal UtenteDetails io) {
        access.verificaApprovatore(utente(io));
        if (req != null && req.approvazioneObbligatoria() != null) {
            impostazioni.salvaApprovazioneObbligatoria(req.approvazioneObbligatoria());
        }
        return ok("Impostazioni salvate", null);
    }

    // ── Spazi e account ──

    @GetMapping("/spazi")
    public ResponseEntity<ApiResponseDto<List<PlannerDto.Spazio>>> spazi() {
        return ok("Spazi", spazi.spazi());
    }

    @PostMapping("/spazi")
    public ResponseEntity<ApiResponseDto<PlannerDto.Spazio>> creaSpazio(@RequestBody PlannerDto.SpazioRequest req,
                                                                       @AuthenticationPrincipal UtenteDetails io) {
        access.verificaApprovatore(utente(io));
        return ok("Spazio creato", spazi.crea(req));
    }

    @PutMapping("/spazi/{id}")
    public ResponseEntity<ApiResponseDto<Void>> aggiornaSpazio(@PathVariable Long id, @RequestBody PlannerDto.SpazioRequest req,
                                                               @AuthenticationPrincipal UtenteDetails io) {
        access.verificaApprovatore(utente(io));
        spazi.aggiorna(id, req);
        return ok("Spazio aggiornato", null);
    }

    @DeleteMapping("/spazi/{id}")
    public ResponseEntity<ApiResponseDto<Void>> eliminaSpazio(@PathVariable Long id, @AuthenticationPrincipal UtenteDetails io) {
        access.verificaApprovatore(utente(io));
        spazi.elimina(id);
        return ok("Spazio eliminato", null);
    }

    @GetMapping("/spazi/integrati")
    public ResponseEntity<ApiResponseDto<List<PlannerDto.AccountIntegrato>>> integrati() {
        return ok("Account collegati", destinazioni.integratiConSpazio());
    }

    @PutMapping("/spazi/assegna")
    public ResponseEntity<ApiResponseDto<Void>> assegna(@RequestBody PlannerDto.AssegnaRequest req, @AuthenticationPrincipal UtenteDetails io) {
        access.verificaApprovatore(utente(io));
        spazi.assegna(req);
        return ok("Account spostato", null);
    }

    @PostMapping("/spazi/{id}/account-manuali")
    public ResponseEntity<ApiResponseDto<PlannerDto.AccountSpazio>> creaManuale(@PathVariable Long id,
                                                                               @RequestBody PlannerDto.AccountManualeRequest req,
                                                                               @AuthenticationPrincipal UtenteDetails io) {
        access.verificaApprovatore(utente(io));
        return ok("Profilo aggiunto", spazi.creaManuale(id, req));
    }

    @DeleteMapping("/spazi/account/{id}")
    public ResponseEntity<ApiResponseDto<Void>> eliminaAccount(@PathVariable Long id, @AuthenticationPrincipal UtenteDetails io) {
        access.verificaApprovatore(utente(io));
        spazi.eliminaAccount(id);
        return ok("Account tolto dallo spazio", null);
    }

    @GetMapping("/tiktok/collega")
    public ResponseEntity<ApiResponseDto<PlannerDto.CollegamentoUrl>> collegaTiktok(@RequestParam(required = false) Long brandId,
                                                                                   @AuthenticationPrincipal UtenteDetails io) {
        access.verificaApprovatore(utente(io));
        return ok("Collegamento", new PlannerDto.CollegamentoUrl(tiktok.urlConsenso(spazi.risolvi(brandId).getId())));
    }

    @PostMapping("/tiktok/callback")
    public ResponseEntity<ApiResponseDto<PlannerDto.AccountSpazio>> callbackTiktok(@RequestBody PlannerDto.OauthCallbackRequest req,
                                                                                  @AuthenticationPrincipal UtenteDetails io) {
        access.verificaApprovatore(utente(io));
        var a = tiktok.completaConsenso(req.code(), req.state());
        return ok("Account TikTok collegato", spazi.spazi().stream().flatMap(s -> s.account().stream())
                .filter(x -> x.id().equals(a.getId())).findFirst().orElse(null));
    }

    @GetMapping("/tiktok/{openId}/creatore")
    public ResponseEntity<ApiResponseDto<PlannerDto.TiktokCreatore>> creatoreTiktok(@PathVariable String openId) {
        return ok("Account TikTok", tiktok.creatore(spazi.accountTiktok(openId)));
    }

    // ── Ricerca, modelli, link in bio, concorrenti ──

    @GetMapping("/cerca")
    public ResponseEntity<ApiResponseDto<List<PlannerDto.Post>>> cerca(@RequestParam(required = false) Long brandId,
                                                                      @RequestParam String q) {
        return ok("Risultati", post.cerca(brandId, q));
    }

    @GetMapping("/modelli")
    public ResponseEntity<ApiResponseDto<List<PlannerDto.Modello>>> modelli(@RequestParam(required = false) Long brandId) {
        return ok("Modelli", modelli.elenco(brandId));
    }

    @PostMapping("/modelli")
    public ResponseEntity<ApiResponseDto<PlannerDto.Modello>> creaModello(@RequestBody PlannerDto.ModelloRequest req) {
        return ok("Modello salvato", modelli.crea(req));
    }

    @DeleteMapping("/modelli/{id}")
    public ResponseEntity<ApiResponseDto<Void>> eliminaModello(@PathVariable Long id) {
        modelli.elimina(id);
        return ok("Modello eliminato", null);
    }

    @PostMapping("/modelli/{id}/uso")
    public ResponseEntity<ApiResponseDto<Void>> usoModello(@PathVariable Long id) {
        modelli.uso(id);
        return ok("Registrato", null);
    }

    @GetMapping("/bio")
    public ResponseEntity<ApiResponseDto<PlannerDto.Bio>> bio(@RequestParam(required = false) Long brandId) {
        return ok("Link in bio", bio.leggi(brandId));
    }

    @PutMapping("/bio")
    public ResponseEntity<ApiResponseDto<PlannerDto.Bio>> salvaBio(@RequestParam(required = false) Long brandId,
                                                                  @RequestBody PlannerDto.BioRequest req,
                                                                  @AuthenticationPrincipal UtenteDetails io) {
        access.verificaApprovatore(utente(io));
        return ok("Link in bio salvato", bio.salva(brandId, req));
    }

    @GetMapping("/concorrenti")
    public ResponseEntity<ApiResponseDto<PlannerDto.Concorrenti>> concorrenti(@RequestParam(required = false) Long brandId,
                                                                             @RequestParam(defaultValue = "false") boolean aggiorna) {
        return ok("Concorrenti", concorrenti.elenco(brandId, aggiorna));
    }

    @PostMapping("/concorrenti")
    public ResponseEntity<ApiResponseDto<Void>> aggiungiConcorrente(@RequestParam(required = false) Long brandId,
                                                                    @RequestBody PlannerDto.ConcorrenteRequest req) {
        concorrenti.aggiungi(brandId, req == null ? null : req.username());
        return ok("Concorrente aggiunto", null);
    }

    @DeleteMapping("/concorrenti/{id}")
    public ResponseEntity<ApiResponseDto<Void>> eliminaConcorrente(@PathVariable Long id) {
        concorrenti.elimina(id);
        return ok("Concorrente tolto", null);
    }

    // ── Analisi e AI ──

    @GetMapping("/analisi")
    public ResponseEntity<ApiResponseDto<PlannerDto.Analisi>> analisi(
            @RequestParam(required = false) Long brandId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dal,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate al) {
        return ok("Analisi", analisi.analisi(brandId, dal, al));
    }

    @PostMapping("/ai/testi")
    public ResponseEntity<ApiResponseDto<PlannerDto.TestiAi>> testiAi(@RequestBody PlannerDto.TestiAiRequest req) {
        return ok("Testi", ai.testi(req));
    }

    @PostMapping("/ai/riscrivi")
    public ResponseEntity<ApiResponseDto<PlannerDto.RiscritturaAi>> riscriviAi(@RequestBody PlannerDto.RiscriviRequest req) {
        return ok("Testo", ai.riscrivi(req));
    }

    @PostMapping("/ai/testi-video")
    public ResponseEntity<ApiResponseDto<PlannerDto.TestiVideoAi>> testiVideo(@RequestBody PlannerDto.TestiVideoRequest req) {
        return ok("Testi dal video", ai.testiDaVideo(req));
    }

    @PostMapping("/ai/conformita")
    public ResponseEntity<ApiResponseDto<PlannerDto.ConformitaAi>> conformita(@RequestBody PlannerDto.ConformitaRequest req) {
        return ok("Controllo", ai.conformita(req));
    }

    @GetMapping("/ai/report")
    public ResponseEntity<ApiResponseDto<PlannerDto.ReportAi>> reportAi(
            @RequestParam(required = false) Long brandId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dal,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate al) {
        return ok("Commento", ai.report(brandId, dal, al));
    }

    @PostMapping("/ai/idee")
    public ResponseEntity<ApiResponseDto<PlannerDto.IdeeAi>> ideeAi(@RequestBody PlannerDto.IdeeAiRequest req,
                                                                   @AuthenticationPrincipal UtenteDetails io) {
        return ok("Idee", ai.idee(req, utente(io)));
    }

    /** «Pubblica ora»: il post salvato come programmato adesso parte subito, in background. */
    private PlannerDto.Post pubblicaSeServe(PlannerDto.Post p, PlannerDto.PostRequest req) {
        if (req != null && PlannerPostService.AZIONE_PUBBLICA_ORA.equalsIgnoreCase(String.valueOf(req.azione()))
                && "PROGRAMMATO".equals(p.stato()) && pubblicazione.avvia(p.id())) {
            return post.dettaglio(p.id()).post();
        }
        return p;
    }

    /** Il principal di EdoDoc tiene solo gli id: i servizi del Planner vogliono l'entity. */
    private Utente utente(UtenteDetails io) {
        return anagrafica.utente(io);
    }

    private static <T> ResponseEntity<ApiResponseDto<T>> ok(String messaggio, T dati) {
        return ResponseEntity.ok(ApiResponseDto.success(messaggio, dati));
    }
}
