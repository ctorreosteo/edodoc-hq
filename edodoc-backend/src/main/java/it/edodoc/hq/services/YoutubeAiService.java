package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import it.edodoc.hq.ai.AiClient;
import it.edodoc.hq.dto.YoutubeDto;
import it.edodoc.hq.exception.GoogleRifiutoException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * AI della pagina YouTube: pacchetto di lancio di un video (titoli, descrizione, tag, hook, testi miniatura),
 * analisi strategica del canale a partire dai numeri Analytics e bozza di risposta ai commenti.
 * Al provider AI vanno solo dati del canale (pubblici o aggregati), nessun dato dei pazienti; nulla viene salvato.
 * Per ora gli errori dell'AI escono come {@link GoogleRifiutoException} (502 con il testo per il dottore): è l'unica
 * eccezione con stato del gestionale, il nome è quello di Google ma il frontend mostra solo il messaggio.
 */
@Service
public class YoutubeAiService {

    private static final String CONTESTO = """
            Lavori per il canale YouTube del Dr. Edoardo Bo, biologo nutrizionista e mental coach italiano: video su
            alimentazione, rapporto con il cibo, abitudini, motivazione e mentalità. Il pubblico sono persone che vogliono
            mangiare meglio, gestire peso, fame nervosa ed energia, e cercano spiegazioni chiare e basate sulle evidenze.
            Regole di comunicazione sanitaria: niente promesse di risultati (chili persi, tempi garantiti, "guarigioni"),
            niente diagnosi né diete personalizzate in un video o in un commento, niente prima/dopo, niente integratori
            o prodotti miracolosi, niente allarmismi sul cibo, nessun confronto denigratorio con altre professioni
            (medici, dietologi, psicologi); il mental coaching non è psicoterapia. Tono competente, umano, diretto,
            in prima persona singolare (parla Edoardo). Scrivi in italiano.
            """;

    private static final String SYSTEM_PACCHETTO = CONTESTO + """
            Sei uno stratega YouTube di livello mondiale (packaging, CTR, retention). Prepari il lancio di un video.
            Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo:
            {"titoli": ["..."], "descrizione": "...", "tag": ["..."], "hook": ["..."], "testiMiniatura": ["..."],
             "capitoli": ["00:00 ..."], "consiglio": "..."}
            - titoli: 6 titoli diversi tra loro per angolo (curiosità, problema, beneficio, errore comune, numero, domanda),
              massimo 70 caratteri, niente clickbait ingannevole, parola chiave principale nei primi 40 caratteri.
            - descrizione: 2 righe iniziali forti con la parola chiave (sono quelle visibili), poi il contenuto in breve,
              poi una riga per prenotare la chiamata conoscitiva gratuita con il segnaposto [link prenotazione],
              poi 3-5 hashtag.
            - tag: 12-18 tag di ricerca reali in italiano, dal più specifico al più generico.
            - hook: 3 aperture parlate per i primi 15 secondi, ognuna in 1-2 frasi.
            - testiMiniatura: 4 testi da 2-4 parole, grandi e leggibili, che completano il titolo senza ripeterlo.
            - capitoli: solo se il materiale lo permette, altrimenti lista vuota.
            - consiglio: una frase sulla cosa più importante per far funzionare questo video.
            Per uno Short: titoli sotto i 50 caratteri, descrizione di 2-3 righe, hook da 1 frase, capitoli vuoti.
            """;

    private static final String SYSTEM_ANALISI = CONTESTO + """
            Sei il consulente YouTube del canale. Ricevi i numeri del periodo scelto (con il periodo precedente),
            i video migliori, le fonti di traffico, le ricerche e il pubblico. Analizza come farebbe il miglior
            consulente al mondo: concreto, numerico, senza frasi generiche.
            Rispondi SOLO con un oggetto JSON valido:
            {"voto": "A|B|C|D", "sintesi": "...", "puntiForza": ["..."], "criticita": ["..."],
             "azioni": [{"titolo": "...", "dettaglio": "...", "impatto": "ALTO|MEDIO|BASSO"}], "ideeVideo": ["..."]}
            - voto: salute del canale nel periodo.
            - sintesi: 2-3 frasi con i numeri chiave e la tendenza.
            - puntiForza e criticita: 3-4 ciascuno, ognuno con un numero a sostegno.
            - azioni: 5 azioni per le prossime 2 settimane, in ordine di impatto.
            - ideeVideo: 6 titoli di video da fare, ispirati alle ricerche e ai video che funzionano.
            Non inventare numeri che non sono nei dati.
            """;

