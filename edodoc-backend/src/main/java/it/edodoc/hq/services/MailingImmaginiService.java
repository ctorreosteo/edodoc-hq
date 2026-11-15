package it.edodoc.hq.services;

import it.edodoc.hq.dto.MailingDto;
import it.edodoc.hq.models.MailingImmagine;
import it.edodoc.hq.repositories.MailingImmagineRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Iterator;
import java.util.Optional;

/**
 * Immagini caricate dall'editor email, servite pubblicamente per token (i client di posta non sono autenticati).
 * Formati jpg, png, gif, webp (riconosciuti dai primi byte, non dal nome), massimo 5 MB. JPEG e PNG più larghi di
 * 1200 px si ridimensionano (l'email è larga 600 px: 1200 basta per gli schermi retina); GIF (anche animate) e WebP
 * restano intatti.
 */
@Service
public class MailingImmaginiService {

    private static final Logger logger = LoggerFactory.getLogger(MailingImmaginiService.class);
    static final int MASSIMO_BYTE = 5 * 1024 * 1024;
    static final int LARGHEZZA_MASSIMA = 1200;

    private final MailingImmagineRepository repository;
    private final MailingConfigService config;

    public MailingImmaginiService(MailingImmagineRepository repository, MailingConfigService config) {
        this.repository = repository;
        this.config = config;
    }

