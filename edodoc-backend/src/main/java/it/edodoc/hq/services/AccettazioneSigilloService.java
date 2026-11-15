package it.edodoc.hq.services;

import it.edodoc.hq.models.Config;
import it.edodoc.hq.repositories.ConfigRepository;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.ExternalSigningSupport;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.PDSignature;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.SignatureOptions;
import org.bouncycastle.asn1.ASN1EncodableVector;
import org.bouncycastle.asn1.ASN1Primitive;
import org.bouncycastle.asn1.DERSet;
import org.bouncycastle.asn1.cms.Attribute;
import org.bouncycastle.asn1.cms.AttributeTable;
import org.bouncycastle.asn1.cms.CMSAttributes;
import org.bouncycastle.asn1.ess.ESSCertIDv2;
import org.bouncycastle.asn1.ess.SigningCertificateV2;
import org.bouncycastle.asn1.nist.NISTObjectIdentifiers;
import org.bouncycastle.asn1.pkcs.PKCSObjectIdentifiers;
import org.bouncycastle.asn1.x500.X500NameBuilder;
import org.bouncycastle.asn1.x500.style.BCStyle;
import org.bouncycastle.asn1.x509.AlgorithmIdentifier;
import org.bouncycastle.asn1.x509.BasicConstraints;
import org.bouncycastle.asn1.x509.Extension;
import org.bouncycastle.asn1.x509.KeyUsage;
import org.bouncycastle.cert.jcajce.JcaCertStore;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.cms.CMSAttributeTableGenerator;
import org.bouncycastle.cms.CMSProcessableByteArray;
import org.bouncycastle.cms.CMSSignedData;
import org.bouncycastle.cms.CMSSignedDataGenerator;
import org.bouncycastle.cms.DefaultSignedAttributeTableGenerator;
import org.bouncycastle.cms.SignerInformation;
import org.bouncycastle.cms.SignerInformationStore;
import org.bouncycastle.cms.jcajce.JcaSignerInfoGeneratorBuilder;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.bouncycastle.operator.jcajce.JcaDigestCalculatorProviderBuilder;
import org.bouncycastle.tsp.TimeStampToken;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigInteger;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.SecureRandom;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.Calendar;
import java.util.Collections;
import java.util.Date;
import java.util.HexFormat;
import java.util.List;

/**
 * Sigillo PAdES (ETSI.CAdES.detached) del PDF firmato, con marca temporale della firma incorporata quando la TSA
 * risponde (PAdES-B-T). Il certificato viene da {@code ACCETTAZIONE_SIGILLO_P12}; se manca se ne genera uno autofirmato
 * del dottore e lo si salva in config, così tutti i moduli portano lo stesso sigillo.
 */
@Service
public class AccettazioneSigilloService {

    private static final Logger logger = LoggerFactory.getLogger(AccettazioneSigilloService.class);
    static final String CONFIG_P12 = "ACCETTAZIONE_SIGILLO_P12";
    static final String CONFIG_P12_PASSWORD = "ACCETTAZIONE_SIGILLO_P12_PASSWORD";

    private final ConfigRepository configRepository;
    private final MarcaTemporaleService marcaTemporale;
    private volatile Chiave chiave;

    public AccettazioneSigilloService(ConfigRepository configRepository, MarcaTemporaleService marcaTemporale) {
        this.configRepository = configRepository;
        this.marcaTemporale = marcaTemporale;
    }

    record Chiave(PrivateKey privata, X509Certificate certificato) {
    }

    /** Esito: PDF sigillato, certificato usato (PEM), marca della firma se ottenuta. */
    public record Sigillato(byte[] pdf, String certificatoPem, MarcaTemporaleService.Marca marca, String erroreMarca) {
    }

