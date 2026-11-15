package it.edodoc.hq.services;

import java.util.Map;

/**
 * Evento applicativo dell'Email Marketing nato dal gestionale (o dalle azioni sui contatti), pubblicato con
 * {@code ApplicationEventPublisher}: lo ascoltano le automazioni (trigger).
 *
 * <p>{@code tipo}: {@value #NUOVO_LEAD}, {@value #CONOSCITIVA_PRENOTATA}, {@value #CONOSCITIVA_SVOLTA},
 * {@value #ESITO_CONOSCITIVA}, {@value #PRIMA_VISITA_PRENOTATA}, {@value #PRIMA_VISITA_EFFETTUATA},
 * {@value #VISITA_EFFETTUATA}, {@value #VISITA_PRENOTATA}, {@value #ACQUISTO}, {@value #TAG_AGGIUNTO},
 * {@value #ISCRIZIONE}, {@value #DISISCRITTO}.
 * {@code parametri}: fonte (Paziente.Fonte), esito (Prenotazione.Esito), tipoPercorso (Percorso.Tipo), tagId,
 * numeroVisite, visitaId, percorsoId, prenotazioneId, importo.
 */
public record MailingEventoGestionale(String tipo, Long contattoId, Long pazienteId, Map<String, Object> parametri) {

    public static final String NUOVO_LEAD = "NUOVO_LEAD";
    public static final String CONOSCITIVA_PRENOTATA = "CONOSCITIVA_PRENOTATA";
    public static final String CONOSCITIVA_SVOLTA = "CONOSCITIVA_SVOLTA";
    public static final String ESITO_CONOSCITIVA = "ESITO_CONOSCITIVA";
    public static final String PRIMA_VISITA_PRENOTATA = "PRIMA_VISITA_PRENOTATA";
    public static final String PRIMA_VISITA_EFFETTUATA = "PRIMA_VISITA_EFFETTUATA";
    public static final String VISITA_EFFETTUATA = "VISITA_EFFETTUATA";
    public static final String VISITA_PRENOTATA = "VISITA_PRENOTATA";
    public static final String ACQUISTO = "ACQUISTO";
    public static final String TAG_AGGIUNTO = "TAG_AGGIUNTO";
    public static final String ISCRIZIONE = "ISCRIZIONE";
    public static final String DISISCRITTO = "DISISCRITTO";

    public MailingEventoGestionale {
        // I valori nulli si scartano: "parametro assente" e "parametro nullo" sono la stessa cosa per i trigger.
        java.util.Map<String, Object> pulita = new java.util.LinkedHashMap<>();
        if (parametri != null) {
            parametri.forEach((k, v) -> {
                if (k != null && v != null) {
                    pulita.put(k, v);
                }
            });
        }
        parametri = java.util.Collections.unmodifiableMap(pulita);
    }
}
