package it.edodoc.hq.services;

import it.edodoc.hq.dto.DietaDto;
import it.edodoc.hq.models.DietaVersione;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class DietaDifferenzeTest {

    private static DietaVersione versione(String titolo, DietaDto.Contenuto c) {
        DietaVersione v = new DietaVersione();
        v.setTitolo(titolo);
        v.setContenuto(c);
        return v;
    }

    private static DietaDto.Contenuto piano(Integer kcal, List<String> liberi, DietaDto.Pasto... pasti) {
        return new DietaDto.Contenuto(null, kcal, null, null, null, null, null,
                List.of(new DietaDto.Giornata("g", "Giornata tipo", null, List.of(pasti))), null, liberi, null, null, true);
    }

    private static DietaDto.Pasto pasto(String nome, String... alimentiEQuantita) {
        List<DietaDto.Alimento> alimenti = new java.util.ArrayList<>();
        for (int i = 0; i < alimentiEQuantita.length; i += 2) {
            alimenti.add(new DietaDto.Alimento("a" + i, alimentiEQuantita[i], alimentiEQuantita[i + 1], null));
        }
        return new DietaDto.Pasto(nome, nome, null, null, List.of(new DietaDto.Opzione("o", null, alimenti, null)));
    }

    @Test
    void raccontaEnergiaAlimentiAggiuntiTogliQuantitaEPasti() {
        DietaVersione prima = versione("Fase 1", piano(1800, List.of("Caffè"),
                pasto("Pranzo", "Riso basmati", "70 g", "Pasta", "80 g"),
                pasto("Cena", "Merluzzo", "150 g")));
        DietaVersione dopo = versione("Fase 1", piano(1650, List.of("Caffè", "Tè verde"),
                pasto("Pranzo", "Riso basmati", "80 g", "Zucchine", "200 g"),
                pasto("Cena", "Merluzzo", "150 g"),
                pasto("Spuntino", "Mandorle", "15 g")));

        assertThat(DietaDifferenze.tra(prima, dopo)).containsExactly(
                "Energia 1.800 → 1.650 kcal",
                "Riso basmati 70 → 80 g · Pranzo",
                "+ Zucchine 200 g · Pranzo",
                "− Pasta · Pranzo",
                "+ Pasto «Spuntino»",
                "Liberi: + Tè verde");
    }

    @Test
    void senzaDifferenzeVisibiliParlaDiRitocchi() {
        DietaVersione v = versione("Fase 1", piano(1800, List.of(), pasto("Pranzo", "Riso", "70 g")));
        assertThat(DietaDifferenze.tra(v, v)).containsExactly("Ritocchi a note e dettagli");
    }
}
