package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Grafo di un'automazione email: lettura del JSON, navigazione e validazione. Solo funzioni pure, senza Spring.
 * <p>
 * Formato (contratto con il frontend, {@code lib/mailing-grafo.ts}):
 * {@code {"nodi":[{"id","tipo","config":{..},"x","y"}],"archi":[{"da","a","ramo":"SI"|"NO"|null}]}}.
 * Config per tipo: EMAIL {emailId} · ATTESA {quantita, unita MINUTI|ORE|GIORNI} · ATTESA_FINO_A {giorni:[1..7]
 * (1 = lunedì), ora "HH:mm"} · CONDIZIONE {regole} oppure {haAperto: nodoId} / {haCliccato: nodoId} ·
 * AGGIUNGI_TAG / RIMUOVI_TAG {tagId} · NOTIFICA_STAFF {testo} (crea un task per il dottore) · FINE {}.
 * Il primo nodo è quello senza archi entranti; una CONDIZIONE senza uno dei due rami fa completare il percorso a chi
 * prende quel ramo (come avvisa la tela).
 */
public final class MailingGrafo {

    public static final Set<String> TIPI_NODO = Set.of(
            "EMAIL", "ATTESA", "ATTESA_FINO_A", "CONDIZIONE", "AGGIUNGI_TAG", "RIMUOVI_TAG", "NOTIFICA_STAFF", "FINE");

    public static final Set<String> UNITA_ATTESA = Set.of("MINUTI", "ORE", "GIORNI");

    private static final Pattern ORA = Pattern.compile("^([01]\\d|2[0-3]):[0-5]\\d$");

    private static final Map<String, String> ETICHETTE = Map.of(
            "EMAIL", "Invia email",
            "ATTESA", "Aspetta",
            "ATTESA_FINO_A", "Aspetta fino a",
            "CONDIZIONE", "Condizione",
            "AGGIUNGI_TAG", "Aggiungi tag",
            "RIMUOVI_TAG", "Togli tag",
            "NOTIFICA_STAFF", "Crea un task",
            "FINE", "Fine");

    public record Nodo(String id, String tipo, JsonNode config, double x, double y) {

        public JsonNode cfg() {
            return config == null ? JsonNodeFactory.instance.objectNode() : config;
        }
    }

    public record Arco(String da, String a, String ramo) {
    }

    private final List<Nodo> nodi;
    private final List<Arco> archi;
    private final Map<String, Nodo> perId;

    private MailingGrafo(List<Nodo> nodi, List<Arco> archi) {
        this.nodi = List.copyOf(nodi);
        this.archi = List.copyOf(archi);
        Map<String, Nodo> m = new LinkedHashMap<>();
        for (Nodo n : nodi) {
            m.putIfAbsent(n.id(), n);
        }
        this.perId = m;
    }

    /** Legge il JSON del grafo; null o non oggetto → grafo vuoto. Nodi senza id ignorati. */
    public static MailingGrafo leggi(JsonNode json) {
        List<Nodo> nodi = new ArrayList<>();
        List<Arco> archi = new ArrayList<>();
        if (json != null && json.isObject()) {
            for (JsonNode n : iterabile(json.path("nodi"))) {
                String id = testo(n.path("id"));
                if (id == null) {
                    continue;
                }
                String tipo = testo(n.path("tipo"));
                nodi.add(new Nodo(id, tipo == null ? "" : tipo.toUpperCase(Locale.ROOT),
                        n.path("config").isObject() ? n.path("config") : JsonNodeFactory.instance.objectNode(),
                        n.path("x").asDouble(0), n.path("y").asDouble(0)));
            }
            for (JsonNode a : iterabile(json.path("archi"))) {
                String da = testo(a.path("da"));
                String verso = testo(a.path("a"));
                if (da == null || verso == null) {
                    continue;
                }
                String ramo = testo(a.path("ramo"));
                archi.add(new Arco(da, verso, ramo == null ? null : ramo.toUpperCase(Locale.ROOT)));
            }
        }
        return new MailingGrafo(nodi, archi);
    }

    public List<Nodo> nodi() {
        return nodi;
    }

    public List<Arco> archi() {
        return archi;
    }

    public Nodo nodo(String id) {
        return id == null ? null : perId.get(id);
    }

    public Set<String> ids() {
        return perId.keySet();
    }

