package it.edodoc.hq.dto;

import jakarta.validation.constraints.NotBlank;

import java.util.List;

public final class ImpostazioniDto {

    private ImpostazioniDto() {
    }

    public record Voce(String chiave, String valore, String descrizione) {
    }

    public record Aggiorna(@NotBlank(message = "Chiave obbligatoria") String chiave, String valore) {
    }

    public record Integrazione(String codice, String nome, boolean attiva, boolean configurata, String nota) {
    }

    public record Panoramica(List<Voce> voci, List<Integrazione> integrazioni) {
    }
}
