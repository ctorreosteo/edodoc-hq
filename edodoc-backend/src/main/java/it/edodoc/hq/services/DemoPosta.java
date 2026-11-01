package it.edodoc.hq.services;

import it.edodoc.hq.dto.CasellaDto;
import it.edodoc.hq.exception.RisorsaNonTrovataException;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Casella finta in memoria, con email inventate: serve a provare la pagina in locale finché Google non è
 * collegato. Si azzera a ogni riavvio. Non spedisce nulla: l'invio finisce nelle Inviate di questa casella.
 */
@Component
public class DemoPosta implements CasellaPosta {

    private static final String MIA = "edoardo@edodoc.it";
    private static final CasellaDto.Indirizzo IO = new CasellaDto.Indirizzo("Dott. Edoardo Bo", MIA);
    private static final List<String> CARTELLE = List.of("INBOX", "STARRED", "SENT", "DRAFT", "SPAM", "TRASH");
    private static final Map<String, String> NOMI = Map.of("INBOX", "Posta in arrivo", "STARRED", "Speciali", "SENT", "Inviate",
            "DRAFT", "Bozze", "SPAM", "Spam", "TRASH", "Cestino");
    private static final int PAGINA = 30;
    private static final byte[] ALLEGATO = "Esempio di allegato della casella dimostrativa.\n".getBytes(StandardCharsets.UTF_8);

    private static final class Msg {
        String id;
        CasellaDto.Indirizzo da;
        List<CasellaDto.Indirizzo> a = List.of();
        List<CasellaDto.Indirizzo> cc = List.of();
        String oggetto;
        String html;
        long data;
        Set<String> etichette = new LinkedHashSet<>();
        List<CasellaDto.Allegato> allegati = List.of();
        Map<String, byte[]> file = Map.of();
        String bozzaId;
    }

    private static final class Thr {
        String id;
        List<Msg> messaggi = new ArrayList<>();
    }

    private final Map<String, Thr> thread = new ConcurrentHashMap<>();
    private final AtomicLong versione = new AtomicLong(1000);

    public DemoPosta() {
        Instant ora = Instant.now();
        arrivo("Conferma della visita di martedì", "Marta Verdi", "marta.verdi@esempio.it",
                "<p>Buongiorno Dottore,</p><p>le confermo la visita di martedì alle 15. Porto anche gli ultimi esami del sangue.</p><p>Grazie,<br>Marta</p>",
                ora.minus(Duration.ofMinutes(40)), true, false);
        arrivo("Domanda sul piano della settimana", "Sergio Neri", "sergio.neri@esempio.it",
                "<p>Salve, posso sostituire il pesce del giovedì con il pollo? Questa settimana sono spesso fuori a pranzo.</p><p>Sergio</p>",
                ora.minus(Duration.ofHours(3)), true, false);
        arrivo("Esami del sangue", "Paola Bianchi", "paola.bianchi@esempio.it",
                "<p>Buonasera, le allego gli esami come d'accordo. Il colesterolo è ancora un po' alto.</p><p>Un saluto,<br>Paola</p>",
                ora.minus(Duration.ofHours(26)), false, true);
        Thr conversazione = arrivo("Pagamento della seconda rata", "Luigi Gialli", "luigi.gialli@esempio.it",
                "<p>Buongiorno, ho fatto il bonifico stamattina. Le serve la contabile?</p><p>Luigi</p>",
                ora.minus(Duration.ofDays(3)), false, false);
        Msg risposta = messaggio(conversazione, IO, List.of(new CasellaDto.Indirizzo("Luigi Gialli", "luigi.gialli@esempio.it")),
                "Re: Pagamento della seconda rata", "<p>Grazie Luigi, sì: mandami pure la contabile via email.</p><p>Un caro saluto,<br>Edoardo</p>",
                ora.minus(Duration.ofDays(3)).plus(Duration.ofHours(1)));
        risposta.etichette.add("SENT");
        Msg terzo = messaggio(conversazione, new CasellaDto.Indirizzo("Luigi Gialli", "luigi.gialli@esempio.it"), List.of(IO),
                "Re: Pagamento della seconda rata", "<p>Ecco la contabile, grazie.</p>", ora.minus(Duration.ofDays(2)));
        terzo.etichette.add("INBOX");
        arrivo("La tua fattura è pronta", "Studio Commercialista Esempio", "info@commercialista-esempio.it",
                "<p>Gentile Dottore, trova in area riservata il prospetto del trimestre.</p>", ora.minus(Duration.ofDays(9)), false, false);
        Thr inviata = nuovoThread();
        Msg m = messaggio(inviata, IO, List.of(new CasellaDto.Indirizzo("Elena Rosa", "elena.rosa@esempio.it")), "Dati per la fattura",
                "<p>Ciao Elena, per preparare la fattura mi servono nome, indirizzo e codice fiscale.</p><p>Edoardo</p>", ora.minus(Duration.ofDays(5)));
        m.etichette.add("SENT");
        Thr spam = arrivo("Hai vinto un premio", "Offerte Imperdibili", "promo@offerte-esempio.it",
                "<p onclick=\"alert(1)\">Clicca qui!</p><script>alert('demo')</script>", ora.minus(Duration.ofDays(1)), true, false);
        spam.messaggi.get(0).etichette.remove("INBOX");
        spam.messaggi.get(0).etichette.add("SPAM");
    }