    private static final String SYSTEM_RISPOSTA = CONTESTO + """
            Scrivi la risposta di Edoardo a un commento su YouTube: breve (1-3 frasi), calorosa, utile, in prima persona
            singolare. Se il commento descrive un problema di salute o chiede una dieta, non fare diagnosi né dare
            schemi alimentari o dosi: dai un'indicazione generale e invita a rivolgersi a un professionista (anche al
            medico, se ci sono sintomi). Se parla di disturbi alimentari o di un forte disagio, rispondi con delicatezza
            e suggerisci un aiuto specialistico. Se è una critica, rispondi con garbo.
            Niente hashtag, al massimo un'emoji se il tono lo permette.
            Rispondi SOLO con un oggetto JSON valido: {"testo": "..."}
            """;

    private final AiClient aiClient;
    private final YoutubeStudioService studio;
    private final ObjectMapper objectMapper;

    public YoutubeAiService(AiClient aiClient, YoutubeStudioService studio, ObjectMapper objectMapper) {
        this.aiClient = aiClient;
        this.studio = studio;
        this.objectMapper = objectMapper;
    }

    public YoutubeDto.AiPacchetto pacchetto(YoutubeDto.AiPacchettoRequest req) {
        StringBuilder user = new StringBuilder();
        String formato = req.formato() != null && req.formato().equalsIgnoreCase("SHORT") ? "Short" : "video lungo";
        if (req.videoId() != null && !req.videoId().isBlank()) {
            YoutubeDto.VideoDettaglio v = studio.dettaglioVideo(req.videoId(), null, null);
            formato = v.video().breve() ? "Short" : "video lungo";
            user.append("VIDEO GIÀ PUBBLICATO DA RIOTTIMIZZARE\nTitolo attuale: ").append(v.video().titolo())
                    .append("\nDescrizione attuale:\n").append(tronca(v.descrizione(), 4000))
                    .append("\nTag attuali: ").append(String.join(", ", v.tag()))
                    .append("\nDurata: ").append(v.video().durataSec()).append(" s")
                    .append("\nVisualizzazioni: ").append(v.video().visualizzazioni());
            if (v.totali() != null) {
                user.append("\nPercentuale media vista: ").append(Math.round(v.totali().percentualeMedia())).append('%');
            }
            if (!v.ricerche().isEmpty()) {
                user.append("\nRicerche che portano al video: ")
                        .append(String.join(", ", v.ricerche().stream().limit(15).map(YoutubeDto.Voce::etichetta).toList()));
            }
            user.append('\n');
        }
        if (req.argomento() != null && !req.argomento().isBlank()) {
            user.append("ARGOMENTO: ").append(tronca(req.argomento().trim(), 2000)).append('\n');
        }
        if (req.note() != null && !req.note().isBlank()) {
            user.append("MATERIALE / NOTE / SCALETTA:\n").append(tronca(req.note().trim(), 12000)).append('\n');
        }
        if (user.isEmpty()) {
            throw new IllegalArgumentException("Scrivi l'argomento del video o scegli un video pubblicato");
        }
        user.append("FORMATO: ").append(formato);
        JsonNode j = json(aiClient.generateContent(SYSTEM_PACCHETTO, user.toString(), 3000));
        return new YoutubeDto.AiPacchetto(lista(j.path("titoli")), j.path("descrizione").asText(""), lista(j.path("tag")),
                lista(j.path("hook")), lista(j.path("testiMiniatura")), lista(j.path("capitoli")), j.path("consiglio").asText(""));
    }

