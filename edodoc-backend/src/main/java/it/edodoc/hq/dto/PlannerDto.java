package it.edodoc.hq.dto;

import com.fasterxml.jackson.databind.JsonNode;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * Planner social (Marketing > Planner). Le date in uscita sono ISO con offset; quelle in entrata ora locale di Roma
 * ({@code 2026-11-14T18:30}). {@code opzioni} di un canale è un oggetto JSON libero, diverso per canale.
 */
public final class PlannerDto {

    private PlannerDto() {
    }

    // ── Stato della pagina ──

    /**
     * Dove si può pubblicare in uno spazio. {@code automatica}: il gestionale pubblica da solo (altrimenti avviso e
     * pubblicazione a mano); {@code motivo} spiega perché no. {@code account} è il page id (Meta), l'id della scheda
     * (Google Business), l'open_id (TikTok), "m&lt;id&gt;" per un profilo manuale, null per il canale generico a mano.
     */
    public record Destinazione(
            String canale,
            String account,
            String nome,
            String dettaglio,
            String immagine,
            String urlProfilo,
            boolean automatica,
            String motivo,
            List<String> formati) {
    }

    /** Spazio di lavoro con i suoi account. */
    public record Spazio(
            Long id,
            String nome,
            String colore,
            String descrizione,
            boolean predefinito,
            int posizione,
            List<AccountSpazio> account) {
    }

    /** tipo: INTEGRATO, OAUTH, MANUALE. {@code collegato}: per OAuth, il token è ancora valido. */
    public record AccountSpazio(
            Long id,
            String canale,
            String tipo,
            String account,
            String nome,
            String dettaglio,
            String immagine,
            String urlProfilo,
            boolean collegato,
            String scadenza) {
    }

    /** Account già collegato al gestionale (Meta, YouTube, Google) e lo spazio in cui sta. */
    public record AccountIntegrato(
            String canale,
            String account,
            String nome,
            String dettaglio,
            String immagine,
            Long brandId,
            boolean assegnato) {
    }

    /** Cosa permette TikTok all'account adesso (va mostrato prima di pubblicare, come chiede TikTok). */
    public record TiktokCreatore(
            String nome,
            String username,
            String avatar,
            List<String> privacy,
            Integer durataMassimaSecondi,
            boolean commentiDisattivati,
            boolean duetDisattivati,
            boolean stitchDisattivati) {
    }

    public record Contatori(
            long idee,
            long bozze,
            long inApprovazione,
            long programmatiSettimana,
            long daPubblicare,
            long errori,
            long pubblicatiMese) {
    }

    public record Stato(
            Long brandId,
            List<Spazio> spazi,
            boolean tiktokConfigurato,
            boolean aiDisponibile,
            boolean approvazioneObbligatoria,
            boolean puoApprovare,
            boolean puoImpostare,
            List<Destinazione> destinazioni,
            List<Etichetta> etichette,
            List<Persona> persone,
            Contatori contatori,
            String prossimoProgrammato) {
    }

    public record Persona(Long id, String nome) {
    }

    // ── Post ──

    public record Media(
            Long id,
            String url,
            String anteprimaUrl,
            String nomeFile,
            String mimeType,
            String tipo,
            Integer larghezza,
            Integer altezza,
            Double durataSecondi,
            long byteDimensione,
            String tag,
            long usi,
            String creatoDaNome,
            String creatoIl) {
    }

    public record Metriche(
            Long visualizzazioni,
            Long copertura,
            Long miPiace,
            Long commenti,
            Long condivisioni,
            Long salvataggi,
            String aggiornateIl) {
    }

    public record PostCanale(
            Long id,
            String canale,
            String account,
            String accountNome,
            String formato,
            String modalita,
            String testo,
            String titolo,
            JsonNode opzioni,
            String stato,
            String idEsterno,
            String linkEsterno,
            String errore,
            String pubblicatoIl,
            String pubblicatoDaNome,
            Metriche metriche) {
    }

    public record Post(
            Long id,
            String titolo,
            String testo,
            String primoCommento,
            String link,
            boolean utm,
            String stato,
            String programmatoAlle,
            String pubblicatoIl,
            Long etichettaId,
            String note,
            Long responsabileId,
            String responsabileNome,
            Long creatoDaId,
            String creatoDaNome,
            String approvatoDaNome,
            String approvatoIl,
            String motivoRifiuto,
            int posizione,
            long commenti,
            String creatoIl,
            String aggiornatoIl,
            List<PostCanale> canali,
            List<Media> media) {
    }

