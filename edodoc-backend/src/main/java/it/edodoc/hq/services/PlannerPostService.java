package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import it.edodoc.hq.dto.PlannerDto;
import it.edodoc.hq.models.PlannerBrand;
import it.edodoc.hq.models.PlannerCommento;
import it.edodoc.hq.models.PlannerMedia;
import it.edodoc.hq.models.PlannerPost;
import it.edodoc.hq.models.PlannerPostCanale;
import it.edodoc.hq.models.PlannerPostMedia;
import it.edodoc.hq.models.PlannerStorico;
import it.edodoc.hq.models.Utente;
import it.edodoc.hq.repositories.PlannerCommentoRepository;
import it.edodoc.hq.repositories.PlannerEtichettaRepository;
import it.edodoc.hq.repositories.PlannerMediaRepository;
import it.edodoc.hq.repositories.PlannerPostCanaleRepository;
import it.edodoc.hq.repositories.PlannerPostMediaRepository;
import it.edodoc.hq.repositories.PlannerPostRepository;
import it.edodoc.hq.repositories.PlannerStoricoRepository;
import it.edodoc.hq.repositories.UtenteRepository;
import it.edodoc.hq.repositories.YoutubeIdeaRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Post del Planner social: creazione, modifica, calendario, idee, approvazione, commenti del team e cronologia.
 * La pubblicazione vera la fa {@link PlannerPubblicazioneService}.
 *
 * <p>Le idee e le bozze si salvano anche incomplete; per chiedere l'approvazione, programmare o pubblicare ogni canale
 * deve avere testo e media adatti ({@link PlannerCanali#problema}). Con l'approvazione obbligatoria, chi non approva
 * programma solo post approvati e non più modificati da allora.
 */
@Service
public class PlannerPostService {

    public static final String AZIONE_IDEA = "IDEA";
    public static final String AZIONE_BOZZA = "BOZZA";
    public static final String AZIONE_APPROVAZIONE = "APPROVAZIONE";
    public static final String AZIONE_PROGRAMMA = "PROGRAMMA";
    public static final String AZIONE_PUBBLICA_ORA = "PUBBLICA_ORA";

    private static final int GIORNI_MAX_PROGRAMMAZIONE = 366;
    private static final int GIORNI_MAX_CALENDARIO = 100;
    private static final int GIORNI_PUBBLICATI_BOARD = 14;
    private static final Set<String> STATI_BOARD = Set.of(PlannerPost.STATO_IDEA, PlannerPost.STATO_BOZZA,
            PlannerPost.STATO_IN_APPROVAZIONE, PlannerPost.STATO_PROGRAMMATO, PlannerPost.STATO_IN_PUBBLICAZIONE,
            PlannerPost.STATO_DA_COMPLETARE, PlannerPost.STATO_PARZIALE, PlannerPost.STATO_ERRORE);
    private static final Set<String> STATI_PUBBLICATI = Set.of(PlannerPost.STATO_PUBBLICATO);

    private final PlannerPostRepository repository;
    private final PlannerPostCanaleRepository canaleRepository;
    private final PlannerPostMediaRepository postMediaRepository;
    private final PlannerMediaRepository mediaRepository;
    private final PlannerCommentoRepository commentoRepository;
    private final PlannerStoricoRepository storicoRepository;
    private final PlannerEtichettaRepository etichettaRepository;
    private final YoutubeIdeaRepository youtubeIdeaRepository;
    private final UtenteRepository utenteRepository;
    private final PlannerMediaService mediaService;
    private final PlannerDestinazioniService destinazioni;
    private final PlannerSpaziService spazi;
    private final PlannerTiktokClient tiktok;
    private final PlannerImpostazioniService impostazioni;
    private final PlannerAccessService access;
    private final PlannerNotificheService notifiche;
    private final PlannerUtenti anagrafica;
    private final ObjectMapper objectMapper;

    public PlannerPostService(PlannerPostRepository repository, PlannerPostCanaleRepository canaleRepository,
                              PlannerPostMediaRepository postMediaRepository, PlannerMediaRepository mediaRepository,
                              PlannerCommentoRepository commentoRepository, PlannerStoricoRepository storicoRepository,
                              PlannerEtichettaRepository etichettaRepository, YoutubeIdeaRepository youtubeIdeaRepository,
                              UtenteRepository utenteRepository, PlannerMediaService mediaService,
                              PlannerDestinazioniService destinazioni, PlannerSpaziService spazi,
                              PlannerTiktokClient tiktok, PlannerImpostazioniService impostazioni,
                              PlannerAccessService access, PlannerNotificheService notifiche, PlannerUtenti anagrafica,
                              ObjectMapper objectMapper) {
        this.repository = repository;
        this.canaleRepository = canaleRepository;
        this.postMediaRepository = postMediaRepository;
        this.mediaRepository = mediaRepository;
        this.commentoRepository = commentoRepository;
        this.storicoRepository = storicoRepository;
        this.etichettaRepository = etichettaRepository;
        this.youtubeIdeaRepository = youtubeIdeaRepository;
        this.utenteRepository = utenteRepository;
        this.mediaService = mediaService;
        this.destinazioni = destinazioni;
        this.spazi = spazi;
        this.tiktok = tiktok;
        this.impostazioni = impostazioni;
        this.access = access;
        this.notifiche = notifiche;
        this.anagrafica = anagrafica;
        this.objectMapper = objectMapper;
    }

    // ── Stato della pagina ──

    @Transactional
    public PlannerDto.Stato stato(Utente utente, boolean aiDisponibile, Long brandId) {
        boolean approvatore = access.puoApprovare(utente);
        LocalDateTime adesso = LocalDateTime.now(SocialTempo.ROMA);
        PlannerBrand brand = spazi.risolvi(brandId);
        return new PlannerDto.Stato(brand.getId(), spazi.spazi(), tiktok.configurato(), aiDisponibile,
                impostazioni.approvazioneObbligatoria(), approvatore, approvatore,
                destinazioni.elenco(brand), impostazioni.etichette(), persone(), contatori(brand.getId(), adesso),
                PlannerCanali.iso(repository.prossimoProgrammato(brand.getId(), adesso)));
    }

    private PlannerDto.Contatori contatori(Long brandId, LocalDateTime adesso) {
        Map<String, Long> perStato = new HashMap<>();
        for (Object[] r : repository.contaPerStato(brandId)) {
            perStato.put((String) r[0], (Long) r[1]);
        }
        long pubblicatiMese = repository.pubblicatiDal(brandId, Set.of(PlannerPost.STATO_PUBBLICATO, PlannerPost.STATO_PARZIALE,
                PlannerPost.STATO_DA_COMPLETARE), adesso.minusDays(30)).size();
        return new PlannerDto.Contatori(
                perStato.getOrDefault(PlannerPost.STATO_IDEA, 0L),
                perStato.getOrDefault(PlannerPost.STATO_BOZZA, 0L),
                perStato.getOrDefault(PlannerPost.STATO_IN_APPROVAZIONE, 0L),
                repository.programmatiNelPeriodo(brandId, adesso, adesso.plusDays(7)),
                repository.canaliInStato(brandId, PlannerPostCanale.STATO_DA_PUBBLICARE),
                perStato.getOrDefault(PlannerPost.STATO_ERRORE, 0L) + perStato.getOrDefault(PlannerPost.STATO_PARZIALE, 0L),
                pubblicatiMese);
    }

    /** Chi può essere responsabile di un post: chi apre il Planner (gli ADMIN attivi), in ordine di cognome. */
    private List<PlannerDto.Persona> persone() {
        return anagrafica.amministratori().stream()
                .map(u -> new PlannerDto.Persona(u.getId(), cognomeNome(u)))
                .toList();
    }

    // ── Lettura ──

    @Transactional
    public PlannerDto.Calendario calendario(Long brandId, LocalDate dal, LocalDate al) {
        if (dal == null || al == null || al.isBefore(dal)) {
            throw new IllegalArgumentException("Periodo non valido.");
        }
        if (ChronoUnit.DAYS.between(dal, al) > GIORNI_MAX_CALENDARIO) {
            throw new IllegalArgumentException("Periodo troppo lungo.");
        }
        PlannerBrand brand = spazi.risolvi(brandId);
        List<PlannerPost> post = repository.nelPeriodo(brand.getId(), dal.atStartOfDay(), al.plusDays(1).atStartOfDay());
        // Il piano editoriale YouTube è uno solo: si mostra nello spazio che ha il canale
        boolean conYoutube = destinazioni.elenco(brand).stream()
                .anyMatch(d -> PlannerCanali.YOUTUBE.equals(d.canale()) && d.automatica());
        List<PlannerDto.VoceYoutube> youtube = !conYoutube ? List.of() : youtubeIdeaRepository.findAllByOrderByPosizioneAscIdAsc().stream()
                .filter(i -> i.getDataUscita() != null && !i.getDataUscita().isBefore(dal) && !i.getDataUscita().isAfter(al))
                .map(i -> new PlannerDto.VoceYoutube(i.getId(), i.getTitolo(), i.getStato(), i.getFormato(), i.getDataUscita()))
                .toList();
        return new PlannerDto.Calendario(dal, al, dto(post), youtube);
    }

    /** Colonne delle idee: tutto ciò che non è ancora uscito, più i pubblicati delle ultime due settimane. */
    @Transactional
    public List<PlannerDto.Post> board(Long brandId) {
        Long b = spazi.risolvi(brandId).getId();
        List<PlannerPost> post = new ArrayList<>(repository.findByBrandIdAndStatoInOrderByPosizioneAscIdDesc(b, STATI_BOARD));
        post.addAll(repository.pubblicatiDal(b, STATI_PUBBLICATI,
                LocalDateTime.now(SocialTempo.ROMA).minusDays(GIORNI_PUBBLICATI_BOARD)));
        return dto(post);
    }

    @Transactional(readOnly = true)
    public PlannerDto.PostDettaglio dettaglio(Long id) {
        PlannerPost p = trova(id);
        List<PlannerCommento> commenti = commentoRepository.findByPostIdOrderByCreatoIlAscIdAsc(id);
        List<PlannerStorico> storico = storicoRepository.findByPostIdOrderByCreatoIlDescIdDesc(id);
        Map<Long, String> nomi = anagrafica.nomiUtenti(java.util.stream.Stream.concat(
                commenti.stream().map(PlannerCommento::getUtenteId), storico.stream().map(PlannerStorico::getUtenteId)).toList());
        return new PlannerDto.PostDettaglio(dto(List.of(p)).get(0),
                commenti.stream().map(c -> new PlannerDto.Commento(c.getId(), c.getUtenteId(), nomi.get(c.getUtenteId()),
                        c.getTesto(), PlannerCanali.iso(c.getCreatoIl()))).toList(),
                storico.stream().map(s -> new PlannerDto.Storico(s.getId(), s.getEvento(), s.getDettaglio(),
                        nomi.get(s.getUtenteId()), PlannerCanali.iso(s.getCreatoIl()))).toList());
    }

    /** Ricerca nei post dello spazio (titolo, testo, note), più recenti prima. */
    @Transactional
    public List<PlannerDto.Post> cerca(Long brandId, String testo) {
        if (!StringUtils.hasText(testo) || testo.trim().length() < 2) {
            return List.of();
        }
        String q = "%" + testo.trim().toLowerCase(Locale.ROOT).replace("%", "").replace("_", "") + "%";
        return dto(repository.cerca(spazi.risolvi(brandId).getId(), q, org.springframework.data.domain.PageRequest.of(0, 20)));
    }

    // ── Scrittura ──

    @Transactional
    public PlannerDto.Post crea(PlannerDto.PostRequest req, Utente utente) {
        if (req == null) {
            throw new IllegalArgumentException("Mancano i dati del post.");
        }
        LocalDateTime ora = LocalDateTime.now();
        PlannerPost p = new PlannerPost();
        p.setBrandId(spazi.risolvi(req.brandId()).getId());
        p.setStato(PlannerPost.STATO_BOZZA);
        p.setCreatoDaUtenteId(utente == null ? null : utente.getId());
        p.setCreatoIl(ora);
        p.setAggiornatoIl(ora);
        applica(p, req);
        p = repository.save(p);
        salvaCanaliEMedia(p, req);
        registra(p.getId(), utente, "CREATO", applicaAzione(p, req.azione(), utente, true));
        return dopoSalvataggio(p, utente);
    }

    @Transactional
    public PlannerDto.Post aggiorna(Long id, PlannerDto.PostRequest req, Utente utente) {
        if (req == null) {
            throw new IllegalArgumentException("Mancano i dati del post.");
        }
        PlannerPost p = trova(id);
        if (!PlannerPost.STATI_MODIFICABILI.contains(p.getStato())) {
            throw new IllegalArgumentException("Il post è già partito: si possono cambiare solo i post non ancora pubblicati.");
        }
        String prima = impronta(p);
        if (req.brandId() != null) {
            p.setBrandId(spazi.risolvi(req.brandId()).getId());
        }
        applica(p, req);
        p.setAggiornatoIl(LocalDateTime.now());
        repository.save(p);
        canaleRepository.eliminaDelPost(p.getId());
        postMediaRepository.eliminaDelPost(p.getId());
        canaleRepository.flush();
        salvaCanaliEMedia(p, req);
        if (!access.puoApprovare(utente) && p.getApprovatoIl() != null && !prima.equals(impronta(p))) {
            // Contenuto cambiato da chi non approva: l'approvazione di prima non vale più
            p.setApprovatoDaUtenteId(null);
            p.setApprovatoIl(null);
            repository.save(p);
        }
        String evento = applicaAzione(p, req.azione(), utente, false);
        registra(p.getId(), utente, "MODIFICATO", evento);
        return dopoSalvataggio(p, utente);
    }

    /** Trascinamento nel calendario: cambia solo giorno e ora. */
    @Transactional
    public PlannerDto.Post sposta(Long id, LocalDateTime quando, Utente utente) {
        PlannerPost p = trova(id);
        if (!PlannerPost.STATI_MODIFICABILI.contains(p.getStato())) {
            throw new IllegalArgumentException("Il post è già partito e non si può spostare.");
        }
        if (quando == null) {
            if (PlannerPost.STATO_PROGRAMMATO.equals(p.getStato())) {
                throw new IllegalArgumentException("Un post programmato deve avere un'ora.");
            }
        } else if (PlannerPost.STATO_PROGRAMMATO.equals(p.getStato())) {
            verificaOra(quando);
        }
        LocalDateTime prima = p.getProgrammatoAlle();
        p.setProgrammatoAlle(quando == null ? null : quando.truncatedTo(ChronoUnit.MINUTES));
        p.setAggiornatoIl(LocalDateTime.now());
        repository.save(p);
        registra(p.getId(), utente, "SPOSTATO", (prima == null ? "senza data" : etichettaOra(prima)) + " → "
                + (quando == null ? "senza data" : etichettaOra(p.getProgrammatoAlle())));
        return dopoSalvataggio(p, utente);
    }

    /** Colonne delle idee: ordine e passaggio fra Idea e Bozza (gli altri stati si cambiano dal post). */
    @Transactional
    public void riordina(List<PlannerDto.OrdineVoce> ordine, Utente utente) {
        if (ordine == null || ordine.isEmpty()) {
            return;
        }
        Map<Long, PlannerPost> post = repository.findAllById(ordine.stream().map(PlannerDto.OrdineVoce::id).toList())
                .stream().collect(Collectors.toMap(PlannerPost::getId, Function.identity()));
        Set<String> spostabili = Set.of(PlannerPost.STATO_IDEA, PlannerPost.STATO_BOZZA);
        for (PlannerDto.OrdineVoce v : ordine) {
            PlannerPost p = post.get(v.id());
            if (p == null) {
                continue;
            }
            p.setPosizione(v.posizione());
            String nuovo = v.stato() == null ? p.getStato() : v.stato().toUpperCase(Locale.ROOT);
            if (!nuovo.equals(p.getStato()) && spostabili.contains(nuovo) && spostabili.contains(p.getStato())) {
                registra(p.getId(), utente, "STATO", etichettaStato(p.getStato()) + " → " + etichettaStato(nuovo));
                p.setStato(nuovo);
                p.setAggiornatoIl(LocalDateTime.now());
            }
        }
        repository.saveAll(post.values());
        notifiche.aggiornato(null, nome(utente));
    }

    @Transactional
    public PlannerDto.Post duplica(Long id, Utente utente) {
        PlannerPost o = trova(id);
        PlannerPost c = copia(o, PlannerUtenti.tronca((StringUtils.hasText(o.getTitolo()) ? o.getTitolo() : "Post") + " (copia)", 200), utente);
        registra(c.getId(), utente, "DUPLICATO", "Copia di «" + PlannerNotificheService.titolo(o) + "»");
        return dopoSalvataggio(c, utente);
    }

    /**
     * Serie: altre {@code volte} uscite dello stesso post, una ogni {@code ogniGiorni} giorni alla stessa ora. Se il
     * post è programmato lo sono anche le copie (stesso contenuto, stessa approvazione), altrimenti restano bozze.
     */
    @Transactional
    public List<PlannerDto.Post> ripeti(Long id, Integer ogniGiorni, Integer volte, Utente utente) {
        PlannerPost o = trova(id);
        if (o.getProgrammatoAlle() == null) {
            throw new IllegalArgumentException("Dai prima un giorno e un'ora al post.");
        }
        int passo = ogniGiorni == null ? 7 : ogniGiorni;
        int n = volte == null ? 4 : volte;
        if (passo < 1 || passo > 90) {
            throw new IllegalArgumentException("La distanza fra le uscite va da 1 a 90 giorni.");
        }
        if (n < 1 || n > 26) {
            throw new IllegalArgumentException("Da 1 a 26 uscite in più.");
        }
        boolean programmato = PlannerPost.STATO_PROGRAMMATO.equals(o.getStato());
        List<PlannerPost> copie = new ArrayList<>();
        for (int i = 1; i <= n; i++) {
            PlannerPost c = copia(o, o.getTitolo(), utente);
            c.setProgrammatoAlle(o.getProgrammatoAlle().plusDays((long) passo * i));
            if (programmato) {
                c.setStato(PlannerPost.STATO_PROGRAMMATO);
                c.setApprovatoDaUtenteId(o.getApprovatoDaUtenteId());
                c.setApprovatoIl(o.getApprovatoIl());
            }
            copie.add(repository.save(c));
            registra(c.getId(), utente, "DUPLICATO", "Serie di «" + PlannerNotificheService.titolo(o) + "»: uscita " + (i + 1) + " di " + (n + 1));
        }
        registra(o.getId(), utente, "SERIE", n + (n == 1 ? " uscita in più" : " uscite in più") + ", ogni " + passo + (passo == 1 ? " giorno" : " giorni"));
        notifiche.aggiornato(o, nome(utente));
        return dto(copie);
    }

    private PlannerPost copia(PlannerPost o, String titolo, Utente utente) {
        LocalDateTime ora = LocalDateTime.now();
        PlannerPost c = repository.save(PlannerPost.builder()
                .titolo(titolo)
                .testo(o.getTesto())
                .primoCommento(o.getPrimoCommento())
                .link(o.getLink())
                .utm(o.isUtm())
                .stato(PlannerPost.STATO_BOZZA)
                .etichettaId(o.getEtichettaId())
                .note(o.getNote())
                .responsabileUtenteId(o.getResponsabileUtenteId())
                .creatoDaUtenteId(utente == null ? null : utente.getId())
                .brandId(o.getBrandId())
                .posizione(repository.posizioneMinima(o.getBrandId(), PlannerPost.STATO_BOZZA) - 1)
                .creatoIl(ora)
                .aggiornatoIl(ora)
                .build());
        for (PlannerPostCanale k : canaleRepository.findByPostIdOrderByIdAsc(o.getId())) {
            canaleRepository.save(PlannerPostCanale.builder()
                    .postId(c.getId()).canale(k.getCanale()).account(k.getAccount()).accountNome(k.getAccountNome())
                    .formato(k.getFormato()).modalita(k.getModalita()).testo(k.getTesto()).titolo(k.getTitolo())
                    .opzioni(k.getOpzioni()).stato(PlannerPostCanale.STATO_IN_ATTESA).build());
        }
        for (PlannerPostMedia m : postMediaRepository.findByPostIdOrderByPosizioneAsc(o.getId())) {
            postMediaRepository.save(PlannerPostMedia.builder().postId(c.getId()).mediaId(m.getMediaId()).posizione(m.getPosizione()).build());
        }
        return c;
    }

    /** Toglie il post dal Planner. Se era già uscito resta sulle piattaforme: lì si cancella a mano. */
    @Transactional
    public void elimina(Long id, Utente utente) {
        PlannerPost p = trova(id);
        if (PlannerPost.STATO_IN_PUBBLICAZIONE.equals(p.getStato())) {
            throw new IllegalArgumentException("Il post si sta pubblicando proprio ora: riprova fra un minuto.");
        }
        repository.delete(p);
        notifiche.aggiornato(p, nome(utente));
    }

    @Transactional
    public PlannerDto.Post annullaProgrammazione(Long id, Utente utente) {
        PlannerPost p = trova(id);
        if (!PlannerPost.STATO_PROGRAMMATO.equals(p.getStato()) && !PlannerPost.STATO_IN_APPROVAZIONE.equals(p.getStato())) {
            throw new IllegalArgumentException("Il post non è programmato.");
        }
        p.setStato(PlannerPost.STATO_BOZZA);
        p.setAggiornatoIl(LocalDateTime.now());
        repository.save(p);
        registra(p.getId(), utente, "ANNULLATO", "Torna fra le bozze");
        return dopoSalvataggio(p, utente);
    }

    // ── Approvazione ──

    @Transactional
    public PlannerDto.Post approva(Long id, Utente utente) {
        access.verificaApprovatore(utente);
        PlannerPost p = trova(id);
        if (!PlannerPost.STATO_IN_APPROVAZIONE.equals(p.getStato())) {
            throw new IllegalArgumentException("Il post non è in attesa di approvazione.");
        }
        LocalDateTime adesso = LocalDateTime.now(SocialTempo.ROMA);
        boolean inTempo = p.getProgrammatoAlle() != null && p.getProgrammatoAlle().isAfter(adesso.plusMinutes(1));
        p.setStato(inTempo ? PlannerPost.STATO_PROGRAMMATO : PlannerPost.STATO_BOZZA);
        p.setApprovatoDaUtenteId(utente.getId());
        p.setApprovatoIl(LocalDateTime.now());
        p.setMotivoRifiuto(null);
        p.setAggiornatoIl(LocalDateTime.now());
        repository.save(p);
        registra(p.getId(), utente, "APPROVATO", inTempo ? "Programmato per " + etichettaOra(p.getProgrammatoAlle())
                : "Approvato: manca l'ora di pubblicazione");
        notifiche.approvato(p, utente.getId(), nome(utente));
        return dopoSalvataggio(p, utente);
    }

    @Transactional
    public PlannerDto.Post rifiuta(Long id, String motivo, Utente utente) {
        access.verificaApprovatore(utente);
        PlannerPost p = trova(id);
        if (!PlannerPost.STATO_IN_APPROVAZIONE.equals(p.getStato())) {
            throw new IllegalArgumentException("Il post non è in attesa di approvazione.");
        }
        String m = StringUtils.hasText(motivo) ? motivo.trim() : null;
        p.setStato(PlannerPost.STATO_BOZZA);
        p.setMotivoRifiuto(m);
        p.setApprovatoDaUtenteId(null);
        p.setApprovatoIl(null);
        p.setAggiornatoIl(LocalDateTime.now());
        repository.save(p);
        registra(p.getId(), utente, "RIFIUTATO", m == null ? null : PlannerUtenti.tronca(m, 400));
        notifiche.rifiutato(p, utente.getId(), nome(utente), m);
        return dopoSalvataggio(p, utente);
    }

    // ── Commenti ──

    @Transactional
    public PlannerDto.Commento commenta(Long id, String testo, Utente utente) {
        PlannerPost p = trova(id);
        if (!StringUtils.hasText(testo)) {
            throw new IllegalArgumentException("Scrivi il commento.");
        }
        String t = testo.trim();
        if (t.length() > 4000) {
            throw new IllegalArgumentException("Il commento è troppo lungo.");
        }
        PlannerCommento c = commentoRepository.save(PlannerCommento.builder()
                .postId(id).utenteId(utente == null ? null : utente.getId()).testo(t).creatoIl(LocalDateTime.now()).build());
        notifiche.commento(p, utente == null ? null : utente.getId(), nome(utente), t);
        notifiche.aggiornato(p, nome(utente));
        return new PlannerDto.Commento(c.getId(), c.getUtenteId(), anagrafica.nomeUtente(c.getUtenteId()), c.getTesto(),
                PlannerCanali.iso(c.getCreatoIl()));
    }

    @Transactional
    public void eliminaCommento(Long postId, Long commentoId, Utente utente) {
        PlannerCommento c = commentoRepository.findById(commentoId)
                .filter(x -> x.getPostId().equals(postId))
                .orElseThrow(() -> new IllegalArgumentException("Commento non trovato."));
        if (!Objects.equals(c.getUtenteId(), utente == null ? null : utente.getId()) && !access.puoApprovare(utente)) {
            throw new org.springframework.security.access.AccessDeniedException("Puoi eliminare solo i tuoi commenti.");
        }
        commentoRepository.delete(c);
    }

    // ── Applicazione della richiesta ──

    private void applica(PlannerPost p, PlannerDto.PostRequest req) {
        p.setTitolo(StringUtils.hasText(req.titolo()) ? PlannerUtenti.tronca(req.titolo(), 200) : null);
        p.setTesto(req.testo() == null ? null : req.testo().strip());
        p.setPrimoCommento(StringUtils.hasText(req.primoCommento()) ? req.primoCommento().strip() : null);
        String link = StringUtils.hasText(req.link()) ? req.link().trim() : null;
        if (link != null && !link.matches("(?i)^https?://\\S+$")) {
            throw new IllegalArgumentException("Il link deve iniziare con http:// o https://.");
        }
        if (link != null && link.length() > 1000) {
            throw new IllegalArgumentException("Il link è troppo lungo.");
        }
        p.setLink(link);
        p.setUtm(req.utm() == null || req.utm());
        if (req.etichettaId() != null && !etichettaRepository.existsById(req.etichettaId())) {
            throw new IllegalArgumentException("Rubrica non trovata.");
        }
        p.setEtichettaId(req.etichettaId());
        p.setNote(StringUtils.hasText(req.note()) ? req.note().strip() : null);
        if (req.responsabileId() != null && !utenteRepository.existsById(req.responsabileId())) {
            throw new IllegalArgumentException("Responsabile non trovato.");
        }
        p.setResponsabileUtenteId(req.responsabileId());
        p.setProgrammatoAlle(req.programmatoAlle() == null ? null : req.programmatoAlle().truncatedTo(ChronoUnit.MINUTES));
    }

    private void salvaCanaliEMedia(PlannerPost p, PlannerDto.PostRequest req) {
        PlannerBrand brand = spazi.risolvi(p.getBrandId());
        Set<String> visti = new LinkedHashSet<>();
        for (PlannerDto.CanaleRequest c : req.canali() == null ? List.<PlannerDto.CanaleRequest>of() : req.canali()) {
            if (c == null) {
                continue;
            }
            String canale = PlannerCanali.canale(c.canale());
            String account = StringUtils.hasText(c.account()) ? c.account().trim() : null;
            if (!visti.add(canale + "|" + account)) {
                continue;
            }
            PlannerDto.Destinazione d = destinazioni.trova(brand, canale, account).orElse(null);
            if (d == null && account != null) {
                throw new IllegalArgumentException(PlannerCanali.nome(canale) + ": l'account scelto non è in questo spazio.");
            }
            boolean automatica = d != null && d.automatica()
                    && !PlannerPostCanale.MODALITA_MANUALE.equalsIgnoreCase(c.modalita());
            String opzioni = null;
            if (c.opzioni() != null && !c.opzioni().isNull() && c.opzioni().isObject() && !c.opzioni().isEmpty()) {
                opzioni = c.opzioni().toString();
                if (opzioni.length() > 20_000) {
                    throw new IllegalArgumentException("Opzioni del canale troppo lunghe.");
                }
            }
            canaleRepository.save(PlannerPostCanale.builder()
                    .postId(p.getId())
                    .canale(canale)
                    .account(account)
                    .accountNome(d != null ? d.nome() : PlannerCanali.nome(canale))
                    .formato(PlannerCanali.formato(canale, c.formato()))
                    .modalita(automatica ? PlannerPostCanale.MODALITA_AUTOMATICA : PlannerPostCanale.MODALITA_MANUALE)
                    .testo(StringUtils.hasText(c.testo()) ? c.testo().strip() : null)
                    .titolo(StringUtils.hasText(c.titolo()) ? PlannerUtenti.tronca(c.titolo(), 200) : null)
                    .opzioni(opzioni)
                    .stato(PlannerPostCanale.STATO_IN_ATTESA)
                    .build());
        }
        List<Long> mediaIds = req.mediaIds() == null ? List.of() : req.mediaIds().stream().filter(Objects::nonNull).distinct().toList();
        if (mediaIds.size() > 35) {
            throw new IllegalArgumentException("Al massimo 35 media per post.");
        }
        Set<Long> esistenti = mediaRepository.findAllById(mediaIds).stream().map(PlannerMedia::getId).collect(Collectors.toSet());
        int i = 0;
        for (Long mediaId : mediaIds) {
            if (!esistenti.contains(mediaId)) {
                throw new IllegalArgumentException("Uno dei media non esiste più: ricaricalo.");
            }
            postMediaRepository.save(PlannerPostMedia.builder().postId(p.getId()).mediaId(mediaId).posizione(i++).build());
        }
    }

    /** Porta il post nello stato chiesto dall'azione. Restituisce il dettaglio per la cronologia. */
    private String applicaAzione(PlannerPost p, String azione, Utente utente, boolean nuovo) {
        String a = azione == null ? AZIONE_BOZZA : azione.trim().toUpperCase(Locale.ROOT);
        boolean approvatore = access.puoApprovare(utente);
        boolean serveApprovazione = impostazioni.approvazioneObbligatoria() && !approvatore && p.getApprovatoIl() == null;
        switch (a) {
            case AZIONE_IDEA -> {
                p.setStato(PlannerPost.STATO_IDEA);
                if (nuovo) {
                    p.setPosizione(repository.posizioneMinima(p.getBrandId(), PlannerPost.STATO_IDEA) - 1);
                }
                repository.save(p);
                return "Idea";
            }
            case AZIONE_BOZZA -> {
                // Salvare un programmato lo lascia programmato (se l'ora è ancora valida): è una modifica, non un ritiro
                if (PlannerPost.STATO_PROGRAMMATO.equals(p.getStato())) {
                    verificaPubblicabile(p);
                    verificaOra(p.getProgrammatoAlle());
                    if (serveApprovazione) {
                        return chiediApprovazione(p, utente);
                    }
                    repository.save(p);
                    return "Resta programmato per " + etichettaOra(p.getProgrammatoAlle());
                }
                if (PlannerPost.STATO_IN_APPROVAZIONE.equals(p.getStato())) {
                    repository.save(p);
                    return "In approvazione";
                }
                p.setStato(PlannerPost.STATO_BOZZA);
                if (nuovo) {
                    p.setPosizione(repository.posizioneMinima(p.getBrandId(), PlannerPost.STATO_BOZZA) - 1);
                }
                repository.save(p);
                return "Bozza";
            }
            case AZIONE_APPROVAZIONE -> {
                verificaPubblicabile(p);
                return chiediApprovazione(p, utente);
            }
            case AZIONE_PROGRAMMA -> {
                verificaPubblicabile(p);
                verificaOra(p.getProgrammatoAlle());
                if (serveApprovazione) {
                    return chiediApprovazione(p, utente);
                }
                p.setStato(PlannerPost.STATO_PROGRAMMATO);
                p.setMotivoRifiuto(null);
                repository.save(p);
                return "Programmato per " + etichettaOra(p.getProgrammatoAlle());
            }
            case AZIONE_PUBBLICA_ORA -> {
                verificaPubblicabile(p);
                if (serveApprovazione) {
                    p.setProgrammatoAlle(null);
                    return chiediApprovazione(p, utente);
                }
                p.setProgrammatoAlle(LocalDateTime.now(SocialTempo.ROMA).truncatedTo(ChronoUnit.MINUTES));
                p.setStato(PlannerPost.STATO_PROGRAMMATO);
                p.setMotivoRifiuto(null);
                repository.save(p);
                return "Pubblicazione immediata";
            }
            default -> throw new IllegalArgumentException("Azione non riconosciuta: " + azione);
        }
    }

    private String chiediApprovazione(PlannerPost p, Utente utente) {
        p.setStato(PlannerPost.STATO_IN_APPROVAZIONE);
        p.setMotivoRifiuto(null);
        repository.save(p);
        notifiche.daApprovare(p, utente == null ? null : utente.getId(), nome(utente));
        return "Approvazione richiesta";
    }

    /** Ogni canale ha testo e media adatti; i canali automatici sono davvero collegati. */
    void verificaPubblicabile(PlannerPost p) {
        List<PlannerPostCanale> canali = canaleRepository.findByPostIdOrderByIdAsc(p.getId());
        if (canali.isEmpty()) {
            throw new IllegalArgumentException("Scegli almeno un canale.");
        }
        List<PlannerMedia> media = mediaDelPost(p.getId());
        List<String> problemi = new ArrayList<>();
        for (PlannerPostCanale c : canali) {
            String testo = testoDi(p, c);
            String problema = PlannerCanali.problema(c.getCanale(), c.getFormato(), testo, c.getTitolo(), media);
            if (problema != null) {
                problemi.add(problema);
            }
            if (PlannerCanali.GOOGLE_BUSINESS.equals(c.getCanale()) && !"AGGIORNAMENTO".equals(c.getFormato())) {
                JsonNode o = opzioni(c);
                if (!StringUtils.hasText(o.path("titoloEvento").asText(null)) || !StringUtils.hasText(o.path("inizio").asText(null))
                        || !StringUtils.hasText(o.path("fine").asText(null))) {
                    problemi.add("Google Business: un evento o un'offerta vuole titolo, data di inizio e di fine.");
                }
            }
        }
        if (!problemi.isEmpty()) {
            throw new IllegalArgumentException(String.join(" ", new LinkedHashSet<>(problemi)));
        }
    }

    private static void verificaOra(LocalDateTime quando) {
        if (quando == null) {
            throw new IllegalArgumentException("Scegli giorno e ora di pubblicazione.");
        }
        LocalDateTime adesso = LocalDateTime.now(SocialTempo.ROMA);
        if (quando.isBefore(adesso.plusMinutes(1))) {
            throw new IllegalArgumentException("L'ora scelta è già passata: scegline una futura o pubblica subito.");
        }
        if (quando.isAfter(adesso.plusDays(GIORNI_MAX_PROGRAMMAZIONE))) {
            throw new IllegalArgumentException("Si programma al massimo a un anno.");
        }
    }

    private PlannerDto.Post dopoSalvataggio(PlannerPost p, Utente utente) {
        notifiche.aggiornato(p, nome(utente));
        return dto(List.of(repository.findById(p.getId()).orElse(p))).get(0);
    }

    // ── Supporto condiviso con la pubblicazione ──

    PlannerPost trova(Long id) {
        return repository.findById(id).orElseThrow(() -> new IllegalArgumentException("Post non trovato."));
    }

    List<PlannerMedia> mediaDelPost(Long postId) {
        List<PlannerPostMedia> righe = postMediaRepository.findByPostIdOrderByPosizioneAsc(postId);
        Map<Long, PlannerMedia> media = mediaRepository.findAllById(righe.stream().map(PlannerPostMedia::getMediaId).toList())
                .stream().collect(Collectors.toMap(PlannerMedia::getId, Function.identity()));
        return righe.stream().map(r -> media.get(r.getMediaId())).filter(Objects::nonNull).toList();
    }

    static String testoDi(PlannerPost p, PlannerPostCanale c) {
        return StringUtils.hasText(c.getTesto()) ? c.getTesto() : p.getTesto() == null ? "" : p.getTesto();
    }

    JsonNode opzioni(PlannerPostCanale c) {
        if (!StringUtils.hasText(c.getOpzioni())) {
            return JsonNodeFactory.instance.objectNode();
        }
        try {
            return objectMapper.readTree(c.getOpzioni());
        } catch (Exception e) {
            return JsonNodeFactory.instance.objectNode();
        }
    }

    void registra(Long postId, Utente utente, String evento, String dettaglio) {
        registra(postId, utente == null ? null : utente.getId(), evento, dettaglio);
    }

    void registra(Long postId, Long utenteId, String evento, String dettaglio) {
        storicoRepository.save(PlannerStorico.builder()
                .postId(postId)
                .utenteId(utenteId)
                .evento(evento)
                .dettaglio(dettaglio == null ? null : PlannerUtenti.tronca(dettaglio, 500))
                .creatoIl(LocalDateTime.now())
                .build());
    }

    // ── DTO ──

    List<PlannerDto.Post> dto(List<PlannerPost> post) {
        if (post.isEmpty()) {
            return List.of();
        }
        List<Long> ids = post.stream().map(PlannerPost::getId).toList();
        Map<Long, List<PlannerPostCanale>> canali = canaleRepository.findByPostIdInOrderByIdAsc(ids).stream()
                .collect(Collectors.groupingBy(PlannerPostCanale::getPostId, LinkedHashMap::new, Collectors.toList()));
        List<PlannerPostMedia> righeMedia = postMediaRepository.findByPostIdInOrderByPosizioneAsc(ids);
        Map<Long, PlannerDto.Media> media = mediaService.dto(mediaRepository.findAllById(
                righeMedia.stream().map(PlannerPostMedia::getMediaId).collect(Collectors.toSet()))).stream()
                .collect(Collectors.toMap(PlannerDto.Media::id, Function.identity()));
        Map<Long, List<PlannerDto.Media>> mediaPerPost = new HashMap<>();
        for (PlannerPostMedia r : righeMedia) {
            PlannerDto.Media m = media.get(r.getMediaId());
            if (m != null) {
                mediaPerPost.computeIfAbsent(r.getPostId(), k -> new ArrayList<>()).add(m);
            }
        }
        Map<Long, Long> commenti = new HashMap<>();
        for (Object[] r : commentoRepository.contaPerPost(ids)) {
            commenti.put((Long) r[0], (Long) r[1]);
        }
        Set<Long> utenti = new LinkedHashSet<>();
        post.forEach(p -> {
            utenti.add(p.getResponsabileUtenteId());
            utenti.add(p.getCreatoDaUtenteId());
            utenti.add(p.getApprovatoDaUtenteId());
        });
        canali.values().forEach(l -> l.forEach(c -> utenti.add(c.getPubblicatoDaUtenteId())));
        Map<Long, String> nomi = anagrafica.nomiUtenti(utenti);
        return post.stream().map(p -> new PlannerDto.Post(
                p.getId(),
                p.getTitolo(),
                p.getTesto(),
                p.getPrimoCommento(),
                p.getLink(),
                p.isUtm(),
                p.getStato(),
                PlannerCanali.iso(p.getProgrammatoAlle()),
                PlannerCanali.iso(p.getPubblicatoIl()),
                p.getEtichettaId(),
                p.getNote(),
                p.getResponsabileUtenteId(),
                nomi.get(p.getResponsabileUtenteId()),
                p.getCreatoDaUtenteId(),
                nomi.get(p.getCreatoDaUtenteId()),
                nomi.get(p.getApprovatoDaUtenteId()),
                PlannerCanali.iso(p.getApprovatoIl()),
                p.getMotivoRifiuto(),
                p.getPosizione(),
                commenti.getOrDefault(p.getId(), 0L),
                PlannerCanali.iso(p.getCreatoIl()),
                PlannerCanali.iso(p.getAggiornatoIl()),
                canali.getOrDefault(p.getId(), List.of()).stream().map(c -> dtoCanale(c, nomi)).toList(),
                mediaPerPost.getOrDefault(p.getId(), List.of()))).toList();
    }

    private PlannerDto.PostCanale dtoCanale(PlannerPostCanale c, Map<Long, String> nomi) {
        PlannerDto.Metriche metriche = c.getMetricheIl() == null ? null : new PlannerDto.Metriche(
                c.getVisualizzazioni(), c.getCopertura(), c.getMiPiace(), c.getCommenti(), c.getCondivisioni(),
                c.getSalvataggi(), PlannerCanali.iso(c.getMetricheIl()));
        return new PlannerDto.PostCanale(c.getId(), c.getCanale(), c.getAccount(), c.getAccountNome(), c.getFormato(),
                c.getModalita(), c.getTesto(), c.getTitolo(), StringUtils.hasText(c.getOpzioni()) ? opzioni(c) : null,
                c.getStato(), c.getIdEsterno(), c.getLinkEsterno(), c.getErrore(), PlannerCanali.iso(c.getPubblicatoIl()),
                nomi.get(c.getPubblicatoDaUtenteId()), metriche);
    }

    // ── Testi ──

    static String nome(Utente u) {
        return u == null ? null : PlannerUtenti.nomeUtente(u);
    }

    private static String cognomeNome(Utente u) {
        String s = ((u.getCognome() == null ? "" : u.getCognome().trim()) + " "
                + (u.getNome() == null ? "" : u.getNome().trim())).trim();
        return s.isEmpty() ? u.getUsername() : s;
    }

    static String etichettaOra(LocalDateTime t) {
        return t == null ? "" : t.format(java.time.format.DateTimeFormatter.ofPattern("EEE d MMM HH:mm", Locale.ITALIAN));
    }

    private static String etichettaStato(String stato) {
        return switch (stato) {
            case PlannerPost.STATO_IDEA -> "Idea";
            case PlannerPost.STATO_BOZZA -> "Bozza";
            default -> stato;
        };
    }

    /** Ciò che si pubblica (testi, canali, media): se cambia, un'approvazione data prima non vale più. */
    private String impronta(PlannerPost p) {
        StringBuilder sb = new StringBuilder();
        sb.append(p.getTitolo()).append('|').append(p.getTesto()).append('|').append(p.getPrimoCommento()).append('|').append(p.getLink());
        for (PlannerPostCanale c : canaleRepository.findByPostIdOrderByIdAsc(p.getId())) {
            sb.append('|').append(c.getCanale()).append(c.getAccount()).append(c.getFormato()).append(c.getModalita())
                    .append(c.getTesto()).append(c.getTitolo()).append(c.getOpzioni());
        }
        postMediaRepository.findByPostIdOrderByPosizioneAsc(p.getId()).forEach(m -> sb.append('|').append(m.getMediaId()));
        return sb.toString();
    }
}
