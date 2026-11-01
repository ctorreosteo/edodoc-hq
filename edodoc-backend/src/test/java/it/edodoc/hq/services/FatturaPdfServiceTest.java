package it.edodoc.hq.services;

import it.edodoc.hq.models.Fattura;
import it.edodoc.hq.models.Pagamento;
import it.edodoc.hq.models.Paziente;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class FatturaPdfServiceTest {

    private static final Map<String, String> CONFIG = Map.of(
            "EMITTENTE_NOME", "Dott. Edoardo Bo",
            "EMITTENTE_TITOLI", "Biologo Nutrizionista e Mental Coach",
            "EMITTENTE_INDIRIZZO", "Via Esempio 1, 20100 Milano (MI)",
            "EMITTENTE_PARTITA_IVA", "00000000000",
            "EMITTENTE_CODICE_FISCALE", "DMODTI00A01F205X",
            "EMITTENTE_ALBO", "Albo dimostrativo n. 000",
            "EMITTENTE_IBAN", "IT00X0000000000000000000000",
            "FATTURA_LUOGO", "Milano",
            "FATTURA_NOTA_IVA", "Operazione in franchigia da IVA ai sensi dell'art. 1, commi 54-89, L. 190/2014.",
            "FATTURA_NOTA_RITENUTA", "Compenso non soggetto a ritenuta d'acconto ai sensi dell'art. 1, comma 67, L. 190/2014.");

    private final FatturaPdfService service = new FatturaPdfService(config());

    private static ConfigService config() {
        ConfigService config = mock(ConfigService.class);
        when(config.get(anyString())).thenAnswer(i -> CONFIG.getOrDefault(i.getArgument(0, String.class), ""));
        when(config.getDecimale("FATTURA_ALIQUOTA_CONTRIBUTO")).thenReturn(new BigDecimal("0.04"));
        return config;
    }

    private static Fattura fattura(String intestatario, String indirizzo, Pagamento pagamento) {
        Paziente paziente = new Paziente();
        paziente.setCognome("Ferrari");
        Fattura f = new Fattura();
        f.setNumero(442);
        f.setDataEmissione(LocalDate.of(2026, 11, 1));
        f.setPaziente(paziente);
        f.setPagamento(pagamento);
        f.setIntestatario(intestatario);
        f.setIndirizzo(indirizzo);
        f.setCodiceFiscale("FRRGLI80A41F205X");
        f.setDescrizione("Consulenza Nutrizionale");
        f.setImponibile(new BigDecimal("673.08"));
        f.setContributo(new BigDecimal("26.92"));
        f.setBollo(new BigDecimal("2.00"));
        f.setImportoTotale(new BigDecimal("702.00"));
        return f;
    }

    private static Pagamento pagamento() {
        Pagamento p = new Pagamento();
        p.setDescrizione("Percorso 6 mesi, rata 1 di 3");
        p.setDataPagamento(LocalDate.of(2026, 10, 30));
        p.setMetodo(Pagamento.Metodo.BONIFICO);
        return p;
    }

    private static String testoDi(byte[] pdf) throws Exception {
        try (PDDocument documento = PDDocument.load(pdf)) {
            assertThat(documento.getNumberOfPages()).isEqualTo(1);
            return new PDFTextStripper().getText(documento);
        }
    }

    @Test
    void contieneTuttoCioCheRichiedeIlModello() throws Exception {
        byte[] pdf = service.genera(fattura("Giulia Ferrari", "Via delle Prove 6, 20100 Milano (MI)", pagamento()));
        Files.createDirectories(Path.of("target"));
        Files.write(Path.of("target/fattura-esempio.pdf"), pdf);

        assertThat(testoDi(pdf)).contains("n. 442", "Milano, 1 novembre 2026", "Giulia Ferrari", "FRRGLI80A41F205X",
                "Prestazioni", "Rimborso spese escluse art. 15", "Consulenza Nutrizionale", "Percorso 6 mesi, rata 1 di 3",
                "Rivalsa contributo previdenziale integrativo ENPAB", "art. 8, co. 3, DLgs 103/1996, 4%", "673,08 €", "26,92 €",
                "Rivalsa marca da bollo", "702,00 €", "Saldata il 30/10/2026", "Bonifico bancario", "IT00X0000000000000000000000",
                "franchigia da IVA", "ritenuta d'acconto");
    }

    @Test
    void reggeNomiLunghiECaratteriFuoriDalFont() throws Exception {
        byte[] pdf = service.genera(fattura("Maria Dolores Ñandú Żółkiewska Çelik 李小龍 von Hohenzollern-Sigmaringen",
                "Viale della Repubblica Italiana Una e Indivisibile 1234, Scala B, Interno 56, 00100 Roma (RM)", null));
        Files.write(Path.of("target/fattura-lunga.pdf"), pdf);
        assertThat(testoDi(pdf)).contains("Maria Dolores", "Sigmaringen").doesNotContain("Saldata il");
    }
}
