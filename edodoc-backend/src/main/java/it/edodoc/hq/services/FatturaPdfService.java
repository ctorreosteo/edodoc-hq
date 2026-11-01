package it.edodoc.hq.services;

import it.edodoc.hq.models.Fattura;
import it.edodoc.hq.models.Pagamento;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.graphics.state.PDExtendedGraphicsState;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Parcella in PDF. Contenuti del modello Numbers (intestazione, destinatario, Prestazioni / Rimborso
 * spese, totali, note fisse) con la grafica EdoDoc: testata blu col logo, schede, totale in evidenza.
 * Si rigenera sempre dalla fotografia salvata sulla fattura; intestazione e note vengono da config.
 */
@Service
public class FatturaPdfService {

    private static final Color NOTTE = new Color(0x1F, 0x3A, 0x63);
    private static final Color BLU = new Color(0x3A, 0x60, 0x98);
    private static final Color ARANCIONE = new Color(0xF0, 0x94, 0x4E);
    private static final Color TESTO = new Color(0x2B, 0x35, 0x45);
    private static final Color TENUE = new Color(0x6B, 0x77, 0x88);
    private static final Color LINEA = new Color(0xE3, 0xE8, 0xF0);
    private static final Color FONDO = new Color(0xF5, 0xF7, 0xFB);
    private static final Color CHIARO = new Color(0xC9, 0xD6, 0xE8);
    private static final float MARGINE = 44;
    private static final float ALTEZZA_TESTATA = 176;
    private static final float CERCHIO = 0.5523f;
    private static final DateTimeFormatter DATA = DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.ITALIAN);
    private static final DateTimeFormatter DATA_BREVE = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private final ConfigService configService;

    public FatturaPdfService(ConfigService configService) {
        this.configService = configService;
    }

    public static String euro(BigDecimal valore) {
        DecimalFormat formato = new DecimalFormat("#,##0.00", DecimalFormatSymbols.getInstance(Locale.ITALY));
        return formato.format(valore) + " €";
    }

    private record Font(PDFont leggero, PDFont normale, PDFont medio, PDFont grassetto) {
    }

    public byte[] genera(Fattura f) throws IOException {
        try (PDDocument documento = new PDDocument(); ByteArrayOutputStream uscita = new ByteArrayOutputStream()) {
            PDPage pagina = new PDPage(PDRectangle.A4);
            documento.addPage(pagina);
            documento.getDocumentInformation().setTitle("Parcella n. " + f.getNumero());
            documento.getDocumentInformation().setAuthor(configService.get("EMITTENTE_NOME"));
            Font font = new Font(carica(documento, "Montserrat-Light"), carica(documento, "Montserrat-Regular"),
                    carica(documento, "Montserrat-SemiBold"), carica(documento, "Montserrat-Bold"));
            PDImageXObject logo;
            try (InputStream immagine = new ClassPathResource("pdf/logo.png").getInputStream()) {
                logo = PDImageXObject.createFromByteArray(documento, immagine.readAllBytes(), "logo.png");
            }
            try (PDPageContentStream c = new PDPageContentStream(documento, pagina)) {
                new Disegno(c, font, pagina.getMediaBox().getWidth(), pagina.getMediaBox().getHeight())
                        .fattura(f, logo);
            }
            documento.save(uscita);
            return uscita.toByteArray();
        }
    }

    private static PDFont carica(PDDocument documento, String nome) throws IOException {
        try (InputStream file = new ClassPathResource("fonts/" + nome + ".ttf").getInputStream()) {
            return PDType0Font.load(documento, file, true);
        }
    }

    /** Una parcella in disegno: tiene stream e font, così i passaggi leggono come la pagina dall'alto in basso. */
    private final class Disegno {
        private final PDPageContentStream c;
        private final Font font;
        private final float larghezza;
        private final float altezza;
        private final float destra;

        Disegno(PDPageContentStream c, Font font, float larghezza, float altezza) {
            this.c = c;
            this.font = font;
            this.larghezza = larghezza;
            this.altezza = altezza;
            this.destra = larghezza - MARGINE;
        }

        void fattura(Fattura f, PDImageXObject logo) throws IOException {
            testata(f, logo);
            float y = schede(f, altezza - ALTEZZA_TESTATA - 28);
            y = prestazioni(f, y - 24);
            riepilogo(f, y - 22);
            piede();
        }

        private void testata(Fattura f, PDImageXObject logo) throws IOException {
            float base = altezza - ALTEZZA_TESTATA;
            riempi(NOTTE);
            c.addRect(0, base, larghezza, ALTEZZA_TESTATA);
            c.fill();

            // Il triangolo della D e la O del logo, in grande e appena accennati
            trasparenza(0.55f);
            riempi(BLU);
            c.moveTo(larghezza * 0.42f, altezza);
            c.lineTo(larghezza, altezza);
            c.lineTo(larghezza, base + 30);
            c.closePath();
            c.fill();
            c.saveGraphicsState();
            c.addRect(0, base, larghezza, ALTEZZA_TESTATA);
            c.clip();
            trasparenza(0.16f);
            riempi(ARANCIONE);
            cerchio(larghezza - 54, base + 26, 96);
            c.fill();
            c.restoreGraphicsState();
            trasparenza(1f);
            riempi(ARANCIONE);
            c.addRect(0, base - 4, larghezza, 4);
            c.fill();

            float altezzaLogo = 44;
            float larghezzaLogo = altezzaLogo * logo.getWidth() / logo.getHeight();
            c.drawImage(logo, MARGINE, altezza - 44 - altezzaLogo, larghezzaLogo, altezzaLogo);
            float y = altezza - 112;
            testo(font.grassetto, 13, Color.WHITE, MARGINE, y, configService.get("EMITTENTE_NOME"));
            testo(font.normale, 9, CHIARO, MARGINE, y - 15, configService.get("EMITTENTE_TITOLI"));

            float destraTestata = larghezza - MARGINE;
            testoDestra(font.medio, 9, ARANCIONE, destraTestata, altezza - 56, spaziato("PARCELLA"));
            testoDestra(font.grassetto, 34, Color.WHITE, destraTestata, altezza - 92, "n. " + f.getNumero());
            String luogo = configService.get("FATTURA_LUOGO");
            String data = f.getDataEmissione().format(DATA);
            testoDestra(font.normale, 9.5f, Color.WHITE, destraTestata, altezza - 112, luogo.isBlank() ? data : luogo + ", " + data);
        }

        private float schede(Fattura f, float alto) throws IOException {
            float spazio = 14;
            float largaScheda = (destra - MARGINE - spazio) / 2;
            float internaTesto = largaScheda - 32;

            List<String> emittente = new ArrayList<>();
            emittente.addAll(aCapo(configService.get("EMITTENTE_INDIRIZZO"), font.normale, 9, internaTesto));
            for (String riga : List.of(configService.get("EMITTENTE_ALBO"), partitaIva(), codiceFiscale())) {
                emittente.addAll(aCapo(riga, font.normale, 9, internaTesto));
            }
            List<String> destinatario = new ArrayList<>(aCapo(f.getIndirizzo(), font.normale, 9, internaTesto));
            destinatario.add("C.F. " + f.getCodiceFiscale());
            List<String> nomePaziente = aCapo(f.getIntestatario(), font.medio, 11, internaTesto);

            int righe = Math.max(emittente.size() + 1, destinatario.size() + nomePaziente.size());
            float alta = 42 + righe * 13.5f + 8;
            scheda(MARGINE, alto, largaScheda, alta, "DA", List.of(configService.get("EMITTENTE_NOME")), emittente);
            scheda(MARGINE + largaScheda + spazio, alto, largaScheda, alta, "INTESTATA A", nomePaziente, destinatario);
            return alto - alta;
        }

        private void scheda(float x, float alto, float larga, float alta, String titolo, List<String> intestazione, List<String> righe) throws IOException {
            riempi(FONDO);
            rettangoloTondo(x, alto - alta, larga, alta, 10);
            c.fill();
            riempi(ARANCIONE);
            rettangoloTondo(x + 16, alto - 22, 16, 3, 1.5f);
            c.fill();
            float y = alto - 36;
            testo(font.medio, 7.5f, BLU, x + 16, y, spaziato(titolo));
            y -= 15;
            for (String riga : intestazione) {
                testo(font.medio, 11, NOTTE, x + 16, y, riga);
                y -= 13.5f;
            }
            for (String riga : righe) {
                testo(font.normale, 9, TESTO, x + 16, y, riga);
                y -= 13.5f;
            }
        }

        private float prestazioni(Fattura f, float alto) throws IOException {
            float colonnaPrestazioni = destra - 170;
            float colonnaRimborso = destra - 14;
            float altaTesta = 28;

            riempi(NOTTE);
            rettangoloTondo(MARGINE, alto - altaTesta, destra - MARGINE, altaTesta, 8);
            c.fill();
            float yTesta = alto - 18;
            testo(font.medio, 8.5f, Color.WHITE, MARGINE + 14, yTesta, "Descrizione");
            testoDestra(font.medio, 8.5f, Color.WHITE, colonnaPrestazioni, yTesta, "Prestazioni");
            testoDestra(font.medio, 8.5f, Color.WHITE, colonnaRimborso, yTesta, "Rimborso spese escluse art. 15");

            float y = alto - altaTesta - 20;
            float largaDescrizione = colonnaPrestazioni - 90 - MARGINE - 14;
            List<String> dettaglio = new ArrayList<>();
            Pagamento pagamento = f.getPagamento();
            if (pagamento != null && !pagamento.getDescrizione().equalsIgnoreCase(f.getDescrizione())) {
                dettaglio.addAll(aCapo(pagamento.getDescrizione(), font.normale, 8.5f, largaDescrizione));
            }
            y = riga(y, destra, colonnaPrestazioni, aCapo(f.getDescrizione(), font.medio, 10, largaDescrizione), dettaglio, euro(f.getImponibile()));
            int percentuale = configService.getDecimale("FATTURA_ALIQUOTA_CONTRIBUTO").movePointRight(2).intValue();
            return riga(y, destra, colonnaPrestazioni, List.of("Rivalsa contributo previdenziale integrativo ENPAB"),
                    List.of("art. 8, co. 3, DLgs 103/1996, " + percentuale + "%"), euro(f.getContributo()));
        }

        private float riga(float y, float destra, float colonnaImporto, List<String> titolo, List<String> dettaglio, String importo) throws IOException {
            testoDestra(font.medio, 10, NOTTE, colonnaImporto, y, importo);
            float corrente = y;
            for (String parte : titolo) {
                testo(font.medio, 10, NOTTE, MARGINE + 14, corrente, parte);
                corrente -= 13.5f;
            }
            for (String parte : dettaglio) {
                testo(font.normale, 8.5f, TENUE, MARGINE + 14, corrente, parte);
                corrente -= 12;
            }
            corrente -= 4;
            traccia(LINEA, 0.6f);
            c.moveTo(MARGINE + 14, corrente + 6);
            c.lineTo(destra - 14, corrente + 6);
            c.stroke();
            return corrente - 16;
        }

        private void riepilogo(Fattura f, float alto) throws IOException {
            float larga = 232;
            float sinistra = destra - larga;
            float y = alto;
            y = voce(y, sinistra, "Totale prestazioni", euro(f.getImponibile().add(f.getContributo())));
            y = voce(y, sinistra, "Imponibile", euro(f.getImponibile()));
            y = voce(y, sinistra, "IVA", euro(BigDecimal.ZERO));
            y = voce(y, sinistra, "Rivalsa marca da bollo", euro(f.getBollo()));

            float altaTotale = 52;
            float baseTotale = y - altaTotale + 6;
            riempi(NOTTE);
            rettangoloTondo(sinistra, baseTotale, larga, altaTotale, 12);
            c.fill();
            testo(font.medio, 7.5f, ARANCIONE, sinistra + 16, baseTotale + 22, spaziato("IMPORTO TOTALE"));
            testoDestra(font.grassetto, 18, Color.WHITE, destra - 16, baseTotale + 19, euro(f.getImportoTotale()));

            pagamento(f, alto, baseTotale, sinistra - 18);
        }

        private float voce(float y, float sinistra, String nome, String valore) throws IOException {
            testo(font.normale, 9, TENUE, sinistra + 16, y, nome);
            testoDestra(font.medio, 9, NOTTE, destra - 16, y, valore);
            return y - 17;
        }

        private void pagamento(Fattura f, float alto, float base, float limite) throws IOException {
            Pagamento pagamento = f.getPagamento();
            String iban = configService.get("EMITTENTE_IBAN");
            boolean saldata = pagamento != null && pagamento.getDataPagamento() != null;
            if (!saldata && iban.isBlank()) {
                return;
            }
            float larga = limite - MARGINE;
            float cima = alto + 12;
            riempi(FONDO);
            rettangoloTondo(MARGINE, base, larga, cima - base, 10);
            c.fill();
            float y = cima - 22;
            testo(font.medio, 7.5f, BLU, MARGINE + 16, y, spaziato("PAGAMENTO"));
            y -= 18;
            if (saldata) {
                testo(font.medio, 10, NOTTE, MARGINE + 16, y, "Saldata il " + pagamento.getDataPagamento().format(DATA_BREVE));
                y -= 15;
                if (pagamento.getMetodo() != null) {
                    testo(font.normale, 9, TESTO, MARGINE + 16, y, metodo(pagamento.getMetodo()));
                    y -= 15;
                }
            }
            if (!iban.isBlank()) {
                testo(font.normale, 7.5f, TENUE, MARGINE + 16, y, "IBAN " + iban);
            }
        }

        private void piede() throws IOException {
            float y = 86;
            traccia(LINEA, 0.6f);
            c.moveTo(MARGINE, y + 14);
            c.lineTo(destra, y + 14);
            c.stroke();
            for (String nota : List.of(configService.get("FATTURA_NOTA_IVA"), configService.get("FATTURA_NOTA_RITENUTA"))) {
                for (String riga : aCapo(nota, font.leggero, 7.5f, destra - MARGINE)) {
                    testo(font.leggero, 7.5f, TENUE, MARGINE, y, riga);
                    y -= 11;
                }
            }
            riempi(ARANCIONE);
            c.addRect(0, 0, larghezza, 5);
            c.fill();
        }

        private void riempi(Color colore) throws IOException {
            c.setNonStrokingColor(colore);
        }

        private void traccia(Color colore, float spessore) throws IOException {
            c.setStrokingColor(colore);
            c.setLineWidth(spessore);
        }

        private void trasparenza(float valore) throws IOException {
            PDExtendedGraphicsState stato = new PDExtendedGraphicsState();
            stato.setNonStrokingAlphaConstant(valore);
            c.setGraphicsStateParameters(stato);
        }

        private void cerchio(float x, float y, float r) throws IOException {
            float k = r * CERCHIO;
            c.moveTo(x - r, y);
            c.curveTo(x - r, y + k, x - k, y + r, x, y + r);
            c.curveTo(x + k, y + r, x + r, y + k, x + r, y);
            c.curveTo(x + r, y - k, x + k, y - r, x, y - r);
            c.curveTo(x - k, y - r, x - r, y - k, x - r, y);
            c.closePath();
        }

        private void rettangoloTondo(float x, float y, float larga, float alta, float r) throws IOException {
            float k = r * (1 - CERCHIO);
            c.moveTo(x + r, y);
            c.lineTo(x + larga - r, y);
            c.curveTo(x + larga - k, y, x + larga, y + k, x + larga, y + r);
            c.lineTo(x + larga, y + alta - r);
            c.curveTo(x + larga, y + alta - k, x + larga - k, y + alta, x + larga - r, y + alta);
            c.lineTo(x + r, y + alta);
            c.curveTo(x + k, y + alta, x, y + alta - k, x, y + alta - r);
            c.lineTo(x, y + r);
            c.curveTo(x, y + k, x + k, y, x + r, y);
            c.closePath();
        }

        private void testo(PDFont carattere, float corpo, Color colore, float x, float y, String testo) throws IOException {
            c.beginText();
            c.setFont(carattere, corpo);
            c.setNonStrokingColor(colore);
            c.newLineAtOffset(x, y);
            c.showText(stampabile(testo, carattere));
            c.endText();
        }

        private void testoDestra(PDFont carattere, float corpo, Color colore, float destra, float y, String testo) throws IOException {
            testo(carattere, corpo, colore, destra - larghezzaDi(testo, carattere, corpo), y, testo);
        }
    }

    private String partitaIva() {
        String valore = configService.get("EMITTENTE_PARTITA_IVA");
        return valore.isBlank() ? "" : "P.IVA " + valore;
    }

    private String codiceFiscale() {
        String valore = configService.get("EMITTENTE_CODICE_FISCALE");
        return valore.isBlank() ? "" : "C.F. " + valore;
    }

    private static String metodo(Pagamento.Metodo metodo) {
        return switch (metodo) {
            case BONIFICO -> "Bonifico bancario";
            case CARTA -> "Carta di pagamento";
            case CONTANTI -> "Contanti";
            case PAYPAL -> "PayPal";
            case ALTRO -> "Altro metodo";
        };
    }

    /** Etichette maiuscole un po' aperte: i font incorporati non hanno la spaziatura come attributo comodo. */
    private static String spaziato(String testo) {
        return String.join(" ", testo.split(""));
    }

    private static float larghezzaDi(String testo, PDFont carattere, float corpo) throws IOException {
        return carattere.getStringWidth(stampabile(testo, carattere)) / 1000 * corpo;
    }

    private static List<String> aCapo(String testo, PDFont carattere, float corpo, float massimo) throws IOException {
        List<String> righe = new ArrayList<>();
        if (testo == null || testo.isBlank()) {
            return righe;
        }
        StringBuilder riga = new StringBuilder();
        for (String parola : testo.trim().split("\\s+")) {
            String prova = riga.isEmpty() ? parola : riga + " " + parola;
            if (larghezzaDi(prova, carattere, corpo) > massimo && !riga.isEmpty()) {
                righe.add(riga.toString());
                riga = new StringBuilder(parola);
            } else {
                riga = new StringBuilder(prova);
            }
        }
        righe.add(riga.toString());
        return righe;
    }

    /** Un carattere fuori dal font bloccherebbe l'intera fattura: meglio un punto di domanda sul PDF. */
    private static String stampabile(String testo, PDFont carattere) {
        StringBuilder uscita = new StringBuilder();
        testo.codePoints().forEach(cp -> {
            String segno = new String(Character.toChars(cp));
            try {
                carattere.encode(Character.isISOControl(cp) ? " " : segno);
                uscita.append(Character.isISOControl(cp) ? " " : segno);
            } catch (IOException | IllegalArgumentException e) {
                uscita.append(cp == 0x200A ? "" : "?");
            }
        });
        return uscita.toString();
    }
}
