package it.edodoc.hq.services;

import it.edodoc.hq.dto.CorsiDto;
import it.edodoc.hq.exception.ConflittoException;
import it.edodoc.hq.exception.RisorsaNonTrovataException;
import it.edodoc.hq.models.Copertina;
import it.edodoc.hq.models.Corso;
import it.edodoc.hq.models.Lezione;
import it.edodoc.hq.models.Modulo;
import it.edodoc.hq.repositories.CopertinaRepository;
import it.edodoc.hq.repositories.CorsoRepository;
import it.edodoc.hq.repositories.LezioneRepository;
import it.edodoc.hq.repositories.ModuloRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/** Corsi del dottore per i pazienti: costruzione dal gestionale e lettura dall'app. */
@Service
public class CorsoService {

    private static final Set<String> TIPI_COPERTINA = Set.of("image/jpeg", "image/png", "image/webp");

    private final CorsoRepository corsoRepository;
    private final ModuloRepository moduloRepository;
    private final LezioneRepository lezioneRepository;
    private final CopertinaRepository copertinaRepository;
    private final CloudflareStreamService cloudflare;

    public CorsoService(CorsoRepository corsoRepository, ModuloRepository moduloRepository,
                        LezioneRepository lezioneRepository, CopertinaRepository copertinaRepository,
                        CloudflareStreamService cloudflare) {
        this.corsoRepository = corsoRepository;
        this.moduloRepository = moduloRepository;
        this.lezioneRepository = lezioneRepository;
        this.copertinaRepository = copertinaRepository;
        this.cloudflare = cloudflare;
    }

    // Catalogo e corsi

    @Transactional(readOnly = true)
    public List<CorsiDto.RigaCorso> catalogo() {
        Map<Long, Long> moduli = moduloRepository.contaPerCorso().stream()
                .collect(Collectors.toMap(r -> (Long) r[0], r -> (Long) r[1]));
        Map<Long, List<Lezione>> lezioni = lezioneRepository.findTutte().stream()
                .collect(Collectors.groupingBy(l -> l.getModulo().getCorso().getId()));
        return corsoRepository.findCatalogo().stream()
                .map(c -> riga(c, moduli.getOrDefault(c.getId(), 0L), lezioni.getOrDefault(c.getId(), List.of())))
                .toList();
    }

    @Transactional(readOnly = true)
    public CorsiDto.Struttura struttura(Long corsoId) {
        Corso corso = corso(corsoId);
        List<Modulo> moduli = moduloRepository.findByCorsoIdOrderByOrdineAscIdAsc(corsoId);
        List<Lezione> lezioni = lezioneRepository.findDelCorso(corsoId);
        Map<Long, List<Lezione>> perModulo = lezioni.stream().collect(Collectors.groupingBy(l -> l.getModulo().getId()));
        return new CorsiDto.Struttura(riga(corso, moduli.size(), lezioni), moduli.stream()
                .map(m -> new CorsiDto.ModuloConLezioni(CorsiDto.RigaModulo.da(m),
                        perModulo.getOrDefault(m.getId(), List.of()).stream().map(CorsiDto.RigaLezione::da).toList()))
                .toList());
    }

    @Transactional
    public Long creaCorso(CorsiDto.SalvaCorso r) {
        Corso corso = new Corso();
        corso.setTitolo(r.titolo().trim());
        corso.setDescrizione(vuotoNull(r.descrizione()));
        return corsoRepository.save(corso).getId();
    }

    @Transactional
    public void aggiornaCorso(Long id, CorsiDto.SalvaCorso r) {
        Corso corso = corso(id);
        corso.setTitolo(r.titolo().trim());
        corso.setDescrizione(vuotoNull(r.descrizione()));
    }

    /** I video si tolgono da Cloudflare solo a database confermato: un errore non deve lasciare lezioni senza video. */
    @Transactional
    public void eliminaCorso(Long id) {
        Corso corso = corso(id);
        List<Modulo> moduli = moduloRepository.findByCorsoIdOrderByOrdineAscIdAsc(id);
        List<Lezione> lezioni = lezioneRepository.findDelCorso(id);
        lezioneRepository.deleteAll(lezioni);
        moduloRepository.deleteAll(moduli);
        corsoRepository.delete(corso);
        moduli.stream().map(Modulo::getCopertinaId).filter(Objects::nonNull).forEach(copertinaRepository::deleteById);
        if (corso.getCopertinaId() != null) {
            copertinaRepository.deleteById(corso.getCopertinaId());
        }
        corsoRepository.flush();
        lezioni.forEach(l -> cloudflare.elimina(l.getCloudflareUid()));
    }

