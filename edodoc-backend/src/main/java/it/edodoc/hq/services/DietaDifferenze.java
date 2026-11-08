package it.edodoc.hq.services;

import it.edodoc.hq.dto.DietaDto;
import it.edodoc.hq.models.DietaVersione;

import java.math.BigDecimal;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Cosa è cambiato tra due versioni di una dieta, in frasi brevi da storico:
 * "Energia 1.800 → 1.650 kcal", "+ Salmone 150 g · Cena", "Riso basmati 70 → 80 g · Pranzo".
 * I pasti si riconoscono per giornata e nome, gli alimenti per nome: è quello che il dottore legge.
 */
public final class DietaDifferenze {

    private static final DateTimeFormatter DATA = DateTimeFormatter.ofPattern("d/MM/yyyy");

    private DietaDifferenze() {
    }

    public static List<String> tra(DietaVersione prima, DietaVersione dopo) {
        List<String> m = new ArrayList<>();
        DietaDto.Contenuto a = prima.getContenuto();
        DietaDto.Contenuto b = dopo.getContenuto();
        if (!Objects.equals(prima.getTitolo(), dopo.getTitolo())) m.add("Titolo: «" + dopo.getTitolo() + "»");
        if (!Objects.equals(prima.getDataInizio(), dopo.getDataInizio())) {
            m.add(dopo.getDataInizio() == null ? "Tolta la data di inizio" : "Inizio dal " + dopo.getDataInizio().format(DATA));
        }
        if (!Objects.equals(vuoto(a.obiettivo()), vuoto(b.obiettivo()))) {
            m.add(vuoto(b.obiettivo()) == null ? "Tolto l'obiettivo" : "Obiettivo: " + b.obiettivo().trim());
        }
        numero(m, "Energia", a.kcal(), b.kcal(), " kcal");
        numero(m, "Proteine", a.proteine(), b.proteine(), " g");
        numero(m, "Carboidrati", a.carboidrati(), b.carboidrati(), " g");
        numero(m, "Grassi", a.grassi(), b.grassi(), " g");
        if (!uguali(a.acquaLitri(), b.acquaLitri())) {
            m.add(a.acquaLitri() == null ? "Acqua " + litri(b.acquaLitri()) + " l" : b.acquaLitri() == null ? "Tolto: acqua"
                    : "Acqua " + litri(a.acquaLitri()) + " → " + litri(b.acquaLitri()) + " l");
        }
        if (!Objects.equals(vuoto(a.introduzione()), vuoto(b.introduzione()))) m.add("Messaggio al paziente riscritto");

        pasti(m, a, b);

        elenco(m, "Liberi", a.liberi(), b.liberi());
        elenco(m, "Da limitare", a.limitare(), b.limitare());
        elenco(m, "Integrazione", a.integrazione().stream().map(DietaDto.Integratore::nome).toList(),
                b.integrazione().stream().map(DietaDto.Integratore::nome).toList());
        elenco(m, "Consigli", a.consigli().stream().map(DietaDto.Consiglio::titolo).toList(),
                b.consigli().stream().map(DietaDto.Consiglio::titolo).toList());
        if (!Objects.equals(a.listaSpesa(), b.listaSpesa())) m.add(Boolean.TRUE.equals(b.listaSpesa()) ? "Lista della spesa nel PDF" : "Lista della spesa tolta");
        if (m.isEmpty()) m.add("Ritocchi a note e dettagli");
        return m;
    }

    private record Riga(String nome, String quantita) {
    }

    private static void pasti(List<String> m, DietaDto.Contenuto a, DietaDto.Contenuto b) {
        Map<String, String> giornateA = giornate(a);
        Map<String, String> giornateB = giornate(b);
        boolean piuGiornate = giornateA.size() > 1 || giornateB.size() > 1;
        for (String g : giornateB.keySet()) if (!giornateA.containsKey(g)) m.add("+ Giornata «" + giornateB.get(g) + "»");
        for (String g : giornateA.keySet()) if (!giornateB.containsKey(g)) m.add("− Giornata «" + giornateA.get(g) + "»");

        Map<String, Map<String, Riga>> pastiA = alimenti(a, piuGiornate);
        Map<String, Map<String, Riga>> pastiB = alimenti(b, piuGiornate);
        for (Map.Entry<String, Map<String, Riga>> p : pastiB.entrySet()) {
            Map<String, Riga> vecchi = pastiA.get(p.getKey());
            if (vecchi == null) {
                if (giornataEsisteva(p.getKey(), pastiA, piuGiornate)) m.add("+ Pasto «" + p.getKey() + "»");
                continue;
            }
            for (Map.Entry<String, Riga> al : p.getValue().entrySet()) {
                Riga prima = vecchi.get(al.getKey());
                Riga ora = al.getValue();
                if (prima == null) {
                    m.add("+ " + ora.nome() + (ora.quantita() == null ? "" : " " + ora.quantita()) + " · " + p.getKey());
                } else if (!Objects.equals(prima.quantita(), ora.quantita())) {
                    m.add(ora.nome() + " " + passaggio(prima.quantita(), ora.quantita()) + " · " + p.getKey());
                }
            }
            for (Map.Entry<String, Riga> al : vecchi.entrySet()) {
                if (!p.getValue().containsKey(al.getKey())) m.add("− " + al.getValue().nome() + " · " + p.getKey());
            }
        }
        for (String p : pastiA.keySet()) {
            if (!pastiB.containsKey(p) && giornataEsisteva(p, pastiB, piuGiornate)) m.add("− Pasto «" + p + "»");
        }
    }

