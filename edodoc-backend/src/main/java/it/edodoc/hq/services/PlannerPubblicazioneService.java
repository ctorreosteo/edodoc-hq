package it.edodoc.hq.services;

import it.edodoc.hq.dto.PlannerDto;
import it.edodoc.hq.models.PlannerMedia;
import it.edodoc.hq.models.PlannerPost;
import it.edodoc.hq.models.PlannerPostCanale;
import it.edodoc.hq.models.Utente;
import it.edodoc.hq.repositories.PlannerPostCanaleRepository;
import it.edodoc.hq.repositories.PlannerPostRepository;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Pubblicazione dei post del Planner social, dal job ogni minuto o subito («Pubblica ora»).
 *
 * <p>Un post si prende in carico con un UPDATE condizionato (PROGRAMMATO → IN_PUBBLICAZIONE), sicuro anche con più
 * repliche, e si pubblica in un thread a parte: un reel che Meta elabora per minuti non ferma gli altri. Ogni canale
 * va per conto suo: i collegati si pubblicano, i manuali passano a DA_PUBBLICARE con l'avviso a chi ne è responsabile.
 * Alla fine il post prende lo stato riassuntivo (PUBBLICATO, DA_COMPLETARE, PARZIALE, ERRORE).
 */
@Service
public class PlannerPubblicazioneService {

    private static final Logger logger = LoggerFactory.getLogger(PlannerPubblicazioneService.class);
    /** Oltre questo tempo una pubblicazione ancora in corso si considera interrotta (riavvio dell'istanza). */
    private static final int MINUTI_BLOCCO = 45;

    private final PlannerPostRepository repository;
    private final PlannerPostCanaleRepository canaleRepository;
    private final PlannerPostService postService;
    private final PlannerNotificheService notifiche;
    private final Map<String, PlannerPubblicatore> pubblicatori;
    private final TransactionTemplate tx;
    private final ExecutorService esecutore = Executors.newFixedThreadPool(3, r -> {
        Thread t = new Thread(r, "planner-pubblicazione");
        t.setDaemon(true);
        return t;
    });

    public PlannerPubblicazioneService(PlannerPostRepository repository, PlannerPostCanaleRepository canaleRepository,
                                       PlannerPostService postService, PlannerNotificheService notifiche,
                                       List<PlannerPubblicatore> pubblicatori, TransactionTemplate tx) {
        this.repository = repository;
        this.canaleRepository = canaleRepository;
        this.postService = postService;
        this.notifiche = notifiche;
        this.pubblicatori = new java.util.HashMap<>();
        pubblicatori.forEach(p -> p.canali().forEach(c -> this.pubblicatori.put(c, p)));
        this.tx = tx;
    }

    @PreDestroy
    void chiudi() {
        esecutore.shutdown();
    }

    // ── Job e «Pubblica ora» ──

    /** I programmati arrivati all'ora; prima sblocca le pubblicazioni rimaste a metà. */
    public int pubblicaScaduti() {
        sbloccaInterrotti();
        int avviati = 0;
        for (Long id : repository.idProgrammatiScaduti(LocalDateTime.now(SocialTempo.ROMA))) {
            if (avvia(id)) {
                avviati++;
            }
        }
        return avviati;
    }

    /** Prende in carico un post programmato e lo pubblica in background. false se qualcun altro l'ha già preso. */
    public boolean avvia(Long postId) {
        Integer presa = tx.execute(s -> repository.prendiInCarico(postId, LocalDateTime.now()));
        if (presa == null || presa != 1) {
            return false;
        }
        esecutore.submit(() -> esegui(postId));
        return true;
    }

    /** Riprova i canali in errore di un post (subito, in background). */
    public PlannerDto.Post riprova(Long postId, Utente utente) {
        Integer presa = tx.execute(s -> {
            PlannerPost p = postService.trova(postId);
            if (!Set.of(PlannerPost.STATO_ERRORE, PlannerPost.STATO_PARZIALE).contains(p.getStato())) {
                throw new IllegalArgumentException("Il post non ha canali in errore.");
            }
            List<PlannerPostCanale> inErrore = canaleRepository.findByPostIdOrderByIdAsc(postId).stream()
                    .filter(c -> PlannerPostCanale.STATO_ERRORE.equals(c.getStato())).toList();
            inErrore.forEach(c -> {
                c.setStato(PlannerPostCanale.STATO_IN_ATTESA);
                c.setErrore(null);
            });
            canaleRepository.saveAll(inErrore);
            p.setStato(PlannerPost.STATO_IN_PUBBLICAZIONE);
            p.setPresaInCaricoIl(LocalDateTime.now());
            repository.save(p);
            postService.registra(postId, utente, "RIPROVA", inErrore.stream()
                    .map(c -> PlannerCanali.nome(c.getCanale())).collect(Collectors.joining(", ")));
            return 1;
        });
        if (presa != null) {
            esecutore.submit(() -> esegui(postId));
        }
        return postService.dto(List.of(postService.trova(postId))).get(0);
    }

