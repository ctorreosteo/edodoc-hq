package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.MailingDto;
import it.edodoc.hq.security.UtenteDetails;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import it.edodoc.hq.dto.ApiResponseDto;
import it.edodoc.hq.models.MailingContatto;
import it.edodoc.hq.services.MailingConfigService;
import it.edodoc.hq.services.MailingContattiService;
import it.edodoc.hq.services.MailingSegmentiService;
import it.edodoc.hq.services.MailingTagService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

/**
 * Email Marketing: contatti, tag, categorie, segmenti e impostazioni (/api/mailing). Specifica:
 * docs/features/email-marketing.md §8.
 */
@RestController
@RequestMapping("/api/mailing")
public class MailingContattiController {

    private static final long CSV_MAX_BYTE = 10L * 1024 * 1024;

    private final MailingContattiService contatti;
    private final MailingTagService tag;
    private final MailingSegmentiService segmenti;
    private final MailingConfigService config;

    public MailingContattiController(MailingContattiService contatti, MailingTagService tag,
                                     MailingSegmentiService segmenti, MailingConfigService config) {
        this.contatti = contatti;
        this.tag = tag;
        this.segmenti = segmenti;
        this.config = config;
    }

    // ── Contatti ──

    @GetMapping("/contatti")
    public ResponseEntity<ApiResponseDto<MailingDto.Pagina<MailingDto.ContattoRiga>>> elenco(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String stato,
            @RequestParam(required = false) Long tagId,
            @RequestParam(required = false) Long segmentoId,
            @RequestParam(defaultValue = "0") int pagina,
            @RequestParam(defaultValue = "50") int dimensione,
            @RequestParam(required = false) String ordina) {
        return ok("Contatti", contatti.elenco(q, stato, tagId, segmentoId, pagina, dimensione, ordina));
    }

    @GetMapping("/contatti/{id}")
    public ResponseEntity<ApiResponseDto<MailingDto.ContattoDettaglio>> dettaglio(@PathVariable long id) {
        return ok("Contatto", contatti.dettaglio(id));
    }

    @GetMapping("/contatti/paziente/{pazienteId}")
    public ResponseEntity<ApiResponseDto<MailingDto.ContattoDettaglio>> perPaziente(@PathVariable long pazienteId) {
        return ok("Contatto del paziente", contatti.dettaglioPerPaziente(pazienteId).orElse(null));
    }

    @PostMapping("/contatti")
    public ResponseEntity<ApiResponseDto<MailingDto.ContattoDettaglio>> crea(@RequestBody MailingDto.ContattoInput input) {
        return ok("Contatto creato", contatti.crea(input));
    }

    @PutMapping("/contatti/{id}")
    public ResponseEntity<ApiResponseDto<MailingDto.ContattoDettaglio>> aggiorna(
            @PathVariable long id, @RequestBody MailingDto.ContattoInput input) {
        return ok("Contatto aggiornato", contatti.aggiorna(id, input));
    }

