package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.ObjectMapper;
import it.edodoc.hq.dto.AccettazioneDto;
import it.edodoc.hq.models.AccettazioneDocumento;
import it.edodoc.hq.models.AccettazioneFirma;
import it.edodoc.hq.models.AccettazioneFirmaEvento;
import it.edodoc.hq.models.Config;
import it.edodoc.hq.repositories.AccettazioneDocumentoRepository;
import it.edodoc.hq.repositories.ConfigRepository;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.PDSignature;
import org.apache.pdfbox.text.PDFTextStripper;
import org.bouncycastle.cert.X509CertificateHolder;
import org.bouncycastle.cms.CMSProcessableByteArray;
import org.bouncycastle.cms.CMSSignedData;
import org.bouncycastle.cms.SignerInformation;
import org.bouncycastle.cms.jcajce.JcaSimpleSignerInfoVerifierBuilder;
import org.junit.jupiter.api.Test;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Testi della migrazione V23, PDF firmato con sigillo verificabile e catena del registro. */
class AccettazioneDocumentiTest {

    private static final Path MIGRAZIONE = Path.of("src/main/resources/db/migration/V23__accettazione_online.sql");

    private final Map<String, String> valori = new HashMap<>(Map.of(
            "EMITTENTE_NOME", "Dott. Edoardo Bo",
            "EMITTENTE_TITOLI", "Biologo Nutrizionista e Mental Coach",
            "EMITTENTE_INDIRIZZO", "Via Esempio 1, 20100 Milano (MI)",
            "EMITTENTE_PARTITA_IVA", "01234567890",
            "EMITTENTE_CODICE_FISCALE", "BOXDRD90A01F205X",
            "EMITTENTE_ALBO", "Ordine dei Biologi della Lombardia, n. AA_000000",
            "ACCETTAZIONE_EMAIL_PRIVACY", "supporto@edodoc.it",
            "ACCETTAZIONE_DISDETTA_ORE", "24"));

    private ConfigService config() {
        ConfigService c = mock(ConfigService.class);
        when(c.get(anyString())).thenAnswer(i -> valori.getOrDefault(i.getArgument(0, String.class), ""));
        return c;
    }

    private static String blocco(String nome) throws IOException {
        String sql = Files.readString(MIGRAZIONE, StandardCharsets.UTF_8);
        Matcher m = Pattern.compile("\\$" + nome + "\\$(.*?)\\$" + nome + "\\$", Pattern.DOTALL).matcher(sql);
        assertThat(m.find()).as("blocco $%s$ nella migrazione", nome).isTrue();
        return m.group(1);
    }

    private static AccettazioneDocumento doc(AccettazioneDocumento.Tipo tipo, String contenuto) {
        AccettazioneDocumento d = new AccettazioneDocumento();
        d.setId((long) tipo.ordinal() + 1);
        d.setTipo(tipo);
        d.setVersione("1.0");
        d.setTitolo(tipo.name());
        d.setContenuto(contenuto);
        d.setSha256(AccettazioneRegistro.sha256Hex(contenuto.getBytes(StandardCharsets.UTF_8)));
        return d;
    }

    private AccettazioneTesti testi() {
        return new AccettazioneTesti(mock(AccettazioneDocumentoRepository.class), config(), new ObjectMapper());
    }

    @Test
    void moduloSiLeggeERiempieISegnaposto() throws IOException {
        AccettazioneTesti testi = testi();
        AccettazioneDocumento modulo = doc(AccettazioneDocumento.Tipo.MODULO, blocco("modulo"));

        AccettazioneDto.Modulo adulto = testi.modulo(modulo, false);
        AccettazioneDto.Modulo minore = testi.modulo(modulo, true);

        assertThat(adulto.sezioni()).extracting(AccettazioneDto.Sezione::id)
                .contains("consulenza", "distanza", "salute", "privacy", "firma_elettronica").doesNotContain("minori");
        assertThat(minore.sezioni()).extracting(AccettazioneDto.Sezione::id).contains("minori");
        assertThat(adulto.consensi()).extracting(AccettazioneDto.ConsensoFacoltativo::id).containsExactly("CONTATTO_MEDICO");
        for (AccettazioneDto.Sezione s : minore.sezioni()) {
            assertThat(s.testo() + s.titolo() + s.dichiarazione()).doesNotContain("{{");
        }
        assertThat(adulto.sezioni().get(0).testo()).contains("Dott. Edoardo Bo", "Ordine dei Biologi della Lombardia");
    }