    /** Archi con entrambi gli estremi esistenti. */
    private List<Arco> archiValidi() {
        return archi.stream().filter(a -> perId.containsKey(a.da()) && perId.containsKey(a.a())).toList();
    }

    /** Nodi senza archi entranti, dall'alto in basso e da sinistra a destra. */
    public List<Nodo> sorgenti() {
        Set<String> conEntrata = new HashSet<>();
        archiValidi().forEach(a -> conEntrata.add(a.a()));
        return nodi.stream().filter(n -> !conEntrata.contains(n.id()))
                .sorted(Comparator.comparingDouble(Nodo::y).thenComparingDouble(Nodo::x))
                .toList();
    }

    /** Il primo nodo (come la tela: il più in alto tra quelli senza archi entranti). */
    public Nodo iniziale() {
        List<Nodo> s = sorgenti();
        return s.isEmpty() ? null : s.get(0);
    }

    /** Il nodo che segue {@code id} sull'uscita {@code ramo} (null per i nodi non condizionali); null = fine. */
    public Nodo successivo(String id, String ramo) {
        for (Arco a : archiValidi()) {
            if (a.da().equals(id) && java.util.Objects.equals(normRamo(a.ramo()), normRamo(ramo))) {
                return perId.get(a.a());
            }
        }
        if (ramo == null) {
            // Tolleranza: nodo semplice con un solo arco che porta un ramo per errore.
            List<Arco> fuori = archiValidi().stream().filter(a -> a.da().equals(id)).toList();
            if (fuori.size() == 1) {
                return perId.get(fuori.get(0).a());
            }
        }
        return null;
    }

    private static String normRamo(String r) {
        return r == null || r.isBlank() ? null : r.toUpperCase(Locale.ROOT);
    }

    /** Nodi da cui si raggiunge {@code id} (escluso). */
    public Set<String> antenati(String id) {
        Set<String> visti = new HashSet<>();
        List<String> pila = new ArrayList<>(List.of(id));
        List<Arco> validi = archiValidi();
        while (!pila.isEmpty()) {
            String cur = pila.remove(pila.size() - 1);
            for (Arco a : validi) {
                if (a.a().equals(cur) && visti.add(a.da())) {
                    pila.add(a.da());
                }
            }
        }
        visti.remove(id);
        return visti;
    }

    /** Raggiungibili da {@code id} (compreso). */
    public Set<String> raggiungibili(String id) {
        Set<String> visti = new LinkedHashSet<>();
        if (!perId.containsKey(id)) {
            return visti;
        }
        List<String> coda = new ArrayList<>(List.of(id));
        visti.add(id);
        List<Arco> validi = archiValidi();
        for (int i = 0; i < coda.size(); i++) {
            for (Arco a : validi) {
                if (a.da().equals(coda.get(i)) && visti.add(a.a())) {
                    coda.add(a.a());
                }
            }
        }
        return visti;
    }

    /** True se il grafo contiene un ciclo (anche un arco su sé stesso). */
    public boolean haCiclo() {
        Map<String, List<String>> adiacenti = new HashMap<>();
        for (Nodo n : nodi) {
            adiacenti.put(n.id(), new ArrayList<>());
        }
        for (Arco a : archiValidi()) {
            adiacenti.get(a.da()).add(a.a());
        }
        Map<String, Integer> colore = new HashMap<>(); // 0 bianco, 1 grigio, 2 nero
        for (String radice : adiacenti.keySet()) {
            if (colore.getOrDefault(radice, 0) != 0) {
                continue;
            }
            // DFS iterativa
            List<String[]> pila = new ArrayList<>();
            List<Integer> indici = new ArrayList<>();
            pila.add(new String[]{radice});
            indici.add(0);
            colore.put(radice, 1);
            while (!pila.isEmpty()) {
                String cur = pila.get(pila.size() - 1)[0];
                int i = indici.get(indici.size() - 1);
                List<String> vicini = adiacenti.get(cur);
                if (i < vicini.size()) {
                    indici.set(indici.size() - 1, i + 1);
                    String w = vicini.get(i);
                    int c = colore.getOrDefault(w, 0);
                    if (c == 1) {
                        return true;
                    }
                    if (c == 0) {
                        colore.put(w, 1);
                        pila.add(new String[]{w});
                        indici.add(0);
                    }
                } else {
                    colore.put(cur, 2);
                    pila.remove(pila.size() - 1);
                    indici.remove(indici.size() - 1);
                }
            }
        }
        return false;
    }