    public record Commento(Long id, Long utenteId, String utenteNome, String testo, String creatoIl) {
    }

    public record Storico(Long id, String evento, String dettaglio, String utenteNome, String creatoIl) {
    }

    public record PostDettaglio(Post post, List<Commento> commenti, List<Storico> storico) {
    }

    /** Scheda del piano editoriale YouTube con data d'uscita: nel calendario come promemoria. */
    public record VoceYoutube(Long id, String titolo, String stato, String formato, LocalDate data) {
    }

    public record Calendario(LocalDate dal, LocalDate al, List<Post> post, List<VoceYoutube> youtube) {
    }

    // ── Impostazioni ──

    public record Etichetta(Long id, String nome, String colore, String descrizione, Integer obiettivoSettimanale, int posizione) {
    }

    public record Slot(Long id, int giorno, String ora) {
    }

    public record Hashtag(Long id, String nome, String hashtag, long usi) {
    }

    public record ProssimoSlot(String quando) {
    }

    // ── Analisi ──

    public record Totali(
            long post,
            long pubblicazioni,
            long visualizzazioni,
            long copertura,
            long interazioni,
            Double interazioniMedie) {
    }

    public record PerCanale(String canale, long pubblicazioni, long visualizzazioni, long copertura, long interazioni) {
    }

    public record PerEtichetta(Long etichettaId, String nome, String colore, long post, long interazioni, Integer obiettivoSettimanale) {
    }

    /** giorno 1 = lunedì … 7 = domenica, ora 0–23: post usciti in quella fascia e interazioni medie. */
    public record CellaOrario(int giorno, int ora, int post, double interazioniMedie) {
    }

    public record Settimana(LocalDate inizio, long pubblicati, long programmati) {
    }

    public record TopPost(Long postId, String titolo, String testo, String anteprimaUrl, String canale, String linkEsterno,
                          String pubblicatoIl, long interazioni, Long visualizzazioni) {
    }

    public record Analisi(
            LocalDate dal,
            LocalDate al,
            Totali totali,
            Totali precedente,
            List<PerCanale> canali,
            List<PerEtichetta> etichette,
            List<CellaOrario> orari,
            List<Settimana> settimane,
            List<TopPost> top,
            String metricheAggiornateIl) {
    }

    // ── AI ──

    /** testi: chiave canale (FACEBOOK, INSTAGRAM, ...) → testo; titoli per YouTube e Pinterest. */
    public record TestiAi(Map<String, String> testi, Map<String, String> titoli, List<String> hashtag, String modello) {
    }

    public record RiscritturaAi(String testo, String modello) {
    }

    public record IdeeAi(List<Post> idee, String modello) {
    }

    public record TestiVideoAi(String trascrizione, TestiAi testi) {
    }

    public record ProblemaConformita(String frase, String motivo, String proposta) {
    }

    /** esito: OK, ATTENZIONE, RISCHIO. */
    public record ConformitaAi(String esito, List<ProblemaConformita> problemi, String testoCorretto, String modello) {
    }

    public record ReportAi(String sintesi, List<String> puntiForti, List<String> daMigliorare, List<String> prossimiPassi,
                           String modello) {
    }

    // ── Modelli ──

    /** contenuto: la richiesta di post salvata (testo, canali, rubrica, link, primo commento, utm). */
    public record Modello(Long id, Long brandId, String nome, JsonNode contenuto, long usi, String creatoDaNome, String creatoIl) {
    }

    public record ModelloRequest(Long brandId, String nome, Boolean perTuttiGliSpazi, JsonNode contenuto) {
    }

    // ── Link in bio ──

    public record BioPulsante(String id, String etichetta, String url) {
    }

    public record BioClic(String chiave, String etichetta, long clic) {
    }

    public record Bio(
            Long id,
            String slug,
            String titolo,
            String descrizione,
            String immagineUrl,
            String colore,
            List<BioPulsante> pulsanti,
            boolean mostraPost,
            boolean attiva,
            long visite30,
            List<BioClic> clic30) {
    }

