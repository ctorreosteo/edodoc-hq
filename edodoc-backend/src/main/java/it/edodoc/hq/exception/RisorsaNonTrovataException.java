package it.edodoc.hq.exception;

/** 404: il messaggio è già scritto per chi usa il gestionale. */
public class RisorsaNonTrovataException extends RuntimeException {
    public RisorsaNonTrovataException(String messaggio) {
        super(messaggio);
    }
}
