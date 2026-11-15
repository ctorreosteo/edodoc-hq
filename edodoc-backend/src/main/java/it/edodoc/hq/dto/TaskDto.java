package it.edodoc.hq.dto;

import it.edodoc.hq.models.Task;
import it.edodoc.hq.models.TaskCartella;
import it.edodoc.hq.models.TaskEvento;
import it.edodoc.hq.models.TaskLista;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Set;

/**
 * DTO dei task (/api/task). Stesse forme di Mobilitas HQ senza la parte multiutente (permessi, assegnatari, follower,
 * letture, notifiche). {@link RigaLegacy} e {@link Salva} restano per l'app e la dashboard, che usano gli endpoint di prima.
 */
public final class TaskDto {

    private TaskDto() {
    }

    // ---------- Struttura ----------

    /** codice: solo le liste di sistema, dove scrivono i job; non si archiviano e non si eliminano. aperti: task aperti. */
    public record Lista(Long id, String codice, String nome, String descrizione, String colore, String icona, int ordine,
                        boolean archiviata, Long cartellaId, long aperti) {
        public static Lista da(TaskLista l, long aperti) {
            return new Lista(l.getId(), l.getCodice(), l.getNome(), l.getDescrizione(), l.getColore(), l.getIcona(),
                    l.getOrdine(), l.getArchiviata(), l.getCartella() != null ? l.getCartella().getId() : null, aperti);
        }
    }

    public record Cartella(Long id, Long parentId, String nome, String descrizione, String colore, String icona, int ordine,
                           boolean archiviata) {
        public static Cartella da(TaskCartella c) {
            return new Cartella(c.getId(), c.getParent() != null ? c.getParent().getId() : null, c.getNome(),
                    c.getDescrizione(), c.getColore(), c.getIcona(), c.getOrdine(), c.getArchiviata());
        }
    }

    public record Struttura(List<Cartella> cartelle, List<Lista> liste) {
    }

    public record Etichetta(Long id, String nome, String colore) {
    }

    public record Persona(Long id, String nome, String cognome, String iniziali) {
    }

    /** Utente assegnabile ai task (gli ADMIN attivi). */
    public record Operatore(Long id, String nome, String cognome, String iniziali, List<String> ruoli) {
    }

    public record Config(List<Cartella> cartelle, List<Lista> liste, List<Etichetta> etichette, List<Operatore> operatori) {
    }

    /** Creazione o modifica di una lista: in modifica cartellaId si ignora (per spostarla c'è /sposta). */
    public record ListaRequest(String nome, String descrizione, String colore, String icona, Integer ordine,
                               Boolean archiviata, Long cartellaId) {
    }

    /** Come ListaRequest, per le cartelle (parentId = cartella che la contiene). */
    public record CartellaRequest(String nome, String descrizione, String colore, String icona, Integer ordine,
                                  Boolean archiviata, Long parentId) {
    }

    public record ListaEliminata(Long id, String nome, int taskEliminati) {
    }

    /** Sposta una lista o una cartella: destinazione = cartella (null = radice), ordine facoltativo. */
    public record SpostaRequest(Long destinazioneId, Integer ordine) {
    }

    /** Forma di prima di /posizione: contenitoreId null = radice, ordine null = in coda. */
    public record Sposta(Long contenitoreId, Integer ordine) {
    }

    public record EtichettaRequest(String nome, String colore) {
    }

    // ---------- Colonne della vista lista ----------

    /** Una colonna: {@code id} del catalogo del gestionale, {@code larghezza} in px (null = la sua). */
    public record Colonna(String id, Integer larghezza) {
    }

    /** contesto: "predefinita" o "lista:<id>". */
    public record DisposizioneColonne(String contesto, List<Colonna> colonne, LocalDateTime aggiornatoIl) {
    }

    public record SalvaColonneRequest(List<Colonna> colonne) {
    }

    // ---------- Task ----------

    public record Paziente(Long id, String nome, String cognome) {
    }

    /** Riga di elenco / card kanban / evento calendario / barra del Gantt. */
    public record Riga(
            Long id,
            Long listaId,
            String titolo,
            Task.Stato stato,
            Task.Priorita priorita,
            LocalDate scadenza,
            LocalTime scadenzaOra,
            Integer stimaMinuti,
            LocalDate dataInizio,
            LocalTime inizioOra,
            List<Persona> assegnatari,
            List<Etichetta> etichette,
            Paziente paziente,
            /** Creato da un job (rinnovi, esami, fisco...) */
            boolean automatico,
            double ordine,
            /** null per i task dei job */
            Persona creatoDa,
            LocalDateTime creatoIl,
            LocalDateTime aggiornatoIl,
            LocalDateTime completatoIl,
            int commenti,
            int allegati,
            int checklistTotale,
            int checklistCompletati,
            Long parentId,
            String parentTitolo,
            int sottotaskTotale,
            int sottotaskCompletati,
            /** Né completati né annullati: completando il principale si chiede se chiudere anche questi */
            int sottotaskAperti,
            /** Task da cui dipende ancora aperti */
            int inAttesaDi
    ) {
    }

    public record PaginaChiusi(List<Riga> righe, long totale, int pagina, boolean altre) {
    }

    public record ChecklistVoce(Long id, String testo, boolean completato, int ordine, LocalDateTime completatoIl) {
    }

    public record Allegato(Long id, String nomeFile, String contentType, String estensione, long dimensione,
                           Long commentoId, LocalDateTime creatoIl) {
    }