    @PostMapping("/contatti/{id}/stato")
    public ResponseEntity<ApiResponseDto<MailingDto.ContattoDettaglio>> cambiaStato(
            @PathVariable long id, @RequestBody MailingDto.CambioStato req) {
        if (req == null || req.stato() == null) {
            throw new IllegalArgumentException("Indica il nuovo stato.");
        }
        MailingContatto.Stato stato;
        try {
            stato = MailingContatto.Stato.valueOf(req.stato().trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Stato non valido.");
        }
        contatti.cambiaStato(id, stato, req.motivo());
        return ok("Stato aggiornato", contatti.dettaglio(id));
    }

    @PostMapping("/contatti/{id}/tag")
    public ResponseEntity<ApiResponseDto<MailingDto.ContattoDettaglio>> aggiungiTag(
            @PathVariable long id, @RequestBody MailingDto.AggiuntaTag req,
            @AuthenticationPrincipal UtenteDetails operatore) {
        Long utente = operatore == null ? null : operatore.getId();
        if (req != null && req.tagId() != null) {
            contatti.aggiungiTagId(id, req.tagId(), utente);
        } else if (req != null && req.nome() != null && !req.nome().isBlank()) {
            contatti.aggiungiTag(id, req.nome(), false, utente);
        } else {
            throw new IllegalArgumentException("Scegli un tag o scrivi il nome di uno nuovo.");
        }
        return ok("Tag aggiunto", contatti.dettaglio(id));
    }

    @DeleteMapping("/contatti/{id}/tag/{tagId}")
    public ResponseEntity<ApiResponseDto<MailingDto.ContattoDettaglio>> rimuoviTag(
            @PathVariable long id, @PathVariable long tagId) {
        contatti.rimuoviTag(id, tagId);
        return ok("Tag rimosso", contatti.dettaglio(id));
    }

    @PostMapping(value = "/contatti/importa", consumes = "multipart/form-data")
    public ResponseEntity<ApiResponseDto<MailingDto.EsitoImport>> importa(
            @RequestPart("file") MultipartFile file,
            @RequestParam(required = false) Long tagId,
            @RequestParam(required = false) String baseGiuridica) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Carica un file CSV.");
        }
        if (file.getSize() > CSV_MAX_BYTE) {
            throw new IllegalArgumentException("Il file è troppo grande (massimo 10 MB).");
        }
        return ok("Import completato", contatti.importa(file.getBytes(), tagId, baseGiuridica));
    }

    @PostMapping("/contatti/sincronizza")
    public ResponseEntity<ApiResponseDto<MailingDto.EsitoSincronizzazione>> sincronizza() {
        return ok("Contatti allineati a pazienti e lead", contatti.sincronizza());
    }

    // ── Tag ──

    @GetMapping("/tag")
    public ResponseEntity<ApiResponseDto<List<MailingDto.Tag>>> tag() {
        return ok("Tag", tag.tag());
    }

    @PostMapping("/tag")
    public ResponseEntity<ApiResponseDto<MailingDto.Tag>> creaTag(@RequestBody MailingDto.TagInput input) {
        return ok("Tag creato", tag.creaTag(input));
    }

    @PutMapping("/tag/{id}")
    public ResponseEntity<ApiResponseDto<MailingDto.Tag>> aggiornaTag(@PathVariable long id,
                                                                      @RequestBody MailingDto.TagInput input) {
        return ok("Tag aggiornato", tag.aggiornaTag(id, input));
    }

    @DeleteMapping("/tag/{id}")
    public ResponseEntity<ApiResponseDto<Void>> eliminaTag(@PathVariable long id) {
        tag.eliminaTag(id);
        return ok("Tag eliminato", null);
    }

    // ── Categorie ──

    @GetMapping("/categorie")
    public ResponseEntity<ApiResponseDto<List<MailingDto.Categoria>>> categorie() {
        return ok("Categorie", tag.categorie());
    }

    @PostMapping("/categorie")
    public ResponseEntity<ApiResponseDto<MailingDto.Categoria>> creaCategoria(@RequestBody MailingDto.CategoriaInput input) {
        return ok("Categoria creata", tag.creaCategoria(input));
    }

    @PutMapping("/categorie/{id}")
    public ResponseEntity<ApiResponseDto<MailingDto.Categoria>> aggiornaCategoria(
            @PathVariable long id, @RequestBody MailingDto.CategoriaInput input) {
        return ok("Categoria aggiornata", tag.aggiornaCategoria(id, input));
    }

    // ── Segmenti ──

    @GetMapping("/segmenti")
    public ResponseEntity<ApiResponseDto<List<MailingDto.Segmento>>> segmenti() {
        return ok("Segmenti", segmenti.elenco());
    }

    @GetMapping("/segmenti/catalogo")
    public ResponseEntity<ApiResponseDto<List<MailingDto.CatalogoCampo>>> catalogo() {
        return ok("Catalogo", segmenti.catalogo());
    }

    @PostMapping("/segmenti/anteprima")
    public ResponseEntity<ApiResponseDto<MailingDto.AnteprimaSegmento>> anteprima(@RequestBody MailingDto.RegoleInput req) {
        return ok("Anteprima", segmenti.anteprima(req == null ? null : req.regole()));
    }

    @GetMapping("/segmenti/{id}")
    public ResponseEntity<ApiResponseDto<MailingDto.Segmento>> segmento(@PathVariable long id) {
        return ok("Segmento", segmenti.dettaglio(id));
    }

    @PostMapping("/segmenti")
    public ResponseEntity<ApiResponseDto<MailingDto.Segmento>> creaSegmento(@RequestBody MailingDto.SegmentoInput input) {
        return ok("Segmento creato", segmenti.crea(input));
    }

    @PutMapping("/segmenti/{id}")
    public ResponseEntity<ApiResponseDto<MailingDto.Segmento>> aggiornaSegmento(
            @PathVariable long id, @RequestBody MailingDto.SegmentoInput input) {
        return ok("Segmento aggiornato", segmenti.aggiorna(id, input));
    }

    @DeleteMapping("/segmenti/{id}")
    public ResponseEntity<ApiResponseDto<Void>> eliminaSegmento(@PathVariable long id) {
        segmenti.elimina(id);
        return ok("Segmento eliminato", null);
    }

    // ── Impostazioni ──

    @GetMapping("/impostazioni")
    public ResponseEntity<ApiResponseDto<MailingDto.Impostazioni>> impostazioni() {
        return ok("Impostazioni", impostazioniCorrenti());
    }

    /** Aggiorna interruttore invii, indirizzo postale e finestra di attribuzione (le categorie hanno i loro endpoint). */
    @PutMapping("/impostazioni")
    public ResponseEntity<ApiResponseDto<MailingDto.Impostazioni>> salvaImpostazioni(
            @RequestBody MailingDto.Impostazioni input) {
        if (input == null) {
            throw new IllegalArgumentException("Impostazioni mancanti.");
        }
        config.impostaIndirizzoPostale(input.indirizzoPostale());
        config.impostaFinestraAttribuzioneGiorni(input.finestraAttribuzioneGiorni());
        boolean prima = config.invioAbilitato();
        config.impostaInvioAbilitato(input.invioAbilitato());
        return ok("Impostazioni salvate", impostazioniCorrenti());
    }

    private MailingDto.Impostazioni impostazioniCorrenti() {
        return new MailingDto.Impostazioni(config.invioAbilitato(), config.indirizzoPostale(),
                config.finestraAttribuzioneGiorni(), tag.categorie());
    }

    private static <T> ResponseEntity<ApiResponseDto<T>> ok(String messaggio, T dati) {
        return ResponseEntity.ok(ApiResponseDto.success(messaggio, dati));
    }
}
