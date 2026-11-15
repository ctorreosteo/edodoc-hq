package it.edodoc.hq.exception;

/**
 * L'integrazione Social (pagine Facebook e profili Instagram) non e utilizzabile: spenta da configurazione,
 * senza credenziali, oppure Meta ha rifiutato la richiesta. Il messaggio e gia scritto per chi usa la pagina.
 *
 * <p>{@code codiceMeta} e {@code sottocodiceMeta} sono quelli dell'errore Graph (0 se l'errore non viene da Meta):
 * servono ai servizi per riconoscere i casi da ritentare (finestra 24 ore dei messaggi, metrica non supportata).
 *
 * <p>Estende {@link IntegrazioneDisattivataException}: GlobalExceptionHandler la risponde gia come 409 con il
 * messaggio cosi com'e, senza bisogno di un handler dedicato.
 */
public class SocialIntegrazioneException extends IntegrazioneDisattivataException {

    private final int codiceMeta;
    private final int sottocodiceMeta;

    public SocialIntegrazioneException(String message) {
        this(message, 0, 0, null);
    }

    public SocialIntegrazioneException(String message, Throwable cause) {
        this(message, 0, 0, cause);
    }

    public SocialIntegrazioneException(String message, int codiceMeta, int sottocodiceMeta, Throwable cause) {
        super(message);
        if (cause != null) {
            initCause(cause);
        }
        this.codiceMeta = codiceMeta;
        this.sottocodiceMeta = sottocodiceMeta;
    }

    public int getCodiceMeta() {
        return codiceMeta;
    }

    public int getSottocodiceMeta() {
        return sottocodiceMeta;
    }
}
