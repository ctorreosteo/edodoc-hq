package it.edodoc.hq.services;

import it.edodoc.hq.dto.DietaDto;
import it.edodoc.hq.exception.RisorsaNonTrovataException;
import it.edodoc.hq.models.Dieta;
import it.edodoc.hq.models.DietaVersione;
import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.repositories.DietaRepository;
import it.edodoc.hq.repositories.DietaVersioneRepository;
import it.edodoc.hq.repositories.PazienteRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Diete dei pazienti e modelli. Ogni salvataggio che cambia qualcosa lascia una versione nello storico,
 * con la sua ora: la dieta si può cambiare quante volte serve e ogni stato passato resta leggibile e stampabile.
 */
@Service
public class DietaService {

    private static final DateTimeFormatter NOME_FILE = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private final DietaRepository dietaRepository;
    private final DietaVersioneRepository versioneRepository;
    private final PazienteRepository pazienteRepository;
    private final DietaPdfService pdfService;

    public DietaService(DietaRepository dietaRepository, DietaVersioneRepository versioneRepository,
                        PazienteRepository pazienteRepository, DietaPdfService pdfService) {
        this.dietaRepository = dietaRepository;
        this.versioneRepository = versioneRepository;
        this.pazienteRepository = pazienteRepository;
        this.pdfService = pdfService;
    }

    public record PdfDieta(String nomeFile, byte[] contenuto) {
    }

    @Transactional(readOnly = true)
    public List<DietaDto.Riga> tutte() {
        return righe(dietaRepository.findTutte());
    }

    @Transactional(readOnly = true)
    public List<DietaDto.Riga> delPaziente(Long pazienteId) {
        return righe(dietaRepository.findDelPaziente(pazienteId));
    }

    private List<DietaDto.Riga> righe(List<Dieta> diete) {
        Map<Long, Integer> versioni = new HashMap<>();
        for (Object[] riga : versioneRepository.contaPerDieta()) {
            versioni.put((Long) riga[0], ((Long) riga[1]).intValue());
        }
        return diete.stream().map(d -> DietaDto.Riga.da(d, versioni.getOrDefault(d.getId(), 0))).toList();
    }

    @Transactional(readOnly = true)
    public DietaDto.Dettaglio dettaglio(Long id) {
        Dieta dieta = trova(id);
        return DietaDto.Dettaglio.da(dieta, versioneRepository.findByDietaIdOrderByNumeroDesc(id));
    }

    @Transactional
    public DietaDto.Dettaglio crea(DietaDto.Crea richiesta) {
        Dieta dieta = new Dieta();
        Paziente paziente = null;
        if (richiesta.pazienteId() != null) {
            paziente = pazienteRepository.findById(richiesta.pazienteId())
                    .orElseThrow(() -> new RisorsaNonTrovataException("Paziente non trovato"));
            dieta.setPaziente(paziente);
        }
        String titolo = vuotoNull(richiesta.titolo());
        String nota = null;
        if (richiesta.daDietaId() != null) {
            Dieta origine = trova(richiesta.daDietaId());
            nota = origine.getPaziente() == null ? "Dal modello «" + origine.getTitolo() + "»"
                    : paziente != null && origine.getPaziente().getId().equals(paziente.getId())
                    ? "Dalla dieta «" + origine.getTitolo() + "»"
                    : "Dalla dieta di " + origine.getPaziente().getNomeCompleto();
            dieta.setContenuto(origine.getContenuto());
            dieta.setDataInizio(paziente == null ? null : origine.getDataInizio());
            if (titolo == null) {
                titolo = origine.getTitolo();
            }
        }
        if (titolo == null) {
            titolo = paziente == null ? "Nuovo modello" : "Piano alimentare";
        }
        dieta.setTitolo(titolo);
        dietaRepository.save(dieta);
        fotografa(dieta, nota);
        return dettaglio(dieta.getId());
    }

    /** Se non cambia nulla non nasce una versione: lo storico mostra solo modifiche vere. */
    @Transactional
    public DietaDto.Dettaglio salva(Long id, DietaDto.Salva richiesta) {
        return salva(id, richiesta, null);
    }

