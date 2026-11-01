package it.edodoc.hq.dto;

import java.util.List;
import java.util.Map;

/**
 * DTO della pagina Calendario (/api/agenda): il Google Calendar del dottore, letto e scritto in diretta.
 * Id di calendari ed eventi sono quelli di Google. Gli orari sono ISO-8601 con offset ("2026-10-25T09:30:00+01:00");
 * gli eventi di tutto il giorno hanno solo la data ("2026-10-25") e la fine esclusa, come in Google.
 */
public final class AgendaDto {

    private AgendaDto() {
    }

    /** Un calendario della lista del dottore (il suo principale, quelli condivisi, le festività…). */
    public record Calendario(
            String id,
            String nome,
            String descrizione,
            String coloreSfondo,
            String coloreTesto,
            /** owner | writer | reader | freeBusyReader */
            String accesso,
            boolean principale,
            boolean selezionato,
            String fusoOrario,
            List<Promemoria> promemoriaPredefiniti) {
    }

    public record Promemoria(
            /** popup | email */
            String metodo,
            int minuti) {
    }

    /** Colori evento di Google (colorId "1"…"11"). */
    public record Colore(String sfondo, String testo) {
    }

    public record Stato(
            String email,
            String nome,
            String fusoOrario,
            List<Calendario> calendari,
            Map<String, Colore> coloriEventi,
            /** Calendario finto per provare la pagina finché Google non è collegato. */
            boolean demo) {
    }

    public record Persona(
            String email,
            String nome,
            /** needsAction | declined | tentative | accepted */
            String risposta,
            boolean organizzatore,
            boolean io,
            boolean facoltativo,
            boolean risorsa,
            String commento,
            /** Paziente con questa email: dal calendario si apre la sua scheda. */
            Long pazienteId) {
    }

    public record Allegato(String titolo, String url, String icona, String mimeType) {
    }

    public record Evento(
            String id,
            String calendarioId,
            String titolo,
            String descrizione,
            String luogo,
            String inizio,
            String fine,
            boolean tuttoIlGiorno,
            String colorId,
            /** confirmed | tentative | cancelled */
            String stato,
            /** opaque (occupato) | transparent (libero) */
            String trasparenza,
            /** default | public | private | confidential */
            String visibilita,
            /** default | outOfOffice | focusTime | workingLocation | birthday | fromGmail */
            String tipo,
            /** Id della serie se è un'occorrenza di un evento ricorrente. */
            String serieId,
            /** Regole RRULE/EXDATE: solo sull'evento principale di una serie (dettaglio). */
            List<String> ricorrenza,
            Persona organizzatore,
            List<Persona> partecipanti,
            String miaRisposta,
            String meet,
            String htmlLink,
            boolean promemoriaPredefiniti,
            List<Promemoria> promemoria,
            List<Allegato> allegati,
            boolean modificabile,
            boolean ospitiPossonoModificare,
            boolean ospitiPossonoInvitare,
            boolean ospitiVedonoAltri,
            Long aggiornato,
            /** Visita del gestionale pubblicata con questo evento, se c'è. */
            Long visitaId,
            Long pazienteId,
            String pazienteNome) {
    }

    public record Eventi(List<Evento> eventi, List<String> calendariNonLetti) {
    }

    /** Novità dopo l'istante indicato, per calendario: il client ricarica solo se qualcosa è cambiato. */
    public record Novita(boolean cambiato, long controllatoIl, List<String> calendariCambiati) {
    }

    public record PartecipanteRequest(String email, Boolean facoltativo) {
    }

    /**
     * Creazione o modifica (patch: i campi null restano come sono; per svuotare un testo si manda "" e per
     * svuotare una lista una lista vuota).
     */
    public record EventoRequest(
            String titolo,
            String descrizione,
            String luogo,
            String inizio,
            String fine,
            Boolean tuttoIlGiorno,
            String fusoOrario,
            String colorId,
            List<PartecipanteRequest> partecipanti,
            Boolean conMeet,
            Boolean promemoriaPredefiniti,
            List<Promemoria> promemoria,
            List<String> ricorrenza,
            String trasparenza,
            String visibilita,
            String tipo,
            Boolean ospitiPossonoModificare,
            Boolean ospitiPossonoInvitare,
            Boolean ospitiVedonoAltri) {
    }

    public record SpostaRequest(String calendarioDestinazione) {
    }

    public record RispostaRequest(String risposta, String commento) {
    }

    public record DisponibilitaRequest(List<String> email, String da, String a) {
    }

    public record Intervallo(String inizio, String fine) {
    }

    public record Disponibilita(String email, List<Intervallo> occupato, String errore) {
    }

    /** Invitato suggerito: i pazienti con un'email. */
    public record Contatto(String email, String nome, String ruolo, Long pazienteId) {
    }
}