    @Transactional
    public MailingDto.Immagine carica(MultipartFile file, Long utenteId) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nessuna immagine ricevuta");
        }
        if (file.getSize() > MASSIMO_BYTE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Immagine troppo pesante (massimo 5 MB)");
        }
        byte[] dati;
        try {
            dati = file.getBytes();
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Immagine illeggibile");
        }
        String tipo = tipo(dati);
        if (tipo == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Formato non supportato: usa JPG, PNG, GIF o WebP");
        }
        Elaborata e = elabora(dati, tipo);
        String nome = file.getOriginalFilename();
        MailingImmagine img = repository.save(MailingImmagine.builder()
                .token(MailingToken.nuovo(MailingToken.IMMAGINE))
                .nomeFile(nome != null && nome.length() > 255 ? nome.substring(nome.length() - 255) : nome)
                .mimeType(e.tipo())
                .larghezza(e.larghezza())
                .altezza(e.altezza())
                .byteDimensione(e.dati().length)
                .contenuto(e.dati())
                .creatoDaUtenteId(utenteId)
                .creatoIl(MailingTempo.adesso())
                .build());
        return new MailingDto.Immagine(img.getId(), url(img.getToken()), img.getLarghezza(), img.getAltezza());
    }

    @Transactional(readOnly = true)
    public Optional<MailingImmagine> perToken(String token) {
        if (token == null || token.length() > 64 || !token.chars().allMatch(Character::isLetterOrDigit)) {
            return Optional.empty();
        }
        return repository.findByToken(token);
    }

    public String url(String token) {
        return config.urlPubblico() + MailingComposizioneService.PERCORSO_PUBBLICO + "/immagini/" + token;
    }

    record Elaborata(byte[] dati, String tipo, Integer larghezza, Integer altezza) {
    }

    /** Dai primi byte, non da quanto dichiara il client. */
    static String tipo(byte[] b) {
        if (b.length >= 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF) {
            return "image/jpeg";
        }
        if (b.length >= 8 && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G'
                && b[4] == 0x0D && b[5] == 0x0A && b[6] == 0x1A && b[7] == 0x0A) {
            return "image/png";
        }
        if (b.length >= 6 && b[0] == 'G' && b[1] == 'I' && b[2] == 'F' && b[3] == '8' && (b[4] == '7' || b[4] == '9') && b[5] == 'a') {
            return "image/gif";
        }
        if (b.length >= 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
                && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') {
            return "image/webp";
        }
        return null;
    }

    static Elaborata elabora(byte[] dati, String tipo) {
        if ("image/gif".equals(tipo)) {
            int[] d = dimensioniGif(dati);
            return new Elaborata(dati, tipo, d != null ? d[0] : null, d != null ? d[1] : null);
        }
        if ("image/webp".equals(tipo)) {
            int[] d = dimensioniWebp(dati);
            return new Elaborata(dati, tipo, d != null ? d[0] : null, d != null ? d[1] : null);
        }
        BufferedImage img;
        try {
            img = ImageIO.read(new ByteArrayInputStream(dati));
        } catch (IOException | RuntimeException e) {
            img = null;
        }
        if (img == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Immagine danneggiata o non leggibile");
        }
        int orientamento = "image/jpeg".equals(tipo) ? orientamentoExif(dati) : 1;
        if (img.getWidth() <= LARGHEZZA_MASSIMA && orientamento == 1) {
            return new Elaborata(dati, tipo, img.getWidth(), img.getHeight());
        }
        try {
            BufferedImage ruotata = orienta(img, orientamento, "image/png".equals(tipo));
            BufferedImage finale = ruotata.getWidth() > LARGHEZZA_MASSIMA ? ridimensiona(ruotata, LARGHEZZA_MASSIMA,
                    "image/png".equals(tipo)) : ruotata;
            byte[] out = "image/png".equals(tipo) ? png(finale) : jpeg(finale, 0.85f);
            return new Elaborata(out, tipo, finale.getWidth(), finale.getHeight());
        } catch (IOException e) {
            logger.warn("[MAILING] Ridimensionamento non riuscito, tengo l'originale: {}", e.getMessage());
            return new Elaborata(dati, tipo, img.getWidth(), img.getHeight());
        }
    }

    static BufferedImage ridimensiona(BufferedImage src, int larghezza, boolean alfa) {
        int altezza = Math.max(1, (int) Math.round(src.getHeight() * (larghezza / (double) src.getWidth())));
        BufferedImage dst = new BufferedImage(larghezza, altezza, alfa ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
        Graphics2D g = dst.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        if (!alfa) {
            g.setColor(java.awt.Color.WHITE);
            g.fillRect(0, 0, larghezza, altezza);
        }
        g.drawImage(src, 0, 0, larghezza, altezza, null);
        g.dispose();
        return dst;
    }

    /** Applica l'orientamento EXIF (i telefoni salvano la foto ruotata e lo dicono nei metadati, persi ricodificando). */
    static BufferedImage orienta(BufferedImage src, int orientamento, boolean alfa) {
        if (orientamento <= 1 || orientamento > 8) {
            return src;
        }
        int w = src.getWidth();
        int h = src.getHeight();
        boolean scambia = orientamento >= 5;
        AffineTransform t = new AffineTransform();
        switch (orientamento) {
            case 2 -> { t.translate(w, 0); t.scale(-1, 1); }
            case 3 -> { t.translate(w, h); t.rotate(Math.PI); }
            case 4 -> { t.translate(0, h); t.scale(1, -1); }
            case 5 -> { t.rotate(-Math.PI / 2); t.scale(-1, 1); }
            case 6 -> { t.translate(h, 0); t.rotate(Math.PI / 2); }
            case 7 -> { t.scale(-1, 1); t.translate(-h, 0); t.translate(0, w); t.rotate(3 * Math.PI / 2); }
            case 8 -> { t.translate(0, w); t.rotate(3 * Math.PI / 2); }
            default -> { }
        }
        BufferedImage dst = new BufferedImage(scambia ? h : w, scambia ? w : h,
                alfa ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
        Graphics2D g = dst.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.drawImage(src, t, null);
        g.dispose();
        return dst;
    }

    private static byte[] png(BufferedImage img) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return out.toByteArray();
    }

    private static byte[] jpeg(BufferedImage img, float qualita) throws IOException {
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("jpeg");
        if (!writers.hasNext()) {
            throw new IOException("Nessun encoder JPEG");
        }
        ImageWriter w = writers.next();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ImageOutputStream ios = ImageIO.createImageOutputStream(out)) {
            w.setOutput(ios);
            ImageWriteParam p = w.getDefaultWriteParam();
            p.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            p.setCompressionQuality(qualita);
            w.write(null, new IIOImage(img, null, null), p);
        } finally {
            w.dispose();
        }
        return out.toByteArray();
    }

    /** Larghezza e altezza dal logical screen descriptor della GIF. */
    static int[] dimensioniGif(byte[] b) {
        if (b.length < 10) {
            return null;
        }
        return new int[]{(b[6] & 0xFF) | (b[7] & 0xFF) << 8, (b[8] & 0xFF) | (b[9] & 0xFF) << 8};
    }

    /** Dimensioni di un WebP (VP8, VP8L o VP8X); null se il formato non è riconosciuto. */
    static int[] dimensioniWebp(byte[] b) {
        if (b.length < 30) {
            return null;
        }
        String chunk = new String(b, 12, 4, java.nio.charset.StandardCharsets.US_ASCII);
        switch (chunk) {
            case "VP8 " -> {
                int w = ((b[26] & 0xFF) | (b[27] & 0xFF) << 8) & 0x3FFF;
                int h = ((b[28] & 0xFF) | (b[29] & 0xFF) << 8) & 0x3FFF;
                return new int[]{w, h};
            }
            case "VP8L" -> {
                int b0 = b[21] & 0xFF;
                int b1 = b[22] & 0xFF;
                int b2 = b[23] & 0xFF;
                int b3 = b[24] & 0xFF;
                int w = 1 + (((b1 & 0x3F) << 8) | b0);
                int h = 1 + (((b3 & 0xF) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6));
                return new int[]{w, h};
            }
            case "VP8X" -> {
                int w = 1 + ((b[24] & 0xFF) | (b[25] & 0xFF) << 8 | (b[26] & 0xFF) << 16);
                int h = 1 + ((b[27] & 0xFF) | (b[28] & 0xFF) << 8 | (b[29] & 0xFF) << 16);
                return new int[]{w, h};
            }
            default -> {
                return null;
            }
        }
    }

    /** Tag EXIF Orientation (0x0112) di un JPEG; 1 se assente. */
    static int orientamentoExif(byte[] b) {
        try {
            int i = 2;
            while (i + 4 < b.length && (b[i] & 0xFF) == 0xFF) {
                int marker = b[i + 1] & 0xFF;
                int lunghezza = ((b[i + 2] & 0xFF) << 8) | (b[i + 3] & 0xFF);
                if (marker == 0xE1 && i + 10 < b.length && b[i + 4] == 'E' && b[i + 5] == 'x' && b[i + 6] == 'i' && b[i + 7] == 'f') {
                    int tiff = i + 10;
                    boolean le = b[tiff] == 'I';
                    int ifd = tiff + leggi(b, tiff + 4, 4, le);
                    int voci = leggi(b, ifd, 2, le);
                    for (int k = 0; k < voci; k++) {
                        int voce = ifd + 2 + k * 12;
                        if (leggi(b, voce, 2, le) == 0x0112) {
                            return leggi(b, voce + 8, 2, le);
                        }
                    }
                    return 1;
                }
                if (marker == 0xDA) {
                    break;
                }
                i += 2 + lunghezza;
            }
        } catch (RuntimeException e) {
            return 1;
        }
        return 1;
    }

    private static int leggi(byte[] b, int pos, int n, boolean le) {
        int v = 0;
        for (int k = 0; k < n; k++) {
            int byteVal = b[pos + k] & 0xFF;
            v = le ? v | byteVal << (8 * k) : (v << 8) | byteVal;
        }
        return v;
    }
}
