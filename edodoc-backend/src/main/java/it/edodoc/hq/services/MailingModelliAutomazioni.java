package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import it.edodoc.hq.dto.MailingDto;

import java.util.ArrayList;
import java.util.List;

import static it.edodoc.hq.services.MailingDocumentoEmail.divisore;
import static it.edodoc.hq.services.MailingDocumentoEmail.intestazione;
import static it.edodoc.hq.services.MailingDocumentoEmail.piedipagina;
import static it.edodoc.hq.services.MailingDocumentoEmail.pulsante;
import static it.edodoc.hq.services.MailingDocumentoEmail.spazio;
import static it.edodoc.hq.services.MailingDocumentoEmail.testo;
import static it.edodoc.hq.services.MailingDocumentoEmail.titolo;

/**
 * Modelli pronti di automazione ("ricette"), con grafo ed email complete in formato documento a blocchi.
 * <p>
 * Nei modelli il nodo EMAIL ha {@code config = {"emailId": null, "emailIndice": i}}: {@code i} è la posizione
 * dell'email nell'elenco {@code email} del modello. Alla creazione da modello il backend crea le email e sostituisce
 * {@code emailIndice} con il vero {@code emailId}. Nascono in BOZZA: si rileggono e si attivano dalla pagina.
 * Testi del Dr. Edoardo Bo, in prima persona: caldi e diretti, senza promesse di risultato né indicazioni personali.
 */
public final class MailingModelliAutomazioni {

    private static final JsonNodeFactory F = JsonNodeFactory.instance;
    /** Passo verticale e scarto dei rami, come la griglia della tela (PASSO_Y = 184, PASSO_X / 2 = 156). */
    static final int PY = 184;
    static final int PX = 156;
    static final int Y0 = 184;

    public static final String SITO_PREDEFINITO = "https://edodoc.it";
    public static final String PRENOTA_PREDEFINITO = "https://edodoc.it/prenota";

    /** Link che i modelli citano. */
    public record Riferimenti(String urlSito, String urlPrenotazione) {
    }

    private MailingModelliAutomazioni() {
    }

    public static List<MailingDto.ModelloAutomazione> tutti(Riferimenti rif) {
        String sito = rif == null || rif.urlSito() == null ? SITO_PREDEFINITO : rif.urlSito();
        String prenota = rif == null || rif.urlPrenotazione() == null ? PRENOTA_PREDEFINITO : rif.urlPrenotazione();
        List<MailingDto.ModelloAutomazione> out = new ArrayList<>();
        out.add(benvenutoLead(prenota));
        out.add(primaDellaConoscitiva(sito));
        out.add(ciPensa(prenota));
        out.add(benvenutoPercorso());
        out.add(riattivazione(prenota));
        out.add(compleanno());
        return out;
    }

    public static MailingDto.ModelloAutomazione trova(String chiave, Riferimenti rif) {
        if (chiave == null) {
            return null;
        }
        return tutti(rif).stream().filter(m -> m.chiave().equalsIgnoreCase(chiave.trim())).findFirst().orElse(null);
    }

    /** Opzioni di default delle automazioni create da modello (rientro: solo il compleanno, ogni anno). */
    public static boolean rientroConsentito(String chiave) {
        return "compleanno".equals(chiave);
    }

    // ───────────────────────── (a) Benvenuto nuovo lead ─────────────────────────

