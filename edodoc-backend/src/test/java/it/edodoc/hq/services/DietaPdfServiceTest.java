package it.edodoc.hq.services;

import it.edodoc.hq.dto.DietaDto;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.io.File;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DietaPdfServiceTest {

    private static final Map<String, String> CONFIG = Map.of(
            "EMITTENTE_NOME", "Dott. Edoardo Bo",
            "EMITTENTE_TITOLI", "Biologo Nutrizionista e Mental Coach");

    private final DietaPdfService service = new DietaPdfService(config());

    private static ConfigService config() {
        ConfigService config = mock(ConfigService.class);
        when(config.get(anyString())).thenAnswer(i -> CONFIG.getOrDefault(i.getArgument(0, String.class), ""));
        return config;
    }

    private static DietaDto.Alimento al(String nome, String q) {
        return new DietaDto.Alimento(nome, nome, q, null);
    }

    private static DietaDto.Opzione op(String nome, DietaDto.Alimento... alimenti) {
        return new DietaDto.Opzione(nome, nome, List.of(alimenti), null);
    }

    static DietaDto.Contenuto completo() {
        List<DietaDto.Pasto> pasti = List.of(
                new DietaDto.Pasto("c", "Colazione", "07:30", null, List.of(
                        op("Dolce", al("Yogurt greco 0%", "170 g"), al("Fiocchi d'avena", "40 g"), al("Frutti di bosco", "100 g"),
                                new DietaDto.Alimento("n", "Noci", "15 g", "Anche mandorle o nocciole")),
                        op("Salata", al("Pane integrale di segale", "60 g"), al("Uova", "2"), al("Avocado", "40 g")))),
                new DietaDto.Pasto("s", "Spuntino", "10:30", null, List.of(op(null, al("Frutta di stagione", "1 frutto"), al("Mandorle", "10 g")))),
                new DietaDto.Pasto("p", "Pranzo", "13:00", "Verdura sempre a inizio pasto: ti sazia prima e rallenta l'assorbimento degli zuccheri.", List.of(
                        op(null, al("Pasta di legumi", "80 g"), al("Verdure di stagione", "a piacere"), al("Olio extravergine d'oliva", "10 g")),
                        op(null, al("Riso basmati", "70 g"), al("Petto di pollo", "130 g"), al("Zucchine grigliate", "200 g"), al("Olio extravergine d'oliva", "10 g")),
                        op(null, al("Farro", "70 g"), al("Ceci", "120 g"), al("Insalata mista", "a piacere"), al("Olio extravergine d'oliva", "10 g")))),
                new DietaDto.Pasto("m", "Merenda", "16:30", null, List.of(op(null, al("Skyr bianco", "150 g"), al("Cioccolato fondente 85%", "10 g")))),
                new DietaDto.Pasto("x", "Cena", "20:00", null, List.of(
                        op("Pesce", al("Salmone", "150 g"), al("Patate", "200 g"), al("Broccoli", "200 g"), al("Olio extravergine d'oliva", "10 g")),
                        op("Vegetariana", al("Tofu al naturale", "150 g"), al("Pane integrale", "50 g"), al("Spinaci saltati", "200 g"))))
        );
        List<DietaDto.Pasto> allenamento = List.of(
                new DietaDto.Pasto("pre", "Pre-allenamento", "17:30", null, List.of(op(null, al("Banana", "1"), al("Gallette di riso", "2")))),
                new DietaDto.Pasto("post", "Cena di recupero", "20:30", null, List.of(op(null, al("Riso integrale", "90 g"), al("Merluzzo", "180 g"), al("Verdure al vapore", "a piacere"))))
        );
        return new DietaDto.Contenuto("Ricomposizione corporea", 1850, 120, 200, 62, new BigDecimal("2.5"),
                "Cara Giulia,\nquesto è il tuo piano per le prossime settimane. Non è una gabbia: è una struttura su cui appoggiarti nelle giornate piene.\n\nSe salti un pasto o esci a cena, riprendi dal pasto dopo senza compensare. Ci vediamo alla prossima visita per aggiustare il tiro.",
                List.of(new DietaDto.Giornata("g1", "Giornata tipo", "Scegli liberamente una delle alternative per ogni pasto. Le grammature sono a crudo e al netto degli scarti.", pasti),
                        new DietaDto.Giornata("g2", "Giorni di allenamento", "Martedì e giovedì: sostituisci merenda e cena con questi due pasti.", allenamento)),
                List.of(new DietaDto.Consiglio("1", "Pesa a crudo", "Le grammature di pasta, riso e cereali sono sempre a crudo."),
                        new DietaDto.Consiglio("2", "Il sonno conta", "Sette ore di sonno valgono quanto il piano. Cena almeno due ore prima di dormire."),
                        new DietaDto.Consiglio("3", "Il pasto libero", "Una volta a settimana mangia quello che vuoi, senza sensi di colpa e senza recuperi."),
                        new DietaDto.Consiglio("4", "Muoviti ogni giorno", "8.000 passi al giorno, anche spezzati in due camminate.")),
                List.of("Verdure crude e cotte", "Tè e tisane senza zucchero", "Caffè", "Spezie ed erbe aromatiche", "Aceto e limone"),
                List.of("Alcolici", "Bibite zuccherate", "Dolci confezionati", "Salumi", "Fritti"),
                List.of(new DietaDto.Integratore("i1", "Vitamina D3", "2.000 UI", "A colazione"),
                        new DietaDto.Integratore("i2", "Omega 3", "1 g", "A pranzo")),
                true);
    }

    @Test
    void generaUnPdfCompletoConTuttiITesti() throws Exception {
        byte[] pdf = service.genera(new DietaPdfService.Documento("Ricomposizione corporea", "Giulia Ferrari & <Co>",
                LocalDate.of(2026, 11, 10), LocalDateTime.of(2026, 11, 8, 15, 32), completo()));
        try (PDDocument documento = PDDocument.load(pdf)) {
            // Con DIETA_PDF_OUT il test lascia PDF e pagine in PNG da guardare
            String uscita = System.getenv("DIETA_PDF_OUT");
            if (uscita != null) {
                Files.write(Path.of(uscita, "dieta.pdf"), pdf);
                PDFRenderer renderer = new PDFRenderer(documento);
                for (int i = 0; i < documento.getNumberOfPages(); i++) {
                    ImageIO.write(renderer.renderImageWithDPI(i, 80), "png", new File(uscita, "pagina-" + (i + 1) + ".png"));
                }
            }
            String testo = new PDFTextStripper().getText(documento);
            assertThat(documento.getNumberOfPages()).isGreaterThanOrEqualTo(5);
            assertThat(testo).contains("Giulia Ferrari & <Co>", "Colazione", "Yogurt greco 0%", "170 g", "Lista della spesa",
                    "Vitamina D3", "1.850", "Dott. Edoardo Bo");
        }
    }

    @Test
    void unaDietaVuotaHaSoloLaCopertina() throws Exception {
        byte[] pdf = service.genera(new DietaPdfService.Documento("Piano alimentare", null, null, LocalDateTime.now(), DietaDto.Contenuto.vuoto()));
        try (PDDocument documento = PDDocument.load(pdf)) {
            assertThat(documento.getNumberOfPages()).isEqualTo(1);
        }
    }

    @Test
    void lePercentualiDeiMacroStimanoLeKcalSeMancano() {
        DietaDto.Contenuto c = new DietaDto.Contenuto(null, null, 100, 200, 50, null, null, null, null, null, null, null, null);
        assertThat(DietaPdfService.kcal(c)).isEqualTo(100 * 4 + 200 * 4 + 50 * 9);
    }
}
