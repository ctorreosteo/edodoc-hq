package it.edodoc.hq.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/** Accettazione firmata online: lato gestionale e pagina pubblica di firma. */
public final class AccettazioneDto {

    private AccettazioneDto() {
    }

    // ------------------------------------------------------------------ dati salvati

    /** Dati anagrafici come li ha visti e confermati chi firma. dataNascita in formato ISO (yyyy-MM-dd). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Persona(String nome, String cognome, String codiceFiscale, String dataNascita, String luogoNascita,
                          String indirizzo, String cap, String citta, String provincia, String email, String cellulare) {
    }

    /** La persona seguita e, per un minore, il genitore o tutore che firma (null per un adulto). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Snapshot(Persona paziente, Persona firmatario) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Scelte(List<String> dichiarazioni, Map<String, Boolean> consensi, boolean rappresentante) {
    }

    // ------------------------------------------------------------------ gestionale

    public record GenitoreRequest(String nome, String cognome, String codiceFiscale, String ruolo) {
    }

    /** email: di chi firma (vuota = quella in scheda). inviaEmail: false = il dottore copia il link e lo manda lui. */
    public record CreaRequest(String email, Boolean inviaEmail, GenitoreRequest genitore) {
    }

    public record ReinviaRequest(String email, Boolean inviaEmail) {
    }

    public record AnnullaRequest(String motivo) {
    }

    public record ConsensoRequest(String tipo, Boolean concesso, String note) {
    }

    /** stato comprende SCADUTA, calcolato dalla scadenza del link. */
    public record Riga(Long id, String stato, String codiceVerifica, LocalDateTime creataIl, LocalDateTime scadeIl,
                       LocalDateTime apertaIl, LocalDateTime firmataIl, String email, String firmatario, String ruolo,
                       String versioneModulo, LocalDateTime emailInviataIl, LocalDateTime copiaInviataIl,
                       boolean marcaTemporale, String motivoAnnullamento, Map<String, Boolean> consensi) {
    }

    /** Il link in chiaro esce solo qui, alla creazione o al reinvio: nel database c'è solo il suo hash. */
    public record Inviata(Riga riga, String link, String avviso) {
    }

    public record Consenso(String tipo, String titolo, boolean concesso, LocalDateTime il, String fonte, String note) {
    }

    public record Panoramica(List<Riga> richieste, List<Consenso> consensi, List<String> datiTitolareMancanti,
                             boolean emailAttiva, boolean minorenne) {
    }

    public record Evento(int seq, String tipo, LocalDateTime il, String ip, String userAgent, String dettagli) {
    }

    public record Registro(List<Evento> eventi, boolean integro) {
    }

    // ------------------------------------------------------------------ pagina pubblica

    public record Sezione(String id, String titolo, String testo, String dichiarazione) {
    }

    public record ConsensoFacoltativo(String id, String titolo, String testo) {
    }

    public record Modulo(String titolo, String sottotitolo, String versione, List<Sezione> sezioni,
                         String dichiarazioneRappresentante, List<ConsensoFacoltativo> consensi, String notaConsensi) {
    }

    public record Firmata(String codiceVerifica, LocalDateTime firmataIl, boolean copiaInviata) {
    }

    /** stato: INVIATA, APERTA, FIRMATA, ANNULLATA o SCADUTA. Testi e dati solo finché si può firmare. */
    public record Vista(String stato, LocalDateTime scadeIl, String titolare, String ruolo, boolean minorenne,
                        Persona paziente, Persona firmatario, String emailMascherata, boolean datiConfermati,
                        boolean codiceVerificato, Modulo modulo, String informativaHtml, String fornitoriHtml,
                        String informativaTitolo, String fornitoriTitolo, Firmata firmata, String contatto) {
    }

    public record DatiRequest(Persona paziente, Persona firmatario) {
    }

    public record CodiceRequest(String codice) {
    }

    public record CodiceInviato(String emailMascherata, int validoMinuti, int attesaSecondi) {
    }

    /** firmaPng: immagine della firma tracciata, data URL o base64 di un PNG. */
    public record FirmaRequest(List<String> dichiarazioni, Map<String, Boolean> consensi, Boolean rappresentante,
                               String firmaPng) {
    }

    public record Verifica(boolean valido, String titolo, LocalDateTime firmataIl, String iniziali, String pdfSha256,
                           boolean marcaTemporale, String titolare) {
    }
}
