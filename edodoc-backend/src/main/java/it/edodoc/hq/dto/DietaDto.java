package it.edodoc.hq.dto;

import it.edodoc.hq.models.Dieta;
import it.edodoc.hq.models.DietaVersione;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public final class DietaDto {

    private DietaDto() {
    }

    /**
     * Tutto il piano in un documento solo, salvato com'è: l'editor lo riscrive intero a ogni salvataggio.
     * Gli id delle voci li genera il gestionale e servono solo all'editor.
     */
    public record Contenuto(
            String obiettivo,
            Integer kcal,
            Integer proteine,
            Integer carboidrati,
            Integer grassi,
            BigDecimal acquaLitri,
            String introduzione,
            List<Giornata> giornate,
            List<Consiglio> consigli,
            List<String> liberi,
            List<String> limitare,
            List<Integratore> integrazione,
            Boolean listaSpesa) {

        public Contenuto {
            giornate = giornate == null ? List.of() : giornate;
            consigli = consigli == null ? List.of() : consigli;
            liberi = liberi == null ? List.of() : liberi;
            limitare = limitare == null ? List.of() : limitare;
            integrazione = integrazione == null ? List.of() : integrazione;
            listaSpesa = listaSpesa == null || listaSpesa;
        }

        public static Contenuto vuoto() {
            List<Pasto> pasti = List.of(
                    Pasto.vuoto("colazione", "Colazione", "07:30"),
                    Pasto.vuoto("spuntino", "Spuntino", "10:30"),
                    Pasto.vuoto("pranzo", "Pranzo", "13:00"),
                    Pasto.vuoto("merenda", "Merenda", "16:30"),
                    Pasto.vuoto("cena", "Cena", "20:00"));
            return new Contenuto(null, null, null, null, null, null, null,
                    List.of(new Giornata("giornata-tipo", "Giornata tipo", null, pasti)),
                    List.of(), List.of(), List.of(), List.of(), true);
        }
    }

    public record Giornata(String id, String nome, String nota, List<Pasto> pasti) {
        public Giornata {
            pasti = pasti == null ? List.of() : pasti;
        }
    }

    /** Un pasto ha una o più alternative: il paziente ne sceglie una. */
    public record Pasto(String id, String nome, String orario, String nota, List<Opzione> opzioni) {
        public Pasto {
            opzioni = opzioni == null ? List.of() : opzioni;
        }

        static Pasto vuoto(String id, String nome, String orario) {
            // una riga vuota da cui iniziare a scrivere; il PDF salta gli alimenti senza nome
            return new Pasto(id, nome, orario, null, List.of(new Opzione(id + "-1", null,
                    List.of(new Alimento(id + "-1-1", "", null, null)), null)));
        }
    }

    public record Opzione(String id, String nome, List<Alimento> alimenti, String nota) {
        public Opzione {
            alimenti = alimenti == null ? List.of() : alimenti;
        }
    }

    /** quantita è testo libero: "80 g", "1 vasetto", "a piacere". */
    public record Alimento(String id, String nome, String quantita, String nota) {
    }

    public record Consiglio(String id, String titolo, String testo) {
    }

    public record Integratore(String id, String nome, String dose, String quando) {
    }

    /** pazienteId null: modello. daDietaId: copia contenuto e titolo da un'altra dieta o da un modello. */
    public record Crea(Long pazienteId, @Size(max = 255, message = "Titolo troppo lungo") String titolo, Long daDietaId) {
    }

    public record Salva(
            @NotBlank(message = "Il titolo è obbligatorio") @Size(max = 255, message = "Titolo troppo lungo") String titolo,
            LocalDate dataInizio,
            @NotNull(message = "Contenuto mancante") @Valid Contenuto contenuto) {
    }

    public record Riga(Long id, Long pazienteId, String pazienteNome, String titolo, String obiettivo, LocalDate dataInizio,
                       Integer kcal, int giornate, int pasti, int versioni, LocalDateTime consegnataIl,
                       LocalDateTime createdAt, LocalDateTime updatedAt) {
        public static Riga da(Dieta d, int versioni) {
            Contenuto c = d.getContenuto();
            return new Riga(d.getId(), d.getPaziente() == null ? null : d.getPaziente().getId(),
                    d.getPaziente() == null ? null : d.getPaziente().getNomeCompleto(), d.getTitolo(), c.obiettivo(),
                    d.getDataInizio(), c.kcal(), c.giornate().size(),
                    c.giornate().stream().mapToInt(g -> g.pasti().size()).sum(), versioni, d.getConsegnataIl(),
                    d.getCreatedAt(), d.getUpdatedAt());
        }
    }

    public record Dettaglio(Long id, Long pazienteId, String pazienteNome, String titolo, LocalDate dataInizio,
                            LocalDateTime consegnataIl, LocalDateTime createdAt, LocalDateTime updatedAt, Contenuto contenuto,
                            List<Versione> versioni) {
        public static Dettaglio da(Dieta d, List<DietaVersione> versioni) {
            return new Dettaglio(d.getId(), d.getPaziente() == null ? null : d.getPaziente().getId(),
                    d.getPaziente() == null ? null : d.getPaziente().getNomeCompleto(), d.getTitolo(), d.getDataInizio(),
                    d.getConsegnataIl(), d.getCreatedAt(), d.getUpdatedAt(), d.getContenuto(),
                    Versione.storico(versioni));
        }
    }

    /**
     * Una riga dello storico: quando è stata salvata, da dove viene (nota) e cosa è cambiato
     * rispetto alla versione prima. La creazione non ha modifiche.
     */
    public record Versione(Integer numero, String titolo, Integer kcal, int pasti, LocalDateTime createdAt,
                           String nota, List<String> modifiche) {

        /** versioni dalla più recente: ognuna si confronta con quella che la segue nell'elenco. */
        public static List<Versione> storico(List<DietaVersione> versioni) {
            List<Versione> righe = new java.util.ArrayList<>(versioni.size());
            for (int i = 0; i < versioni.size(); i++) {
                DietaVersione v = versioni.get(i);
                List<String> modifiche = i + 1 < versioni.size()
                        ? it.edodoc.hq.services.DietaDifferenze.tra(versioni.get(i + 1), v) : List.of();
                righe.add(new Versione(v.getNumero(), v.getTitolo(), v.getContenuto().kcal(),
                        v.getContenuto().giornate().stream().mapToInt(g -> g.pasti().size()).sum(), v.getCreatedAt(),
                        v.getNota(), modifiche));
            }
            return righe;
        }
    }
}