    private Thr nuovoThread() {
        Thr t = new Thr();
        t.id = "t" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        thread.put(t.id, t);
        return t;
    }

    private static Msg messaggio(Thr t, CasellaDto.Indirizzo da, List<CasellaDto.Indirizzo> a, String oggetto, String html, Instant quando) {
        Msg m = new Msg();
        m.id = "m" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        m.da = da;
        m.a = a;
        m.oggetto = oggetto;
        m.html = html;
        m.data = quando.toEpochMilli();
        t.messaggi.add(m);
        return m;
    }

    private Thr arrivo(String oggetto, String nome, String email, String html, Instant quando, boolean nonLetto, boolean allegato) {
        Thr t = nuovoThread();
        Msg m = messaggio(t, new CasellaDto.Indirizzo(nome, email), List.of(IO), oggetto, html, quando);
        m.etichette.add("INBOX");
        if (nonLetto) {
            m.etichette.add("UNREAD");
        }
        if (allegato) {
            m.allegati = List.of(new CasellaDto.Allegato(m.id, "a1", "esami-esempio.txt", "text/plain", ALLEGATO.length, false));
            m.file = Map.of("a1", ALLEGATO);
        }
        return t;
    }

    private void tocca() {
        versione.incrementAndGet();
    }

    private static Set<String> etichette(Thr t) {
        Set<String> tutte = new LinkedHashSet<>();
        t.messaggi.forEach(m -> tutte.addAll(m.etichette));
        return tutte;
    }

    private static boolean nonLetto(Thr t) {
        return t.messaggi.stream().anyMatch(m -> m.etichette.contains("UNREAD") && !m.etichette.contains("DRAFT"));
    }

    private static long dataUltimo(Thr t) {
        return t.messaggi.stream().mapToLong(m -> m.data).max().orElse(0);
    }

    /** Come in Gmail: spam e cestino non compaiono nelle altre cartelle. */
    private static boolean inCartella(Thr t, String cartella) {
        Set<String> e = etichette(t);
        if (t.messaggi.isEmpty()) {
            return false;
        }
        if (cartella == null || cartella.isBlank()) {
            return !e.contains("TRASH") && !e.contains("SPAM");
        }
        if ("TRASH".equals(cartella) || "SPAM".equals(cartella)) {
            return e.contains(cartella);
        }
        return e.contains(cartella) && !e.contains("TRASH") && !e.contains("SPAM");
    }

    /** Sottoinsieme della sintassi di ricerca di Gmail usata dalla pagina: testo libero, is:unread, has:attachment, is:starred. */
    private static boolean corrisponde(Thr t, String q) {
        if (q == null || q.isBlank()) {
            return true;
        }
        Set<String> e = etichette(t);
        for (String parola : q.toLowerCase(Locale.ROOT).trim().split("\\s+")) {
            boolean ok = switch (parola) {
                case "is:unread" -> nonLetto(t);
                case "is:starred" -> e.contains("STARRED");
                case "has:attachment" -> t.messaggi.stream().anyMatch(m -> !m.allegati.isEmpty());
                default -> t.messaggi.stream().anyMatch(m -> (m.oggetto + " " + m.html + " " + m.da.email() + " " + m.da.nome())
                        .toLowerCase(Locale.ROOT).contains(parola));
            };
            if (!ok) {
                return false;
            }
        }
        return true;
    }

    private static String anteprima(Msg m) {
        String testo = CorpoEmail.testoDaHtml(m.html).replaceAll("\\s+", " ").trim();
        return testo.length() > 120 ? testo.substring(0, 120) : testo;
    }