    static MailingDto.ModelloAutomazione benvenutoLead(String prenota) {
        Grafo g = new Grafo();
        g.email("n_benv01", 0, 0, Y0);
        g.attesa("n_att201", 2, "GIORNI", 0, Y0 + PY);
        g.condizione("n_cond01", "haAperto", "n_benv01", 0, Y0 + 2 * PY);
        g.attesa("n_attsi1", 2, "GIORNI", -PX, Y0 + 3 * PY);
        g.email("n_riscr1", 1, PX, Y0 + 3 * PY);
        g.attesa("n_attno1", 3, "GIORNI", PX, Y0 + 4 * PY);
        g.email("n_invit1", 2, 0, Y0 + 5 * PY);
        g.fine("n_fine01", 0, Y0 + 6 * PY);
        g.arco("n_benv01", "n_att201", null);
        g.arco("n_att201", "n_cond01", null);
        g.arco("n_cond01", "n_attsi1", "SI");
        g.arco("n_cond01", "n_riscr1", "NO");
        g.arco("n_attsi1", "n_invit1", null);
        g.arco("n_riscr1", "n_attno1", null);
        g.arco("n_attno1", "n_invit1", null);
        g.arco("n_invit1", "n_fine01", null);

        String perche = "Ricevi questa email perché mi hai lasciato i tuoi contatti.";
        List<MailingDto.AutomazioneEmailInput> email = List.of(
                email("Benvenuto", "{{nome|Ciao}}, benvenuto", "Ti racconto come lavoro e cosa succede adesso",
                        List.of(
                                intestazione("Biologo nutrizionista e mental coach"),
                                titolo("{{nome|Ciao}}, piacere di conoscerti", 1),
                                testo("<p>sono Edoardo. Grazie per avermi lasciato i tuoi contatti: vuol dire che qualcosa nel "
                                        + "tuo rapporto con il cibo, con il peso o con l'energia di tutti i giorni ti sta a cuore.</p>"
                                        + "<p>Nei prossimi giorni ti scrivo qualche email breve: come lavoro, cosa cambia rispetto "
                                        + "alle diete che forse hai già provato e come capire, insieme, se un percorso fa per te.</p>"
                                        + "<p>Se vuoi raccontarmi da dove parti, rispondi pure a questa email: la leggo io.</p>"),
                                divisore(),
                                testo("<p><strong>Un'idea per oggi:</strong> prima di cambiare cosa mangi, osserva quando e "
                                        + "perché mangi. Annota per tre giorni i momenti in cui hai fame davvero e quelli in cui "
                                        + "mangi per stanchezza, noia o abitudine. È il primo passo di ogni percorso.</p>"),
                                firma(),
                                piedipagina(perche))),
                email("Ti riscrivo", "{{nome|Ciao}}, ti è sfuggita la mia email?", "Due righe per ricordarti che ci sono",
                        List.of(
                                intestazione(null),
                                titolo("Volevo solo sapere come stai", 2),
                                testo("<p>{{nome|Ciao}}, qualche giorno fa ti ho scritto: magari è finita tra le altre email, "
                                        + "succede a tutti.</p>"
                                        + "<p>Ti ricordo che il primo passo con me è una chiamata conoscitiva gratuita: mi racconti "
                                        + "la tua storia e i tuoi obiettivi, io ti spiego come lavoro, e decidiamo insieme se ha "
                                        + "senso iniziare. Nessun impegno.</p>"),
                                pulsante("Prenota la chiamata conoscitiva", prenota),
                                firma(),
                                piedipagina(perche))),
                email("Invito alla chiamata", "{{nome|Ciao}}, com'è fatta la chiamata conoscitiva",
                        "Cosa ci diciamo, quanto dura e come prepararti",
                        List.of(
                                intestazione(null),
                                titolo("La chiamata conoscitiva, in breve", 1),
                                testo("<p>{{nome|Ciao}}, tante persone mi chiedono cosa succede durante la chiamata. Eccola:</p>"
                                        + "<ul><li><strong>Ascolto:</strong> mi racconti abitudini, tentativi passati e cosa vorresti "
                                        + "cambiare.</li>"
                                        + "<li><strong>Chiarezza:</strong> ti spiego come funziona il Metodo Bussola, tempi e costi, "
                                        + "senza giri di parole.</li>"
                                        + "<li><strong>Decisione:</strong> se pensiamo entrambi che possa aiutarti, fissiamo la prima "
                                        + "visita. Se non è il momento, te lo dico con onestà.</li></ul>"
                                        + "<p>Dura una mezz'ora, online. Ti basta un posto tranquillo.</p>"),
                                pulsante("Scegli il giorno della chiamata", prenota),
                                firma(),
                                piedipagina(perche))));

        return new MailingDto.ModelloAutomazione("benvenuto-lead",
                "Benvenuto nuovo lead",
                "Accoglie chi lascia i contatti: benvenuto subito, poi un percorso diverso per chi ha aperto e per chi no, "
                        + "e un invito alla chiamata conoscitiva. Esce appena la prenota.",
                "benvenuto",
                trigger("NUOVO_LEAD"),
                g.json(),
                trigger("CONOSCITIVA_PRENOTATA"),
                email);
    }

