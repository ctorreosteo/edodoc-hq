package it.edodoc.hq.services;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Gli slot liberi della chiamata conoscitiva: dentro le fasce del dottore, ogni mezz'ora, con il preavviso minimo,
 * lontani dagli impegni (margine compreso) e solo nei giorni che non hanno già raggiunto il massimo di chiamate.
 * Solo calcolo, senza Google né database: si prova a parte.
 */
public final class SlotConoscitiva {

    public static final int DURATA_MINUTI = 30;

    private static final Map<String, DayOfWeek> GIORNI = Map.of(
            "lun", DayOfWeek.MONDAY, "mar", DayOfWeek.TUESDAY, "mer", DayOfWeek.WEDNESDAY, "gio", DayOfWeek.THURSDAY,
            "ven", DayOfWeek.FRIDAY, "sab", DayOfWeek.SATURDAY, "dom", DayOfWeek.SUNDAY);

    private SlotConoscitiva() {
    }

    public record Fascia(LocalTime inizio, LocalTime fine) {
    }

    public record Impegno(LocalDateTime inizio, LocalDateTime fine) {
    }

    public record Regole(Map<DayOfWeek, List<Fascia>> orari, int preavvisoOre, int giorni, int margineMinuti, int maxAlGiorno) {
    }

    /**
     * "lun-ven 09:00-13:00 14:30-19:00; sab 09:00-12:00". Un blocco scritto male si salta: meglio qualche slot
     * in meno che una pagina di prenotazione rotta per un refuso nelle impostazioni.
     */
    public static Map<DayOfWeek, List<Fascia>> leggiOrari(String testo) {
        Map<DayOfWeek, List<Fascia>> orari = new EnumMap<>(DayOfWeek.class);
        if (testo == null) return orari;
        for (String blocco : testo.split(";")) {
            String[] parti = blocco.trim().toLowerCase(Locale.ITALIAN).split("\\s+");
            if (parti.length < 2) continue;
            List<DayOfWeek> giorni = giorni(parti[0]);
            List<Fascia> fasce = new ArrayList<>();
            for (int i = 1; i < parti.length; i++) {
                String[] estremi = parti[i].split("-");
                if (estremi.length != 2) continue;
                try {
                    LocalTime da = LocalTime.parse(estremi[0].length() == 4 ? "0" + estremi[0] : estremi[0]);
                    LocalTime a = LocalTime.parse(estremi[1].length() == 4 ? "0" + estremi[1] : estremi[1]);
                    if (a.isAfter(da)) fasce.add(new Fascia(da, a));
                } catch (RuntimeException e) {
                    // fascia illeggibile: si ignora
                }
            }
            for (DayOfWeek g : giorni) orari.computeIfAbsent(g, k -> new ArrayList<>()).addAll(fasce);
        }
        return orari;
    }

    private static List<DayOfWeek> giorni(String testo) {
        List<DayOfWeek> giorni = new ArrayList<>();
        for (String voce : testo.split(",")) {
            String[] estremi = voce.split("-");
            DayOfWeek da = GIORNI.get(estremi[0].trim());
            DayOfWeek a = estremi.length > 1 ? GIORNI.get(estremi[1].trim()) : da;
            if (da == null || a == null) continue;
            for (int g = da.getValue(); ; g = g % 7 + 1) {
                giorni.add(DayOfWeek.of(g));
                if (g == a.getValue()) break;
            }
        }
        return giorni;
    }

    /**
     * @param adesso          ora attuale a Roma
     * @param impegni         occupato su Google e visite in agenda
     * @param chiamateFissate chiamate conoscitive già in agenda per giorno
     * @return per ogni giorno con almeno uno slot, gli orari d'inizio in ordine
     */
    public static Map<LocalDate, List<LocalTime>> liberi(LocalDateTime adesso, Regole regole, List<Impegno> impegni,
                                                        Map<LocalDate, Integer> chiamateFissate) {
        Map<LocalDate, List<LocalTime>> giorni = new LinkedHashMap<>();
        LocalDateTime primo = adesso.plusHours(regole.preavvisoOre());
        for (int i = 0; i < regole.giorni(); i++) {
            LocalDate giorno = adesso.toLocalDate().plusDays(i);
            if (chiamateFissate.getOrDefault(giorno, 0) >= regole.maxAlGiorno()) continue;
            List<LocalTime> orari = new ArrayList<>();
            for (Fascia f : regole.orari().getOrDefault(giorno.getDayOfWeek(), List.of())) {
                for (LocalTime t = allinea(f.inizio()); !t.plusMinutes(DURATA_MINUTI).isAfter(f.fine()) && !t.isBefore(f.inizio());
                     t = t.plusMinutes(DURATA_MINUTI)) {
                    LocalDateTime inizio = giorno.atTime(t);
                    LocalDateTime fine = inizio.plusMinutes(DURATA_MINUTI);
                    if (inizio.isBefore(primo) || occupato(inizio, fine, impegni, regole.margineMinuti())) continue;
                    if (!orari.contains(t)) orari.add(t);
                    if (t.plusMinutes(DURATA_MINUTI).equals(LocalTime.MIDNIGHT)) break;
                }
            }
            orari.sort(null);
            if (!orari.isEmpty()) giorni.put(giorno, orari);
        }
        return giorni;
    }

    /** Gli slot partono all'ora o alla mezza: una fascia dalle 14:40 inizia alle 15:00. */
    private static LocalTime allinea(LocalTime t) {
        int resto = t.getMinute() % DURATA_MINUTI;
        LocalTime pulito = t.withSecond(0).withNano(0);
        return resto == 0 ? pulito : pulito.plusMinutes(DURATA_MINUTI - resto);
    }

    private static boolean occupato(LocalDateTime inizio, LocalDateTime fine, List<Impegno> impegni, int margine) {
        LocalDateTime da = inizio.minusMinutes(margine);
        LocalDateTime a = fine.plusMinutes(margine);
        for (Impegno i : impegni) {
            if (i.inizio().isBefore(a) && i.fine().isAfter(da)) return true;
        }
        return false;
    }
}