    @Transactional
    public void pubblicaCorso(Long id, boolean pubblicato) {
        Corso corso = corso(id);
        if (pubblicato && lezioneRepository.findDelCorso(id).stream().noneMatch(l -> l.getPubblicata() && l.isCompleta())) {
            throw new ConflittoException("Pubblica almeno una lezione prima di pubblicare il corso");
        }
        corso.setPubblicato(pubblicato);
    }

    @Transactional
    public void cambiaCopertinaCorso(Long id, MultipartFile file) {
        Corso corso = corso(id);
        corso.setCopertinaId(sostituisci(corso.getCopertinaId(), file));
    }

    @Transactional
    public void cambiaCopertinaModulo(Long id, MultipartFile file) {
        Modulo modulo = modulo(id);
        modulo.setCopertinaId(sostituisci(modulo.getCopertinaId(), file));
    }

    @Transactional(readOnly = true)
    public Copertina copertina(UUID id) {
        return copertinaRepository.findById(id).orElseThrow(() -> new RisorsaNonTrovataException("Immagine non trovata"));
    }

    // Moduli

    @Transactional
    public CorsiDto.RigaModulo creaModulo(Long corsoId, CorsiDto.SalvaModulo r) {
        Modulo modulo = new Modulo();
        modulo.setCorso(corso(corsoId));
        modulo.setTitolo(r.titolo().trim());
        modulo.setDescrizione(vuotoNull(r.descrizione()));
        modulo.setOrdine(moduloRepository.findMaxOrdine(corsoId) + 1);
        return CorsiDto.RigaModulo.da(moduloRepository.save(modulo));
    }

    @Transactional
    public CorsiDto.RigaModulo aggiornaModulo(Long id, CorsiDto.SalvaModulo r) {
        Modulo modulo = modulo(id);
        modulo.setTitolo(r.titolo().trim());
        modulo.setDescrizione(vuotoNull(r.descrizione()));
        return CorsiDto.RigaModulo.da(modulo);
    }

    @Transactional
    public void eliminaModulo(Long id) {
        Modulo modulo = modulo(id);
        List<Lezione> lezioni = lezioneRepository.findByModuloIdOrderByOrdineAscIdAsc(id);
        lezioneRepository.deleteAll(lezioni);
        moduloRepository.delete(modulo);
        if (modulo.getCopertinaId() != null) {
            copertinaRepository.deleteById(modulo.getCopertinaId());
        }
        moduloRepository.flush();
        lezioni.forEach(l -> cloudflare.elimina(l.getCloudflareUid()));
    }

    @Transactional
    public void riordinaModuli(Long corsoId, List<Long> ids) {
        List<Modulo> moduli = moduloRepository.findByCorsoIdOrderByOrdineAscIdAsc(corsoId);
        verificaStessiElementi(moduli.stream().map(Modulo::getId).toList(), ids);
        moduli.forEach(m -> m.setOrdine(ids.indexOf(m.getId()) + 1));
    }

    // Lezioni

    @Transactional
    public CorsiDto.RigaLezione creaLezione(Long moduloId, CorsiDto.SalvaLezione r) {
        Lezione lezione = new Lezione();
        lezione.setModulo(modulo(moduloId));
        lezione.setTipo(r.tipo());
        lezione.setOrdine(lezioneRepository.findMaxOrdine(moduloId) + 1);
        applica(lezione, r);
        return CorsiDto.RigaLezione.da(lezioneRepository.save(lezione));
    }

    @Transactional
    public CorsiDto.RigaLezione aggiornaLezione(Long id, CorsiDto.SalvaLezione r) {
        Lezione lezione = lezione(id);
        if (r.tipo() != lezione.getTipo()) {
            throw new IllegalArgumentException("Il tipo di una lezione non si può cambiare");
        }
        applica(lezione, r);
        return CorsiDto.RigaLezione.da(lezione);
    }

    @Transactional
    public void eliminaLezione(Long id) {
        Lezione lezione = lezione(id);
        lezioneRepository.delete(lezione);
        lezioneRepository.flush();
        cloudflare.elimina(lezione.getCloudflareUid());
    }