    // ───────────────────────── (b) Prima della chiamata conoscitiva ─────────────────────────

    static MailingDto.ModelloAutomazione primaDellaConoscitiva(String sito) {
        Grafo g = new Grafo();
        g.email("n_conf01", 0, 0, Y0);
        g.fine("n_fine02", 0, Y0 + PY);
        g.arco("n_conf01", "n_fine02", null);

        List<MailingDto.AutomazioneEmailInput> email = List.of(
                email("Prepararsi alla chiamata", "{{nome|Ciao}}, ci sentiamo presto",
                        "Tre cose da pensare prima della chiamata",
                        List.of(
                                intestazione(null),
                                titolo("Ci sentiamo {{prossima_visita|presto}}", 1),
                                testo("<p>{{nome|Ciao}}, grazie per aver prenotato la chiamata conoscitiva. L'invito con il link "
                                        + "della videochiamata ti è arrivato nel calendario.</p>"
                                        + "<p>Per sfruttare al meglio il tempo, pensa a queste tre cose:</p>"
                                        + "<ul><li>cosa vorresti che fosse diverso tra sei mesi;</li>"
                                        + "<li>cosa hai già provato e perché, secondo te, non ha funzionato;</li>"
                                        + "<li>quanto tempo ed energia puoi dedicare a te in questo periodo.</li></ul>"
                                        + "<p>Se non riesci più a esserci, rispondi a questa email e troviamo un altro orario.</p>"),
                                pulsante("Conosci il mio metodo", sito),
                                firma(),
                                piedipagina("Ricevi questa email perché hai prenotato una chiamata conoscitiva."))));

        return new MailingDto.ModelloAutomazione("prima-della-conoscitiva",
                "Prima della chiamata conoscitiva",
                "Appena qualcuno prenota la chiamata conoscitiva gli manda tre domande per arrivarci preparato.",
                "chiamata",
                trigger("CONOSCITIVA_PRENOTATA"),
                g.json(),
                null,
                email);
    }

    // ───────────────────────── (c) Dopo la chiamata: "ci pensa" ─────────────────────────

    static MailingDto.ModelloAutomazione ciPensa(String prenota) {
        Grafo g = new Grafo();
        g.attesa("n_att101", 2, "GIORNI", 0, Y0);
        g.email("n_dubb01", 0, 0, Y0 + PY);
        g.attesa("n_att502", 5, "GIORNI", 0, Y0 + 2 * PY);
        g.email("n_stor01", 1, 0, Y0 + 3 * PY);
        g.fine("n_fine03", 0, Y0 + 4 * PY);
        g.arco("n_att101", "n_dubb01", null);
        g.arco("n_dubb01", "n_att502", null);
        g.arco("n_att502", "n_stor01", null);
        g.arco("n_stor01", "n_fine03", null);

        String perche = "Ricevi questa email perché abbiamo fatto una chiamata conoscitiva.";
        List<MailingDto.AutomazioneEmailInput> email = List.of(
                email("I dubbi più comuni", "{{nome|Ciao}}, i dubbi che sento più spesso",
                        "Le domande che quasi tutti si fanno prima di iniziare",
                        List.of(
                                intestazione(null),
                                titolo("È normale pensarci", 2),
                                testo("<p>{{nome|Ciao}}, grazie ancora per la chiacchierata. Prendersi del tempo prima di iniziare "
                                        + "un percorso è sensato, e i dubbi che sento più spesso sono questi:</p>"
                                        + "<ul><li><strong>\"Ci ho già provato tante volte.\"</strong> Proprio per questo lavoriamo "
                                        + "anche sulle abitudini e sulla testa, non solo sul piatto.</li>"
                                        + "<li><strong>\"Non ho tempo.\"</strong> Il piano si costruisce sulla tua settimana vera, "
                                        + "non su quella ideale.</li>"
                                        + "<li><strong>\"Ho paura di non farcela.\"</strong> Il check settimanale serve a questo: "
                                        + "non resti da solo tra una visita e l'altra.</li></ul>"
                                        + "<p>Se hai un dubbio diverso, rispondimi: ne parliamo.</p>"),
                                firma(),
                                piedipagina(perche))),
                email("Quando vuoi", "{{nome|Ciao}}, quando sarai pronto io ci sono",
                        "Nessuna fretta: ecco come riprendere da dove eravamo",
                        List.of(
                                intestazione(null),
                                titolo("Quando vuoi, ripartiamo da qui", 2),
                                testo("<p>{{nome|Ciao}}, non voglio riempirti la casella: questa è l'ultima email su questo tema.</p>"
                                        + "<p>Se e quando vorrai iniziare, rispondi a questa email oppure prenota un nuovo momento per "
                                        + "sentirci: ripartiamo da quello che mi hai già raccontato.</p>"),
                                pulsante("Risentiamoci", prenota),
                                firma(),
                                piedipagina(perche))));

        ObjectNode trig = F.objectNode();
        trig.put("tipo", "ESITO_CONOSCITIVA");
        trig.putObject("parametri").putArray("esito").add("CI_PENSA").add("INTERESSATO");
        return new MailingDto.ModelloAutomazione("ci-pensa",
                "Dopo la chiamata: ci pensa",
                "Quando segni l'esito \"ci pensa\" o \"interessato\", due giorni dopo risponde ai dubbi più comuni e una "
                        + "settimana dopo lascia la porta aperta. Esce appena acquista un percorso.",
                "chiamata",
                trig,
                g.json(),
                trigger("ACQUISTO"),
                email);
    }

