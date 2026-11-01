package it.edodoc.hq.exception;

/** 409: operazione valida ma impossibile nello stato attuale (es. fattura già emessa). */
public class ConflittoException extends RuntimeException {
    public ConflittoException(String messaggio) {
        super(messaggio);
    }
}