    @Test
    void informativaEFornitoriDiventanoHtmlCompleto() throws IOException {
        AccettazioneTesti testi = testi();
        String informativa = testi.html(doc(AccettazioneDocumento.Tipo.INFORMATIVA, blocco("informativa")));
        String fornitori = testi.html(doc(AccettazioneDocumento.Tipo.FORNITORI, blocco("fornitori")));

        assertThat(informativa).contains("<h2>1. Chi tratta i tuoi dati</h2>", "01234567890", "BOXDRD90A01F205X",
                "Via Esempio 1", "supporto@edodoc.it").doesNotContain("{{");
        assertThat(fornitori).contains("<table>", "Google Workspace").doesNotContain("{{");
    }

    @Test
    void datiDelTitolareMancantiBloccanoLInvio() {
        valori.put("EMITTENTE_PARTITA_IVA", "");
        valori.put("EMITTENTE_ALBO", " ");
        assertThat(testi().datiTitolareMancanti()).containsExactly("partita IVA", "iscrizione all'albo");
    }

    @Test
    void pdfFirmatoSigillatoEVerificabile() throws Exception {
        AccettazioneTesti testi = testi();
        AccettazioneDocumento moduloDoc = doc(AccettazioneDocumento.Tipo.MODULO, blocco("modulo"));
        AccettazioneDocumento informativa = doc(AccettazioneDocumento.Tipo.INFORMATIVA, blocco("informativa"));
        AccettazioneDocumento fornitori = doc(AccettazioneDocumento.Tipo.FORNITORI, blocco("fornitori"));
        AccettazioneDto.Modulo modulo = testi.modulo(moduloDoc, false);

        AccettazioneFirma a = new AccettazioneFirma();
        a.setId(1L);
        a.setCodiceVerifica("ED-ABCD-2345");
        a.setFirmatarioRuolo(AccettazioneFirma.Ruolo.PAZIENTE);
        a.setEmail("mario.rossi@example.com");
        a.setCreataIl(LocalDateTime.of(2026, 11, 15, 9, 0));
        a.setDatiConfermatiIl(LocalDateTime.of(2026, 11, 15, 9, 5));
        a.setOtpVerificatoIl(LocalDateTime.of(2026, 11, 15, 9, 7));
        a.setFirmataIl(LocalDateTime.of(2026, 11, 15, 9, 8));
        a.setFirmaIp("203.0.113.7");
        a.setFirmaUserAgent("Mozilla/5.0 (iPhone)");
        a.setConservareFinoAl(LocalDate.of(2041, 11, 15));
        a.setFirmaPng(firmaPng());

        AccettazioneDto.Persona paziente = new AccettazioneDto.Persona("Mario", "Rossi", "RSSMRA80A01F205X", "1980-01-01",
                null, "Via Roma 1", "20100", "Milano", "MI", "mario.rossi@example.com", "+39 333 0000000");
        AccettazioneDto.Scelte scelte = new AccettazioneDto.Scelte(
                modulo.sezioni().stream().map(AccettazioneDto.Sezione::id).toList(), Map.of("CONTATTO_MEDICO", false), false);

        AccettazioneRegistro registro = new AccettazioneRegistro(null, null);
        List<AccettazioneFirmaEvento> eventi = catena(3);

        byte[] pdf = new AccettazionePdfService().genera(new AccettazionePdfService.Dati(a,
                new AccettazioneDto.Snapshot(paziente, null), scelte, modulo, informativa, testi.html(informativa),
                fornitori, testi.html(fornitori), moduloDoc, eventi, "Dott. Edoardo Bo",
                "Biologo Nutrizionista e Mental Coach", "https://hq.edodoc.it/verifica-firma/ED-ABCD-2345"));

        ConfigRepository configRepo = mock(ConfigRepository.class);
        when(configRepo.findByChiave(anyString())).thenAnswer(i -> {
            String k = i.getArgument(0, String.class);
            Config c = new Config();
            c.setChiave(k);
            c.setValore(valori.getOrDefault(k, ""));
            return Optional.of(c);
        });
        when(configRepo.save(any())).thenAnswer(i -> i.getArgument(0));
        MarcaTemporaleService marca = mock(MarcaTemporaleService.class);
        when(marca.marcaDati(any())).thenThrow(new IllegalStateException("rete assente nel test"));

        AccettazioneSigilloService.Sigillato s = new AccettazioneSigilloService(configRepo, marca)
                .sigilla(pdf, a.getCodiceVerifica(), Calendar.getInstance());

        Files.write(Path.of("target/accettazione-prova.pdf"), s.pdf());
        assertThat(s.marca()).isNull();
        assertThat(s.erroreMarca()).contains("rete assente");
        try (PDDocument d = PDDocument.load(s.pdf())) {
            String testo = new PDFTextStripper().getText(d);
            assertThat(testo).contains("Mario Rossi", "ED-ABCD-2345", "Come è stato firmato", "Informativa sul trattamento",
                    "Google Cloud");
            assertThat(d.getNumberOfPages()).isGreaterThan(3);
            List<PDSignature> firme = d.getSignatureDictionaries();
            assertThat(firme).hasSize(1);
            PDSignature firma = firme.get(0);
            byte[] contenutoFirmato = firma.getSignedContent(s.pdf());
            CMSSignedData cms = new CMSSignedData(new CMSProcessableByteArray(contenutoFirmato), firma.getContents(s.pdf()));
            SignerInformation si = cms.getSignerInfos().getSigners().iterator().next();
            @SuppressWarnings("unchecked")
            X509CertificateHolder cert = (X509CertificateHolder) cms.getCertificates().getMatches(si.getSID()).iterator().next();
            assertThat(si.verify(new JcaSimpleSignerInfoVerifierBuilder().build(cert))).isTrue();
            assertThat(cert.getSubject().toString()).contains("Dott. Edoardo Bo", "VATIT-01234567890");
        }
        assertThat(registro.verifica(eventi)).isTrue();
    }