    // ───────────────────────── (d) Benvenuto nel percorso ─────────────────────────

    static MailingDto.ModelloAutomazione benvenutoPercorso() {
        Grafo g = new Grafo();
        g.email("n_perc01", 0, 0, Y0);
        g.attesa("n_att301", 3, "GIORNI", 0, Y0 + PY);
        g.email("n_perc02", 1, 0, Y0 + 2 * PY);
        g.fine("n_fine04", 0, Y0 + 3 * PY);
        g.arco("n_perc01", "n_att301", null);
        g.arco("n_att301", "n_perc02", null);
        g.arco("n_perc02", "n_fine04", null);

        String perche = "Ricevi questa email perché hai iniziato un percorso con me.";
        List<MailingDto.AutomazioneEmailInput> email = List.of(
                email("Benvenuto nel percorso", "{{nome|Ciao}}, si comincia", "Grazie per la fiducia: ecco come procediamo",
                        List.of(
                                intestazione(null),
                                titolo("Benvenuto nel percorso", 1),
                                testo("<p>{{nome|Ciao}}, grazie per aver scelto di iniziare. È una decisione che prendo sul serio "
                                        + "quanto te.</p>"
                                        + "<p>Ecco i prossimi passi:</p>"
                                        + "<ul><li>alla prima visita costruiamo insieme il piano, partendo dalle tue abitudini;</li>"
                                        + "<li>nell'app trovi il piano, i corsi e il check settimanale;</li>"
                                        + "<li>tra una visita e l'altra il check mi dice come va, e ti rispondo.</li></ul>"
                                        + "<p>{{prossima_visita|La data della prima visita ti arriva nel calendario}}.</p>"),
                                firma(),
                                piedipagina(perche))),
                email("Come vivere le prime settimane", "{{nome|Ciao}}, tre consigli per le prime settimane",
                        "Quello che fa la differenza all'inizio",
                        List.of(
                                intestazione(null),
                                titolo("Le prime settimane", 2),
                                testo("<p>{{nome|Ciao}}, tre cose che vedo fare la differenza all'inizio:</p>"
                                        + "<ul><li><strong>Costanza prima della perfezione:</strong> una settimana \"buona\" vale più "
                                        + "di tre giorni perfetti e poi lo stop.</li>"
                                        + "<li><strong>Il check ogni settimana:</strong> anche quando va male, anzi soprattutto "
                                        + "allora.</li>"
                                        + "<li><strong>Guarda oltre la bilancia:</strong> sonno, energia, fame e umore contano quanto "
                                        + "il peso.</li></ul>"
                                        + "<p>Per qualsiasi dubbio rispondi a questa email.</p>"),
                                divisore(),
                                testo("<p style=\"font-size:14px\">Per sintomi nuovi o che ti preoccupano rivolgiti al tuo "
                                        + "medico.</p>"),
                                firma(),
                                piedipagina(perche))));

        return new MailingDto.ModelloAutomazione("benvenuto-percorso",
                "Benvenuto nel percorso",
                "Quando un paziente acquista un percorso lo accoglie con i prossimi passi e, tre giorni dopo, gli dà tre "
                        + "consigli per le prime settimane.",
                "acquisto",
                trigger("ACQUISTO"),
                g.json(),
                null,
                email);
    }

