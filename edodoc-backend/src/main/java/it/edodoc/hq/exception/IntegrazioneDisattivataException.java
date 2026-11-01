package it.edodoc.hq.exception;

/** 409: integrazione spenta o non configurata. Non è un guasto: il frontend mostra il testo così com'è. */
public class IntegrazioneDisattivataException extends RuntimeException {
    public IntegrazioneDisattivataException(String messaggio) {
        super(messaggio);
    }
}