    public YoutubeDto.AiAnalisi analisi(YoutubeDto.AiAnalisiRequest req) {
        YoutubeDto.Panoramica p = studio.panoramica(req.dal(), req.al());
        List<YoutubeDto.Video> video = studio.video(p.dal(), p.al());
        YoutubeDto.Pubblico pub = studio.pubblico(p.dal(), p.al());

        StringBuilder u = new StringBuilder();
        u.append("PERIODO: ").append(p.dal()).append(" → ").append(p.al()).append('\n');
        u.append("ATTUALE: ").append(totali(p.corrente())).append('\n');
        u.append("PRECEDENTE: ").append(totali(p.precedente())).append('\n');
        if (!p.tipiContenuto().isEmpty()) {
            u.append("PER FORMATO: ").append(voci(p.tipiContenuto(), 5)).append('\n');
        }
        u.append("\nVIDEO MIGLIORI NEL PERIODO (visualizzazioni, % media vista, iscritti):\n");
        video.stream().filter(v -> v.periodoVisualizzazioni() != null)
                .sorted(Comparator.comparing(YoutubeDto.Video::periodoVisualizzazioni).reversed())
                .limit(12)
                .forEach(v -> u.append("- ").append(v.titolo()).append(v.breve() ? " [Short]" : "")
                        .append(" | ").append(v.periodoVisualizzazioni())
                        .append(" | ").append(v.periodoPercentualeMedia() == null ? "-" : Math.round(v.periodoPercentualeMedia()) + "%")
                        .append(" | +").append(v.periodoIscritti() == null ? 0 : v.periodoIscritti())
                        .append(" | pubblicato ").append(v.pubblicatoIl() == null ? "?" : v.pubblicatoIl().substring(0, 10)).append('\n'));
        long pubblicati = video.stream().filter(v -> v.pubblicatoIl() != null && v.pubblicatoIl().substring(0, 10).compareTo(p.dal()) >= 0).count();
        u.append("Video pubblicati nel periodo: ").append(pubblicati).append(" su ").append(video.size()).append(" totali\n");
        u.append("\nFONTI DI TRAFFICO: ").append(voci(pub.fonti(), 8)).append('\n');
        u.append("RICERCHE YOUTUBE: ").append(voci(pub.ricerche(), 20)).append('\n');
        u.append("DISPOSITIVI: ").append(voci(pub.dispositivi(), 5)).append('\n');
        u.append("ISCRITTI VS NON ISCRITTI: ").append(voci(pub.iscrizione(), 2)).append('\n');
        u.append("ETÀ/GENERE (%): ");
        pub.demografia().forEach(d -> u.append(d.fascia()).append(" M").append(Math.round(d.maschi()))
                .append(" F").append(Math.round(d.femmine())).append("; "));
        u.append('\n');

        JsonNode j = json(aiClient.generateContent(SYSTEM_ANALISI, u.toString(), 3500));
        List<YoutubeDto.AzioneAi> azioni = new ArrayList<>();
        j.path("azioni").forEach(a -> azioni.add(new YoutubeDto.AzioneAi(a.path("titolo").asText(""),
                a.path("dettaglio").asText(""), a.path("impatto").asText("MEDIO").toUpperCase(Locale.ROOT))));
        return new YoutubeDto.AiAnalisi(j.path("voto").asText(""), j.path("sintesi").asText(""), lista(j.path("puntiForza")),
                lista(j.path("criticita")), azioni, lista(j.path("ideeVideo")));
    }

    public YoutubeDto.AiRisposta risposta(YoutubeDto.AiRispostaRequest req) {
        if (req.testo() == null || req.testo().isBlank()) {
            throw new IllegalArgumentException("Commento mancante");
        }
        String user = "VIDEO: " + (req.videoTitolo() == null ? "" : req.videoTitolo())
                + "\nCOMMENTO: " + tronca(req.testo(), 3000)
                + (req.istruzioni() == null || req.istruzioni().isBlank() ? "" : "\nINDICAZIONI: " + tronca(req.istruzioni(), 500));
        JsonNode j = json(aiClient.generateContent(SYSTEM_RISPOSTA, user, 600));
        String testo = j.path("testo").asText("");
        if (testo.isBlank()) {
            throw new GoogleRifiutoException(HttpStatus.BAD_GATEWAY, "L'AI non ha restituito una risposta, riprova.", null);
        }
        return new YoutubeDto.AiRisposta(testo.trim());
    }

    private static String totali(YoutubeDto.Totali t) {
        return "visualizzazioni " + t.visualizzazioni() + ", ore di visione " + Math.round(t.minutiVisti() / 60.0)
                + ", durata media " + Math.round(t.durataMediaSec()) + " s, % media vista " + Math.round(t.percentualeMedia())
                + "%, iscritti +" + t.iscrittiGuadagnati() + " -" + t.iscrittiPersi() + ", like " + t.like()
                + ", commenti " + t.commenti() + ", condivisioni " + t.condivisioni()
                + (t.ricavi() == null ? "" : ", ricavi stimati " + String.format(Locale.ITALY, "%.2f", t.ricavi()));
    }

    private static String voci(List<YoutubeDto.Voce> v, int max) {
        return String.join(", ", v.stream().limit(max).map(x -> x.etichetta() + " " + Math.round(x.valore())).toList());
    }

    private JsonNode json(String risposta) {
        if (risposta == null || risposta.isBlank()) {
            throw new GoogleRifiutoException(HttpStatus.BAD_GATEWAY, "L'AI non ha risposto, riprova.", null);
        }
        String s = risposta.trim();
        int inizio = s.indexOf('{');
        int fine = s.lastIndexOf('}');
        if (inizio < 0 || fine <= inizio) {
            throw new GoogleRifiutoException(HttpStatus.BAD_GATEWAY, "Risposta AI non leggibile, riprova.", null);
        }
        try {
            return objectMapper.readTree(s.substring(inizio, fine + 1));
        } catch (Exception e) {
            throw new GoogleRifiutoException(HttpStatus.BAD_GATEWAY, "Risposta AI non leggibile, riprova.", e);
        }
    }

    private static List<String> lista(JsonNode n) {
        List<String> out = new ArrayList<>();
        if (n != null && n.isArray()) {
            n.forEach(x -> {
                if (!x.asText("").isBlank()) {
                    out.add(x.asText().trim());
                }
            });
        }
        return out;
    }

    private static String tronca(String s, int max) {
        return s == null ? "" : (s.length() > max ? s.substring(0, max) + "…" : s);
    }
}
