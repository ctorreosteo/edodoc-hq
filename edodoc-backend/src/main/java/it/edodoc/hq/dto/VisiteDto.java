package it.edodoc.hq.dto;

import it.edodoc.hq.models.Percorso;
import it.edodoc.hq.models.Visita;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDateTime;

public final class VisiteDto {

    private VisiteDto() {
    }

    public record Salva(
            @NotNull(message = "Scegli il paziente") Long pazienteId,
            @NotNull(message = "Scegli il tipo di visita") Visita.Tipo tipo,
            @NotNull(message = "Scegli la modalità") Visita.Modalita modalita,
            @NotNull(message = "Indica data e ora") LocalDateTime inizio,
            Integer durataMinuti,
            Boolean conMeet,
            Boolean invitaPaziente,
            String note) {
    }

    public record CambiaStato(@NotNull(message = "Stato obbligatorio") Visita.Stato stato) {
    }

    public record Riga(
            Long id, Long pazienteId, String pazienteNome, String pazienteEmail, String pazienteCellulare,
            Long percorsoId, Percorso.Tipo percorsoTipo, Integer numeroVisita, Integer visiteTotali,
            Visita.Tipo tipo, Visita.Modalita modalita, Visita.Stato stato,
            LocalDateTime inizio, LocalDateTime fine, boolean conMeet, String meetUrl, boolean invitaPaziente,
            String note, String titoloCalendario, Visita.GoogleSync googleSyncStato, String googleSyncErrore) {

        public static Riga da(Visita v, String titoloCalendario) {
            return new Riga(v.getId(), v.getPaziente().getId(), v.getPaziente().getNomeCompleto(),
                    v.getPaziente().getEmail(), v.getPaziente().getCellulare(),
                    v.getPercorso() != null ? v.getPercorso().getId() : null,
                    v.getPercorso() != null ? v.getPercorso().getTipo() : null,
                    v.getNumeroVisita(),
                    v.getPercorso() != null ? v.getPercorso().getVisiteTotali() : null,
                    v.getTipo(), v.getModalita(), v.getStato(), v.getInizio(), v.getFine(),
                    Boolean.TRUE.equals(v.getConMeet()), v.getMeetUrl(), Boolean.TRUE.equals(v.getInvitaPaziente()),
                    v.getNote(), titoloCalendario, v.getGoogleSyncStato(), v.getGoogleSyncErrore());
        }
    }

    /** Vista del paziente: niente note del dottore né dati di sincronizzazione Google. */
    public record AppVisita(Long id, Integer numeroVisita, Integer visiteTotali, Visita.Tipo tipo, Visita.Modalita modalita,
                            Visita.Stato stato, LocalDateTime inizio, LocalDateTime fine, String meetUrl) {
        public static AppVisita da(Visita v) {
            return new AppVisita(v.getId(), v.getNumeroVisita(),
                    v.getPercorso() != null ? v.getPercorso().getVisiteTotali() : null,
                    v.getTipo(), v.getModalita(), v.getStato(), v.getInizio(), v.getFine(), v.getMeetUrl());
        }
    }
}
