package it.edodoc.hq.dto;

import java.util.List;

/**
 * Pagina YouTube (portata da Mobilitas HQ): canale, contatori live, Analytics, video, pubblico, commenti, piano editoriale e AI.
 * Le date sono {@code yyyy-MM-dd}, gli istanti ISO-8601 (come li dà Google) o epoch ms dove indicato.
 */
public final class YoutubeDto {

    private YoutubeDto() {
    }

    public record Stato(
            boolean clientConfigurato,
            boolean collegato,
            String redirectUri,
            Canale canale,
            boolean puoGestire,
            boolean puoCollegare,
            Long obiettivoIscritti,
            /** Valorizzato quando il canale risulta collegato ma Google rifiuta le chiamate (token revocato, API spenta). */
            String errore) {
    }

    public record Canale(
            String id,
            String titolo,
            String descrizione,
            String handle,
            String avatar,
            String banner,
            long iscritti,
            boolean iscrittiNascosti,
            long visualizzazioni,
            long video,
            String creatoIl,
            String paese) {
    }

    public record OauthUrl(String url, String redirectUri) {
    }

    public record CallbackRequest(String code, String state) {
    }

    /** Contatori pubblici adesso + storico delle rilevazioni (punti in epoch ms). */
    public record Live(
            long rilevatoIl,
            long iscritti,
            boolean iscrittiNascosti,
            long visualizzazioni,
            long video,
            /** Iscritti netti da Analytics dalla nascita del canale (non arrotondati, aggiornati a {@code iscrittiEsattiAl}). */
            Long iscrittiEsatti,
            String iscrittiEsattiAl,
            List<VideoLive> ultimiVideo,
            List<Punto> storico) {
    }

    public record Punto(long t, long iscritti, long visualizzazioni) {
    }

    public record VideoLive(
            String id,
            String titolo,
            String miniatura,
            String pubblicatoIl,
            long visualizzazioni,
            long like,
            long commenti) {
    }

    public record Totali(
            long visualizzazioni,
            long minutiVisti,
            double durataMediaSec,
            double percentualeMedia,
            long iscrittiGuadagnati,
            long iscrittiPersi,
            long like,
            long dislike,
            long commenti,
            long condivisioni,
            Double ricavi) {
    }

    public record Giorno(
            String data,
            long visualizzazioni,
            long minutiVisti,
            double durataMediaSec,
            long iscrittiGuadagnati,
            long iscrittiPersi,
            long like,
            long commenti,
            long condivisioni,
            Double ricavi) {
    }

    /** Riga generica di una classifica (fonte di traffico, paese, ricerca, …): valore principale e secondario. */
    public record Voce(String chiave, String etichetta, double valore, Double secondario) {
    }

    public record Panoramica(
            String dal,
            String al,
            Totali corrente,
            Totali precedente,
            List<Giorno> serie,
            boolean ricaviDisponibili,
            /** Visualizzazioni per tipo di contenuto (video, Short, live). */
            List<Voce> tipiContenuto) {
    }

    public record Video(
            String id,
            String titolo,
            String miniatura,
            String pubblicatoIl,
            long durataSec,
            boolean breve,
            String privacy,
            String programmatoIl,
            long visualizzazioni,
            long like,
            long commenti,
            /** Numeri Analytics del periodo scelto (null se il video non ha dati nel periodo). */
            Long periodoVisualizzazioni,
            Long periodoMinutiVisti,
            Double periodoDurataMediaSec,
            Double periodoPercentualeMedia,
            Long periodoIscritti,
            Long periodoCondivisioni) {
    }

    public record PuntoRitenzione(double t, double ritenzione, Double relativa) {
    }

    public record VideoDettaglio(
            Video video,
            String descrizione,
            List<String> tag,
            String categoriaId,
            Totali totali,
            List<Giorno> serie,
            List<PuntoRitenzione> ritenzione,
            List<Voce> fonti,
            List<Voce> ricerche,
            List<Voce> dispositivi,
            List<Voce> paesi) {
    }

    public record ModificaVideo(String titolo, String descrizione, List<String> tag, String privacy) {
    }

    public record Demografia(String fascia, double maschi, double femmine, double altro) {
    }

    public record Pubblico(
            List<Demografia> demografia,
            List<Voce> paesi,
            List<Voce> dispositivi,
            List<Voce> sistemiOperativi,
            List<Voce> fonti,
            List<Voce> ricerche,
            List<Voce> sitiEsterni,
            List<Voce> luoghiRiproduzione,
            List<Voce> iscrizione,
            List<Voce> condivisioni) {
    }

    public record Commento(
            String id,
            String commentoId,
            String videoId,
            String videoTitolo,
            String autore,
            String autoreAvatar,
            String autoreCanale,
            String testo,
            long like,
            String pubblicatoIl,
            long risposte,
            boolean rispostoDalCanale,
            List<Risposta> ultimeRisposte,
            String moderazione) {
    }

    public record Risposta(
            String id,
            String autore,
            String autoreAvatar,
            String testo,
            long like,
            String pubblicatoIl,
            boolean delCanale) {
    }

    public record PaginaCommenti(List<Commento> commenti, String prossimaPagina) {
    }

    public record RispostaRequest(String testo) {
    }

    public record ModerazioneRequest(String stato) {
    }

    public record Idea(
            Long id,
            String titolo,
            String note,
            String stato,
            String formato,
            String priorita,
            String dataUscita,
            String videoId,
            Long responsabileId,
            String responsabileNome,
            int posizione,
            String creataIl,
            String aggiornataIl) {
    }

    public record IdeaRequest(
            String titolo,
            String note,
            String stato,
            String formato,
            String priorita,
            String dataUscita,
            String videoId,
            Long responsabileId) {
    }

    public record OrdineVoce(Long id, String stato, int posizione) {
    }

    public record Persona(Long id, String nome) {
    }

    public record ObiettivoRequest(Long iscritti) {
    }

    public record AiPacchettoRequest(String argomento, String videoId, String formato, String note) {
    }

    public record AiPacchetto(
            List<String> titoli,
            String descrizione,
            List<String> tag,
            List<String> hook,
            List<String> testiMiniatura,
            List<String> capitoli,
            String consiglio) {
    }

    public record AiAnalisiRequest(String dal, String al) {
    }

    public record AzioneAi(String titolo, String dettaglio, String impatto) {
    }

    public record AiAnalisi(
            String voto,
            String sintesi,
            List<String> puntiForza,
            List<String> criticita,
            List<AzioneAi> azioni,
            List<String> ideeVideo) {
    }

    public record AiRispostaRequest(String testo, String videoTitolo, String istruzioni) {
    }

    public record AiRisposta(String testo) {
    }
}
