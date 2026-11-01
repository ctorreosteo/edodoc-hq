package it.edodoc.hq.dto;

import it.edodoc.hq.models.Task;
import it.edodoc.hq.models.TaskCartella;
import it.edodoc.hq.models.TaskLista;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public final class TaskDto {

    private static final String COLORE = "^#[0-9a-fA-F]{6}$";

    private TaskDto() {
    }

    public record Salva(
            @NotNull(message = "Scegli la lista") Long listaId,
            @NotBlank(message = "Scrivi il titolo del task") String titolo,
            String descrizione,
            LocalDate scadenza,
            Task.Priorita priorita,
            Long pazienteId) {
    }

    public record Cartella(Long id, String nome, Long parentId, String colore, int ordine, boolean archiviata) {
        public static Cartella da(TaskCartella c) {
            return new Cartella(c.getId(), c.getNome(), c.getParent() != null ? c.getParent().getId() : null,
                    c.getColore(), c.getOrdine(), c.getArchiviata());
        }
    }

    /** codice: solo le liste di sistema, dove scrivono i job; non si archiviano e non si eliminano. */
    public record Lista(Long id, String nome, Long cartellaId, String codice, String colore, String icona, int ordine,
                        boolean archiviata) {
        public static Lista da(TaskLista l) {
            return new Lista(l.getId(), l.getNome(), l.getCartella() != null ? l.getCartella().getId() : null,
                    l.getCodice(), l.getColore(), l.getIcona(), l.getOrdine(), l.getArchiviata());
        }
    }

    public record Struttura(List<Cartella> cartelle, List<Lista> liste) {
    }

    public record SalvaCartella(
            @NotBlank(message = "Scrivi il nome") @Size(max = 100) String nome,
            Long parentId,
            @Pattern(regexp = COLORE) String colore) {
    }

    public record SalvaLista(
            @NotBlank(message = "Scrivi il nome") @Size(max = 100) String nome,
            Long cartellaId,
            @Pattern(regexp = COLORE) String colore,
            @Size(max = 40) String icona) {
    }

    /** Si applicano solo i campi presenti. */
    public record ModificaStruttura(
            @Pattern(regexp = ".*\\S.*", message = "Scrivi il nome") @Size(max = 100) String nome,
            @Pattern(regexp = COLORE) String colore,
            @Size(max = 40) String icona,
            Boolean archiviata) {
    }

    /** contenitoreId null = radice; ordine null = in coda. */
    public record Sposta(Long contenitoreId, Integer ordine) {
    }

    public record Riga(
            Long id, String titolo, String descrizione, Lista lista, Task.Stato stato, Task.Priorita priorita,
            LocalDate scadenza, Long pazienteId, String pazienteNome, boolean automatico,
            LocalDateTime completatoIl, boolean inRitardo) {

        public static Riga da(Task t, LocalDate oggi) {
            boolean ritardo = t.getStato() == Task.Stato.DA_FARE && t.getScadenza() != null && t.getScadenza().isBefore(oggi);
            return new Riga(t.getId(), t.getTitolo(), t.getDescrizione(), Lista.da(t.getLista()), t.getStato(),
                    t.getPriorita(), t.getScadenza(), t.getPaziente() != null ? t.getPaziente().getId() : null,
                    t.getPaziente() != null ? t.getPaziente().getNomeCompleto() : null,
                    t.getChiaveAutomatica() != null, t.getCompletatoIl(), ritardo);
        }
    }
}
