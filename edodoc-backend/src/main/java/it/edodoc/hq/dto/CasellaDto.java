package it.edodoc.hq.dto;

import java.util.List;

/**
 * DTO della pagina Email: la casella Gmail del dottore. Gli id di thread, messaggi ed etichette sono quelli
 * di Gmail. Le date sono millisecondi epoch, il client le mostra nel fuso locale.
 */
public final class CasellaDto {

    private CasellaDto() {
    }

    public record Indirizzo(String nome, String email) {
    }

    public record Etichetta(String id, String nome, String tipo, long threadTotali, long threadNonLetti,
                            String coloreSfondo, String coloreTesto) {
    }

    /** demo: casella finta per provare la pagina finché Google non è collegato. */
    public record Casella(String email, String nomeVisualizzato, List<Etichetta> etichette, String historyId, boolean demo) {
    }

    /** Polling leggero per badge e pagina. */
    public record Stato(String historyId, long inArrivoNonLetti, boolean cambiato) {
    }

    public record ThreadRiga(String id, String oggetto, String anteprima, List<Indirizzo> partecipanti, Indirizzo ultimoMittente,
                             int messaggi, long data, boolean nonLetto, boolean speciale, boolean allegati, boolean bozza,
                             List<String> etichette) {
    }

    public record PaginaThread(List<ThreadRiga> righe, String paginaSuccessiva, long stimaTotale) {
    }

    public record Allegato(String messaggioId, String allegatoId, String nome, String mimeType, long dimensione, boolean inline) {
    }

    /** html è già ripulito dal backend e va comunque mostrato in un iframe sandbox. */
    public record Messaggio(String id, String threadId, Indirizzo da, List<Indirizzo> a, List<Indirizzo> cc, List<Indirizzo> ccn,
                            List<Indirizzo> rispondiA, String oggetto, long data, String anteprima, String html, String testo,
                            List<Allegato> allegati, List<String> etichette, boolean nonLetto, boolean bozza,
                            String messageIdHeader, String references, String bozzaId) {

        public Messaggio conBozza(String id) {
            return new Messaggio(this.id, threadId, da, a, cc, ccn, rispondiA, oggetto, data, anteprima, html, testo,
                    allegati, etichette, nonLetto, bozza, messageIdHeader, references, id);
        }
    }

    public record Thread(String id, String oggetto, List<Messaggio> messaggi, List<String> etichette) {
    }

    public record Suggerimento(String nome, String email, String fonte, Long pazienteId) {
    }

    public record ModificaRequest(List<String> threadIds, List<String> aggiungi, List<String> rimuovi) {
    }

    public record ThreadIdsRequest(List<String> threadIds) {
    }

    public record AllegatoRif(String messaggioId, String allegatoId, String nome, String mimeType) {
    }

    /** Parte JSON "messaggio" del multipart; i file nuovi arrivano nella parte "file". */
    public record Composizione(List<String> a, List<String> cc, List<String> ccn, String oggetto, String html, String threadId,
                               String inReplyTo, String references, List<AllegatoRif> allegatiEsistenti, String bozzaId) {
    }

    public record EsitoInvio(String messaggioId, String threadId) {
    }

    public record EsitoBozza(String bozzaId, String messaggioId, String threadId, List<Allegato> allegati) {
    }

    public record Bozza(String bozzaId, String messaggioId, String threadId, List<Indirizzo> a, List<Indirizzo> cc, List<Indirizzo> ccn,
                        String oggetto, String html, String inReplyTo, String references, List<Allegato> allegati) {
    }
}
