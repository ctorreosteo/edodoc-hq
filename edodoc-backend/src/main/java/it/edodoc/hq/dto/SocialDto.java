package it.edodoc.hq.dto;

import java.time.LocalDateTime;
import java.util.List;

/**
 * DTO della pagina Meta (/api/social): pagine Facebook e profili Instagram collegati.
 * Gli id di post, commenti, conversazioni e messaggi sono quelli di Meta.
 * Le date sono stringhe ISO-8601 con offset (Europe/Rome), i giorni {@code yyyy-MM-dd}.
 * Le metriche sono Long nullable: null significa "Meta non la fornisce", non zero.
 */
public final class SocialDto {

    private SocialDto() {
    }

    // ── Stato e account ──

    public record Stato(
            boolean utilizzabile,
            String motivo,
            boolean aiDisponibile,
            boolean webhookConfigurato,
            int intervalloAggiornamentoSecondi,
            List<Account> account) {
    }

    /** Pagina Facebook con l'eventuale profilo Instagram Business collegato. Nessun token qui dentro. */
    public record Account(
            String pageId,
            String nome,
            String immagine,
            String categoria,
            String linkFacebook,
            Long followerFacebook,
            String instagramId,
            String instagramUsername,
            String instagramImmagine,
            String linkInstagram,
            Long followerInstagram,
            Long postInstagram) {
    }

    // ── Panoramica ──

    public record Metrica(String chiave, String etichetta, Long valore, Long precedente, String descrizione) {
    }

    public record Piattaforma(boolean disponibile, String errore, Long follower, List<Metrica> metriche) {
    }

    public record PuntoSerie(
            String data,
            Long fbCopertura,
            Long fbVisualizzazioni,
            Long fbInterazioni,
            Long igCopertura,
            Long igNuoviFollower) {
    }

    /** giorno 1 = lunedì … 7 = domenica, ora 0-23 Europe/Rome, punteggio = interazioni medie per contenuto. */
    public record CellaOrario(int giorno, int ora, double punteggio, int contenuti) {
    }

    public record Community(
            int commentiTotali,
            int commentiDaRispondere,
            int commentiRisposti,
            Double tassoRisposta,
            Long tempoMedioRispostaMinuti,
            int conversazioniNonLette) {
    }

    public record Azione(
            Long id,
            String tipo,
            String piattaforma,
            String oggettoId,
            String anteprima,
            Long utenteId,
            String utenteNome,
            String creatoIl) {
    }

    public record Panoramica(
            String pageId,
            int giorni,
            String aggiornatoIl,
            Piattaforma facebook,
            Piattaforma instagram,
            List<PuntoSerie> serie,
            List<CellaOrario> orariMigliori,
            List<Contenuto> topContenuti,
            Community community,
            List<Azione> attivitaTeam) {
    }

    // ── Contenuti ──

    public record Contenuto(
            String id,
            String piattaforma,
            String tipo,
            String testo,
            String immagine,
            String link,
            String pubblicatoIl,
            Long miPiace,
            Long commenti,
            Long condivisioni,
            Long salvataggi,
            Long copertura,
            Long visualizzazioni,
            Long interazioni,
            Double tassoInterazione) {
    }

    // ── Commenti ──

    public record Commento(
            String id,
            String piattaforma,
            String postId,
            String postTesto,
            String postImmagine,
            String postLink,
            String autoreId,
            String autoreNome,
            String autoreImmagine,
            String testo,
            String allegatoImmagine,
            String creatoIl,
            Long miPiace,
            boolean nascosto,
            boolean piaceAllaPagina,
            boolean puoNascondere,
            boolean puoEliminare,
            boolean puoMettereMiPiace,
            boolean daPagina,
            boolean risposto,
            String rispostoIl,
            boolean gestito,
            String gestitoDa,
            String gestitoIl,
            List<Commento> risposte,
            Long rispostoDaUtenteId,
            String rispostoDaUtenteNome) {
    }

    public record ElencoCommenti(List<Commento> commenti, Community community, String aggiornatoIl) {
    }

    // ── Messaggi diretti ──

    public record Conversazione(
            String id,
            String piattaforma,
            String contattoId,
            String contattoNome,
            String contattoImmagine,
            String ultimoMessaggio,
            String ultimoMessaggioIl,
            boolean ultimoDaPagina,
            int nonLetti,
            boolean gestito,
            boolean finestraAperta,
            String finestraScadeIl,
            String link) {
    }

    public record Allegato(String tipo, String url, String anteprima, String nome) {
    }

    public record Messaggio(
            String id,
            String testo,
            String creatoIl,
            boolean daPagina,
            String autoreNome,
            List<Allegato> allegati,
            Long inviatoDaUtenteId,
            String inviatoDaUtenteNome) {
    }

    public record ThreadConversazione(Conversazione conversazione, List<Messaggio> messaggi) {
    }

    // ── Risposte rapide, pubblicazioni, pubblico ──

    public record RispostaRapida(Long id, String titolo, String testo, String scorciatoia, long usi) {
    }

    public record Pubblicazione(
            Long id,
            String pageId,
            List<String> piattaforme,
            String testo,
            String link,
            boolean conImmagine,
            String stato,
            String programmataAlle,
            String pubblicataIl,
            String idFacebook,
            String idInstagram,
            String linkFacebook,
            String linkInstagram,
            String errore,
            Long creatoDaUtenteId,
            String creatoDaNome,
            String creatoIl) {
    }

    public record Fetta(String chiave, String etichetta, long valore) {
    }

    public record FettaEtaGenere(String eta, long donne, long uomini, long altro) {
    }

    public record Pubblico(
            boolean disponibile,
            String errore,
            Long follower,
            List<FettaEtaGenere> etaGenere,
            List<Fetta> genere,
            List<Fetta> citta,
            List<Fetta> paesi) {
    }

    // ── AI ──

    public record RispostaAi(String testo, String modello) {
    }

    public record DidascaliaAi(String facebook, String instagram, List<String> hashtag, String modello) {
    }

    // ── Realtime ──

    /** Frame su /topic/social. tipo: COMMENTO | MESSAGGIO | AGGIORNAMENTO | PUBBLICAZIONE. */
    public record SocialEvento(
            String tipo,
            String piattaforma,
            String pageId,
            String autoreNome,
            String anteprima,
            String oggettoId) {
    }

    // ── Richieste ──

    public record RispostaCommentoRequest(String account, String piattaforma, String testo) {
    }

    public record NascondiRequest(String account, String piattaforma, Boolean nascosto) {
    }

    public record MiPiaceRequest(String account, String piattaforma, Boolean attivo) {
    }

    public record GestitoRequest(String account, String piattaforma, String oggettoId, String tipo, Boolean gestito) {
    }

    public record InviaMessaggioRequest(String account, String piattaforma, String destinatarioId, String testo) {
    }

    public record LettaRequest(String account, String piattaforma, String destinatarioId) {
    }

    public record RispostaRapidaRequest(String titolo, String testo, String scorciatoia) {
    }

    public record PubblicazioneRequest(
            String account,
            List<String> piattaforme,
            String testo,
            String link,
            LocalDateTime programmataAlle) {
    }

    public record RispostaAiRequest(
            String account,
            String piattaforma,
            String tipo,
            String oggettoId,
            String tono,
            String istruzioni) {
    }

    public record DidascaliaAiRequest(
            String idea,
            List<String> piattaforme,
            String tono,
            Boolean hashtag,
            Boolean emoji) {
    }
}
