package it.edodoc.hq.dto;

import com.fasterxml.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * DTO della pagina Email Marketing (/api/mailing), che sostituisce Mailchimp. Specifica:
 * docs/features/email-marketing.md. I tipi TypeScript gemelli sono in edodoc-frontend/src/services/mailing-service.ts.
 * Le date in uscita sono stringhe ISO-8601 con offset (Europe/Rome); in ingresso si accetta ISO con o senza offset.
 * I campi JSON liberi (design, regole, pubblico, grafo...) viaggiano come oggetti, non come stringhe.
 * Tassi in percentuale 0–100 con un decimale, null se il denominatore è zero.
 */
public final class MailingDto {

    private MailingDto() {
    }

    // ───────────────────────── Comuni ─────────────────────────

    public record Pagina<T>(List<T> elementi, long totale, int pagina, int dimensione) {
    }

    /** Metriche di un messaggio (campagna, email di automazione, aggregati). Aperture e click solo "umani". */
    public record Metriche(
            int destinatari,
            int inviati,
            int inCoda,
            int errori,
            int rimbalzi,
            int apertureUniche,
            int apertureAutomatiche,
            int clickUnici,
            int risposte,
            int disiscrizioni,
            int spam,
            Double tassoApertura,
            Double tassoClick,
            Double tassoClickSuAperture,
            Double tassoDisiscrizione,
            Double tassoRimbalzo,
            int visiteGenerate,
            BigDecimal fatturatoGenerato) {
    }

    // ───────────────────────── Stato e panoramica ─────────────────────────

    public record Stato(
            boolean invioAbilitato,
            boolean aiDisponibile,
            int mittentiAttivi,
            String urlPubblico,
            List<String> avvisi) {
    }

    public record Panoramica(
            int giorni,
            int contattiIscritti,
            int contattiTotali,
            int nuoviIscritti,
            int nuoviIscrittiPrecedente,
            int disiscritti,
            Metriche metriche,
            Metriche metrichePrecedente,
            List<PuntoSerie> crescita,
            List<PuntoSerie> attivitaGiornaliera,
            SaluteLista salute,
            List<CampagnaRiga> campagneRecenti,
            List<CampagnaRiga> programmate,
            List<AutomazioneRiga> automazioniAttive,
            List<Mittente> mittenti,
            int inCodaTotale) {
    }

    /** Un punto di serie temporale: {@code giorno} yyyy-MM-dd, valori per chiave (es. iscritti, aperture, click). */
    public record PuntoSerie(String giorno, Map<String, Number> valori) {
    }

    public record SaluteLista(
            int punteggio,
            int attivi,
            int tiepidi,
            int dormienti,
            int maiAperto,
            int rimbalzati,
            int disiscritti,
            Double tassoRimbalzo30g,
            Double tassoSpam30g,
            List<String> consigli) {
    }

    /** Voce del feed live: aperture, click, disiscrizioni, risposte, conversioni. */
    public record Attivita(
            long id,
            String tipo,
            String avvenutoIl,
            Long contattoId,
            String contattoNome,
            String contattoEmail,
            Long campagnaId,
            Long automazioneId,
            String messaggio,
            String url,
            String dispositivo,
            BigDecimal valore) {
    }

    // ───────────────────────── Contatti ─────────────────────────

    public record ContattoRiga(
            long id,
            String email,
            String nome,
            String cognome,
            String stato,
            String baseGiuridica,
            Long pazienteId,
            String tipo,
            List<Tag> tag,
            int punteggio,
            String coinvolgimento,
            String ultimaAperturaIl,
            String ultimoClickIl,
            String creatoIl) {
    }

    public record ContattoDettaglio(
            ContattoRiga contatto,
            String fonte,
            String consensoIl,
            String disiscrittoIl,
            String motivoDisiscrizione,
            String note,
            List<Long> categorieEscluse,
            Metriche metriche,
            List<InvioContatto> invii,
            List<Attivita> eventi,
            List<IscrizioneContatto> automazioni,
            PazienteBreve paziente) {
    }