    public Sigillato sigilla(byte[] pdf, String codice, Calendar quando) {
        Chiave k = chiave();
        MarcaTemporaleService.Marca[] marca = new MarcaTemporaleService.Marca[1];
        String[] errore = new String[1];
        try (PDDocument doc = PDDocument.load(pdf);
             SignatureOptions opzioni = new SignatureOptions()) {
            PDSignature firma = new PDSignature();
            firma.setFilter(PDSignature.FILTER_ADOBE_PPKLITE);
            firma.setSubFilter(PDSignature.SUBFILTER_ETSI_CADES_DETACHED);
            firma.setName(titolare());
            firma.setLocation("Italia");
            firma.setReason("Sigillo del modulo di accettazione firmato " + codice);
            firma.setContactInfo(config("ACCETTAZIONE_EMAIL_PRIVACY"));
            firma.setSignDate(quando);
            // Spazio per CMS + certificato + token della marca temporale con la catena della TSA.
            opzioni.setPreferredSignatureSize(SignatureOptions.DEFAULT_SIGNATURE_SIZE * 4);
            doc.addSignature(firma, opzioni);

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ExternalSigningSupport esterna = doc.saveIncrementalForExternalSigning(out);
            byte[] contenuto;
            try (InputStream in = esterna.getContent()) {
                contenuto = in.readAllBytes();
            }
            esterna.setSignature(cms(contenuto, k, marca, errore));
            return new Sigillato(out.toByteArray(), pem(k.certificato()), marca[0], errore[0]);
        } catch (IOException e) {
            throw new IllegalStateException("Sigillo del PDF non riuscito", e);
        }
    }

    private byte[] cms(byte[] contenuto, Chiave k, MarcaTemporaleService.Marca[] marca, String[] errore) {
        try {
            byte[] certSha = MessageDigest.getInstance("SHA-256").digest(k.certificato().getEncoded());
            SigningCertificateV2 sc = new SigningCertificateV2(new ESSCertIDv2[]{
                    new ESSCertIDv2(new AlgorithmIdentifier(NISTObjectIdentifiers.id_sha256), certSha)});
            ASN1EncodableVector firmati = new ASN1EncodableVector();
            firmati.add(new Attribute(PKCSObjectIdentifiers.id_aa_signingCertificateV2, new DERSet(sc)));
            DefaultSignedAttributeTableGenerator base = new DefaultSignedAttributeTableGenerator(new AttributeTable(firmati));
            // PAdES: l'ora della firma sta nel dizionario /M del PDF, non nel signing-time del CMS.
            CMSAttributeTableGenerator senzaOra = parametri -> base.getAttributes(parametri).remove(CMSAttributes.signingTime);

            ContentSigner signer = new JcaContentSignerBuilder("SHA256withRSA").build(k.privata());
            CMSSignedDataGenerator gen = new CMSSignedDataGenerator();
            gen.addSignerInfoGenerator(new JcaSignerInfoGeneratorBuilder(new JcaDigestCalculatorProviderBuilder().build())
                    .setSignedAttributeGenerator(senzaOra)
                    .build(signer, k.certificato()));
            gen.addCertificates(new JcaCertStore(List.of(k.certificato())));
            CMSSignedData firmato = gen.generate(new CMSProcessableByteArray(contenuto), false);

            SignerInformation si = firmato.getSignerInfos().getSigners().iterator().next();
            try {
                MarcaTemporaleService.Marca m = marcaTemporale.marcaDati(si.getSignature());
                TimeStampToken token = new TimeStampToken(new CMSSignedData(m.token()));
                ASN1EncodableVector nonFirmati = new ASN1EncodableVector();
                nonFirmati.add(new Attribute(PKCSObjectIdentifiers.id_aa_signatureTimeStampToken,
                        new DERSet(ASN1Primitive.fromByteArray(token.getEncoded()))));
                si = SignerInformation.replaceUnsignedAttributes(si, new AttributeTable(nonFirmati));
                firmato = CMSSignedData.replaceSigners(firmato, new SignerInformationStore(si));
                marca[0] = m;
            } catch (Exception e) {
                logger.warn("[FIRMA] Sigillo senza marca temporale incorporata: {}", e.getMessage());
                errore[0] = e.getMessage();
            }
            return firmato.getEncoded();
        } catch (Exception e) {
            throw new IllegalStateException("Firma CMS del sigillo non riuscita", e);
        }
    }

    // ------------------------------------------------------------------ chiave del sigillo

    Chiave chiave() {
        Chiave k = chiave;
        if (k == null) {
            synchronized (this) {
                if (chiave == null) {
                    chiave = caricaOGenera();
                }
                k = chiave;
            }
        }
        return k;
    }