    public record BioRequest(
            String slug,
            String titolo,
            String descrizione,
            String immagineUrl,
            String colore,
            List<BioPulsante> pulsanti,
            Boolean mostraPost,
            Boolean attiva) {
    }

    /** Pagina pubblica: gli url restano nel backend, i clic passano da /vai?k= (che li conta). */
    public record BioPubblicaPulsante(String id, String etichetta) {
    }

    public record BioPubblicaPost(Long id, String immagineUrl, String titolo, String canale) {
    }

    public record BioPubblica(
            String titolo,
            String descrizione,
            String immagineUrl,
            String colore,
            List<BioPubblicaPulsante> pulsanti,
            List<BioPubblicaPost> post) {
    }

    // ── Concorrenti ──

    public record PostConcorrente(String permalink, String immagine, String tipo, Long miPiace, Long commenti, String data, String testo) {
    }

    public record ProfiloConcorrente(
            Long id,
            String username,
            boolean proprio,
            String nome,
            String immagine,
            String biografia,
            Long follower,
            Long post,
            Double postSettimana,
            Double mediaMiPiace,
            Double mediaCommenti,
            Double tassoInterazione,
            List<PostConcorrente> ultimi,
            String errore) {
    }

    public record Concorrenti(List<ProfiloConcorrente> profili, String motivo, String aggiornatoIl) {
    }

    public record ConcorrenteRequest(String username) {
    }

    // ── Richieste ──

    public record CanaleRequest(
            String canale,
            String account,
            String formato,
            String modalita,
            String testo,
            String titolo,
            JsonNode opzioni) {
    }

    /**
     * azione: IDEA, BOZZA, APPROVAZIONE (chiede l'approvazione), PROGRAMMA, PUBBLICA_ORA.
     * Con l'approvazione obbligatoria, PROGRAMMA e PUBBLICA_ORA di chi non approva diventano APPROVAZIONE.
     */
    public record PostRequest(
            Long brandId,
            String titolo,
            String testo,
            String primoCommento,
            String link,
            Long etichettaId,
            String note,
            Long responsabileId,
            LocalDateTime programmatoAlle,
            String azione,
            List<CanaleRequest> canali,
            List<Long> mediaIds,
            Boolean utm) {
    }

    public record SpostaRequest(LocalDateTime programmatoAlle) {
    }

    public record OrdineVoce(Long id, String stato, int posizione) {
    }

    public record RifiutoRequest(String motivo) {
    }

    public record CommentoRequest(String testo) {
    }

    public record ManualeRequest(String link) {
    }

    public record EtichettaRequest(String nome, String colore, String descrizione, Integer obiettivoSettimanale) {
    }

    public record SlotRequest(int giorno, String ora) {
    }

    public record HashtagRequest(String nome, String hashtag) {
    }

    public record ImpostazioniRequest(Boolean approvazioneObbligatoria) {
    }

    public record SpazioRequest(String nome, String colore, String descrizione) {
    }

    public record AssegnaRequest(String canale, String account, Long brandId) {
    }

    public record AccountManualeRequest(String canale, String nome, String dettaglio, String urlProfilo) {
    }

    public record CollegamentoUrl(String url) {
    }

    public record OauthCallbackRequest(String code, String state) {
    }

    public record TestiAiRequest(Long brandId, String idea, String testo, List<String> canali, String tono, Boolean hashtag,
                                 Boolean emoji) {
    }

    public record RiscriviRequest(String testo, String canale, String istruzione) {
    }

    /** giornate: le ricorrenze del periodo che il calendario mostra («2026-11-14 Giornata mondiale del diabete»). */
    public record TestiVideoRequest(Long brandId, Long mediaId, List<String> canali, String tono, Boolean hashtag, Boolean emoji) {
    }

    public record ConformitaRequest(String testo, String canale) {
    }

    /** ogniGiorni: distanza fra un'uscita e l'altra; volte: quante copie in più (1–26). */
    public record RipetiRequest(Integer ogniGiorni, Integer volte) {
    }

    public record IdeeAiRequest(Long brandId, LocalDate dal, LocalDate al, Integer quante, String indicazioni,
                                List<String> canali, List<String> giornate) {
    }
}