    public record PazienteBreve(
            long id,
            String nomeCompleto,
            String cellulare,
            int numeroVisite,
            String ultimaVisita,
            String prossimaVisita,
            String statoPaziente,
            BigDecimal spesaTotale) {
    }

    public record InvioContatto(
            long id,
            String oggetto,
            Long campagnaId,
            String campagnaNome,
            Long automazioneId,
            String automazioneNome,
            String stato,
            String inviatoIl,
            String primaAperturaIl,
            int aperture,
            String primoClickIl,
            int click,
            String rispostoIl) {
    }

    public record IscrizioneContatto(
            long id,
            long automazioneId,
            String automazioneNome,
            String stato,
            String nodoCorrente,
            String prossimaAzioneIl,
            String iniziataIl) {
    }

    public record ContattoInput(
            String email,
            String nome,
            String cognome,
            String baseGiuridica,
            String note,
            List<Long> tagIds,
            List<Long> categorieEscluse) {
    }

    public record CambioStato(String stato, String motivo) {
    }

    public record AggiuntaTag(Long tagId, String nome) {
    }

    public record EsitoImport(int righe, int creati, int aggiornati, int saltati, int nonValidi, List<String> errori) {
    }

    public record EsitoSincronizzazione(int pazienti, int lead, int creati, int aggiornati, int archiviati) {
    }

    // ───────────────────────── Tag, categorie, segmenti ─────────────────────────

    public record Tag(long id, String nome, String colore, boolean sistema, Integer contatti) {
    }

    public record TagInput(String nome, String colore) {
    }

    public record Categoria(long id, String nome, String descrizione, int ordine, boolean attiva, Integer esclusi) {
    }

    public record CategoriaInput(String nome, String descrizione, Integer ordine, Boolean attiva) {
    }

    public record Segmento(
            long id,
            String nome,
            String descrizione,
            String colore,
            JsonNode regole,
            Integer ultimoConteggio,
            String contatoIl,
            String aggiornatoIl) {
    }

    public record SegmentoInput(String nome, String descrizione, String colore, JsonNode regole) {
    }

    public record RegoleInput(JsonNode regole) {
    }

    /** Un campo del costruttore di segmenti: operatori ammessi e, per i select, le opzioni. */
    public record CatalogoCampo(
            String campo,
            String etichetta,
            String gruppo,
            String tipoValore,
            List<String> operatori,
            List<Opzione> opzioni,
            String aiuto) {
    }

    public record Opzione(String valore, String etichetta) {
    }

    public record AnteprimaSegmento(int totale, int iscritti, List<ContattoRiga> campione) {
    }

    // ───────────────────────── Template e immagini ─────────────────────────

    public record TemplateRiga(long id, String nome, String categoria, String origine, String aggiornatoIl) {
    }

    public record Template(long id, String nome, String categoria, String origine, JsonNode design, String html,
                           String aggiornatoIl) {
    }

    public record TemplateInput(String nome, String categoria, JsonNode design, String html) {
    }

    public record Immagine(long id, String url, Integer larghezza, Integer altezza) {
    }

    // ───────────────────────── Campagne ─────────────────────────

    /**
     * Pubblico di una campagna. {@code tutti} = tutti gli iscritti; altrimenti unione di segmenti, tag e regole
     * inline, meno le esclusioni.
     */
    public record Pubblico(
            boolean tutti,
            List<Long> segmentiIds,
            List<Long> tagIds,
            JsonNode regole,
            List<Long> esclusiSegmentiIds,
            List<Long> esclusiTagIds) {
    }

    public record VarianteAb(String chiave, String oggetto, String preheader) {
    }

    public record TestAb(
            List<VarianteAb> varianti,
            int percentualeTest,
            String metrica,
            int oreAttesa,
            String vincitore,
            String decisoIl) {
    }