    private Chiave caricaOGenera() {
        String p12 = config(CONFIG_P12);
        if (!p12.isEmpty()) {
            return carica(Base64.getDecoder().decode(p12), config(CONFIG_P12_PASSWORD).toCharArray());
        }
        logger.warn("[FIRMA] {} vuoto: genero un sigillo autofirmato", CONFIG_P12);
        try {
            KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA");
            kpg.initialize(3072, new SecureRandom());
            KeyPair kp = kpg.generateKeyPair();
            Instant ora = Instant.now();
            X500NameBuilder dn = new X500NameBuilder(BCStyle.INSTANCE)
                    .addRDN(BCStyle.C, "IT")
                    .addRDN(BCStyle.O, titolare());
            String partitaIva = config("EMITTENTE_PARTITA_IVA").replaceAll("\\s", "");
            if (!partitaIva.isEmpty()) {
                dn.addRDN(BCStyle.ORGANIZATION_IDENTIFIER, "VATIT-" + partitaIva);
            }
            var nome = dn.addRDN(BCStyle.CN, titolare() + " - Sigillo moduli di accettazione").build();
            var builder = new JcaX509v3CertificateBuilder(nome, new BigInteger(64, new SecureRandom()).abs(),
                    Date.from(ora.minus(1, ChronoUnit.DAYS)), Date.from(ora.plus(30 * 366, ChronoUnit.DAYS)),
                    nome, kp.getPublic());
            builder.addExtension(Extension.basicConstraints, true, new BasicConstraints(false));
            builder.addExtension(Extension.keyUsage, true,
                    new KeyUsage(KeyUsage.digitalSignature | KeyUsage.nonRepudiation));
            X509Certificate cert = new JcaX509CertificateConverter().getCertificate(
                    builder.build(new JcaContentSignerBuilder("SHA256withRSA").build(kp.getPrivate())));

            char[] password = HexFormat.of().formatHex(randomBytes(24)).toCharArray();
            KeyStore ks = KeyStore.getInstance("PKCS12");
            ks.load(null, null);
            ks.setKeyEntry("sigillo", kp.getPrivate(), password, new Certificate[]{cert});
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ks.store(out, password);
            salva(CONFIG_P12, Base64.getEncoder().encodeToString(out.toByteArray()));
            salva(CONFIG_P12_PASSWORD, new String(password));
            return new Chiave(kp.getPrivate(), cert);
        } catch (Exception e) {
            throw new IllegalStateException("Generazione del sigillo non riuscita", e);
        }
    }

    private static Chiave carica(byte[] p12, char[] password) {
        try {
            KeyStore ks = KeyStore.getInstance("PKCS12");
            ks.load(new ByteArrayInputStream(p12), password);
            for (String alias : Collections.list(ks.aliases())) {
                if (ks.isKeyEntry(alias)) {
                    return new Chiave((PrivateKey) ks.getKey(alias, password), (X509Certificate) ks.getCertificate(alias));
                }
            }
            throw new IllegalStateException("Il PKCS#12 del sigillo non contiene una chiave privata");
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("PKCS#12 del sigillo non leggibile", e);
        }
    }

    private static byte[] randomBytes(int n) {
        byte[] b = new byte[n];
        new SecureRandom().nextBytes(b);
        return b;
    }

    static String pem(X509Certificate cert) {
        try {
            return "-----BEGIN CERTIFICATE-----\n"
                    + Base64.getMimeEncoder(64, "\n".getBytes()).encodeToString(cert.getEncoded())
                    + "\n-----END CERTIFICATE-----\n";
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private String titolare() {
        String nome = config("EMITTENTE_NOME");
        return nome.isEmpty() ? "Dott. Edoardo Bo" : nome;
    }

    private String config(String chiave) {
        return configRepository.findByChiave(chiave).map(Config::getValore).map(String::strip).orElse("");
    }

    private void salva(String chiave, String valore) {
        Config c = configRepository.findByChiave(chiave).orElseGet(() -> {
            Config n = new Config();
            n.setChiave(chiave);
            return n;
        });
        c.setValore(valore);
        configRepository.save(c);
    }

    /** {@code true} se il sigillo è quello generato dal gestionale (autofirmato), non uno di un fornitore. */
    public boolean isAutofirmato() {
        X509Certificate c = chiave().certificato();
        return c.getSubjectX500Principal().equals(c.getIssuerX500Principal());
    }

    /** Solo per i test: certificato del sigillo in uso. */
    X509Certificate certificato() {
        return chiave().certificato();
    }
}