    public record Evento(Long id, TaskEvento.Tipo tipo, String testo, String valorePrecedente, String valoreNuovo,
                         LocalDateTime creatoIl, LocalDateTime modificatoIl, List<Allegato> allegati) {
    }

    public record DipendenzaVoce(Long id, String titolo, Task.Stato stato, LocalDate dataInizio, LocalDate scadenza,
                                 Long listaId) {
    }

    public record Dipendenze(List<DipendenzaVoce> attende, List<DipendenzaVoce> blocca) {
    }

    public record Dettaglio(
            Riga task,
            String descrizione,
            List<ChecklistVoce> checklist,
            List<Allegato> allegati,
            List<Evento> eventi,
            List<Riga> sottotask,
            Dipendenze dipendenze
    ) {
    }

    /** {@code successoreId} parte quando {@code predecessoreId} è finito. */
    public record Dipendenza(Long predecessoreId, Long successoreId) {
    }

    public record DipendenzaRequest(Long predecessoreId) {
    }

    public record DipendenzeRequest(List<Long> ids) {
    }

    public record PianificaRequest(List<PianificaVoce> voci) {
    }

    public record PianificaVoce(Long id, LocalDate dataInizio, LocalDate scadenza) {
    }

    /** Contatori dei task aperti. prossimi7Giorni = da domani a +7. */
    public record Riepilogo(long inRitardo, long oggi, long prossimi7Giorni, long senzaScadenza) {
    }

    public record CreaRequest(
            Long listaId,
            String titolo,
            String descrizione,
            Task.Stato stato,
            Task.Priorita priorita,
            LocalDate scadenza,
            LocalTime scadenzaOra,
            Integer stimaMinuti,
            LocalDate dataInizio,
            LocalTime inizioOra,
            List<Long> assegnatariIds,
            List<Long> etichettaIds,
            Long pazienteId,
            List<String> checklist,
            /** Task principale: il nuovo task è un suo sottotask, nella stessa lista */
            Long parentId
    ) {
    }

    /**
     * Modifica parziale: si applicano solo i campi elencati in {@code campi} (listaId, titolo, descrizione, stato,
     * priorita, scadenza, scadenzaOra, stimaMinuti, dataInizio, inizioOra, assegnatariIds, etichettaIds, pazienteId, ordine).
     * Un campo elencato e null viene svuotato.
     */
    public record AggiornaRequest(
            Set<String> campi,
            Long listaId,
            String titolo,
            String descrizione,
            Task.Stato stato,
            Task.Priorita priorita,
            LocalDate scadenza,
            LocalTime scadenzaOra,
            Integer stimaMinuti,
            LocalDate dataInizio,
            LocalTime inizioOra,
            List<Long> assegnatariIds,
            List<Long> etichettaIds,
            Long pazienteId,
            Double ordine,
            /** Con stato COMPLETATO su un task principale: completa anche i suoi sottotask ancora aperti. */
            Boolean completaSottotask
    ) {
        public static AggiornaRequest di(Set<String> campi) {
            return new AggiornaRequest(campi, null, null, null, null, null, null, null, null, null, null, null, null, null,
                    null, null);
        }
    }

    /** Stessa modifica su più task (selezione multipla). {@code elimina=true} li cancella. */
    public record BulkRequest(List<Long> ids, AggiornaRequest modifica, Boolean elimina) {
    }

    public record BulkEsito(int aggiornati, int saltati) {
    }

    /** {@code allegati}: quanti file seguono il commento; se ce ne sono il testo può mancare. */
    public record CommentoRequest(String testo, Integer allegati) {
    }

    public record ChecklistRequest(String testo, Boolean completato, Integer ordine) {
    }

    // ---------- Forma di prima (app iOS/Android, dashboard, scheda paziente) ----------

    /** priorita: ALTA, MEDIA o BASSA (anche URGENTE e NORMALE, che diventano ALTA e MEDIA); null = MEDIA. */
    public record Salva(
            @NotNull(message = "Scegli la lista") Long listaId,
            @NotBlank(message = "Scrivi il titolo del task") String titolo,
            String descrizione,
            LocalDate scadenza,
            String priorita,
            Long pazienteId) {
    }

    /** stato: DA_FARE o FATTO (completato o annullato); priorita: ALTA, MEDIA o BASSA. */
    public record RigaLegacy(
            Long id, String titolo, String descrizione, Lista lista, String stato, String priorita,
            LocalDate scadenza, Long pazienteId, String pazienteNome, boolean automatico,
            LocalDateTime completatoIl, boolean inRitardo) {

        public static RigaLegacy da(Task t, LocalDate oggi) {
            boolean chiuso = t.getStato().isChiuso();
            boolean ritardo = !chiuso && t.getScadenza() != null && t.getScadenza().isBefore(oggi);
            String priorita = t.getPriorita() == null ? "MEDIA" : switch (t.getPriorita()) {
                case URGENTE, ALTA -> "ALTA";
                case NORMALE -> "MEDIA";
                case BASSA -> "BASSA";
            };
            return new RigaLegacy(t.getId(), t.getTitolo(), t.getDescrizione(), Lista.da(t.getLista(), 0),
                    chiuso ? "FATTO" : "DA_FARE", priorita, t.getScadenza(),
                    t.getPaziente() != null ? t.getPaziente().getId() : null,
                    t.getPaziente() != null ? t.getPaziente().getNomeCompleto() : null,
                    t.getChiaveAutomatica() != null, t.getCompletatoIl(), ritardo);
        }
    }
}
