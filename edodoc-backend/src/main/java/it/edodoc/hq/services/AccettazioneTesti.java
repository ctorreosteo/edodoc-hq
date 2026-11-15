package it.edodoc.hq.services;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import it.edodoc.hq.dto.AccettazioneDto;
import it.edodoc.hq.models.AccettazioneDocumento;
import it.edodoc.hq.repositories.AccettazioneDocumentoRepository;
import org.commonmark.ext.gfm.tables.TablesExtension;
import org.commonmark.parser.Parser;
import org.commonmark.renderer.html.HtmlRenderer;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Testi dell'accettazione come li legge e li firma la persona: versione attiva (o quella firmata), segnaposto riempiti
 * con i dati del titolare da config e sezioni del modulo filtrate (quella dei minori solo per un minore).
 */
@Service
public class AccettazioneTesti {

    private static final Pattern SEGNAPOSTO = Pattern.compile("\\{\\{([A-Z_]+)}}");
    private static final List<org.commonmark.Extension> ESTENSIONI = List.of(TablesExtension.create());
    private static final Parser PARSER = Parser.builder().extensions(ESTENSIONI).build();
    private static final HtmlRenderer HTML = HtmlRenderer.builder().extensions(ESTENSIONI).escapeHtml(true).build();

    /** Dati del titolare che l'informativa deve contenere (art. 13 GDPR): senza, non si invia nulla da firmare. */
    private static final Map<String, String> OBBLIGATORI = Map.of(
            "EMITTENTE_NOME", "nome",
            "EMITTENTE_INDIRIZZO", "indirizzo",
            "EMITTENTE_PARTITA_IVA", "partita IVA",
            "EMITTENTE_CODICE_FISCALE", "codice fiscale",
            "EMITTENTE_ALBO", "iscrizione all'albo",
            "ACCETTAZIONE_EMAIL_PRIVACY", "email per la privacy");

    private final AccettazioneDocumentoRepository documenti;
    private final ConfigService config;
    private final ObjectMapper objectMapper;

    public AccettazioneTesti(AccettazioneDocumentoRepository documenti, ConfigService config, ObjectMapper objectMapper) {
        this.documenti = documenti;
        this.config = config;
        this.objectMapper = objectMapper;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record SezioneJson(String id, String titolo, String condizione, String testo, String dichiarazione) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record ModuloJson(String titolo, String sottotitolo, List<SezioneJson> sezioni, String dichiarazioneRappresentante,
                      List<AccettazioneDto.ConsensoFacoltativo> consensiFacoltativi, String notaConsensi) {
    }

    public AccettazioneDocumento attivo(AccettazioneDocumento.Tipo tipo) {
        return documenti.findByTipoAndAttivoTrue(tipo)
                .orElseThrow(() -> new IllegalStateException("Manca la versione attiva del documento " + tipo));
    }

    public AccettazioneDocumento documento(Long id) {
        return documenti.findById(id).orElseThrow(() -> new IllegalStateException("Documento " + id + " non trovato"));
    }

    /** Etichette dei dati del titolare ancora vuoti in Impostazioni. */
    public List<String> datiTitolareMancanti() {
        List<String> mancanti = new ArrayList<>();
        for (String chiave : List.of("EMITTENTE_NOME", "EMITTENTE_INDIRIZZO", "EMITTENTE_PARTITA_IVA",
                "EMITTENTE_CODICE_FISCALE", "EMITTENTE_ALBO", "ACCETTAZIONE_EMAIL_PRIVACY")) {
            if (config.get(chiave).isBlank()) {
                mancanti.add(OBBLIGATORI.get(chiave));
            }
        }
        return mancanti;
    }

    public String titolare() {
        String nome = config.get("EMITTENTE_NOME").strip();
        return nome.isEmpty() ? "Dott. Edoardo Bo" : nome;
    }

    public String emailPrivacy() {
        return config.get("ACCETTAZIONE_EMAIL_PRIVACY").strip();
    }

    Map<String, String> valori() {
        Map<String, String> v = new LinkedHashMap<>();
        v.put("TITOLARE", titolare());
        v.put("ALBO", config.get("EMITTENTE_ALBO").strip());
        v.put("INDIRIZZO", config.get("EMITTENTE_INDIRIZZO").strip());
        v.put("PARTITA_IVA", config.get("EMITTENTE_PARTITA_IVA").strip());
        v.put("CODICE_FISCALE", config.get("EMITTENTE_CODICE_FISCALE").strip());
        String email = emailPrivacy();
        String pec = config.get("ACCETTAZIONE_PEC").strip();
        v.put("EMAIL", email);
        v.put("CONTATTI", pec.isEmpty() ? email : email + " oppure la PEC " + pec);
        String ore = config.get("ACCETTAZIONE_DISDETTA_ORE").strip();
        v.put("DISDETTA_ORE", ore.isEmpty() ? "24" : ore);
        return v;
    }

    /** Sostituisce i segnaposto; uno sconosciuto resta com'è, così si nota nella revisione del testo. */
    public String compila(String testo) {
        if (testo == null) {
            return null;
        }
        Map<String, String> v = valori();
        Matcher m = SEGNAPOSTO.matcher(testo);
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            String valore = v.get(m.group(1));
            m.appendReplacement(out, Matcher.quoteReplacement(valore != null && !valore.isEmpty() ? valore : m.group()));
        }
        m.appendTail(out);
        return out.toString();
    }

    /** Il modulo da leggere e firmare: le sezioni con una condizione compaiono solo se vale (MINORENNE). */
    public AccettazioneDto.Modulo modulo(AccettazioneDocumento doc, boolean minorenne) {
        ModuloJson m;
        try {
            m = objectMapper.readValue(doc.getContenuto(), ModuloJson.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Modulo di accettazione v. " + doc.getVersione() + " non leggibile", e);
        }
        List<AccettazioneDto.Sezione> sezioni = new ArrayList<>();
        for (SezioneJson s : m.sezioni()) {
            if ("MINORENNE".equals(s.condizione()) && !minorenne) {
                continue;
            }
            sezioni.add(new AccettazioneDto.Sezione(s.id(), compila(s.titolo()), compila(s.testo()), compila(s.dichiarazione())));
        }
        List<AccettazioneDto.ConsensoFacoltativo> consensi = m.consensiFacoltativi() == null ? List.of()
                : m.consensiFacoltativi().stream()
                .map(c -> new AccettazioneDto.ConsensoFacoltativo(c.id(), compila(c.titolo()), compila(c.testo())))
                .toList();
        return new AccettazioneDto.Modulo(compila(m.titolo()), compila(m.sottotitolo()), doc.getVersione(), sezioni,
                compila(m.dichiarazioneRappresentante()), consensi, compila(m.notaConsensi()));
    }

    /** Informativa o elenco fornitori in HTML (testo nostro, comunque con l'HTML grezzo disattivato). */
    public String html(AccettazioneDocumento doc) {
        return HTML.render(PARSER.parse(compila(doc.getContenuto())));
    }
}