    // ───────────────────────── Configurazioni ─────────────────────────

    /** Durata di un nodo ATTESA in minuti (0 se non valida). */
    public static long minutiAttesa(JsonNode config) {
        long q = numero(config.path("quantita"), 0L);
        String u = testo(config.path("unita"));
        u = u == null ? "GIORNI" : u.toUpperCase(Locale.ROOT);
        return switch (u) {
            case "MINUTI" -> q;
            case "ORE" -> q * 60;
            default -> q * 1440;
        };
    }

    /** "APERTO", "CLICCATO", "REGOLA" o null, come {@code tipoCondizione} della tela. */
    public static String tipoCondizione(JsonNode config) {
        if (testo(config.path("haAperto")) != null) {
            return "APERTO";
        }
        if (testo(config.path("haCliccato")) != null) {
            return "CLICCATO";
        }
        JsonNode r = config.path("regole");
        if (r.isObject() && r.path("condizioni").isArray()) {
            return "REGOLA";
        }
        return null;
    }

    /** Giorni ammessi di ATTESA_FINO_A (1 = lunedì … 7 = domenica). */
    public static Set<Integer> giorniAttesa(JsonNode config) {
        Set<Integer> giorni = new java.util.TreeSet<>();
        for (JsonNode g : iterabile(config.path("giorni"))) {
            long v = numero(g, -1L);
            if (v >= 1 && v <= 7) {
                giorni.add((int) v);
            }
        }
        return giorni;
    }

    public static LocalTime oraAttesa(JsonNode config) {
        String ora = testo(config.path("ora"));
        if (ora == null || !ORA.matcher(ora).matches()) {
            return null;
        }
        return LocalTime.parse(ora);
    }

    /**
     * Prossimo istante (strettamente dopo {@code da}, ora di Roma) che cade in uno dei giorni indicati all'ora
     * indicata. Giorni vuoti = qualsiasi giorno.
     */
    public static LocalDateTime prossimaOccorrenza(LocalDateTime da, Set<Integer> giorni, LocalTime ora) {
        for (int i = 0; i <= 7; i++) {
            LocalDateTime candidato = da.toLocalDate().plusDays(i).atTime(ora);
            if (!candidato.isAfter(da)) {
                continue;
            }
            DayOfWeek dow = candidato.getDayOfWeek();
            if (giorni == null || giorni.isEmpty() || giorni.contains(dow.getValue())) {
                return candidato;
            }
        }
        return da.plusDays(7);
    }

    // ───────────────────────── Validazione ─────────────────────────

    /** Dati delle email dell'automazione che servono alla validazione. */
    public record EmailInfo(String oggetto, String html) {
    }

    /** Le email di un passo EMAIL (una, o nessuna se manca). */
    public static List<Long> emailDelPasso(JsonNode cfg) {
        long id = cfg == null ? -1L : numero(cfg.path("emailId"), -1L);
        return id > 0 ? List.of(id) : List.of();
    }

    private static void validaEmail(String nome, long id, Map<Long, EmailInfo> email, List<String> errori) {
        EmailInfo e = email == null ? null : email.get(id);
        if (id < 0 || e == null) {
            errori.add(nome + ": l'email è ancora da scrivere.");
        } else {
            if (e.oggetto() == null || e.oggetto().isBlank()) {
                errori.add(nome + ": manca l'oggetto dell'email.");
            }
            if (htmlVuoto(e.html())) {
                errori.add(nome + ": l'email è vuota, aprila nell'editor e scrivi il contenuto.");
            }
        }
    }

