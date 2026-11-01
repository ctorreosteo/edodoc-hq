package it.edodoc.hq.services;

import it.edodoc.hq.dto.EmailDto;
import it.edodoc.hq.exception.ConflittoException;
import it.edodoc.hq.exception.RisorsaNonTrovataException;
import it.edodoc.hq.models.Fattura;
import it.edodoc.hq.models.Pagamento;
import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.repositories.FatturaRepository;
import it.edodoc.hq.repositories.PagamentoRepository;
import it.edodoc.hq.repositories.PazienteRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Email al paziente con revisione: {@link #bozza} riempie il modello, il dottore la cambia nel popup,
 * {@link #invia} spedisce quello che ha approvato. Oggetto e testo del modello vivono in config.
 */
@Service
public class EmailService {

    private static final DateTimeFormatter DATA = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private final PazienteRepository pazienteRepository;
    private final PagamentoRepository pagamentoRepository;
    private final FatturaRepository fatturaRepository;
    private final ConfigService configService;
    private final FatturaPdfService pdfService;
    private final GmailService gmailService;

    public EmailService(PazienteRepository pazienteRepository, PagamentoRepository pagamentoRepository,
                        FatturaRepository fatturaRepository, ConfigService configService,
                        FatturaPdfService pdfService, GmailService gmailService) {
        this.pazienteRepository = pazienteRepository;
        this.pagamentoRepository = pagamentoRepository;
        this.fatturaRepository = fatturaRepository;
        this.configService = configService;
        this.pdfService = pdfService;
        this.gmailService = gmailService;
    }

    @Transactional(readOnly = true)
    public EmailDto.Bozza bozza(EmailDto.Richiesta r) {
        return switch (r.tipo()) {
            case SOLLECITO_PAGAMENTO -> bozzaSollecito(r);
            case DATI_FATTURAZIONE -> {
                Paziente paziente = paziente(r.pazienteId());
                yield bozza(r.tipo(), paziente, null, null, configService.get("EMAIL_DATI_OGGETTO"),
                        riempiNome(configService.get("EMAIL_DATI_TESTO"), paziente), null);
            }
            case FATTURA -> {
                Fattura fattura = fattura(r);
                Paziente paziente = fattura.getPaziente();
                String numero = String.valueOf(fattura.getNumero());
                yield bozza(r.tipo(), paziente, null, fattura.getId(),
                        configService.get("FATTURA_EMAIL_OGGETTO").replace("{numero}", numero),
                        riempiNome(configService.get("FATTURA_EMAIL_TESTO"), paziente).replace("{numero}", numero),
                        fattura.getNomeFile());
            }
        };
    }

    private EmailDto.Bozza bozzaSollecito(EmailDto.Richiesta r) {
        List<Pagamento> daSollecitare = daSollecitare(r);
        Paziente paziente = daSollecitare.get(0).getPaziente();
        String dettaglio = daSollecitare.stream()
                .map(p -> "- " + p.getDescrizione() + ": " + FatturaPdfService.euro(p.getImporto()) + ", scadenza " + p.getScadenza().format(DATA))
                .collect(Collectors.joining("\n"));
        BigDecimal totale = daSollecitare.stream().map(Pagamento::getImporto).reduce(BigDecimal.ZERO, BigDecimal::add);
        String testo = riempiNome(configService.get("EMAIL_SOLLECITO_TESTO"), paziente)
                .replace("{dettaglio}", dettaglio)
                .replace("{totale}", FatturaPdfService.euro(totale))
                .replace("{iban}", configService.get("EMITTENTE_IBAN"));
        return bozza(r.tipo(), paziente, r.pagamentoId(), null, configService.get("EMAIL_SOLLECITO_OGGETTO"), testo, null);
    }

    /** Dal paziente si sollecita ciò che è scaduto; se nulla è scaduto, le rate ancora aperte. */
    private List<Pagamento> daSollecitare(EmailDto.Richiesta r) {
        if (r.pagamentoId() != null) {
            Pagamento pagamento = pagamentoRepository.findConPaziente(r.pagamentoId())
                    .orElseThrow(() -> new RisorsaNonTrovataException("Pagamento non trovato"));
            if (pagamento.getStato() != Pagamento.Stato.DA_PAGARE) {
                throw new ConflittoException("Questo pagamento non è da saldare");
            }
            return List.of(pagamento);
        }
        LocalDate oggi = LocalDate.now();
        List<Pagamento> aperti = pagamentoRepository.findDelPaziente(paziente(r.pazienteId()).getId()).stream()
                .filter(p -> p.getStato() == Pagamento.Stato.DA_PAGARE).toList();
        List<Pagamento> scaduti = aperti.stream().filter(p -> p.isScaduto(oggi)).toList();
        if (aperti.isEmpty()) {
            throw new ConflittoException("Questo paziente non ha pagamenti da saldare");
        }
        return scaduti.isEmpty() ? aperti : scaduti;
    }

    private EmailDto.Bozza bozza(EmailDto.Tipo tipo, Paziente paziente, Long pagamentoId, Long fatturaId, String oggetto, String testo, String allegato) {
        return new EmailDto.Bozza(tipo, paziente.getId(), paziente.getNomeCompleto(), pagamentoId, fatturaId,
                gmailService.mittente(), paziente.getEmail(), oggetto, testo, allegato, gmailService.isAttivo());
    }

    /** La fattura segna l'invio solo dopo che Google ha accettato: un errore lascia tutto com'era. */
    @Transactional
    public void invia(EmailDto.Invia r) throws IOException {
        CorpoEmail corpo = CorpoEmail.da(r.corpo());
        if (corpo.testo().isBlank()) {
            throw new IllegalArgumentException("Il testo è obbligatorio");
        }
        String destinatario = r.destinatario().trim();
        String oggetto = r.oggetto().replaceAll("[\\r\\n]+", " ").trim();
        if (r.tipo() != EmailDto.Tipo.FATTURA) {
            gmailService.invia(destinatario, oggetto, corpo, null, null);
            return;
        }
        Fattura fattura = fattura(new EmailDto.Richiesta(r.tipo(), r.pazienteId(), r.pagamentoId(), r.fatturaId()));
        gmailService.invia(destinatario, oggetto, corpo, fattura.getNomeFile(), pdfService.genera(fattura));
        fattura.setEmailDestinatario(destinatario);
        fattura.setEmailInviataIl(LocalDateTime.now());
    }

    /**
     * Feedback al check, senza popup: il dottore l'ha appena scritto. Il vocale non si allega, si avvisa soltanto.
     * Chi chiama decide cosa fare se l'email non parte.
     */
    public void inviaFeedback(Paziente paziente, String testo, boolean vocale) {
        if (paziente.getEmail() == null || paziente.getEmail().isBlank()) {
            throw new ConflittoException("il paziente non ha un indirizzo email");
        }
        String corpo = vocale
                ? riempiNome(configService.get("EMAIL_FEEDBACK_VOCALE_TESTO"), paziente)
                : riempiNome(configService.get("EMAIL_FEEDBACK_TESTO"), paziente).replace("{feedback}", testo);
        gmailService.invia(paziente.getEmail().trim(), configService.get("EMAIL_FEEDBACK_OGGETTO"), CorpoEmail.da(corpo), null, null);
    }

    private Fattura fattura(EmailDto.Richiesta r) {
        Fattura fattura;
        if (r.fatturaId() != null) {
            fattura = fatturaRepository.findConDettagli(r.fatturaId())
                    .orElseThrow(() -> new RisorsaNonTrovataException("Fattura non trovata"));
        } else if (r.pagamentoId() != null) {
            fattura = fatturaRepository.findEmessaDelPagamento(r.pagamentoId())
                    .orElseThrow(() -> new ConflittoException("Questo pagamento non ha una fattura emessa"));
        } else {
            fattura = fatturaRepository.findDelPaziente(paziente(r.pazienteId()).getId()).stream()
                    .filter(f -> f.getStato() == Fattura.Stato.EMESSA).findFirst()
                    .orElseThrow(() -> new ConflittoException("Questo paziente non ha fatture emesse"));
        }
        if (fattura.getStato() != Fattura.Stato.EMESSA) {
            throw new ConflittoException("La fattura è annullata");
        }
        return fattura;
    }

    private Paziente paziente(Long id) {
        if (id == null) {
            throw new IllegalArgumentException("Scegli il paziente");
        }
        return pazienteRepository.findByIdAndAttivoTrue(id)
                .orElseThrow(() -> new RisorsaNonTrovataException("Paziente non trovato"));
    }

    private static String riempiNome(String modello, Paziente paziente) {
        return modello.replace("{nome}", paziente.getNome());
    }
}