    // ───────────────────────── (e) Riattivazione ─────────────────────────

    static MailingDto.ModelloAutomazione riattivazione(String prenota) {
        Grafo g = new Grafo();
        g.email("n_ciao01", 0, 0, Y0);
        g.attesa("n_att501", 5, "GIORNI", 0, Y0 + PY);
        g.condizione("n_cond02", "haCliccato", "n_ciao01", 0, Y0 + 2 * PY);
        g.fine("n_finesi", -PX, Y0 + 3 * PY);
        g.email("n_seco01", 1, PX, Y0 + 3 * PY);
        g.attesa("n_att402", 4, "GIORNI", PX, Y0 + 4 * PY);
        ObjectNode task = g.nodo("n_task01", "NOTIFICA_STAFF", PX, Y0 + 5 * PY);
        task.withObjectProperty("config").put("testo", "Richiamare {{nome_completo}}: nessuna visita da 6 mesi");
        g.fine("n_fineno", PX, Y0 + 6 * PY);
        g.arco("n_ciao01", "n_att501", null);
        g.arco("n_att501", "n_cond02", null);
        g.arco("n_cond02", "n_finesi", "SI");
        g.arco("n_cond02", "n_seco01", "NO");
        g.arco("n_seco01", "n_att402", null);
        g.arco("n_att402", "n_task01", null);
        g.arco("n_task01", "n_fineno", null);

        String perche = "Ricevi questa email perché hai fatto un percorso con me.";
        List<MailingDto.AutomazioneEmailInput> email = List.of(
                email("Come stai?", "{{nome|Ciao}}, come stai?", "È un po' che non ci sentiamo",
                        List.of(
                                intestazione(null),
                                titolo("È un po' che non ci sentiamo", 2),
                                testo("<p>{{nome|Ciao}}, sono passati alcuni mesi dalla nostra ultima visita e mi è venuto da "
                                        + "chiederti come va.</p>"
                                        + "<p>Le abitudini che abbiamo costruito insieme reggono? Capita a tutti di perdere un po' "
                                        + "la rotta: una visita di controllo serve proprio a rimettere a fuoco gli obiettivi.</p>"),
                                pulsante("Fissiamo un controllo", prenota),
                                firma(),
                                piedipagina(perche))),
                email("Un pensiero", "{{nome|Ciao}}, ti lascio solo questo",
                        "Un consiglio pratico, senza impegno",
                        List.of(
                                intestazione(null),
                                titolo("Un consiglio, senza impegno", 2),
                                testo("<p>{{nome|Ciao}}, se in questo periodo fai fatica, riparti da una cosa sola: un pasto al "
                                        + "giorno fatto con calma, seduto, senza schermi. Sembra poco, ma riaccende l'attenzione su "
                                        + "fame e sazietà.</p>"
                                        + "<p>E se vuoi una mano, rispondimi: ci sentiamo.</p>"),
                                pulsante("Prenota quando vuoi", prenota),
                                firma(),
                                piedipagina(perche))));

        ObjectNode uscita = F.objectNode();
        uscita.put("tipo", "VISITA_PRENOTATA");
        uscita.putObject("parametri");
        return new MailingDto.ModelloAutomazione("riattivazione",
                "Riattivazione pazienti",
                "Scrive ai pazienti che superano i 180 giorni senza visite (da quando la attivi); chi non clicca riceve un "
                        + "secondo messaggio e nasce un task per richiamarlo. Esce appena prenota una visita.",
                "riattivazione",
                triggerInattivi(),
                g.json(),
                uscita,
                email);
    }

    // ───────────────────────── (f) Compleanno ─────────────────────────