    /**
     * Errori bloccanti del grafo, in italiano e leggibili, con il numero del passo. Lista vuota = valido.
     *
     * @param email email dell'automazione per id (per verificare che il nodo EMAIL punti a un'email con contenuto)
     */
    public List<String> valida(Map<Long, EmailInfo> email) {
        List<String> errori = new ArrayList<>();
        if (nodi.isEmpty()) {
            errori.add("Aggiungi almeno un passo sotto il trigger.");
            return errori;
        }
        Set<String> visti = new HashSet<>();
        for (Nodo n : nodi) {
            if (!visti.add(n.id())) {
                errori.add("Due passi hanno lo stesso identificativo «" + n.id() + "».");
            }
            if (!TIPI_NODO.contains(n.tipo())) {
                errori.add("Il passo «" + n.id() + "» ha un tipo sconosciuto (" + n.tipo() + ").");
            }
        }
        for (Arco a : archi) {
            if (!perId.containsKey(a.da()) || !perId.containsKey(a.a())) {
                errori.add("Un collegamento punta a un passo che non esiste più: ricollega il percorso.");
                break;
            }
        }
        Map<String, Integer> numeri = numerazione();
        List<Nodo> sorgenti = sorgenti();
        if (sorgenti.isEmpty()) {
            errori.add("Il percorso non ha un primo passo: ogni passo ha un collegamento in entrata.");
        } else if (sorgenti.size() > 1) {
            List<String> orfani = sorgenti.subList(1, sorgenti.size()).stream().map(n -> descrivi(n, numeri)).toList();
            errori.add("Il percorso deve avere un solo primo passo: " + String.join(", ", orfani)
                    + (orfani.size() == 1 ? " non è collegato" : " non sono collegati") + " al resto.");
        }
        if (haCiclo()) {
            errori.add("Il percorso torna indietro su un passo già fatto e girerebbe all'infinito: togli il collegamento all'indietro.");
        }

        List<Arco> validi = archiValidi();
        for (Nodo n : nodi) {
            String nome = descrivi(n, numeri);
            JsonNode c = n.cfg();
            List<Arco> fuori = validi.stream().filter(a -> a.da().equals(n.id())).toList();
            if ("FINE".equals(n.tipo()) && !fuori.isEmpty()) {
                errori.add(nome + ": dopo la fine non può esserci un altro passo.");
            } else if ("CONDIZIONE".equals(n.tipo())) {
                long si = fuori.stream().filter(a -> "SI".equals(normRamo(a.ramo()))).count();
                long no = fuori.stream().filter(a -> "NO".equals(normRamo(a.ramo()))).count();
                long altri = fuori.size() - si - no;
                if (si == 0 && no == 0) {
                    errori.add(nome + ": la condizione non porta da nessuna parte, aggiungi un passo sul ramo Sì e sul ramo No.");
                }
                if (si > 1 || no > 1) {
                    errori.add(nome + ": da un ramo della condizione partono due strade.");
                }
                if (altri > 0) {
                    errori.add(nome + ": ogni collegamento di una condizione deve essere sul ramo Sì o sul ramo No.");
                }
            } else if (fuori.size() > 1) {
                errori.add(nome + ": da questo passo partono due strade, ne è ammessa una sola.");
            }

            switch (n.tipo()) {
                case "EMAIL" -> {
                    validaEmail(nome, numero(c.path("emailId"), -1L), email, errori);
                }
                case "ATTESA" -> {
                    String u = testo(c.path("unita"));
                    if (numero(c.path("quantita"), 0L) <= 0) {
                        errori.add(nome + ": indica quanto aspettare (più di zero).");
                    } else if (u != null && !UNITA_ATTESA.contains(u.toUpperCase(Locale.ROOT))) {
                        errori.add(nome + ": l'unità dell'attesa deve essere minuti, ore o giorni.");
                    }
                }
                case "ATTESA_FINO_A" -> {
                    if (giorniAttesa(c).isEmpty()) {
                        errori.add(nome + ": scegli almeno un giorno della settimana.");
                    }
                    if (oraAttesa(c) == null) {
                        errori.add(nome + ": indica un orario valido (es. 09:00).");
                    }
                }
                case "CONDIZIONE" -> {
                    String tipo = tipoCondizione(c);
                    if (tipo == null) {
                        errori.add(nome + ": scegli che cosa deve controllare la condizione.");
                    } else if ("REGOLA".equals(tipo)) {
                        if (contaFoglie(c.path("regole")) == 0) {
                            errori.add(nome + ": aggiungi almeno una regola alla condizione.");
                        }
                    } else {
                        String rif = testo(c.path("APERTO".equals(tipo) ? "haAperto" : "haCliccato"));
                        Nodo target = nodo(rif);
                        if (target == null || !"EMAIL".equals(target.tipo())) {
                            errori.add(nome + ": la condizione guarda un'email che non c'è più.");
                        } else if (!antenati(n.id()).contains(rif)) {
                            errori.add(nome + ": l'email del passo " + numeri.get(rif)
                                    + " arriva dopo questa condizione, scegline una precedente.");
                        }
                    }
                }
                case "AGGIUNGI_TAG", "RIMUOVI_TAG" -> {
                    if (numero(c.path("tagId"), -1L) < 0 && testo(c.path("nome")) == null) {
                        errori.add(nome + ": scegli il tag.");
                    }
                }
                case "NOTIFICA_STAFF" -> {
                    if (testo(c.path("testo")) == null) {
                        errori.add(nome + ": scrivi il titolo del task.");
                    }
                }
                default -> {
                }
            }
        }
        return errori;
    }

