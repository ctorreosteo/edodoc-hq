package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Traduce le regole JSON di un segmento (§4 di docs/features/email-marketing.md) in un predicato SQL nativo sul
 * contatto (alias {@code c} di {@code mailing_contatti}) con parametri nominati per {@code NamedParameterJdbcTemplate}.
 *
 * <p>Sicurezza: campi e operatori sono una whitelist chiusa ({@link Campo}); nel testo SQL finiscono solo frammenti
 * costanti scritti qui e nomi di parametro generati ({@code :<prefisso><n>}). Ogni valore dell'utente viaggia come
 * parametro, validato e tipizzato. Regole non valide → 400 con un messaggio leggibile.
 *
 * <p>Formato: {@code {"operatore":"E"|"O","condizioni":[{"campo":..,"op":..,"valore":..} | gruppo]}}; gruppo vuoto o
 * regole nulle = tutti i contatti. Profondità massima {@value #PROFONDITA_MAX}, al massimo {@value #CONDIZIONI_MAX}
 * condizioni.
 *
 * <p>Semantica (EdoDoc): le visite che contano sono quelle EFFETTUATA esclusa la chiamata conoscitiva; "visita futura"
 * = PROGRAMMATA da adesso in poi; spesa = somma dei pagamenti PAGATO; lead = paziente in stato LEAD o LISTA_ATTESA.
 */
public final class MailingSegmentiSql {

    public static final int PROFONDITA_MAX = 4;
    public static final int CONDIZIONI_MAX = 50;
    static final int VALORI_MAX = 200;
    static final int TESTO_MAX = 200;

    public static final String ATTIVO = "ATTIVO";
    public static final String TIEPIDO = "TIEPIDO";
    public static final String DORMIENTE = "DORMIENTE";
    public static final String MAI = "MAI";
    static final int GIORNI_ATTIVO = 30;
    static final int GIORNI_DORMIENTE = 90;
    static final int INVII_PER_MAI = 3;

    /** Visite effettuate (non la chiamata conoscitiva): le uniche che contano per numero, ultima e prima visita. */
    static final String VISITA_CONTA = "v.stato = 'EFFETTUATA' AND v.tipo <> 'CHIAMATA_CONOSCITIVA'";

    /** Pazienti con spesa totale (somma dei pagamenti incassati) che soddisfa {@code confronto}: insieme calcolato una volta. */
    static String pazientiConSpesa(String confronto) {
        return "COALESCE(c.paziente_id IN (SELECT g.paziente_id FROM pagamenti g WHERE g.stato = 'PAGATO' "
                + "GROUP BY g.paziente_id HAVING SUM(g.importo) " + confronto + "), FALSE)";
    }

    static final String NUMERO_VISITE = "(SELECT COUNT(*) FROM visite v WHERE v.paziente_id = c.paziente_id AND "
            + VISITA_CONTA + ")";

    static final String INVII_INVIATI = "(SELECT COUNT(*) FROM mailing_invii i WHERE i.contatto_id = c.id "
            + "AND i.inviato_il IS NOT NULL)";

    static final Set<String> STATI = Set.of("ISCRITTO", "DISISCRITTO", "RIMBALZATO", "SEGNALATO_SPAM", "ARCHIVIATO");
    static final Set<String> TIPI = Set.of("PAZIENTE", "LEAD", "SENZA_SCHEDA");
    static final Set<String> STATI_PAZIENTE = Set.of("LEAD", "LISTA_ATTESA", "ATTIVO", "MANTENIMENTO", "CONCLUSO");
    static final Set<String> FONTI = Set.of("YOUTUBE", "INSTAGRAM", "MASTERCLASS", "LIBRO", "PASSAPAROLA", "SITO", "ALTRO");
    static final Set<String> ESITI = Set.of("INTERESSATO", "CI_PENSA", "ACQUISTATO", "NON_ADATTO");
    static final Set<String> TIPI_PERCORSO = Set.of("METODO_BUSSOLA", "RINNOVO", "MANTENIMENTO");
    static final Set<String> COINVOLGIMENTI = Set.of(ATTIVO, TIEPIDO, DORMIENTE, MAI);

    /** Campi ammessi: nome JSON, operatori, gruppo ed etichetta per il catalogo. */
    public enum Campo {
        TIPO("tipo", "Tipo di contatto", "Contatto", "SELECT", List.of("UGUALE"),
                "Paziente = ha iniziato un percorso; lead = in stato lead o lista d'attesa; senza scheda = indirizzo importato."),
        STATO("stato", "Stato iscrizione", "Contatto", "SELECT", List.of("UGUALE", "DIVERSO"), null),
        TAG("tag", "Tag", "Contatto", "SELECT", List.of("HA", "NON_HA"), null),
        CREATO_GIORNI("creatoGiorni", "Aggiunto da (giorni)", "Contatto", "NUMERO", List.of("MINORE", "MAGGIORE"),
                "Minore di 30 = aggiunto negli ultimi 30 giorni."),
        STATO_PAZIENTE("statoPaziente", "Stato del paziente", "Paziente", "MULTI_SELECT", List.of("IN", "NON_IN"), null),
        FONTE("fonte", "Fonte", "Paziente", "MULTI_SELECT", List.of("IN", "NON_IN"), "Da dove è arrivato il paziente."),
        ETA("eta", "Età", "Paziente", "INTERVALLO", List.of("TRA"), "Dalla data di nascita del paziente."),
        CITTA("citta", "Città", "Paziente", "MULTI_SELECT", List.of("IN"), "Città dell'anagrafica."),
        COMPLEANNO_MESE("compleannoMese", "Mese del compleanno", "Paziente", "MESE", List.of("UGUALE"), null),
        HA_CONOSCITIVA("haConoscitiva", "Ha fatto o prenotato la chiamata conoscitiva", "Conoscitiva", "NESSUNO",
                List.of("VERO", "FALSO"), "Chiamate annullate escluse."),
        ESITO_CONOSCITIVA("esitoConoscitiva", "Esito della chiamata conoscitiva", "Conoscitiva", "MULTI_SELECT",
                List.of("IN", "NON_IN"), "Esito di una qualsiasi delle sue chiamate."),
        PERCORSO_ACQUISTATO("percorsoAcquistato", "Percorso acquistato", "Percorsi", "MULTI_SELECT",
                List.of("IN", "NON_IN"), "Percorsi annullati esclusi."),
        PERCORSO_ATTIVO("percorsoAttivo", "Ha un percorso attivo", "Percorsi", "NESSUNO", List.of("VERO", "FALSO"), null),
        FINE_PERCORSO_GIORNI("finePercorsoGiorni", "Giorni alla fine del percorso attivo", "Percorsi", "NUMERO",
                List.of("MINORE", "MAGGIORE"), "Minore di 30 = il percorso attivo finisce entro 30 giorni."),
        SPESA_TOTALE("spesaTotale", "Spesa totale (€)", "Percorsi", "NUMERO", List.of("MAGGIORE", "MINORE"),
                "Somma dei pagamenti incassati."),
        NUMERO_VISITE("numeroVisite", "Visite effettuate", "Visite", "NUMERO", List.of("MAGGIORE", "MINORE", "UGUALE"),
                "Chiamata conoscitiva esclusa."),
        ULTIMA_VISITA_GIORNI("ultimaVisitaGiorni", "Giorni dall'ultima visita", "Visite", "NUMERO",
                List.of("MAGGIORE", "MINORE"), "Solo visite effettuate. Chi non ha visite non rientra."),
        HA_VISITA_FUTURA("haVisitaFutura", "Ha una visita in programma", "Visite", "NESSUNO", List.of("VERO", "FALSO"), null),
        PRIMA_VISITA_GIORNI("primaVisitaGiorni", "Giorni dalla prima visita", "Visite", "NUMERO",
                List.of("MAGGIORE", "MINORE"), "Dalla prima visita effettuata."),
        APERTURA_CAMPAGNA("aperturaCampagna", "Ha aperto la campagna", "Email", "SELECT", List.of("HA", "NON_HA"),
                "Aperture automatiche (proxy, antivirus) escluse."),
        CLICK_CAMPAGNA("clickCampagna", "Ha cliccato la campagna", "Email", "SELECT", List.of("HA", "NON_HA"), null),
        COINVOLGIMENTO("coinvolgimento", "Coinvolgimento", "Email", "SELECT", List.of("UGUALE"),
                "Attivo: aperto negli ultimi 30 giorni. Dormiente: nessuna apertura da 90 giorni. Mai: mai aperto su almeno 3 email."),
        PUNTEGGIO("punteggio", "Punteggio", "Email", "NUMERO", List.of("MAGGIORE", "MINORE"), "Da 0 a 100."),
        CATEGORIA_ESCLUSA("categoriaEsclusa", "Ha escluso la categoria", "Email", "SELECT", List.of("HA", "NON_HA"),
                "Dal centro preferenze.");

        public final String chiave;
        public final String etichetta;
        public final String gruppo;
        public final String tipoValore;
        public final List<String> operatori;
        public final String aiuto;

        Campo(String chiave, String etichetta, String gruppo, String tipoValore, List<String> operatori, String aiuto) {
            this.chiave = chiave;
            this.etichetta = etichetta;
            this.gruppo = gruppo;
            this.tipoValore = tipoValore;
            this.operatori = operatori;
            this.aiuto = aiuto;
        }

        static Campo daChiave(String chiave) {
            for (Campo c : values()) {
                if (c.chiave.equals(chiave)) {
                    return c;
                }
            }
            return null;
        }
    }

    /** Dati esterni alle regole: l'istante di valutazione (ora di Roma). */
    public record Contesto(LocalDateTime adesso) {
        public Contesto {
            adesso = adesso == null ? MailingTempo.adesso() : adesso;
        }
    }

    /** Predicato SQL (su alias {@code c}) e i suoi parametri. */
    public record Frammento(String sql, Map<String, Object> parametri) {
    }

    private final Contesto contesto;
    private final String prefisso;
    private final Map<String, Object> parametri = new LinkedHashMap<>();
    private int contatore;
    private int condizioni;

    private MailingSegmentiSql(Contesto contesto, String prefisso) {
        this.contesto = contesto == null ? new Contesto(null) : contesto;
        this.prefisso = prefisso == null || prefisso.isBlank() ? "p" : prefisso;
        if (!this.prefisso.matches("[a-z][a-z0-9_]{0,20}")) {
            throw new IllegalArgumentException("Prefisso parametri non valido: " + prefisso);
        }
    }

    /** Compila le regole; {@code prefisso} distingue i parametri quando più frammenti finiscono nella stessa query. */
    public static Frammento compila(JsonNode regole, Contesto contesto, String prefisso) {
        MailingSegmentiSql c = new MailingSegmentiSql(contesto, prefisso);
        String sql = c.gruppo(regole, 1);
        return new Frammento(sql, c.parametri);
    }

    public static Frammento compila(JsonNode regole, Contesto contesto) {
        return compila(regole, contesto, "p");
    }

    /** Solo validazione (400 se non valide). */
    public static void valida(JsonNode regole) {
        compila(regole, new Contesto(null), "p");
    }

    // ───────────────────────── Gruppi ─────────────────────────

    private String gruppo(JsonNode nodo, int profondita) {
        if (nodo == null || nodo.isNull() || nodo.isMissingNode()) {
            return "TRUE";
        }
        if (!nodo.isObject()) {
            throw errore("Le regole devono essere un gruppo {operatore, condizioni}.");
        }
        if (profondita > PROFONDITA_MAX) {
            throw errore("Troppi gruppi annidati: al massimo " + PROFONDITA_MAX + " livelli.");
        }
        String operatore = testoOpzionale(nodo.get("operatore"));
        String congiunzione;
        if (operatore == null || "E".equals(operatore)) {
            congiunzione = " AND ";
        } else if ("O".equals(operatore)) {
            congiunzione = " OR ";
        } else {
            throw errore("Operatore di gruppo non valido: usa E oppure O.");
        }
        JsonNode lista = nodo.get("condizioni");
        if (lista == null || lista.isNull() || (lista.isArray() && lista.isEmpty())) {
            return "TRUE";
        }
        if (!lista.isArray()) {
            throw errore("\"condizioni\" deve essere un elenco.");
        }
        List<String> parti = new ArrayList<>();
        for (JsonNode figlio : lista) {
            if (figlio != null && figlio.isObject() && figlio.has("condizioni")) {
                parti.add(gruppo(figlio, profondita + 1));
            } else {
                parti.add(condizione(figlio));
            }
        }
        return "(" + String.join(congiunzione, parti) + ")";
    }

    // ───────────────────────── Condizioni ─────────────────────────

    private String condizione(JsonNode nodo) {
        if (nodo == null || !nodo.isObject()) {
            throw errore("Ogni condizione deve avere campo, op e valore.");
        }
        if (++condizioni > CONDIZIONI_MAX) {
            throw errore("Troppe condizioni: al massimo " + CONDIZIONI_MAX + ".");
        }
        String chiave = testoOpzionale(nodo.get("campo"));
        Campo campo = chiave == null ? null : Campo.daChiave(chiave);
        if (campo == null) {
            throw errore("Campo non ammesso nei segmenti: " + (chiave == null ? "(vuoto)" : abbrevia(chiave)) + ".");
        }
        String op = testoOpzionale(nodo.get("op"));
        if (op == null || !campo.operatori.contains(op)) {
            throw errore("Operatore non ammesso per \"" + campo.etichetta + "\": " + (op == null ? "(vuoto)" : abbrevia(op))
                    + ". Ammessi: " + String.join(", ", campo.operatori) + ".");
        }
        JsonNode valore = nodo.get("valore");
        LocalDateTime adesso = contesto.adesso();
        LocalDate oggi = adesso.toLocalDate();
        return switch (campo) {
            case TIPO -> tipo(scelta(valore, TIPI, campo));
            case STATO -> "c.stato " + ("UGUALE".equals(op) ? "=" : "<>") + " " + param(scelta(valore, STATI, campo));
            case TAG -> esiste(op.equals("HA"),
                    "SELECT 1 FROM mailing_contatti_tag ct WHERE ct.contatto_id = c.id AND ct.tag_id = " + param(id(valore, campo)));
            case CREATO_GIORNI -> {
                LocalDateTime soglia = adesso.minusDays(intero(valore, 0, 36500, campo));
                yield "MINORE".equals(op) ? "c.creato_il >= " + param(soglia) : "c.creato_il < " + param(soglia);
            }
            case STATO_PAZIENTE -> (op.equals("IN") ? "" : "NOT ") + "COALESCE(c.paziente_id IN (SELECT p.id FROM pazienti p "
                    + "WHERE p.stato IN (" + param(scelte(valore, STATI_PAZIENTE, campo)) + ")), FALSE)";
            case FONTE -> (op.equals("IN") ? "" : "NOT ") + "COALESCE(c.paziente_id IN (SELECT p.id FROM pazienti p "
                    + "WHERE p.fonte IN (" + param(scelte(valore, FONTI, campo)) + ")), FALSE)";
            case ETA -> {
                int[] intervallo = intervallo(valore, campo);
                // età compiuta tra min e max ⇔ nato tra (oggi - max - 1 anni, oggi - min anni]
                LocalDate natoDopo = oggi.minusYears(intervallo[1] + 1L);
                LocalDate natoEntro = oggi.minusYears(intervallo[0]);
                yield "EXISTS (SELECT 1 FROM pazienti p WHERE p.id = c.paziente_id AND p.data_nascita > "
                        + param(natoDopo) + " AND p.data_nascita <= " + param(natoEntro) + ")";
            }
            case CITTA -> "EXISTS (SELECT 1 FROM pazienti p WHERE p.id = c.paziente_id AND "
                    + "LOWER(TRIM(p.citta)) IN (" + param(testiMinuscoli(valore, campo)) + "))";
            case COMPLEANNO_MESE -> "EXISTS (SELECT 1 FROM pazienti p WHERE p.id = c.paziente_id AND "
                    + "EXTRACT(MONTH FROM p.data_nascita) = " + param(mese(valore, oggi, campo)) + ")";
            case HA_CONOSCITIVA -> esiste("VERO".equals(op), "SELECT 1 FROM visite v WHERE v.paziente_id = c.paziente_id "
                    + "AND v.tipo = 'CHIAMATA_CONOSCITIVA' AND v.stato <> 'ANNULLATA'");
            case ESITO_CONOSCITIVA -> esiste(op.equals("IN"), "SELECT 1 FROM prenotazioni pr WHERE pr.paziente_id = c.paziente_id "
                    + "AND pr.esito IN (" + param(scelte(valore, ESITI, campo)) + ")");
            case PERCORSO_ACQUISTATO -> esiste(op.equals("IN"), "SELECT 1 FROM percorsi pc WHERE pc.paziente_id = c.paziente_id "
                    + "AND pc.stato <> 'ANNULLATO' AND pc.tipo IN (" + param(scelte(valore, TIPI_PERCORSO, campo)) + ")");
            case PERCORSO_ATTIVO -> esiste("VERO".equals(op), "SELECT 1 FROM percorsi pc WHERE pc.paziente_id = c.paziente_id "
                    + "AND pc.stato = 'ATTIVO'");
            case FINE_PERCORSO_GIORNI -> {
                LocalDate soglia = oggi.plusDays(intero(valore, 0, 36500, campo));
                yield "EXISTS (SELECT 1 FROM percorsi pc WHERE pc.paziente_id = c.paziente_id AND pc.stato = 'ATTIVO' "
                        + "AND pc.data_fine >= " + param(oggi) + " AND pc.data_fine " + ("MINORE".equals(op) ? "<= " : "> ")
                        + param(soglia) + ")";
            }
            case NUMERO_VISITE -> NUMERO_VISITE + " " + confronto(op) + " " + param(intero(valore, 0, 100000, campo));
            case ULTIMA_VISITA_GIORNI -> dataVisitaEffettuata("MAX", op, oggi.minusDays(intero(valore, 0, 36500, campo)));
            case PRIMA_VISITA_GIORNI -> dataVisitaEffettuata("MIN", op, oggi.minusDays(intero(valore, 0, 36500, campo)));
            case HA_VISITA_FUTURA -> esiste("VERO".equals(op),
                    "SELECT 1 FROM visite v WHERE v.paziente_id = c.paziente_id AND v.stato = 'PROGRAMMATA' "
                            + "AND v.inizio >= " + param(adesso));
            // MAGGIORE di v (v ≥ 0): solo chi ha pagato; MINORE di v: anche chi non ha mai pagato (spesa 0).
            case SPESA_TOTALE -> "MAGGIORE".equals(op)
                    ? pazientiConSpesa("> " + param(decimale(valore, campo)))
                    : "NOT " + pazientiConSpesa(">= " + param(decimale(valore, campo)));
            case APERTURA_CAMPAGNA -> esiste(op.equals("HA"), eventoUmano("APERTURA", id(valore, campo)));
            case CLICK_CAMPAGNA -> esiste(op.equals("HA"), eventoUmano("CLICK", id(valore, campo)));
            case COINVOLGIMENTO -> coinvolgimentoSql(adesso) + " = " + param(scelta(valore, COINVOLGIMENTI, campo));
            case PUNTEGGIO -> "c.punteggio " + confronto(op) + " " + param(intero(valore, 0, 100, campo));
            case CATEGORIA_ESCLUSA -> esiste(op.equals("HA"),
                    "SELECT 1 FROM mailing_contatti_categorie_escluse ce WHERE ce.contatto_id = c.id AND ce.categoria_id = "
                            + param(id(valore, campo)));
        };
    }

    private String tipo(String tipo) {
        return switch (tipo) {
            case "PAZIENTE" -> "COALESCE(c.paziente_id IN (SELECT p.id FROM pazienti p WHERE p.stato IN "
                    + "('ATTIVO', 'MANTENIMENTO', 'CONCLUSO')), FALSE)";
            case "LEAD" -> "COALESCE(c.paziente_id IN (SELECT p.id FROM pazienti p WHERE p.stato IN ('LEAD', 'LISTA_ATTESA')), FALSE)";
            default -> "c.paziente_id IS NULL";
        };
    }

    /** MAGGIORE di N giorni = la data (ultima o prima visita effettuata) è precedente a oggi-N. */
    private String dataVisitaEffettuata(String aggregato, String op, LocalDate soglia) {
        String data = "(SELECT " + aggregato + "(CAST(v.inizio AS DATE)) FROM visite v WHERE v.paziente_id = c.paziente_id AND "
                + VISITA_CONTA + ")";
        return data + ("MAGGIORE".equals(op) ? " < " : " > ") + param(soglia);
    }

    private String eventoUmano(String tipo, long campagnaId) {
        return "SELECT 1 FROM mailing_eventi e WHERE e.contatto_id = c.id AND e.tipo = '" + tipo
                + "' AND e.automatico = FALSE AND e.campagna_id = " + param(campagnaId);
    }

    /** Stessa regola di {@link #coinvolgimento(LocalDateTime, long, LocalDateTime)}, in SQL. */
    private String coinvolgimentoSql(LocalDateTime adesso) {
        return "(CASE WHEN c.ultima_apertura_il >= " + param(adesso.minusDays(GIORNI_ATTIVO)) + " THEN '" + ATTIVO + "'"
                + " WHEN c.ultima_apertura_il IS NULL THEN CASE WHEN " + INVII_INVIATI + " >= " + INVII_PER_MAI
                + " THEN '" + MAI + "' ELSE '" + TIEPIDO + "' END"
                + " WHEN c.ultima_apertura_il < " + param(adesso.minusDays(GIORNI_DORMIENTE)) + " THEN '" + DORMIENTE + "'"
                + " ELSE '" + TIEPIDO + "' END)";
    }

    /**
     * Coinvolgimento di un contatto: ATTIVO se ha aperto negli ultimi 30 giorni; MAI se non ha mai aperto avendo
     * ricevuto almeno 3 email; DORMIENTE se ha aperto in passato ma non negli ultimi 90 giorni; altrimenti TIEPIDO
     * (aperto tra 30 e 90 giorni fa, oppure troppo poche email per giudicare).
     */
    public static String coinvolgimento(LocalDateTime ultimaApertura, long inviati, LocalDateTime adesso) {
        LocalDateTime ora = adesso == null ? MailingTempo.adesso() : adesso;
        if (ultimaApertura == null) {
            return inviati >= INVII_PER_MAI ? MAI : TIEPIDO;
        }
        if (!ultimaApertura.isBefore(ora.minusDays(GIORNI_ATTIVO))) {
            return ATTIVO;
        }
        if (ultimaApertura.isBefore(ora.minusDays(GIORNI_DORMIENTE))) {
            return DORMIENTE;
        }
        return TIEPIDO;
    }

    // ───────────────────────── Valori ─────────────────────────

    private static String esiste(boolean positivo, String sottoquery) {
        return (positivo ? "EXISTS (" : "NOT EXISTS (") + sottoquery + ")";
    }

    private static String confronto(String op) {
        return switch (op) {
            case "MAGGIORE" -> ">";
            case "MINORE" -> "<";
            case "UGUALE" -> "=";
            default -> throw errore("Operatore non valido: " + abbrevia(op));
        };
    }

    private String param(Object valore) {
        String nome = prefisso + (++contatore);
        parametri.put(nome, valore);
        return ":" + nome;
    }

    private static String scelta(JsonNode valore, Set<String> ammessi, Campo campo) {
        String v = valore != null && valore.isTextual() ? valore.asText().trim().toUpperCase(Locale.ROOT) : null;
        if (v == null || !ammessi.contains(v)) {
            List<String> ordinati = new ArrayList<>(ammessi);
            ordinati.sort(null);
            throw errore("Valore non valido per \"" + campo.etichetta + "\". Ammessi: " + String.join(", ", ordinati) + ".");
        }
        return v;
    }

    /** Elenco di valori di una whitelist (maiuscoli, senza doppioni). */
    private static List<String> scelte(JsonNode valore, Set<String> ammessi, Campo campo) {
        List<String> out = new ArrayList<>();
        for (JsonNode n : elenco(valore, campo)) {
            String v = scelta(n, ammessi, campo);
            if (!out.contains(v)) {
                out.add(v);
            }
        }
        return out;
    }

    private static long id(JsonNode valore, Campo campo) {
        Long id = numeroIntero(valore);
        if (id == null || id <= 0) {
            throw errore("Scegli un valore per \"" + campo.etichetta + "\".");
        }
        return id;
    }

    private static List<Long> ids(JsonNode valore, Campo campo) {
        List<Long> out = new ArrayList<>();
        for (JsonNode n : elenco(valore, campo)) {
            Long id = numeroIntero(n);
            if (id == null || id <= 0) {
                throw errore("Valore non valido per \"" + campo.etichetta + "\".");
            }
            if (!out.contains(id)) {
                out.add(id);
            }
        }
        return out;
    }

    private static int intero(JsonNode valore, int min, int max, Campo campo) {
        Long n = numeroIntero(valore);
        if (n == null || n < min || n > max) {
            throw errore("\"" + campo.etichetta + "\" vuole un numero intero tra " + min + " e " + max + ".");
        }
        return n.intValue();
    }

    private static BigDecimal decimale(JsonNode valore, Campo campo) {
        BigDecimal d = null;
        if (valore != null && valore.isNumber()) {
            d = valore.decimalValue();
        } else if (valore != null && valore.isTextual()) {
            try {
                d = new BigDecimal(valore.asText().trim().replace(',', '.'));
            } catch (NumberFormatException e) {
                d = null;
            }
        }
        if (d == null || d.signum() < 0 || d.compareTo(BigDecimal.valueOf(10_000_000)) > 0) {
            throw errore("\"" + campo.etichetta + "\" vuole un importo in euro non negativo.");
        }
        return d;
    }

    private static int[] intervallo(JsonNode valore, Campo campo) {
        if (valore == null || !valore.isArray() || valore.size() != 2) {
            throw errore("\"" + campo.etichetta + "\" vuole due numeri [minimo, massimo].");
        }
        int min = intero(valore.get(0), 0, 130, campo);
        int max = intero(valore.get(1), 0, 130, campo);
        if (min > max) {
            throw errore("\"" + campo.etichetta + "\": il minimo supera il massimo.");
        }
        return new int[]{min, max};
    }

    private static int mese(JsonNode valore, LocalDate oggi, Campo campo) {
        if (valore != null && valore.isTextual() && "CORRENTE".equalsIgnoreCase(valore.asText().trim())) {
            return oggi.getMonthValue();
        }
        Long n = numeroIntero(valore);
        if (n == null || n < 1 || n > 12) {
            throw errore("\"" + campo.etichetta + "\" vuole un mese da 1 a 12 oppure CORRENTE.");
        }
        return n.intValue();
    }

    private static String testo(JsonNode valore, Campo campo) {
        String t = valore != null && valore.isTextual() ? valore.asText().trim() : null;
        if (t == null || t.isEmpty() || t.length() > TESTO_MAX) {
            throw errore("\"" + campo.etichetta + "\" vuole un testo (massimo " + TESTO_MAX + " caratteri).");
        }
        return t;
    }

    private static List<String> testiMinuscoli(JsonNode valore, Campo campo) {
        List<String> grezzi = new ArrayList<>();
        if (valore != null && valore.isTextual()) {
            grezzi.addAll(Arrays.asList(valore.asText().split("[,;]")));
        } else {
            for (JsonNode n : elenco(valore, campo)) {
                if (!n.isTextual()) {
                    throw errore("Valore non valido per \"" + campo.etichetta + "\".");
                }
                grezzi.add(n.asText());
            }
        }
        List<String> out = new ArrayList<>();
        for (String g : grezzi) {
            String t = g.trim().toLowerCase(Locale.ROOT);
            if (t.isEmpty()) {
                continue;
            }
            if (t.length() > TESTO_MAX) {
                throw errore("Valore troppo lungo per \"" + campo.etichetta + "\".");
            }
            if (!out.contains(t)) {
                out.add(t);
            }
        }
        if (out.isEmpty()) {
            throw errore("Indica almeno un valore per \"" + campo.etichetta + "\".");
        }
        if (out.size() > VALORI_MAX) {
            throw errore("Troppi valori per \"" + campo.etichetta + "\" (massimo " + VALORI_MAX + ").");
        }
        return out;
    }

    /** Elenco non vuoto (un valore singolo vale come elenco di uno). */
    private static List<JsonNode> elenco(JsonNode valore, Campo campo) {
        List<JsonNode> out = new ArrayList<>();
        if (valore == null || valore.isNull() || valore.isMissingNode()) {
            throw errore("Indica almeno un valore per \"" + campo.etichetta + "\".");
        }
        if (valore.isArray()) {
            valore.forEach(out::add);
        } else {
            out.add(valore);
        }
        if (out.isEmpty()) {
            throw errore("Indica almeno un valore per \"" + campo.etichetta + "\".");
        }
        if (out.size() > VALORI_MAX) {
            throw errore("Troppi valori per \"" + campo.etichetta + "\" (massimo " + VALORI_MAX + ").");
        }
        return out;
    }

    private static Long numeroIntero(JsonNode valore) {
        if (valore == null) {
            return null;
        }
        if (valore.isIntegralNumber() && valore.canConvertToLong()) {
            return valore.asLong();
        }
        if (valore.isNumber()) {
            double d = valore.asDouble();
            return d == Math.rint(d) && Math.abs(d) < 1e15 ? (long) d : null;
        }
        if (valore.isTextual()) {
            String t = valore.asText().trim();
            if (t.matches("-?\\d{1,15}")) {
                return Long.parseLong(t);
            }
        }
        return null;
    }

    private static String testoOpzionale(JsonNode n) {
        return n != null && n.isTextual() && !n.asText().isBlank() ? n.asText().trim() : null;
    }

    static String escapeLike(String testo) {
        return testo.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private static String abbrevia(String s) {
        String t = s.replaceAll("[^\\p{L}\\p{N}_ -]", "");
        return t.length() > 40 ? t.substring(0, 40) + "…" : t;
    }

    static ResponseStatusException errore(String messaggio) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Regole del segmento non valide: " + messaggio);
    }
}
