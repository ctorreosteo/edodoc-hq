package it.edodoc.hq.services;

/**
 * Errore di un canale di invio dell'Email Marketing. Le sottoclassi dicono al worker cosa fare:
 * <ul>
 *   <li>{@link Permanente}: il messaggio non partirà mai così com'è. Se {@code perDestinatario} è l'indirizzo a essere
 *       rifiutato (il contatto diventa RIMBALZATO), altrimenti il singolo invio va in ERRORE.</li>
 *   <li>{@link Temporanea}: rete, quota, 429/5xx di Google: si ritenta con attesa crescente.</li>
 *   <li>{@link NonConfigurato}: delega, scope, password o relay mancanti. Il messaggio inizia con
 *       {@value #NON_CONFIGURATO}: le campagne del mittente vanno in pausa e la pagina mostra la guida.</li>
 * </ul>
 */
public abstract sealed class MailingCanaleException extends Exception
        permits MailingCanaleException.Permanente, MailingCanaleException.Temporanea,
        MailingCanaleException.NonConfigurato {

    public static final String NON_CONFIGURATO = "MAILING_MITTENTE_NON_CONFIGURATO";

    protected MailingCanaleException(String messaggio, Throwable causa) {
        super(messaggio, causa);
    }

    public static final class Permanente extends MailingCanaleException {
        private final boolean perDestinatario;

        public Permanente(String messaggio, boolean perDestinatario, Throwable causa) {
            super(messaggio, causa);
            this.perDestinatario = perDestinatario;
        }

        public boolean isPerDestinatario() {
            return perDestinatario;
        }
    }

    public static final class Temporanea extends MailingCanaleException {
        public Temporanea(String messaggio, Throwable causa) {
            super(messaggio, causa);
        }
    }

    public static final class NonConfigurato extends MailingCanaleException {
        public NonConfigurato(String spiegazione, Throwable causa) {
            super(spiegazione != null && spiegazione.startsWith(NON_CONFIGURATO)
                    ? spiegazione : NON_CONFIGURATO + ": " + spiegazione, causa);
        }
    }
}