    @Transactional
    public CorsiDto.RigaLezione pubblicaLezione(Long id, boolean pubblicata) {
        Lezione lezione = lezione(id);
        if (pubblicata && !lezione.isCompleta()) {
            throw new ConflittoException(lezione.getTipo() == Lezione.Tipo.VIDEO
                    ? "Il video non è ancora pronto" : "Scrivi il testo prima di pubblicare");
        }
        lezione.setPubblicata(pubblicata);
        return CorsiDto.RigaLezione.da(lezione);
    }

    @Transactional
    public void riordinaLezioni(Long moduloId, List<Long> ids) {
        List<Lezione> lezioni = lezioneRepository.findByModuloIdOrderByOrdineAscIdAsc(moduloId);
        verificaStessiElementi(lezioni.stream().map(Lezione::getId).toList(), ids);
        lezioni.forEach(l -> l.setOrdine(ids.indexOf(l.getId()) + 1));
    }

    // Video

    /** Il video precedente si elimina subito: la lezione resta nascosta al paziente finché il nuovo non è pronto. */
    @Transactional
    public CorsiDto.UploadVideo avviaUpload(Long id, long dimensioneBytes) {
        Lezione lezione = lezione(id);
        if (lezione.getTipo() != Lezione.Tipo.VIDEO) {
            throw new IllegalArgumentException("Questa lezione non è un video");
        }
        CloudflareStreamService.UploadTus upload = cloudflare.creaUpload(dimensioneBytes, lezione.getTitolo());
        cloudflare.elimina(lezione.getCloudflareUid());
        lezione.setCloudflareUid(upload.uid());
        lezione.setVideoStato(Lezione.VideoStato.CARICAMENTO);
        lezione.setVideoErrore(null);
        lezione.setDurataSecondi(null);
        return new CorsiDto.UploadVideo(upload.uploadUrl());
    }

    @Transactional
    public CorsiDto.StatoVideo sincronizzaVideo(Long id) {
        Lezione lezione = lezione(id);
        if (lezione.getCloudflareUid() == null) {
            throw new ConflittoException("Nessun video caricato per questa lezione");
        }
        CloudflareStreamService.InfoVideo info = cloudflare.leggi(lezione.getCloudflareUid());
        lezione.setVideoStato(statoVideo(info));
        lezione.setVideoErrore(info.errore());
        if (info.durataSecondi() != null) {
            lezione.setDurataSecondi(info.durataSecondi());
        }
        return new CorsiDto.StatoVideo(lezione.getVideoStato(), info.avanzamento(), CorsiDto.RigaLezione.da(lezione));
    }

    @Transactional(readOnly = true)
    public CorsiDto.Riproduzione riproduzioneGestionale(Long id) {
        Lezione lezione = lezione(id);
        if (lezione.getVideoStato() != Lezione.VideoStato.PRONTO) {
            throw new ConflittoException("Il video non è ancora pronto");
        }
        return riproduzione(lezione);
    }

    // App del paziente

    @Transactional(readOnly = true)
    public List<CorsiDto.AppCorso> corsiApp() {
        Map<Corso, List<Lezione>> perCorso = lezioneRepository.findVisibili().stream()
                .collect(Collectors.groupingBy(l -> l.getModulo().getCorso()));
        return perCorso.entrySet().stream()
                .map(e -> CorsiDto.AppCorso.da(e.getKey(), e.getValue()))
                .sorted(Comparator.comparing(c -> c.titolo().toLowerCase()))
                .toList();
    }

    @Transactional(readOnly = true)
    public CorsiDto.AppCorsoDettaglio corsoApp(Long corsoId) {
        List<Lezione> lezioni = lezioneRepository.findVisibili().stream()
                .filter(l -> l.getModulo().getCorso().getId().equals(corsoId))
                .toList();
        if (lezioni.isEmpty()) {
            throw new RisorsaNonTrovataException("Corso non trovato");
        }
        Map<Modulo, List<CorsiDto.AppLezioneRiga>> perModulo = new LinkedHashMap<>();
        lezioni.forEach(l -> perModulo.computeIfAbsent(l.getModulo(), m -> new ArrayList<>()).add(CorsiDto.AppLezioneRiga.da(l)));
        return new CorsiDto.AppCorsoDettaglio(CorsiDto.AppCorso.da(lezioni.get(0).getModulo().getCorso(), lezioni),
                perModulo.entrySet().stream().map(e -> {
                    Modulo m = e.getKey();
                    return new CorsiDto.AppModulo(m.getId(), m.getTitolo(), m.getDescrizione(), m.getCopertinaId(), e.getValue());
                }).toList());
    }

