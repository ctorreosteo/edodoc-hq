package it.edodoc.hq.dto;

import it.edodoc.hq.models.Task;
import it.edodoc.hq.models.TaskTipo;
import jakarta.validation.constraints.NotBlank;

import java.time.LocalDate;
import java.time.LocalDateTime;

public final class TaskDto {

    private TaskDto() {
    }

    /** Solo il tipo è obbligatorio: titolo, scadenza e priorità arrivano dal preset se assenti. */
    public record Salva(
            @NotBlank(message = "Scegli il tipo di task") String tipoCodice,
            String titolo,
            String descrizione,
            LocalDate scadenza,
            Task.Priorita priorita,
            Long pazienteId) {
    }

    public record Tipo(Long id, String codice, String etichetta, String titoloDefault, int giorniDefault,
                       Task.Priorita priorita, String icona) {
        public static Tipo da(TaskTipo t) {
            return new Tipo(t.getId(), t.getCodice(), t.getEtichetta(), t.getTitoloDefault(), t.getGiorniDefault(),
                    t.getPriorita(), t.getIcona());
        }
    }

    public record Riga(
            Long id, String titolo, String descrizione, Tipo tipo, Task.Stato stato, Task.Priorita priorita,
            LocalDate scadenza, Long pazienteId, String pazienteNome, boolean automatico,
            LocalDateTime completatoIl, boolean inRitardo) {

        public static Riga da(Task t, LocalDate oggi) {
            boolean ritardo = t.getStato() == Task.Stato.DA_FARE && t.getScadenza() != null && t.getScadenza().isBefore(oggi);
            return new Riga(t.getId(), t.getTitolo(), t.getDescrizione(), Tipo.da(t.getTipo()), t.getStato(),
                    t.getPriorita(), t.getScadenza(), t.getPaziente() != null ? t.getPaziente().getId() : null,
                    t.getPaziente() != null ? t.getPaziente().getNomeCompleto() : null,
                    t.getChiaveAutomatica() != null, t.getCompletatoIl(), ritardo);
        }
    }
}
