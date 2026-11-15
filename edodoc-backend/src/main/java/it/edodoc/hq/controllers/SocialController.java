package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.SocialDto;
import it.edodoc.hq.dto.ApiResponseDto;
import it.edodoc.hq.models.SocialPubblicazioneImmagine;
import it.edodoc.hq.services.SocialAccountService;
import it.edodoc.hq.services.SocialAiService;
import it.edodoc.hq.services.SocialAzioniService;
import it.edodoc.hq.services.SocialCommentiService;
import it.edodoc.hq.services.SocialInsightsService;
import it.edodoc.hq.services.SocialMessaggiService;
import it.edodoc.hq.services.SocialPubblicazioniService;
import it.edodoc.hq.services.SocialRisposteRapideService;
import it.edodoc.hq.services.SocialStatoService;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.Duration;
import java.util.List;

/**
 * Pagina Meta: pagine Facebook e profili Instagram del dottore. Statistiche, commenti, messaggi
 * diretti, pubblicazione e AI. {@code account} e il page id: ogni servizio lo verifica contro le pagine che il
 * token Meta gestisce davvero. Solo ADMIN: lo garantisce SecurityConfig (anyRequest ADMIN), il REVISORE non entra.
 */
@RestController
@RequestMapping("/api/social")
public class SocialController {

    private final SocialStatoService stato;
    private final SocialAccountService account;
    private final SocialInsightsService insights;
    private final SocialCommentiService commenti;
    private final SocialMessaggiService messaggi;
    private final SocialPubblicazioniService pubblicazioni;
    private final SocialRisposteRapideService risposteRapide;
    private final SocialAzioniService azioni;
    private final SocialAiService ai;

    public SocialController(SocialStatoService stato, SocialAccountService account, SocialInsightsService insights,
                            SocialCommentiService commenti, SocialMessaggiService messaggi,
                            SocialPubblicazioniService pubblicazioni, SocialRisposteRapideService risposteRapide,
                            SocialAzioniService azioni, SocialAiService ai) {
        this.stato = stato;
        this.account = account;
        this.insights = insights;
        this.commenti = commenti;
        this.messaggi = messaggi;
        this.pubblicazioni = pubblicazioni;
        this.risposteRapide = risposteRapide;
        this.azioni = azioni;
        this.ai = ai;
    }

    @GetMapping("/stato")
    public ResponseEntity<ApiResponseDto<SocialDto.Stato>> stato() {
        return ok("Stato", stato.stato());
    }

    // ── Statistiche ──

    @GetMapping("/panoramica")
    public ResponseEntity<ApiResponseDto<SocialDto.Panoramica>> panoramica(
            @RequestParam(required = false) String account, @RequestParam(defaultValue = "28") int giorni) {
        return ok("Panoramica", insights.panoramica(account, giorni));
    }

    @GetMapping("/contenuti")
    public ResponseEntity<ApiResponseDto<List<SocialDto.Contenuto>>> contenuti(
            @RequestParam(required = false) String account,
            @RequestParam(defaultValue = "TUTTE") String piattaforma,
            @RequestParam(defaultValue = "30") int limite) {
        return ok("Contenuti", insights.contenuti(account, piattaforma, limite));
    }

    @GetMapping("/pubblico")
    public ResponseEntity<ApiResponseDto<SocialDto.Pubblico>> pubblico(@RequestParam(required = false) String account) {
        return ok("Pubblico", insights.pubblico(account));
    }

    @GetMapping("/attivita")
    public ResponseEntity<ApiResponseDto<List<SocialDto.Azione>>> attivita(@RequestParam(required = false) String account) {
        return ok("Attività", azioni.recenti(this.account.risolvi(account).pageId(), 50));
    }

    // ── Commenti ──

    @GetMapping("/commenti")
    public ResponseEntity<ApiResponseDto<SocialDto.ElencoCommenti>> commenti(
            @RequestParam(required = false) String account, @RequestParam(defaultValue = "TUTTE") String piattaforma) {
        return ok("Commenti", commenti.elenco(account, piattaforma));
    }

    @PostMapping("/commenti/{id}/rispondi")
    public ResponseEntity<ApiResponseDto<SocialDto.Commento>> rispondi(
            @PathVariable String id, @RequestBody SocialDto.RispostaCommentoRequest req) {
        return ok("Risposta pubblicata", commenti.rispondi(req.account(), id, req.piattaforma(), req.testo()));
    }

    @PostMapping("/commenti/{id}/nascondi")
    public ResponseEntity<ApiResponseDto<Void>> nascondi(@PathVariable String id, @RequestBody SocialDto.NascondiRequest req) {
        boolean nascosto = !Boolean.FALSE.equals(req.nascosto());
        commenti.nascondi(req.account(), id, req.piattaforma(), nascosto);
        return ok(nascosto ? "Commento nascosto" : "Commento di nuovo visibile", null);
    }

    @PostMapping("/commenti/{id}/mi-piace")
    public ResponseEntity<ApiResponseDto<Void>> miPiace(@PathVariable String id, @RequestBody SocialDto.MiPiaceRequest req) {
        commenti.miPiace(req.account(), id, req.piattaforma(), !Boolean.FALSE.equals(req.attivo()));
        return ok("Aggiornato", null);
    }

    @DeleteMapping("/commenti/{id}")
    public ResponseEntity<ApiResponseDto<Void>> eliminaCommento(
            @PathVariable String id, @RequestParam(required = false) String account, @RequestParam String piattaforma) {
        commenti.elimina(account, id, piattaforma);
        return ok("Commento eliminato", null);
    }

