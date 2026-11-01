package it.edodoc.hq.exception;

import org.springframework.http.HttpStatus;

/** Google ha rifiutato una richiesta: lo stato dice cosa è successo, il frontend mostra il testo così com'è. */
public class GoogleRifiutoException extends RuntimeException {

    private final HttpStatus stato;

    public GoogleRifiutoException(HttpStatus stato, String messaggio, Throwable causa) {
        super(messaggio, causa);
        this.stato = stato;
    }

    public HttpStatus getStato() {
        return stato;
    }
}
