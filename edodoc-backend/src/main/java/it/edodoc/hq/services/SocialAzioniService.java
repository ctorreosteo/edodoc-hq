package it.edodoc.hq.services;

import it.edodoc.hq.dto.SocialDto;
import it.edodoc.hq.models.SocialAzione;
import it.edodoc.hq.models.SocialGestito;
import it.edodoc.hq.models.Utente;
import it.edodoc.hq.repositories.SocialAzioneRepository;
import it.edodoc.hq.repositories.SocialGestitoRepository;
import it.edodoc.hq.repositories.UtenteRepository;
import it.edodoc.hq.security.UtenteDetails;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Registro di cio che si fa dalla pagina Meta e stato "gestito" di commenti e conversazioni.
 * Meta non sa chi ha risposto dal gestionale: lo sappiamo noi, da qui.
 */
@Service
public class SocialAzioniService {

    private static final Logger logger = LoggerFactory.getLogger(SocialAzioniService.class);

    public static final String RISPOSTA_COMMENTO = "RISPOSTA_COMMENTO";
    public static final String MESSAGGIO = "MESSAGGIO";
    public static final String MESSAGGIO_PRIVATO = "MESSAGGIO_PRIVATO";
    public static final String NASCOSTO = "NASCOSTO";
    public static final String MOSTRATO = "MOSTRATO";
    public static final String ELIMINATO = "ELIMINATO";
    public static final String MI_PIACE = "MI_PIACE";
    public static final String GESTITO = "GESTITO";
    public static final String PUBBLICAZIONE = "PUBBLICAZIONE";

    public static final String TIPO_COMMENTO = "COMMENTO";
    public static final String TIPO_CONVERSAZIONE = "CONVERSAZIONE";

    private static final Set<String> RISPOSTE = Set.of(RISPOSTA_COMMENTO, MESSAGGIO_PRIVATO);

    private final SocialAzioneRepository azioneRepository;
    private final SocialGestitoRepository gestitoRepository;
    private final UtenteRepository utenteRepository;

    public SocialAzioniService(SocialAzioneRepository azioneRepository, SocialGestitoRepository gestitoRepository,
                               UtenteRepository utenteRepository) {
        this.azioneRepository = azioneRepository;
        this.gestitoRepository = gestitoRepository;
        this.utenteRepository = utenteRepository;
    }

    /** Chi ha agito e quando: un errore qui non deve mai far fallire l'azione gia fatta su Meta. */
    public void registra(String tipo, String piattaforma, String pageId, String oggettoId, String risultatoId, String anteprima) {
        try {
            azioneRepository.save(SocialAzione.builder()
                    .tipo(tipo)
                    .piattaforma(piattaforma)
                    .pageId(pageId)
                    .oggettoId(tronca(oggettoId, 120))
                    .risultatoId(tronca(risultatoId, 120))
                    .anteprima(tronca(anteprima, 200))
                    .utenteId(operatoreCorrenteId())
                    .creatoIl(LocalDateTime.now())
                    .build());
        } catch (Exception e) {
            logger.warn("Social: registrazione azione {} non riuscita: {}", tipo, e.getMessage());
        }
    }

    @Transactional(readOnly = true)
    public List<SocialDto.Azione> recenti(String pageId, int quante) {
        List<SocialAzione> azioni = azioneRepository.findByPageIdOrderByCreatoIlDesc(pageId, PageRequest.of(0, quante));
        Map<Long, String> nomi = nomiUtenti(azioni.stream().map(SocialAzione::getUtenteId).toList());
        return azioni.stream()
                .map(a -> new SocialDto.Azione(a.getId(), a.getTipo(), a.getPiattaforma(), a.getOggettoId(),
                        a.getAnteprima(), a.getUtenteId(), nomi.get(a.getUtenteId()),
                        SocialTempo.iso(a.getCreatoIl().atZone(SocialTempo.ROMA).toInstant())))
                .toList();
    }

    /** Chi ha risposto (ultima risposta dal gestionale) per commento. */
    @Transactional(readOnly = true)
    public Map<String, Autore> autoriRisposte(Collection<String> commentoIds) {
        if (commentoIds.isEmpty()) {
            return Map.of();
        }
        return autori(azioneRepository.findByTipoInAndOggettoIdIn(RISPOSTE, commentoIds), SocialAzione::getOggettoId);
    }

