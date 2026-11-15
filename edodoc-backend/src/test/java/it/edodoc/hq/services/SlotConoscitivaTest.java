package it.edodoc.hq.services;

import org.junit.jupiter.api.Test;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class SlotConoscitivaTest {

    // lunedì 16 novembre 2026, ore 8
    private static final LocalDateTime LUNEDI_8 = LocalDateTime.of(2026, 11, 16, 8, 0);

    private static SlotConoscitiva.Regole regole(String orari, int preavviso, int margine, int max) {
        return new SlotConoscitiva.Regole(SlotConoscitiva.leggiOrari(orari), preavviso, 7, margine, max);
    }

    @Test
    void leggeIntervalliElenchiEFasceMultiple() {
        Map<DayOfWeek, List<SlotConoscitiva.Fascia>> o = SlotConoscitiva.leggiOrari("lun-mer 09:00-12:00 15:00-18:00; ven,sab 9:30-11:00; xyz 10-11");
        assertThat(o).containsOnlyKeys(DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY);
        assertThat(o.get(DayOfWeek.TUESDAY)).hasSize(2);
        assertThat(o.get(DayOfWeek.SATURDAY).get(0).inizio()).isEqualTo(LocalTime.of(9, 30));
    }

    @Test
    void slotOgniMezzoraDentroLeFasceConPreavvisoEMargine() {
        var impegni = List.of(new SlotConoscitiva.Impegno(LUNEDI_8.withHour(10).withMinute(0), LUNEDI_8.withHour(10).withMinute(45)));
        var liberi = SlotConoscitiva.liberi(LUNEDI_8, regole("lun 09:00-12:00", 1, 10, 4), impegni, Map.of());
        // 09:00 cade nel preavviso? No: 8 + 1h = 9:00 è ammesso. 09:30 finisce alle 10:00, a ridosso dell'impegno: margine 10' lo esclude.
        assertThat(liberi.get(LocalDate.of(2026, 11, 16))).containsExactly(LocalTime.of(9, 0), LocalTime.of(11, 0), LocalTime.of(11, 30));
    }

    @Test
    void ilGiornoPienoDiChiamateSparisceELeFasceStortesiAllineano() {
        var liberi = SlotConoscitiva.liberi(LUNEDI_8, regole("lun-mar 14:40-16:00", 0, 0, 2), List.of(),
                Map.of(LocalDate.of(2026, 11, 16), 2));
        assertThat(liberi).doesNotContainKey(LocalDate.of(2026, 11, 16));
        assertThat(liberi.get(LocalDate.of(2026, 11, 17))).containsExactly(LocalTime.of(15, 0), LocalTime.of(15, 30));
    }
}
