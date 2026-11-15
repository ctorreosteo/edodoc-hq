package it.edodoc.hq.services;

import it.edodoc.hq.dto.ObiettiviDto;
import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.models.Percorso;
import it.edodoc.hq.repositories.PazienteRepository;
import it.edodoc.hq.repositories.PercorsoRepository;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ObiettivoServiceTest {

    private final PercorsoRepository percorsi = mock(PercorsoRepository.class);
    private final ObiettivoService service = new ObiettivoService(percorsi, mock(PazienteRepository.class));

    private static Paziente paziente(long id, String nome) {
        Paziente p = new Paziente();
        p.setId(id);
        p.setNome(nome);
        p.setCognome("Rossi");
        p.setFonte(Paziente.Fonte.YOUTUBE);
        return p;
    }

    private static Percorso percorso(Paziente pz, LocalDate inizio, Percorso.Tipo tipo, String importo) {
        Percorso p = new Percorso();
        p.setPaziente(pz);
        p.setDataInizio(inizio);
        p.setTipo(tipo);
        p.setImportoTotale(new BigDecimal(importo));
        return p;
    }

    @Test
    void unClienteContaUnaVoltaSolaConLaDataDelPrimoPercorso() {
        Paziente anna = paziente(1, "Anna");
        Paziente bruno = paziente(2, "Bruno");
        when(percorsi.findVendutiTra(LocalDate.of(2027, 1, 1), LocalDate.of(2027, 12, 31))).thenReturn(List.of(
                percorso(anna, LocalDate.of(2027, 1, 10), Percorso.Tipo.METODO_BUSSOLA, "1200"),
                percorso(bruno, LocalDate.of(2027, 2, 3), Percorso.Tipo.METODO_BUSSOLA, "1200"),
                percorso(anna, LocalDate.of(2027, 7, 12), Percorso.Tipo.RINNOVO, "900")));

        List<ObiettiviDto.Conquista> righe = service.conquiste(2027);

        assertThat(righe).hasSize(2);
        assertThat(righe.get(0).nome()).isEqualTo("Anna Rossi");
        assertThat(righe.get(0).data()).isEqualTo(LocalDate.of(2027, 1, 10));
        assertThat(righe.get(0).importo()).isEqualByComparingTo("2100");
        assertThat(righe.get(0).percorsi()).isEqualTo(2);
        assertThat(righe.get(1).pazienteId()).isEqualTo(2L);
    }
}