    @Test
    void registroRilevaUnaRigaModificata() {
        AccettazioneRegistro registro = new AccettazioneRegistro(null, null);
        List<AccettazioneFirmaEvento> eventi = catena(4);
        assertThat(registro.verifica(eventi)).isTrue();

        eventi.get(1).setDettagli("modificato a mano");
        assertThat(registro.verifica(eventi)).isFalse();
    }

    @Test
    void emailMascherata() {
        assertThat(AccettazionePdfService.mascheraEmail("mario.rossi@example.com")).isEqualTo("m******i@example.com");
        assertThat(AccettazionePdfService.mascheraEmail("ab@x.it")).isEqualTo("a*@x.it");
    }

    private static List<AccettazioneFirmaEvento> catena(int n) {
        List<AccettazioneFirmaEvento> eventi = new ArrayList<>();
        String precedente = AccettazioneRegistro.HASH_INIZIALE;
        AccettazioneFirmaEvento.Tipo[] tipi = AccettazioneFirmaEvento.Tipo.values();
        for (int i = 1; i <= n; i++) {
            AccettazioneFirmaEvento e = new AccettazioneFirmaEvento();
            e.setAccettazioneId(1L);
            e.setSeq(i);
            e.setTipo(tipi[i % tipi.length]);
            e.setIl(LocalDateTime.of(2026, 11, 15, 9, i, 0, i * 1000));
            e.setIp("203.0.113.7");
            e.setDettagli("passo " + i);
            e.setHashPrecedente(precedente);
            e.setHash(AccettazioneRegistro.hash(e));
            precedente = e.getHash();
            eventi.add(e);
        }
        return eventi;
    }

    private static byte[] firmaPng() throws IOException {
        BufferedImage img = new BufferedImage(600, 200, BufferedImage.TYPE_INT_ARGB);
        var g = img.createGraphics();
        g.setColor(java.awt.Color.BLACK);
        g.setStroke(new java.awt.BasicStroke(4));
        g.drawLine(40, 150, 200, 50);
        g.drawLine(200, 50, 320, 160);
        g.drawLine(320, 160, 560, 60);
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        javax.imageio.ImageIO.write(img, "png", out);
        return out.toByteArray();
    }
}
