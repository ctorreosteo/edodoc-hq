package it.edodoc.hq.services;

import it.edodoc.hq.dto.PlannerDto;
import it.edodoc.hq.models.PlannerMedia;
import it.edodoc.hq.models.PlannerMediaAnteprima;
import it.edodoc.hq.models.PlannerMediaFile;
import it.edodoc.hq.repositories.PlannerMediaAnteprimaRepository;
import it.edodoc.hq.repositories.PlannerMediaFileRepository;
import it.edodoc.hq.repositories.PlannerMediaRepository;
import it.edodoc.hq.repositories.PlannerPostMediaRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Libreria media del Planner social. Le immagini diventano JPEG (Instagram accetta solo quello) con il lato lungo al
 * massimo di {@value #LATO_MASSIMO} px; i video restano come sono (MP4 o MOV, fino al limite multipart di 100 MB).
 *
 * <p>Ogni media ha un indirizzo pubblico per token ({@code /api/pubblico/planner/media/<token>}): Instagram, Facebook
 * e Google scaricano i file da lì, come fanno i client di posta con le immagini dell'Email Marketing. Il token è
 * casuale di 32 caratteri e non si ricava dall'id.
 */
@Service
public class PlannerMediaService {

    public static final String PERCORSO_PUBBLICO = "/pubblico/planner/media/";

    static final long MAX_BYTE_IMMAGINE = 20L * 1024 * 1024;
    static final long MAX_BYTE_VIDEO = 100L * 1024 * 1024;
    static final int LATO_MASSIMO = 2160;
    static final int LATO_ANTEPRIMA = 480;
    private static final int LIMITE_ELENCO = 300;

    private final PlannerMediaRepository repository;
    private final PlannerMediaFileRepository fileRepository;
    private final PlannerMediaAnteprimaRepository anteprimaRepository;
    private final PlannerPostMediaRepository postMediaRepository;
    private final PlannerUtenti anagrafica;
    private final String urlPubblico;

    public PlannerMediaService(PlannerMediaRepository repository, PlannerMediaFileRepository fileRepository,
                               PlannerMediaAnteprimaRepository anteprimaRepository,
                               PlannerPostMediaRepository postMediaRepository, PlannerUtenti anagrafica,
                               @Value("${app.planner.url-pubblico:}") String urlPubblico) {
        this.repository = repository;
        this.fileRepository = fileRepository;
        this.anteprimaRepository = anteprimaRepository;
        this.postMediaRepository = postMediaRepository;
        this.anagrafica = anagrafica;
        this.urlPubblico = urlPubblico == null ? "" : urlPubblico.trim().replaceAll("/+$", "");
    }

    // ── Libreria ──

    @Transactional(readOnly = true)
    public List<PlannerDto.Media> elenco(String tipo, String cerca) {
        String t = StringUtils.hasText(tipo) && !"TUTTI".equalsIgnoreCase(tipo) ? tipo.trim().toUpperCase(Locale.ROOT) : null;
        String q = StringUtils.hasText(cerca) ? "%" + cerca.trim().toLowerCase(Locale.ROOT) + "%" : null;
        return dto(repository.cerca(t, q, PageRequest.of(0, LIMITE_ELENCO)));
    }

    @Transactional
    public PlannerDto.Media carica(MultipartFile file, MultipartFile anteprima, Double durata, Integer larghezza,
                                   Integer altezza, String tag) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Nessun file ricevuto.");
        }
        byte[] dati;
        try {
            dati = file.getBytes();
        } catch (IOException e) {
            throw new IllegalArgumentException("File illeggibile.");
        }
        String video = tipoVideo(dati);
        String nome = nomeFile(file.getOriginalFilename());
        PlannerMedia.PlannerMediaBuilder m = PlannerMedia.builder()
                .token(MailingToken.nuovo(MailingToken.IMMAGINE))
                .tag(StringUtils.hasText(tag) ? PlannerUtenti.tronca(tag, 200) : null)
                .creatoDaUtenteId(anagrafica.operatoreCorrenteId())
                .creatoIl(LocalDateTime.now());
        byte[] contenuto;
        byte[] miniatura;
        if (video != null) {
            if (dati.length > MAX_BYTE_VIDEO) {
                throw new IllegalArgumentException("Il video supera i 100 MB.");
            }
            contenuto = dati;
            miniatura = anteprima == null || anteprima.isEmpty() ? null : miniatura(leggi(anteprima));
            m.tipo(PlannerMedia.TIPO_VIDEO).mimeType(video).nomeFile(nome)
                    .larghezza(positivo(larghezza)).altezza(positivo(altezza))
                    .durataSecondi(durata != null && durata > 0 && durata < 86_400
                            ? BigDecimal.valueOf(durata).setScale(2, RoundingMode.HALF_UP) : null);
        } else {
            if (dati.length > MAX_BYTE_IMMAGINE) {
                throw new IllegalArgumentException("L'immagine supera i 20 MB.");
            }
            BufferedImage img = immagine(dati);
            if (img == null) {
                throw new IllegalArgumentException("Formato non supportato: carica immagini JPG o PNG, video MP4 o MOV.");
            }
            BufferedImage ridotta = riduci(img, LATO_MASSIMO);
            contenuto = jpeg(ridotta, 0.92f);
            miniatura = jpeg(riduci(ridotta, LATO_ANTEPRIMA), 0.8f);
            m.tipo(PlannerMedia.TIPO_IMMAGINE).mimeType("image/jpeg")
                    .larghezza(ridotta.getWidth()).altezza(ridotta.getHeight())
                    .nomeFile(nome == null ? null : nome.replaceFirst("(?i)\\.(png|jpe?g|webp|gif)$", "") + ".jpg");
        }
        PlannerMedia salvato = repository.save(m.byteDimensione(contenuto.length).build());
        fileRepository.save(PlannerMediaFile.builder().mediaId(salvato.getId()).contenuto(contenuto).build());
        if (miniatura != null) {
            anteprimaRepository.save(PlannerMediaAnteprima.builder().mediaId(salvato.getId()).contenuto(miniatura).build());
        }
        return dto(List.of(salvato)).get(0);
    }

    @Transactional
    public PlannerDto.Media aggiornaTag(Long id, String tag) {
        PlannerMedia m = trova(id);
        m.setTag(StringUtils.hasText(tag) ? PlannerUtenti.tronca(tag, 200) : null);
        return dto(List.of(repository.save(m))).get(0);
    }

    @Transactional
    public void elimina(Long id) {
        PlannerMedia m = trova(id);
        long usi = postMediaRepository.countByMediaId(id);
        if (usi > 0) {
            throw new IllegalArgumentException("Questo media è usato in " + usi + " post: toglilo dai post prima di eliminarlo.");
        }
        repository.delete(m);
    }

    // ── File (pubblici per token) ──

    @Transactional(readOnly = true)
    public Optional<PlannerMedia> perToken(String token) {
        if (token == null || token.length() > 48 || !token.chars().allMatch(Character::isLetterOrDigit)) {
            return Optional.empty();
        }
        return repository.findByToken(token);
    }

    @Transactional(readOnly = true)
    public byte[] contenuto(Long mediaId) {
        return fileRepository.findById(mediaId).map(PlannerMediaFile::getContenuto)
                .orElseThrow(() -> new IllegalArgumentException("File del media non trovato."));
    }

    @Transactional(readOnly = true)
    public Optional<byte[]> anteprima(Long mediaId) {
        return anteprimaRepository.findById(mediaId).map(PlannerMediaAnteprima::getContenuto);
    }

    /** Indirizzo assoluto che le piattaforme possono scaricare (serve {@code app.planner.url-pubblico}). */
    public String urlAssoluto(PlannerMedia m) {
        if (!StringUtils.hasText(urlPubblico)) {
            throw new IllegalStateException("Manca app.planner.url-pubblico: le piattaforme non possono scaricare i media.");
        }
        return urlPubblico + "/api" + PERCORSO_PUBBLICO + m.getToken();
    }

    // ── DTO ──

    public List<PlannerDto.Media> dto(Collection<PlannerMedia> media) {
        if (media.isEmpty()) {
            return List.of();
        }
        List<Long> ids = media.stream().map(PlannerMedia::getId).toList();
        Map<Long, Long> usi = new HashMap<>();
        for (Object[] r : postMediaRepository.usi(ids)) {
            usi.put((Long) r[0], (Long) r[1]);
        }
        Map<Long, String> nomi = anagrafica.nomiUtenti(media.stream().map(PlannerMedia::getCreatoDaUtenteId).toList());
        java.util.Set<Long> conAnteprima = new java.util.HashSet<>();
        anteprimaRepository.findAllById(ids).forEach(a -> conAnteprima.add(a.getMediaId()));
        return media.stream().map(m -> new PlannerDto.Media(
                m.getId(),
                PERCORSO_PUBBLICO + m.getToken(),
                conAnteprima.contains(m.getId()) ? PERCORSO_PUBBLICO + m.getToken() + "/anteprima" : null,
                m.getNomeFile(),
                m.getMimeType(),
                m.getTipo(),
                m.getLarghezza(),
                m.getAltezza(),
                m.getDurataSecondi() == null ? null : m.getDurataSecondi().doubleValue(),
                m.getByteDimensione(),
                m.getTag(),
                usi.getOrDefault(m.getId(), 0L),
                nomi.get(m.getCreatoDaUtenteId()),
                PlannerCanali.iso(m.getCreatoIl()))).toList();
    }

    PlannerMedia trova(Long id) {
        return repository.findById(id).orElseThrow(() -> new IllegalArgumentException("Media non trovato."));
    }

    // ── Supporto ──

    /** MP4/MOV dai primi byte (box {@code ftyp}); null se non è un video riconosciuto. */
    static String tipoVideo(byte[] b) {
        if (b.length < 12 || b[4] != 'f' || b[5] != 't' || b[6] != 'y' || b[7] != 'p') {
            return null;
        }
        String brand = new String(b, 8, 4, java.nio.charset.StandardCharsets.US_ASCII);
        return "qt  ".equals(brand) ? "video/quicktime" : "video/mp4";
    }

    private static BufferedImage immagine(byte[] dati) {
        try {
            return ImageIO.read(new ByteArrayInputStream(dati));
        } catch (IOException e) {
            return null;
        }
    }

    private static BufferedImage leggi(MultipartFile f) {
        try {
            return ImageIO.read(new ByteArrayInputStream(f.getBytes()));
        } catch (IOException e) {
            return null;
        }
    }

    private static byte[] miniatura(BufferedImage img) {
        return img == null ? null : jpeg(riduci(img, LATO_ANTEPRIMA), 0.8f);
    }

    /** Lato lungo al massimo {@code lato}, su fondo bianco (il JPEG non ha trasparenza). */
    static BufferedImage riduci(BufferedImage img, int lato) {
        int w = img.getWidth();
        int h = img.getHeight();
        double scala = Math.min(1.0, (double) lato / Math.max(w, h));
        int nw = Math.max(1, (int) Math.round(w * scala));
        int nh = Math.max(1, (int) Math.round(h * scala));
        if (scala == 1.0 && img.getType() == BufferedImage.TYPE_INT_RGB) {
            return img;
        }
        BufferedImage out = new BufferedImage(nw, nh, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, nw, nh);
        g.drawImage(img, 0, 0, nw, nh, null);
        g.dispose();
        return out;
    }

    static byte[] jpeg(BufferedImage img, float qualita) {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            ImageWriter writer = ImageIO.getImageWritersByFormatName("jpg").next();
            ImageWriteParam param = writer.getDefaultWriteParam();
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionQuality(qualita);
            try (ImageOutputStream ios = ImageIO.createImageOutputStream(out)) {
                writer.setOutput(ios);
                writer.write(null, new IIOImage(img, null, null), param);
            } finally {
                writer.dispose();
            }
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalArgumentException("Immagine non elaborabile.");
        }
    }

    private static String nomeFile(String nome) {
        if (!StringUtils.hasText(nome)) {
            return null;
        }
        String n = nome.replaceAll("[\\\\/]", "_").trim();
        return n.length() > 255 ? n.substring(n.length() - 255) : n;
    }

    private static Integer positivo(Integer v) {
        return v != null && v > 0 && v < 20_000 ? v : null;
    }
}