    static boolean htmlVuoto(String html) {
        if (html == null) {
            return true;
        }
        String t = html.replaceAll("(?is)<style.*?</style>", "")
                .replaceAll("(?is)<head.*?</head>", "");
        boolean haImmagini = t.toLowerCase(Locale.ROOT).contains("<img");
        t = t.replaceAll("<[^>]+>", "").replace("&nbsp;", " ").trim();
        return t.isEmpty() && !haImmagini;
    }

    static int contaFoglie(JsonNode gruppo) {
        int n = 0;
        for (JsonNode c : iterabile(gruppo.path("condizioni"))) {
            n += c.has("condizioni") ? contaFoglie(c) : (c.has("campo") ? 1 : 0);
        }
        return n;
    }

    /** Numero di passo in ordine di lettura (in ampiezza dal primo, SI prima di NO), come la tela. */
    public Map<String, Integer> numerazione() {
        Map<String, Integer> numeri = new LinkedHashMap<>();
        Nodo inizio = iniziale();
        if (inizio != null) {
            List<String> coda = new ArrayList<>(List.of(inizio.id()));
            Set<String> visti = new HashSet<>(coda);
            List<Arco> validi = new ArrayList<>(archiValidi());
            validi.sort(Comparator.comparingInt(a -> "NO".equals(normRamo(a.ramo())) ? 1 : 0));
            for (int i = 0; i < coda.size(); i++) {
                for (Arco a : validi) {
                    if (a.da().equals(coda.get(i)) && visti.add(a.a())) {
                        coda.add(a.a());
                    }
                }
            }
            coda.forEach(id -> numeri.put(id, numeri.size() + 1));
        }
        nodi.stream().filter(n -> !numeri.containsKey(n.id()))
                .sorted(Comparator.comparingDouble(Nodo::y).thenComparingDouble(Nodo::x))
                .forEach(n -> numeri.put(n.id(), numeri.size() + 1));
        return numeri;
    }

    private static String descrivi(Nodo n, Map<String, Integer> numeri) {
        Integer num = numeri.get(n.id());
        return "Passo " + (num == null ? "?" : num) + " («" + ETICHETTE.getOrDefault(n.tipo(), n.tipo()) + "»)";
    }

    public static String etichetta(String tipo) {
        return ETICHETTE.getOrDefault(tipo, tipo);
    }

    // ───────────────────────── Util JSON ─────────────────────────

    static Iterable<JsonNode> iterabile(JsonNode n) {
        return n != null && n.isArray() ? n : List.of();
    }

    static String testo(JsonNode n) {
        if (n == null || n.isNull() || n.isMissingNode() || n.isContainerNode()) {
            return null;
        }
        String s = n.asText();
        return s == null || s.isBlank() ? null : s.trim();
    }

    static long numero(JsonNode n, long predefinito) {
        if (n == null || n.isNull() || n.isMissingNode()) {
            return predefinito;
        }
        if (n.isNumber()) {
            return n.asLong();
        }
        if (n.isTextual()) {
            try {
                return Long.parseLong(n.asText().trim());
            } catch (NumberFormatException e) {
                try {
                    return (long) Double.parseDouble(n.asText().trim());
                } catch (NumberFormatException e2) {
                    return predefinito;
                }
            }
        }
        return predefinito;
    }

    /** Grafo vuoto valido come JSON. */
    public static ObjectNode vuoto() {
        ObjectNode o = JsonNodeFactory.instance.objectNode();
        o.putArray("nodi");
        o.putArray("archi");
        return o;
    }
}