    /** Chi ha inviato i messaggi (per id messaggio Meta). */
    @Transactional(readOnly = true)
    public Map<String, Autore> autoriMessaggi(Collection<String> messaggioIds) {
        if (messaggioIds.isEmpty()) {
            return Map.of();
        }
        return autori(azioneRepository.findByTipoAndRisultatoIdIn(MESSAGGIO, messaggioIds), SocialAzione::getRisultatoId);
    }

    public record Autore(Long utenteId, String nome) {
    }

    public record StatoGestito(String gestitoDa, String gestitoIl) {
    }

    @Transactional(readOnly = true)
    public Map<String, StatoGestito> gestiti(Collection<String> oggettoIds) {
        if (oggettoIds.isEmpty()) {
            return Map.of();
        }
        List<SocialGestito> righe = gestitoRepository.findByOggettoIdIn(oggettoIds);
        Map<Long, String> nomi = nomiUtenti(righe.stream().map(SocialGestito::getUtenteId).toList());
        Map<String, StatoGestito> out = new HashMap<>();
        for (SocialGestito g : righe) {
            out.put(g.getOggettoId(), new StatoGestito(nomi.get(g.getUtenteId()),
                    SocialTempo.iso(g.getGestitoIl().atZone(SocialTempo.ROMA).toInstant())));
        }
        return out;
    }

    @Transactional
    public void impostaGestito(String pageId, String piattaforma, String oggettoId, String tipo, boolean gestito) {
        if (!StringUtils.hasText(oggettoId)) {
            throw new IllegalArgumentException("Manca l'elemento da segnare come gestito.");
        }
        String tipoNorm = TIPO_CONVERSAZIONE.equalsIgnoreCase(tipo) ? TIPO_CONVERSAZIONE : TIPO_COMMENTO;
        var esistente = gestitoRepository.findByOggettoId(oggettoId);
        if (gestito) {
            if (esistente.isEmpty()) {
                gestitoRepository.save(SocialGestito.builder()
                        .oggettoId(oggettoId)
                        .tipo(tipoNorm)
                        .piattaforma(piattaforma)
                        .pageId(pageId)
                        .utenteId(operatoreCorrenteId())
                        .gestitoIl(LocalDateTime.now())
                        .build());
                registra(GESTITO, piattaforma, pageId, oggettoId, null, null);
            }
        } else {
            esistente.ifPresent(gestitoRepository::delete);
        }
    }

    private Map<String, Autore> autori(List<SocialAzione> azioni, Function<SocialAzione, String> chiave) {
        Map<Long, String> nomi = nomiUtenti(azioni.stream().map(SocialAzione::getUtenteId).toList());
        Map<String, Autore> out = new HashMap<>();
        azioni.stream()
                .filter(a -> chiave.apply(a) != null)
                .sorted((a, b) -> a.getCreatoIl().compareTo(b.getCreatoIl()))
                .forEach(a -> out.put(chiave.apply(a), new Autore(a.getUtenteId(), nomi.get(a.getUtenteId()))));
        return out;
    }

    Map<Long, String> nomiUtenti(Collection<Long> ids) {
        Set<Long> unici = ids.stream().filter(Objects::nonNull).collect(Collectors.toSet());
        if (unici.isEmpty()) {
            return Map.of();
        }
        Map<Long, String> out = new HashMap<>();
        for (Utente u : utenteRepository.findAllById(unici)) {
            out.put(u.getId(), nomeUtente(u));
        }
        return out;
    }

    /** Utente della richiesta in corso; null nei job e nei webhook, dove non c'e nessuno al gestionale. */
    public Long operatoreCorrenteId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.getPrincipal() instanceof UtenteDetails utente ? utente.getId() : null;
    }

    public String nomeUtente(Long utenteId) {
        if (utenteId == null) {
            return null;
        }
        return utenteRepository.findById(utenteId).map(SocialAzioniService::nomeUtente).orElse(null);
    }

    static String nomeUtente(Utente u) {
        String nome = ((u.getNome() == null ? "" : u.getNome().trim()) + " "
                + (u.getCognome() == null ? "" : u.getCognome().trim())).trim();
        return nome.isEmpty() ? u.getUsername() : nome;
    }

    static String tronca(String s, int max) {
        if (s == null) {
            return null;
        }
        String t = s.replaceAll("\\s+", " ").trim();
        return t.length() <= max ? t : t.substring(0, max - 1) + "…";
    }
}