    @Override
    public CasellaDto.Casella casella() {
        List<CasellaDto.Etichetta> etichette = new ArrayList<>();
        for (String id : CARTELLE) {
            List<Thr> dentro = thread.values().stream().filter(t -> inCartella(t, id)).toList();
            etichette.add(new CasellaDto.Etichetta(id, NOMI.get(id), "SYSTEM", dentro.size(),
                    dentro.stream().filter(DemoPosta::nonLetto).count(), null, null));
        }
        return new CasellaDto.Casella(MIA, IO.nome(), etichette, String.valueOf(versione.get()), true);
    }

    @Override
    public CasellaDto.Stato stato(String dalHistoryId) {
        String corrente = String.valueOf(versione.get());
        long nonLetti = thread.values().stream().filter(t -> inCartella(t, "INBOX") && nonLetto(t)).count();
        return new CasellaDto.Stato(corrente, nonLetti, dalHistoryId != null && !dalHistoryId.isBlank() && !dalHistoryId.equals(corrente));
    }

    @Override
    public CasellaDto.PaginaThread elenco(String cartella, String q, String pagina) {
        List<Thr> trovati = thread.values().stream()
                .filter(t -> inCartella(t, cartella) && corrisponde(t, q))
                .sorted(Comparator.comparingLong(DemoPosta::dataUltimo).reversed())
                .toList();
        int da = pagina != null && !pagina.isBlank() ? Integer.parseInt(pagina) : 0;
        int a = Math.min(trovati.size(), da + PAGINA);
        return new CasellaDto.PaginaThread(trovati.subList(da, a).stream().map(DemoPosta::riga).toList(),
                a < trovati.size() ? String.valueOf(a) : null, trovati.size());
    }

    private static CasellaDto.ThreadRiga riga(Thr t) {
        Msg ultimo = t.messaggi.stream().max(Comparator.comparingLong(m -> m.data)).orElseThrow();
        boolean soloIo = t.messaggi.stream().allMatch(m -> MIA.equals(m.da.email()));
        List<CasellaDto.Indirizzo> partecipanti = soloIo ? ultimo.a
                : t.messaggi.stream().map(m -> m.da).filter(d -> !MIA.equals(d.email())).distinct().toList();
        Set<String> e = etichette(t);
        return new CasellaDto.ThreadRiga(t.id, t.messaggi.get(0).oggetto, anteprima(ultimo), partecipanti, ultimo.da,
                (int) t.messaggi.stream().filter(m -> !m.etichette.contains("DRAFT")).count(), ultimo.data, nonLetto(t),
                e.contains("STARRED"), t.messaggi.stream().anyMatch(m -> !m.allegati.isEmpty()), e.contains("DRAFT"), new ArrayList<>(e));
    }

    private Thr trovaThread(String id) {
        Thr t = thread.get(id);
        if (t == null || t.messaggi.isEmpty()) {
            throw new RisorsaNonTrovataException("Email non trovata: forse è stata eliminata");
        }
        return t;
    }

    private static CasellaDto.Messaggio dto(Thr t, Msg m) {
        return new CasellaDto.Messaggio(m.id, t.id, m.da, m.a, m.cc, List.of(), List.of(), m.oggetto, m.data, anteprima(m),
                CasellaMime.sanificaLettura(m.html), CorpoEmail.testoDaHtml(m.html), m.allegati, new ArrayList<>(m.etichette),
                m.etichette.contains("UNREAD"), m.etichette.contains("DRAFT"), "<" + m.id + "@demo.edodoc>", null, m.bozzaId);
    }

    @Override
    public CasellaDto.Thread thread(String threadId) {
        Thr t = trovaThread(threadId);
        List<CasellaDto.Messaggio> messaggi = t.messaggi.stream().sorted(Comparator.comparingLong(m -> m.data)).map(m -> dto(t, m)).toList();
        return new CasellaDto.Thread(t.id, t.messaggi.get(0).oggetto, messaggi, new ArrayList<>(etichette(t)));
    }

    @Override
    public byte[] allegato(String messaggioId, String allegatoId) {
        return thread.values().stream().flatMap(t -> t.messaggi.stream()).filter(m -> m.id.equals(messaggioId))
                .map(m -> m.file.get(allegatoId)).filter(java.util.Objects::nonNull).findFirst()
                .orElseThrow(() -> new RisorsaNonTrovataException("Allegato non trovato"));
    }