    /** Un canale pubblicato a mano (o fuori dal gestionale): si segna col link, se c'è. */
    public PlannerDto.Post segnaPubblicato(Long postId, Long canaleId, String link, Utente utente) {
        tx.executeWithoutResult(s -> {
            PlannerPostCanale c = canaleRepository.findById(canaleId)
                    .filter(x -> x.getPostId().equals(postId))
                    .orElseThrow(() -> new IllegalArgumentException("Canale non trovato."));
            if (PlannerPostCanale.STATO_PUBBLICATO.equals(c.getStato()) || PlannerPostCanale.STATO_IN_PUBBLICAZIONE.equals(c.getStato())) {
                throw new IllegalArgumentException("Questo canale è già pubblicato o si sta pubblicando.");
            }
            String l = StringUtils.hasText(link) ? link.trim() : null;
            if (l != null && !l.matches("(?i)^https?://\\S+$")) {
                throw new IllegalArgumentException("Il link deve iniziare con http:// o https://.");
            }
            c.setStato(PlannerPostCanale.STATO_PUBBLICATO);
            c.setErrore(null);
            c.setLinkEsterno(l);
            c.setPubblicatoIl(LocalDateTime.now());
            c.setPubblicatoDaUtenteId(utente == null ? null : utente.getId());
            canaleRepository.save(c);
            postService.registra(postId, utente, "PUBBLICATO_A_MANO", PlannerCanali.nome(c.getCanale()));
            PlannerPost p = postService.trova(postId);
            if (!PlannerPost.STATI_MODIFICABILI.contains(p.getStato()) && !PlannerPost.STATO_IN_PUBBLICAZIONE.equals(p.getStato())) {
                chiudi(p, canaleRepository.findByPostIdOrderByIdAsc(postId));
            }
        });
        PlannerPost p = postService.trova(postId);
        notifiche.aggiornato(p, PlannerPostService.nome(utente));
        return postService.dto(List.of(p)).get(0);
    }

    // ── Esecuzione ──

    void esegui(Long postId) {
        try {
            PlannerPost p = postService.trova(postId);
            List<PlannerPostCanale> canali = canaleRepository.findByPostIdOrderByIdAsc(postId);
            List<PlannerMedia> media = postService.mediaDelPost(postId);
            List<String> manuali = new ArrayList<>();
            List<String> errori = new ArrayList<>();
            List<String> riusciti = new ArrayList<>();
            for (PlannerPostCanale c : canali) {
                if (!PlannerPostCanale.STATO_IN_ATTESA.equals(c.getStato())) {
                    continue;
                }
                String nome = PlannerCanali.nome(c.getCanale()) + (StringUtils.hasText(c.getAccountNome())
                        && !c.getAccountNome().equals(PlannerCanali.nome(c.getCanale())) ? " (" + c.getAccountNome() + ")" : "");
                PlannerPubblicatore pub = pubblicatori.get(c.getCanale());
                if (PlannerPostCanale.MODALITA_MANUALE.equals(c.getModalita()) || pub == null) {
                    c.setStato(PlannerPostCanale.STATO_DA_PUBBLICARE);
                    canaleRepository.save(c);
                    manuali.add(nome);
                    continue;
                }
                c.setStato(PlannerPostCanale.STATO_IN_PUBBLICAZIONE);
                canaleRepository.save(c);
                try {
                    PlannerPubblicatore.Risultato r = pub.pubblica(new PlannerPubblicatore.Contesto(p, c,
                            PlannerPostService.testoDi(p, c), PlannerUtm.link(p, c.getCanale(), c.getFormato()), media,
                            postService.opzioni(c)));
                    c.setStato(PlannerPostCanale.STATO_PUBBLICATO);
                    c.setIdEsterno(r.idEsterno());
                    c.setLinkEsterno(r.link());
                    c.setErrore(null);
                    c.setPubblicatoIl(LocalDateTime.now());
                    riusciti.add(nome);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    c.setStato(PlannerPostCanale.STATO_ERRORE);
                    c.setErrore("Pubblicazione interrotta: riprova.");
                    errori.add(nome);
                } catch (Exception e) {
                    c.setStato(PlannerPostCanale.STATO_ERRORE);
                    c.setErrore(messaggio(e));
                    errori.add(nome);
                    logger.warn("Planner: post {} su {} non pubblicato: {}", postId, c.getCanale(), c.getErrore());
                }
                canaleRepository.save(c);
            }
            tx.executeWithoutResult(s -> chiudi(postService.trova(postId), canaleRepository.findByPostIdOrderByIdAsc(postId)));
            PlannerPost chiuso = postService.trova(postId);
            if (!riusciti.isEmpty()) {
                postService.registra(postId, (Long) null, "PUBBLICATO", String.join(", ", riusciti));
            }
            if (!manuali.isEmpty()) {
                postService.registra(postId, (Long) null, "DA_PUBBLICARE", String.join(", ", manuali));
                notifiche.daPubblicareAMano(chiuso, manuali);
            }
            if (!errori.isEmpty()) {
                postService.registra(postId, (Long) null, "ERRORE", String.join(", ", errori));
                notifiche.errore(chiuso, errori);
            }
            notifiche.aggiornato(chiuso, null);
        } catch (Exception e) {
            logger.error("Planner: pubblicazione del post {} non completata", postId, e);
        }
    }

