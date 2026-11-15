package it.edodoc.hq.dto;

import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.models.Percorso;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class ObiettiviDto {

    private ObiettiviDto() {
    }

    /**
     * Obiettivo annuale: clienti unici che comprano almeno un percorso nell'anno.
     * {@code conquiste} ha una riga per cliente (il suo primo percorso dell'anno), in ordine di data;
     * {@code annoPrecedente} è lo stesso conteggio per l'anno prima, come termine di paragone.
     */
    public record Obiettivo(int anno, int target, LocalDate oggi,
                            List<Conquista> conquiste, List<Conquista> annoPrecedente,
                            long lead, long listaAttesa) {
    }

    public record Conquista(Long pazienteId, String nome, LocalDate data, Percorso.Tipo tipo,
                            Paziente.Fonte fonte, BigDecimal importo, int percorsi) {
    }
}