    public record CampagnaRiga(
            long id,
            String nome,
            String stato,
            String oggetto,
            String mittente,
            String programmataIl,
            String invioIniziatoIl,
            String invioCompletatoIl,
            Integer destinatariTotali,
            boolean testAb,
            Metriche metriche,
            String aggiornatoIl) {
    }

    public record Campagna(
            long id,
            String nome,
            String stato,
            Long mittenteId,
            Long categoriaId,
            String oggetto,
            String preheader,
            JsonNode design,
            String html,
            Pubblico pubblico,
            TestAb testAb,
            boolean invioIntelligente,
            String utmCampaign,
            String programmataIl,
            String invioIniziatoIl,
            String invioCompletatoIl,
            Integer destinatariTotali,
            Metriche metriche,
            String creatoIl,
            String aggiornatoIl) {
    }

    public record CampagnaInput(
            String nome,
            Long mittenteId,
            Long categoriaId,
            String oggetto,
            String preheader,
            JsonNode design,
            String html,
            Pubblico pubblico,
            TestAb testAb,
            Boolean invioIntelligente,
            String utmCampaign,
            Long templateId) {
    }

    public record StimaPubblicoInput(Pubblico pubblico, Long categoriaId, Long mittenteId) {
    }

    public record StimaPubblico(
            int destinatari,
            int disiscritti,
            int rimbalzati,
            int categoriaEsclusa,
            int senzaEmailValida,
            int giorniInvioStimati,
            String fineInvioStimata,
            List<ContattoRiga> campione) {
    }

    public record InvioTest(List<String> indirizzi, Long contattoAnteprimaId) {
    }

    /** Prova del contenuto che si sta modificando (email di automazione, template, campagna), anche non salvato. */
    public record InvioProva(List<String> indirizzi, String oggetto, String preheader, String html, Long mittenteId,
                             Long categoriaId, Long contattoAnteprimaId) {
    }

    public record AvvioInvio(String programmataIl) {
    }

    public record Controllo(String chiave, String esito, String titolo, String dettaglio) {
    }

    /** esito: OK, AVVISO, BLOCCANTE. {@code pronta} = nessun BLOCCANTE. */
    public record Controlli(boolean pronta, int punteggioSpam, List<Controllo> controlli) {
    }

    public record LinkReport(int indice, String url, String etichetta, int clickUnici, int clickTotali) {
    }

    public record VoceConteggio(String chiave, String etichetta, int valore) {
    }

    public record ReportVariante(String chiave, String oggetto, Metriche metriche, boolean vincitore) {
    }

    public record ReportCampagna(
            Campagna campagna,
            Metriche metriche,
            List<PuntoSerie> andamentoOrario,
            List<LinkReport> link,
            List<VoceConteggio> dispositivi,
            List<VoceConteggio> client,
            List<ReportVariante> varianti,
            List<Attivita> conversioni) {
    }

    public record DestinatarioRiga(
            long invioId,
            long contattoId,
            String email,
            String nome,
            String stato,
            String variante,
            String inviatoIl,
            String primaAperturaIl,
            int aperture,
            String primoClickIl,
            int click,
            String rispostoIl,
            String disiscrittoIl,
            String errore) {
    }

    // ───────────────────────── Automazioni ─────────────────────────

    public record AutomazioneRiga(
            long id,
            String nome,
            String descrizione,
            String stato,
            String triggerTipo,
            String triggerDescrizione,
            int attivi,
            int completati,
            int totaliIscritti,
            Metriche metriche,
            String attivataIl,
            String aggiornatoIl) {
    }

    public record AutomazioneEmail(
            long id,
            String nome,
            String oggetto,
            String preheader,
            JsonNode design,
            String html,
            Metriche metriche) {
    }

    public record Automazione(
            long id,
            String nome,
            String descrizione,
            String stato,
            Long mittenteId,
            Long categoriaId,
            JsonNode trigger,
            JsonNode grafo,
            JsonNode uscita,
            boolean rientroConsentito,
            boolean soloOrariLavorativi,
            List<AutomazioneEmail> email,
            String attivataIl,
            String aggiornatoIl) {
    }