    private DietaDto.Dettaglio salva(Long id, DietaDto.Salva richiesta, String nota) {
        Dieta dieta = trova(id);
        String titolo = richiesta.titolo().trim();
        boolean cambiata = !titolo.equals(dieta.getTitolo())
                || !Objects.equals(richiesta.dataInizio(), dieta.getDataInizio())
                || !richiesta.contenuto().equals(dieta.getContenuto());
        if (cambiata) {
            dieta.setTitolo(titolo);
            dieta.setDataInizio(richiesta.dataInizio());
            dieta.setContenuto(richiesta.contenuto());
            dieta.setUpdatedAt(LocalDateTime.now());
            dietaRepository.flush();
            fotografa(dieta, nota);
        }
        return dettaglio(id);
    }

    /** Riporta la dieta com'era a una versione passata. Diventa a sua volta una versione nuova: non si perde nulla. */
    @Transactional
    public DietaDto.Dettaglio ripristina(Long id, Integer numero) {
        DietaVersione versione = versione(id, numero);
        return salva(id, new DietaDto.Salva(versione.getTitolo(), versione.getDataInizio(), versione.getContenuto()),
                "Ripristino della versione " + numero);
    }

    @Transactional
    public DietaDto.Dettaglio segnaConsegnata(Long id, boolean consegnata) {
        Dieta dieta = trova(id);
        dieta.setConsegnataIl(consegnata ? LocalDateTime.now() : null);
        return dettaglio(id);
    }

    @Transactional
    public void elimina(Long id) {
        dietaRepository.delete(trova(id));
    }

    @Transactional(readOnly = true)
    public PdfDieta pdf(Long id) throws IOException {
        Dieta dieta = trova(id);
        return pdf(dieta, dieta.getTitolo(), dieta.getDataInizio(), dieta.getContenuto(), dieta.getUpdatedAt());
    }

    @Transactional(readOnly = true)
    public PdfDieta pdfVersione(Long id, Integer numero) throws IOException {
        DietaVersione v = versione(id, numero);
        return pdf(v.getDieta(), v.getTitolo(), v.getDataInizio(), v.getContenuto(), v.getCreatedAt());
    }

    private PdfDieta pdf(Dieta dieta, String titolo, java.time.LocalDate dataInizio, DietaDto.Contenuto contenuto,
                         LocalDateTime aggiornata) throws IOException {
        String paziente = dieta.getPaziente() == null ? null : dieta.getPaziente().getNomeCompleto();
        byte[] contenutoPdf = pdfService.genera(new DietaPdfService.Documento(titolo, paziente, dataInizio, aggiornata, contenuto));
        String nome = paziente == null ? titolo : "Dieta " + paziente;
        return new PdfDieta(nome.replaceAll("[\\\\/:*?\"<>|]", "") + " " + aggiornata.format(NOME_FILE) + ".pdf", contenutoPdf);
    }

    private void fotografa(Dieta dieta, String nota) {
        int numero = versioneRepository.findFirstByDietaIdOrderByNumeroDesc(dieta.getId())
                .map(v -> v.getNumero() + 1).orElse(1);
        DietaVersione versione = new DietaVersione();
        versione.setDieta(dieta);
        versione.setNumero(numero);
        versione.setTitolo(dieta.getTitolo());
        versione.setDataInizio(dieta.getDataInizio());
        versione.setContenuto(dieta.getContenuto());
        versione.setNota(nota);
        versione.setCreatedAt(numero == 1 ? dieta.getCreatedAt() : dieta.getUpdatedAt());
        versioneRepository.save(versione);
    }

    private DietaVersione versione(Long id, Integer numero) {
        return versioneRepository.findByDietaIdAndNumero(id, numero)
                .orElseThrow(() -> new RisorsaNonTrovataException("Versione della dieta non trovata"));
    }

    private Dieta trova(Long id) {
        return dietaRepository.findById(id).orElseThrow(() -> new RisorsaNonTrovataException("Dieta non trovata"));
    }

    private static String vuotoNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