    @PostMapping("/commenti/{id}/messaggio-privato")
    public ResponseEntity<ApiResponseDto<Void>> messaggioPrivato(
            @PathVariable String id, @RequestBody SocialDto.RispostaCommentoRequest req) {
        commenti.messaggioPrivato(req.account(), id, req.piattaforma(), req.testo());
        return ok("Messaggio privato inviato", null);
    }

    @PostMapping("/gestiti")
    public ResponseEntity<ApiResponseDto<Void>> gestito(@RequestBody SocialDto.GestitoRequest req) {
        commenti.impostaGestito(req.account(), req.piattaforma(), req.oggettoId(), req.tipo(), !Boolean.FALSE.equals(req.gestito()));
        return ok("Aggiornato", null);
    }

    // ── Messaggi diretti ──

    @GetMapping("/conversazioni")
    public ResponseEntity<ApiResponseDto<List<SocialDto.Conversazione>>> conversazioni(
            @RequestParam(required = false) String account, @RequestParam(defaultValue = "TUTTE") String piattaforma) {
        return ok("Conversazioni", messaggi.conversazioni(account, piattaforma));
    }

    @GetMapping("/conversazioni/{id}")
    public ResponseEntity<ApiResponseDto<SocialDto.ThreadConversazione>> conversazione(
            @PathVariable String id, @RequestParam(required = false) String account, @RequestParam String piattaforma) {
        return ok("Conversazione", messaggi.thread(account, id, piattaforma));
    }

    @PostMapping("/conversazioni/{id}/messaggi")
    public ResponseEntity<ApiResponseDto<SocialDto.Messaggio>> invia(
            @PathVariable String id, @RequestBody SocialDto.InviaMessaggioRequest req) {
        return ok("Messaggio inviato", messaggi.invia(req.account(), id, req.piattaforma(), req.destinatarioId(), req.testo()));
    }

    @PostMapping("/conversazioni/{id}/letta")
    public ResponseEntity<ApiResponseDto<Void>> letta(@PathVariable String id, @RequestBody SocialDto.LettaRequest req) {
        messaggi.segnaLetta(req.account(), req.piattaforma(), req.destinatarioId());
        return ok("Letta", null);
    }

    // ── Risposte rapide ──

    @GetMapping("/risposte-rapide")
    public ResponseEntity<ApiResponseDto<List<SocialDto.RispostaRapida>>> risposteRapide() {
        return ok("Risposte rapide", risposteRapide.elenco());
    }

    @PostMapping("/risposte-rapide")
    public ResponseEntity<ApiResponseDto<SocialDto.RispostaRapida>> creaRisposta(@RequestBody SocialDto.RispostaRapidaRequest req) {
        return ok("Risposta salvata", risposteRapide.crea(req));
    }

    @PutMapping("/risposte-rapide/{id}")
    public ResponseEntity<ApiResponseDto<SocialDto.RispostaRapida>> aggiornaRisposta(
            @PathVariable Long id, @RequestBody SocialDto.RispostaRapidaRequest req) {
        return ok("Risposta aggiornata", risposteRapide.aggiorna(id, req));
    }

    @DeleteMapping("/risposte-rapide/{id}")
    public ResponseEntity<ApiResponseDto<Void>> eliminaRisposta(@PathVariable Long id) {
        risposteRapide.elimina(id);
        return ok("Risposta eliminata", null);
    }

    @PostMapping("/risposte-rapide/{id}/uso")
    public ResponseEntity<ApiResponseDto<Void>> usoRisposta(@PathVariable Long id) {
        risposteRapide.uso(id);
        return ok("Registrato", null);
    }

    // ── Pubblicazioni ──

    @GetMapping("/pubblicazioni")
    public ResponseEntity<ApiResponseDto<List<SocialDto.Pubblicazione>>> pubblicazioni(@RequestParam(required = false) String account) {
        return ok("Pubblicazioni", pubblicazioni.elenco(account));
    }

    @PostMapping(value = "/pubblicazioni", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponseDto<SocialDto.Pubblicazione>> pubblica(
            @RequestPart("pubblicazione") SocialDto.PubblicazioneRequest req,
            @RequestPart(value = "immagine", required = false) MultipartFile immagine) {
        SocialDto.Pubblicazione p = pubblicazioni.crea(req, immagine);
        return ok("PROGRAMMATA".equals(p.stato()) ? "Post programmato" : "Pubblicazione completata", p);
    }

    @DeleteMapping("/pubblicazioni/{id}")
    public ResponseEntity<ApiResponseDto<SocialDto.Pubblicazione>> annulla(@PathVariable Long id) {
        return ok("Programmazione annullata", pubblicazioni.annulla(id));
    }

    @GetMapping("/pubblicazioni/{id}/immagine")
    public ResponseEntity<byte[]> immagine(@PathVariable Long id) {
        SocialPubblicazioneImmagine img = pubblicazioni.immagine(id);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(img.getMimeType()))
                .cacheControl(CacheControl.maxAge(Duration.ofDays(7)).cachePrivate())
                .body(img.getContenuto());
    }

    // ── AI ──

    @PostMapping("/ai/risposta")
    public ResponseEntity<ApiResponseDto<SocialDto.RispostaAi>> rispostaAi(@RequestBody SocialDto.RispostaAiRequest req) {
        return ok("Risposta", ai.risposta(req));
    }

    @PostMapping("/ai/didascalia")
    public ResponseEntity<ApiResponseDto<SocialDto.DidascaliaAi>> didascaliaAi(@RequestBody SocialDto.DidascaliaAiRequest req) {
        return ok("Didascalia", ai.didascalia(req));
    }

    private static <T> ResponseEntity<ApiResponseDto<T>> ok(String messaggio, T dati) {
        return ResponseEntity.ok(ApiResponseDto.success(messaggio, dati));
    }
}
