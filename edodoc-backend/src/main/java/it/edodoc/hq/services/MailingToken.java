package it.edodoc.hq.services;

import java.security.SecureRandom;

/** Token pubblici base62 dell'Email Marketing: contatti 32, invii 24, immagini 32 caratteri. */
public final class MailingToken {

    public static final int CONTATTO = 32;
    public static final int INVIO = 24;
    public static final int IMMAGINE = 32;

    private static final char[] ALFABETO =
            "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".toCharArray();
    private static final SecureRandom RANDOM = new SecureRandom();

    private MailingToken() {
    }

    public static String nuovo(int lunghezza) {
        if (lunghezza <= 0) {
            throw new IllegalArgumentException("Lunghezza del token non valida: " + lunghezza);
        }
        char[] token = new char[lunghezza];
        for (int i = 0; i < lunghezza; i++) {
            token[i] = ALFABETO[RANDOM.nextInt(ALFABETO.length)];
        }
        return new String(token);
    }
}