    /** Stato riassuntivo dai canali; la data di pubblicazione è quella del primo canale uscito. */
    private void chiudi(PlannerPost p, List<PlannerPostCanale> canali) {
        long pubblicati = canali.stream().filter(c -> PlannerPostCanale.STATO_PUBBLICATO.equals(c.getStato())).count();
        long errori = canali.stream().filter(c -> PlannerPostCanale.STATO_ERRORE.equals(c.getStato())).count();
        long daPubblicare = canali.stream().filter(c -> PlannerPostCanale.STATO_DA_PUBBLICARE.equals(c.getStato())).count();
        if (errori > 0) {
            p.setStato(pubblicati > 0 || daPubblicare > 0 ? PlannerPost.STATO_PARZIALE : PlannerPost.STATO_ERRORE);
        } else if (daPubblicare > 0) {
            p.setStato(PlannerPost.STATO_DA_COMPLETARE);
        } else {
            p.setStato(PlannerPost.STATO_PUBBLICATO);
        }
        p.setPubblicatoIl(canali.stream().map(PlannerPostCanale::getPubblicatoIl).filter(Objects::nonNull)
                .min(Comparator.naturalOrder()).orElse(p.getPubblicatoIl()));
        p.setPresaInCaricoIl(null);
        p.setAggiornatoIl(LocalDateTime.now());
        repository.save(p);
    }

    /** Pubblicazioni rimaste IN_PUBBLICAZIONE oltre il limite (istanza riavviata a metà): i canali in sospeso vanno in errore. */
    private void sbloccaInterrotti() {
        for (Long id : repository.idBloccati(LocalDateTime.now().minusMinutes(MINUTI_BLOCCO))) {
            tx.executeWithoutResult(s -> {
                List<PlannerPostCanale> canali = canaleRepository.findByPostIdOrderByIdAsc(id);
                Map<Long, PlannerPostCanale> sospesi = canali.stream()
                        .filter(c -> PlannerPostCanale.STATO_IN_PUBBLICAZIONE.equals(c.getStato())
                                || PlannerPostCanale.STATO_IN_ATTESA.equals(c.getStato()))
                        .collect(Collectors.toMap(PlannerPostCanale::getId, Function.identity()));
                sospesi.values().forEach(c -> {
                    c.setStato(PlannerPostCanale.STATO_ERRORE);
                    c.setErrore("Pubblicazione interrotta: controlla sulla piattaforma se il post è uscito prima di riprovare.");
                });
                canaleRepository.saveAll(sospesi.values());
                chiudi(postService.trova(id), canaleRepository.findByPostIdOrderByIdAsc(id));
                postService.registra(id, (Long) null, "ERRORE", "Pubblicazione interrotta");
            });
            logger.warn("Planner: pubblicazione del post {} interrotta, canali in sospeso segnati in errore", id);
        }
    }

    static String messaggio(Exception e) {
        String m = e instanceof ResponseStatusException rse && StringUtils.hasText(rse.getReason()) ? rse.getReason() : e.getMessage();
        return StringUtils.hasText(m) ? PlannerUtenti.tronca(m, 1000) : "Errore sconosciuto";
    }
}