    @Transactional(readOnly = true)
    public CorsiDto.AppLezione lezioneApp(Long id) {
        Lezione l = lezioneRepository.findVisibile(id).orElseThrow(() -> new RisorsaNonTrovataException("Lezione non trovata"));
        boolean video = l.getTipo() == Lezione.Tipo.VIDEO;
        return new CorsiDto.AppLezione(l.getId(), l.getTitolo(), l.getDescrizione(), l.getTipo(), l.getDurataSecondi(),
                video ? null : l.getContenuto(), video ? riproduzione(l) : null);
    }

    // Regole

    /** Una pagina rimasta aperta non deve poter riscrivere l'ordine di elementi che non conosce. */
    static void verificaStessiElementi(List<Long> attuali, List<Long> richiesti) {
        if (richiesti.size() != attuali.size() || !new HashSet<>(richiesti).equals(new HashSet<>(attuali))) {
            throw new ConflittoException("La pagina non è aggiornata: ricaricala e riprova");
        }
    }

    static Lezione.VideoStato statoVideo(CloudflareStreamService.InfoVideo info) {
        if (info.pronto()) {
            return Lezione.VideoStato.PRONTO;
        }
        return switch (info.stato()) {
            case "error" -> Lezione.VideoStato.ERRORE;
            case "pendingupload", "" -> Lezione.VideoStato.CARICAMENTO;
            default -> Lezione.VideoStato.ELABORAZIONE;
        };
    }

    private CorsiDto.Riproduzione riproduzione(Lezione lezione) {
        CloudflareStreamService.Riproduzione r = cloudflare.riproduzione(lezione.getCloudflareUid());
        return new CorsiDto.Riproduzione(r.iframeUrl(), r.hlsUrl());
    }

    private void applica(Lezione lezione, CorsiDto.SalvaLezione r) {
        lezione.setTitolo(r.titolo().trim());
        lezione.setDescrizione(vuotoNull(r.descrizione()));
        if (lezione.getTipo() == Lezione.Tipo.TESTO) {
            lezione.setContenuto(vuotoNull(r.contenuto()));
            if (!lezione.isCompleta()) {
                lezione.setPubblicata(false);
            }
        }
    }

    private CorsiDto.RigaCorso riga(Corso c, long moduli, List<Lezione> lezioni) {
        long pubblicate = lezioni.stream().filter(l -> l.getPubblicata() && l.isCompleta()).count();
        long secondi = lezioni.stream().mapToLong(l -> l.getDurataSecondi() != null ? l.getDurataSecondi() : 0).sum();
        return new CorsiDto.RigaCorso(c.getId(), c.getTitolo(), c.getDescrizione(), c.getCopertinaId(), c.getPubblicato(),
                moduli, lezioni.size(), pubblicate, secondi);
    }

    /** file null: toglie la copertina. */
    private UUID sostituisci(UUID attuale, MultipartFile file) {
        UUID nuova = null;
        if (file != null) {
            Copertina copertina = leggiCopertina(file);
            nuova = copertinaRepository.save(copertina).getId();
        }
        if (attuale != null) {
            copertinaRepository.deleteById(attuale);
        }
        return nuova;
    }

    private static Copertina leggiCopertina(MultipartFile file) {
        if (file.isEmpty() || !TIPI_COPERTINA.contains(file.getContentType())) {
            throw new IllegalArgumentException("La copertina deve essere un'immagine JPG, PNG o WebP");
        }
        Copertina copertina = new Copertina();
        copertina.setId(UUID.randomUUID());
        copertina.setTipo(file.getContentType());
        try {
            copertina.setDati(file.getBytes());
        } catch (IOException e) {
            throw new IllegalArgumentException("Immagine non leggibile");
        }
        return copertina;
    }

    private Corso corso(Long id) {
        return corsoRepository.findById(id).orElseThrow(() -> new RisorsaNonTrovataException("Corso non trovato"));
    }

    private Modulo modulo(Long id) {
        return moduloRepository.findById(id).orElseThrow(() -> new RisorsaNonTrovataException("Modulo non trovato"));
    }

    private Lezione lezione(Long id) {
        return lezioneRepository.findById(id).orElseThrow(() -> new RisorsaNonTrovataException("Lezione non trovata"));
    }

    private static String vuotoNull(String testo) {
        return testo == null || testo.isBlank() ? null : testo.trim();
    }
}