    /** Un pasto nuovo dentro una giornata nuova lo racconta già "+ Giornata": non si ripete pasto per pasto. */
    private static boolean giornataEsisteva(String pasto, Map<String, Map<String, Riga>> altra, boolean piuGiornate) {
        if (!piuGiornate) return true;
        String giornata = pasto.substring(pasto.lastIndexOf(" · ") + 3);
        return altra.keySet().stream().anyMatch(k -> k.endsWith(" · " + giornata));
    }

    private static Map<String, String> giornate(DietaDto.Contenuto c) {
        Map<String, String> g = new LinkedHashMap<>();
        for (DietaDto.Giornata giornata : c.giornate()) g.put(chiave(giornata.nome()), nome(giornata.nome(), "Giornata"));
        return g;
    }

    /** Pasto → alimenti, con le alternative fuse: per lo storico conta cosa compare nel pasto, non in quale opzione. */
    private static Map<String, Map<String, Riga>> alimenti(DietaDto.Contenuto c, boolean piuGiornate) {
        Map<String, Map<String, Riga>> pasti = new LinkedHashMap<>();
        for (DietaDto.Giornata g : c.giornate()) {
            for (DietaDto.Pasto p : g.pasti()) {
                String nome = nome(p.nome(), "Pasto") + (piuGiornate ? " · " + nome(g.nome(), "Giornata") : "");
                Map<String, Riga> righe = pasti.computeIfAbsent(nome, k -> new LinkedHashMap<>());
                for (DietaDto.Opzione o : p.opzioni()) {
                    for (DietaDto.Alimento al : o.alimenti()) {
                        if (al.nome() == null || al.nome().isBlank()) continue;
                        righe.putIfAbsent(chiave(al.nome()), new Riga(al.nome().trim(), vuoto(al.quantita())));
                    }
                }
            }
        }
        return pasti;
    }

    private static void elenco(List<String> m, String etichetta, List<String> a, List<String> b) {
        Set<String> prima = new LinkedHashSet<>();
        Set<String> dopo = new LinkedHashSet<>();
        Map<String, String> nomi = new LinkedHashMap<>();
        for (String s : a) if (vuoto(s) != null) prima.add(chiave(s));
        for (String s : b) if (vuoto(s) != null) {
            dopo.add(chiave(s));
            nomi.putIfAbsent(chiave(s), s.trim());
        }
        for (String s : a) if (vuoto(s) != null) nomi.putIfAbsent(chiave(s), s.trim());
        List<String> aggiunti = dopo.stream().filter(s -> !prima.contains(s)).map(nomi::get).toList();
        List<String> tolti = prima.stream().filter(s -> !dopo.contains(s)).map(nomi::get).toList();
        if (!aggiunti.isEmpty()) m.add(etichetta + ": + " + String.join(", ", aggiunti));
        if (!tolti.isEmpty()) m.add(etichetta + ": − " + String.join(", ", tolti));
    }

    private static void numero(List<String> m, String nome, Integer a, Integer b, String unita) {
        if (Objects.equals(a, b)) return;
        if (a == null) m.add(nome + " " + intero(b) + unita);
        else if (b == null) m.add("Tolto: " + nome.toLowerCase(Locale.ITALIAN));
        else m.add(nome + " " + intero(a) + " → " + intero(b) + unita);
    }

    private static boolean uguali(BigDecimal a, BigDecimal b) {
        return a == null ? b == null : b != null && a.compareTo(b) == 0;
    }

    private static String intero(Integer n) {
        return n == null ? "—" : new DecimalFormat("#,##0", DecimalFormatSymbols.getInstance(Locale.ITALY)).format(n);
    }

    private static String litri(BigDecimal l) {
        return l == null ? "—" : new DecimalFormat("0.#", DecimalFormatSymbols.getInstance(Locale.ITALY)).format(l);
    }

    private static String chiave(String s) {
        return s == null ? "" : s.trim().toLowerCase(Locale.ITALIAN).replaceAll("\\s+", " ");
    }

    private static String nome(String s, String altrimenti) {
        return s == null || s.isBlank() ? altrimenti : s.trim();
    }

    private static String vuoto(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static final java.util.regex.Pattern QUANTITA = java.util.regex.Pattern.compile("^(\\d+(?:[.,]\\d+)?)\\s*(\\S.*)$");

    /** "70 g" e "80 g" diventano "70 → 80 g": con la stessa unità basta scriverla una volta. */
    private static String passaggio(String prima, String dopo) {
        if (prima != null && dopo != null) {
            java.util.regex.Matcher a = QUANTITA.matcher(prima);
            java.util.regex.Matcher b = QUANTITA.matcher(dopo);
            if (a.matches() && b.matches() && a.group(2).equalsIgnoreCase(b.group(2))) {
                return a.group(1) + " → " + b.group(1) + " " + b.group(2);
            }
        }
        return testo(prima) + " → " + testo(dopo);
    }

    private static String testo(String s) {
        return s == null ? "—" : s;
    }
}