    public record AutomazioneInput(
            String nome,
            String descrizione,
            Long mittenteId,
            Long categoriaId,
            JsonNode trigger,
            JsonNode grafo,
            JsonNode uscita,
            Boolean rientroConsentito,
            Boolean soloOrariLavorativi,
            String modello) {
    }

    public record AutomazioneEmailInput(String nome, String oggetto, String preheader, JsonNode design, String html) {
    }

    public record ModelloAutomazione(String chiave, String nome, String descrizione, String icona, JsonNode trigger,
                                     JsonNode grafo, JsonNode uscita, List<AutomazioneEmailInput> email) {
    }

    public record IscrizioneManuale(List<Long> contattoIds) {
    }

    public record EsitoIscrizione(int iscritti, int saltati) {
    }

    public record ReportNodo(String nodoId, int entrati, int inAttesa, int usciti, Metriche metriche) {
    }

    public record ReportAutomazione(
            Automazione automazione,
            int attivi,
            int completati,
            int usciti,
            int errori,
            Metriche metriche,
            List<ReportNodo> nodi,
            List<PuntoSerie> ingressiGiornalieri) {
    }

    // ───────────────────────── Mittenti e impostazioni ─────────────────────────

    public record Mittente(
            long id,
            String email,
            String nomeVisualizzato,
            String rispondiA,
            String casellaDelegata,
            String canale,
            String smtpHost,
            Integer smtpPorta,
            String smtpUtente,
            String smtpPasswordEnv,
            boolean smtpPasswordPresente,
            int limiteGiornaliero,
            int limiteAlMinuto,
            boolean predefinito,
            boolean attivo,
            String verificatoIl,
            String ultimoErrore,
            int inviatiUltime24h,
            int inCoda) {
    }

    public record MittenteInput(
            String email,
            String nomeVisualizzato,
            String rispondiA,
            String casellaDelegata,
            String canale,
            String smtpHost,
            Integer smtpPorta,
            String smtpUtente,
            String smtpPasswordEnv,
            Integer limiteGiornaliero,
            Integer limiteAlMinuto,
            Boolean predefinito,
            Boolean attivo) {
    }

    public record VerificaMittente(String indirizzoTest) {
    }

    /** Controlli DNS e di invio del dominio mittente: esito OK, AVVISO, ERRORE per ciascuno. */
    public record EsitoVerifica(boolean inviata, String errore, List<Controllo> controlli) {
    }

    public record Impostazioni(
            boolean invioAbilitato,
            String indirizzoPostale,
            int finestraAttribuzioneGiorni,
            List<Categoria> categorie) {
    }

    // ───────────────────────── AI ─────────────────────────

    public record AiEmailInput(String brief, String tono, String obiettivo, Long segmentoId, JsonNode impostazioni) {
    }

    public record AiEmail(JsonNode design, List<String> oggetti, String preheader) {
    }

    public record AiOggettiInput(String oggetto, String contenuto, String obiettivo) {
    }

    public record AiOggetto(String oggetto, int punteggio, String motivazione) {
    }

    public record AiRiscriviInput(String testo, String tono) {
    }

    public record AiTesto(String testo) {
    }

    public record AiSegmentoInput(String descrizione) {
    }

    public record AiSegmento(JsonNode regole, String spiegazione) {
    }

    public record AiAnalisi(String sintesi, List<String> puntiForza, List<String> consigli) {
    }

    // ───────────────────────── Pubblico (senza login) ─────────────────────────

    public record PreferenzeCategoria(long id, String nome, String descrizione, boolean attiva) {
    }

    public record Preferenze(String nomeMostrato, String emailMascherata, String stato, String mittente,
                             List<PreferenzeCategoria> categorie) {
    }

    public record AggiornaPreferenze(List<Long> categorieEscluse, boolean disiscrivi, String motivo, boolean reiscrivi,
                                     String invioToken) {
    }

}