    static MailingDto.ModelloAutomazione compleanno() {
        Grafo g = new Grafo();
        g.email("n_augu01", 0, 0, Y0);
        g.fine("n_fine05", 0, Y0 + PY);
        g.arco("n_augu01", "n_fine05", null);

        List<MailingDto.AutomazioneEmailInput> email = List.of(
                email("Auguri di compleanno", "Buon compleanno, {{nome|da Edoardo}}!", "Un pensiero per te",
                        List.of(
                                intestazione(null),
                                titolo("Buon compleanno, {{nome|da Edoardo}}!", 1),
                                testo("<p>Oggi è il tuo giorno e ti mando un augurio sincero.</p>"
                                        + "<p>Che sia un anno pieno di energia e di momenti per prenderti cura di te, a tavola e "
                                        + "fuori. Festeggia senza sensi di colpa: anche questo fa parte di un buon rapporto con il "
                                        + "cibo.</p>"),
                                spazio(8),
                                testo("<p style=\"text-align:center\">Un abbraccio,<br><strong>Edoardo</strong></p>"),
                                piedipagina("Ricevi questa email perché sei un mio paziente."))));

        return new MailingDto.ModelloAutomazione("compleanno",
                "Auguri di compleanno",
                "Il giorno del compleanno manda gli auguri. Si ripete ogni anno.",
                "compleanno",
                triggerConParametro("COMPLEANNO", "giorniPrima", 0),
                g.json(),
                null,
                email);
    }

    // ───────────────────────── Supporto ─────────────────────────

    private static ObjectNode firma() {
        return testo("<p>A presto,<br><strong>Edoardo</strong></p>");
    }

    private static MailingDto.AutomazioneEmailInput email(String nome, String oggetto, String preheader,
                                                          List<ObjectNode> blocchi) {
        ObjectNode doc = MailingDocumentoEmail.documento(blocchi);
        return new MailingDto.AutomazioneEmailInput(nome, oggetto, preheader, doc, MailingDocumentoEmail.render(doc));
    }

    private static ObjectNode trigger(String tipo) {
        ObjectNode t = F.objectNode();
        t.put("tipo", tipo);
        t.putObject("parametri");
        return t;
    }

    /** 180 giorni; i già inattivi all'attivazione restano fuori (entra solo chi supera la soglia da lì in poi). */
    private static ObjectNode triggerInattivi() {
        ObjectNode t = F.objectNode();
        t.put("tipo", "INATTIVO_DA_GIORNI");
        t.putObject("parametri").put("giorni", 180).put("includiGiaInattivi", false);
        return t;
    }

    private static ObjectNode triggerConParametro(String tipo, String chiave, int valore) {
        ObjectNode t = F.objectNode();
        t.put("tipo", tipo);
        t.putObject("parametri").put(chiave, valore);
        return t;
    }

    /** Costruttore compatto del JSON del grafo. */
    static final class Grafo {
        private final ObjectNode root = F.objectNode();
        private final ArrayNode nodi = root.putArray("nodi");
        private final ArrayNode archi = root.putArray("archi");

        ObjectNode nodo(String id, String tipo, int x, int y) {
            ObjectNode n = nodi.addObject();
            n.put("id", id);
            n.put("tipo", tipo);
            n.putObject("config");
            n.put("x", x);
            n.put("y", y);
            return n;
        }

        void email(String id, int indice, int x, int y) {
            ObjectNode c = nodo(id, "EMAIL", x, y).withObjectProperty("config");
            c.putNull("emailId");
            c.put("emailIndice", indice);
        }

        void attesa(String id, int quantita, String unita, int x, int y) {
            nodo(id, "ATTESA", x, y).withObjectProperty("config").put("quantita", quantita).put("unita", unita);
        }

        void condizione(String id, String chiave, String nodoEmail, int x, int y) {
            nodo(id, "CONDIZIONE", x, y).withObjectProperty("config").put(chiave, nodoEmail);
        }

        void fine(String id, int x, int y) {
            nodo(id, "FINE", x, y);
        }

        void arco(String da, String a, String ramo) {
            ObjectNode arco = archi.addObject();
            arco.put("da", da);
            arco.put("a", a);
            if (ramo == null) {
                arco.putNull("ramo");
            } else {
                arco.put("ramo", ramo);
            }
        }

        JsonNode json() {
            return root;
        }
    }
}