    @Override
    public void modifica(List<String> threadIds, List<String> aggiungi, List<String> rimuovi) {
        for (String id : threadIds) {
            for (Msg m : trovaThread(id).messaggi) {
                m.etichette.removeAll(rimuovi);
                // UNREAD aggiunto vale solo per l'ultimo messaggio, le altre etichette per tutta la conversazione
                m.etichette.addAll(aggiungi.stream().filter(e -> !"UNREAD".equals(e)).toList());
            }
            if (aggiungi.contains("UNREAD")) {
                trovaThread(id).messaggi.stream().max(Comparator.comparingLong(m -> m.data)).ifPresent(m -> m.etichette.add("UNREAD"));
            }
        }
        tocca();
    }

    @Override
    public void cestina(List<String> threadIds) {
        modifica(threadIds, List.of("TRASH"), List.of("INBOX", "SPAM"));
    }

    @Override
    public void ripristina(List<String> threadIds) {
        modifica(threadIds, List.of("INBOX"), List.of("TRASH"));
    }

    private static List<CasellaDto.Indirizzo> indirizzi(List<String> valori) {
        return valori == null ? List.of() : CasellaMime.indirizzi(String.join(",", valori));
    }

    private Thr threadDi(CasellaDto.Composizione c) {
        return c.threadId() != null && thread.containsKey(c.threadId()) ? thread.get(c.threadId()) : nuovoThread();
    }

    private void riempi(Msg m, CasellaDto.Composizione c, List<CasellaMime.FileAllegato> allegati) {
        m.da = IO;
        m.a = indirizzi(c.a());
        m.cc = indirizzi(c.cc());
        m.oggetto = c.oggetto() != null ? c.oggetto() : "";
        m.html = c.html() != null ? c.html() : "";
        m.data = Instant.now().toEpochMilli();
        List<CasellaDto.Allegato> dto = new ArrayList<>();
        Map<String, byte[]> file = new java.util.HashMap<>();
        for (int i = 0; i < allegati.size(); i++) {
            CasellaMime.FileAllegato f = allegati.get(i);
            String id = "a" + (i + 1);
            dto.add(new CasellaDto.Allegato(m.id, id, f.nome(), f.mimeType(), f.dati().length, false));
            file.put(id, f.dati());
        }
        m.allegati = dto;
        m.file = file;
    }

    @Override
    public CasellaDto.EsitoInvio invia(CasellaDto.Composizione c, List<CasellaMime.FileAllegato> allegati) {
        if (c.bozzaId() != null) {
            rimuoviBozza(c.bozzaId());
        }
        Thr t = threadDi(c);
        Msg m = messaggio(t, IO, List.of(), c.oggetto(), "", Instant.now());
        riempi(m, c, allegati);
        m.etichette.add("SENT");
        tocca();
        return new CasellaDto.EsitoInvio(m.id, t.id);
    }

    private Msg trovaBozza(String bozzaId) {
        return thread.values().stream().flatMap(t -> t.messaggi.stream()).filter(m -> bozzaId.equals(m.bozzaId)).findFirst().orElse(null);
    }

    @Override
    public CasellaDto.EsitoBozza salvaBozza(CasellaDto.Composizione c, List<CasellaMime.FileAllegato> allegati) {
        Msg m = c.bozzaId() != null ? trovaBozza(c.bozzaId()) : null;
        if (m == null) {
            m = messaggio(threadDi(c), IO, List.of(), c.oggetto(), "", Instant.now());
            m.bozzaId = "b" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
            m.etichette.add("DRAFT");
        }
        riempi(m, c, allegati);
        tocca();
        Msg salvata = m;
        String threadId = thread.values().stream().filter(t -> t.messaggi.contains(salvata)).map(t -> t.id).findFirst().orElse(null);
        return new CasellaDto.EsitoBozza(m.bozzaId, m.id, threadId, m.allegati);
    }

    @Override
    public CasellaDto.Bozza bozza(String bozzaId) {
        Msg m = trovaBozza(bozzaId);
        if (m == null) {
            throw new RisorsaNonTrovataException("Bozza non trovata");
        }
        String threadId = thread.values().stream().filter(t -> t.messaggi.contains(m)).map(t -> t.id).findFirst().orElse(null);
        return new CasellaDto.Bozza(bozzaId, m.id, threadId, m.a, m.cc, List.of(), m.oggetto, m.html, null, null, m.allegati);
    }

    private void rimuoviBozza(String bozzaId) {
        thread.values().forEach(t -> t.messaggi.removeIf(m -> bozzaId.equals(m.bozzaId)));
    }

    @Override
    public void eliminaBozza(String bozzaId) {
        rimuoviBozza(bozzaId);
        tocca();
    }
}
