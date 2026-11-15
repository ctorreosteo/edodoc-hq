package it.edodoc.hq.jobs;

import it.edodoc.hq.models.Config;
import it.edodoc.hq.models.MailingCampagna;
import it.edodoc.hq.models.MailingContatto;
import it.edodoc.hq.models.MailingEvento;
import it.edodoc.hq.models.MailingInvio;
import it.edodoc.hq.models.MailingMittente;
import it.edodoc.hq.repositories.ConfigRepository;
import it.edodoc.hq.repositories.MailingCampagnaRepository;
import it.edodoc.hq.repositories.MailingEventoRepository;
import it.edodoc.hq.repositories.MailingInvioRepository;
import it.edodoc.hq.repositories.MailingMittenteRepository;
import it.edodoc.hq.services.MailingCampagneService;
import it.edodoc.hq.services.MailingCanaleException;
import it.edodoc.hq.services.MailingCanali;
import it.edodoc.hq.services.MailingComposizioneService;
import it.edodoc.hq.services.MailingConfigService;
import it.edodoc.hq.services.MailingContattiService;
import it.edodoc.hq.services.MailingMittentiService;
import it.edodoc.hq.services.MailingPubblicoService;
import it.edodoc.hq.services.MailingTempo;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Smaltisce la coda dell'Email Marketing (mailing_invii). NON è {@code @Scheduled} (l'aspect dei job impone un lock
 * minimo di 2 minuti): è un ciclo continuo su {@code mailingInvioExecutor}, avviato a {@link ApplicationReadyEvent}.
 * <p>
 * Ogni giro, se {@value #CONFIG_JOB_ENABLED} e {@code MAILING_INVIO_ABILITATO} sono accesi, prende il lock ShedLock
 * {@value #LOCK} (al massimo 90 s, rilasciato a fine giro: una sola istanza lavora alla volta) e per ogni mittente
 * attivo: calcola la capacità (limite giornaliero − inviati nelle 24 h, limite al minuto − inviati nell'ultimo minuto),
 * prende con {@code FOR UPDATE SKIP LOCKED} un blocco di invii IN_CODA già dovuti (al più un quarto del limite al
 * minuto, ~15 s di lavoro) marcandoli IN_INVIO, e li spedisce uno a uno distanziati di 60/limite_al_minuto secondi.
 * Coda vuota → pausa di 5 s. Invii rimasti IN_INVIO da più di 10 minuti (crash) tornano in coda.
 */
@Component
public class MailingInvioWorker {

    private static final Logger logger = LoggerFactory.getLogger(MailingInvioWorker.class);

    public static final String CONFIG_JOB_ENABLED = "JOB_MAILING_INVIO_ENABLED";
    static final String LOCK = "MailingInvioWorker";
    static final int TENTATIVI_MAX = 5;
    static final Duration LOCK_AL_MASSIMO = Duration.ofSeconds(90);
    static final Duration RECUPERO_DOPO = Duration.ofMinutes(10);
    static final Duration SOSPENSIONE_NON_CONFIGURATO = Duration.ofMinutes(15);
    static final long PAUSA_VUOTO_MS = 5_000;
    static final long PAUSA_SPENTO_MS = 15_000;
    static final long PAUSA_LOCK_ALTRI_MS = 30_000;
    static final long AVANZAMENTO_OGNI_MS = 2_000;

    private enum Esito { INVIATO, SALTATO, RIPROVA, ERRORE, NON_CONFIGURATO, NIENTE }

    private final ExecutorService executor;
    private final ConfigRepository configRepository;
    private final MailingConfigService config;
    private final ScheduledJobClusterLock clusterLock;
    private final MailingMittenteRepository mittenteRepository;
    private final MailingInvioRepository invioRepository;
    private final MailingCampagnaRepository campagnaRepository;
    private final MailingEventoRepository eventoRepository;
    private final MailingComposizioneService composizione;
    private final MailingCanali canali;
    private final MailingPubblicoService pubblicoService;
    private final MailingContattiService contattiService;
    private final MailingMittentiService mittentiService;
    private final MailingCampagneService campagneService;
    private final NamedParameterJdbcTemplate jdbc;
    private final TransactionTemplate tx;

    private final AtomicBoolean avviato = new AtomicBoolean(false);
    private volatile boolean fermo;
    private volatile Future<?> futuro;
    private volatile Instant ultimoRecupero;
    private final Map<Long, Instant> mittentiSospesi = new ConcurrentHashMap<>();
    private final Map<Long, Long> ultimoAvanzamento = new ConcurrentHashMap<>();

    private volatile boolean running;
    private volatile Instant lastRunStartedAt;
    private volatile Instant lastRunFinishedAt;
    private volatile String lastMessage;
    private volatile String lastError;
    private volatile long inviatiDallAvvio;

    public MailingInvioWorker(@Qualifier("mailingInvioExecutor") ExecutorService executor, ConfigRepository configRepository,
                              MailingConfigService config, ScheduledJobClusterLock clusterLock,
                              MailingMittenteRepository mittenteRepository, MailingInvioRepository invioRepository,
                              MailingCampagnaRepository campagnaRepository, MailingEventoRepository eventoRepository,
                              MailingComposizioneService composizione, MailingCanali canali,
                              MailingPubblicoService pubblicoService, MailingContattiService contattiService,
                              MailingMittentiService mittentiService, MailingCampagneService campagneService,  NamedParameterJdbcTemplate jdbc,
                              PlatformTransactionManager transactionManager) {
        this.executor = executor;
        this.configRepository = configRepository;
        this.config = config;
        this.clusterLock = clusterLock;
        this.mittenteRepository = mittenteRepository;
        this.invioRepository = invioRepository;
        this.campagnaRepository = campagnaRepository;
        this.eventoRepository = eventoRepository;
        this.composizione = composizione;
        this.canali = canali;
        this.pubblicoService = pubblicoService;
        this.contattiService = contattiService;
        this.mittentiService = mittentiService;
        this.campagneService = campagneService;
        this.jdbc = jdbc;
        this.tx = new TransactionTemplate(transactionManager);
    }

    // ───────────────────────── Ciclo di vita ─────────────────────────

    @EventListener(ApplicationReadyEvent.class)
    public void avvia() {
        if (avviato.compareAndSet(false, true)) {
            futuro = executor.submit(this::ciclo);
            logger.info("[MAILING] Worker di invio avviato");
        }
    }

    @PreDestroy
    public void ferma() {
        fermo = true;
        Future<?> f = futuro;
        if (f == null) {
            return;
        }
        try {
            f.get(10, TimeUnit.SECONDS);
        } catch (Exception e) {
            f.cancel(true);
        }
        logger.info("[MAILING] Worker di invio fermato");
    }

    private void ciclo() {
        while (!fermo && !Thread.currentThread().isInterrupted()) {
            long pausa;
            try {
                pausa = giro();
            } catch (Throwable t) {
                lastError = t.getClass().getSimpleName() + ": " + t.getMessage();
                logger.error("[MAILING] Errore nel worker di invio", t);
                pausa = PAUSA_LOCK_ALTRI_MS;
            }
            if (pausa > 0) {
                dormi(pausa);
            }
        }
    }

    public boolean isEnabled() {
        return configRepository.findByChiave(CONFIG_JOB_ENABLED)
                .map(Config::getValore)
                .map(v -> "TRUE".equalsIgnoreCase(v.trim()))
                .orElse(false);
    }

    /** Un giro: ritorna quanti ms aspettare prima del prossimo (0 = subito, c'è altro lavoro). */
    long giro() {
        if (!isEnabled() || !config.invioEmailDiSistemaAttivo() || !config.invioAbilitato()) {
            return PAUSA_SPENTO_MS;
        }
        AtomicBoolean lavoro = new AtomicBoolean(false);
        boolean preso = clusterLock.runIfAcquired(ScheduledJobClusterLock.name(LOCK), LOCK_AL_MASSIMO, Duration.ZERO,
                () -> lavoro.set(lavora()));
        if (!preso) {
            return PAUSA_LOCK_ALTRI_MS;
        }
        return lavoro.get() ? 0 : PAUSA_VUOTO_MS;
    }

    // ───────────────────────── Lavoro ─────────────────────────

    private boolean lavora() {
        LocalDateTime ora = MailingTempo.adesso();
        if (ultimoRecupero == null || Duration.between(ultimoRecupero, Instant.now()).compareTo(RECUPERO_DOPO) >= 0) {
            recupera(ora);
            ultimoRecupero = Instant.now();
        }
        assegnaMittenteMancante();
        boolean fatto = false;
        Set<Long> campagneToccate = new LinkedHashSet<>();
        int inviatiGiro = 0;
        Instant inizio = Instant.now();
        for (MailingMittente m : mittenteRepository.findByAttivoTrueOrderByEmailAsc()) {
            if (fermo) {
                break;
            }
            Instant sospeso = mittentiSospesi.get(m.getId());
            if (sospeso != null && Instant.now().isBefore(sospeso)) {
                continue;
            }
            int capacita = capacita(m, ora);
            if (capacita <= 0) {
                continue;
            }
            int blocco = dimensioneBlocco(capacita, m.getLimiteAlMinuto());
            List<Long> ids = prendi(m.getId(), blocco, MailingTempo.adesso());
            if (ids.isEmpty()) {
                continue;
            }
            if (!fatto) {
                running = true;
                lastRunStartedAt = inizio;
            }
            fatto = true;
            long intervallo = 60_000L / Math.max(1, m.getLimiteAlMinuto());
            for (int k = 0; k < ids.size(); k++) {
                if (fermo) {
                    rimettiInCoda(ids.subList(k, ids.size()));
                    break;
                }
                long t0 = System.currentTimeMillis();
                Long[] campagna = new Long[1];
                Esito e = inviaUno(ids.get(k), m, campagna);
                if (campagna[0] != null) {
                    campagneToccate.add(campagna[0]);
                    avanzamento(campagna[0], false);
                }
                if (e == Esito.INVIATO) {
                    inviatiGiro++;
                }
                if (e == Esito.NON_CONFIGURATO) {
                    rimettiInCoda(ids.subList(k + 1, ids.size()));
                    break;
                }
                long resto = intervallo - (System.currentTimeMillis() - t0);
                if (resto > 0 && k < ids.size() - 1) {
                    dormi(resto);
                }
            }
        }
        for (Long id : campagneToccate) {
            try {
                if (!campagneService.verificaCompletamento(id)) {
                    avanzamento(id, true);
                }
            } catch (RuntimeException ex) {
                logger.warn("[MAILING] Completamento campagna {} non verificato: {}", id, ex.getMessage());
            }
        }
        if (fatto) {
            inviatiDallAvvio += inviatiGiro;
            running = false;
            lastRunFinishedAt = Instant.now();
            lastMessage = inviatiGiro + " email inviate nell'ultimo giro (" + inviatiDallAvvio + " dall'avvio)";
        }
        return fatto;
    }

    /** Quota del mittente adesso, dai conteggi sul DB. */
    private int capacita(MailingMittente m, LocalDateTime ora) {
        Map<String, Object> r = jdbc.queryForMap("SELECT "
                        + "COUNT(*) FILTER (WHERE inviato_il > :giorno) AS giorno, "
                        + "COUNT(*) FILTER (WHERE inviato_il > :minuto) AS minuto "
                        + "FROM mailing_invii WHERE mittente_id = :m AND inviato_il > :giorno",
                new MapSqlParameterSource("m", m.getId()).addValue("giorno", ora.minusHours(24)).addValue("minuto", ora.minusMinutes(1)));
        return MailingMittentiService.capacita(m.getLimiteGiornaliero(), ((Number) r.get("giorno")).intValue(),
                m.getLimiteAlMinuto(), ((Number) r.get("minuto")).intValue());
    }

    /** Blocco per giro: al più un quarto del limite al minuto (~15 s di invii distanziati), almeno 1. */
    static int dimensioneBlocco(int capacita, int limiteAlMinuto) {
        return Math.max(1, Math.min(capacita, (Math.max(1, limiteAlMinuto) + 3) / 4));
    }

    /**
     * Prende e marca IN_INVIO gli invii dovuti del mittente. Campagne: solo se IN_INVIO o TEST_AB; automazioni: solo
     * se ATTIVA (pausa e annullamento si rispettano qui). programmato_per diventa l'istante della presa (serve al recupero).
     */
    List<Long> prendi(long mittenteId, int quanti, LocalDateTime ora) {
        List<Long> ids = jdbc.queryForList("UPDATE mailing_invii SET stato = 'IN_INVIO', programmato_per = :ora "
                        + "WHERE id IN (SELECT i.id FROM mailing_invii i "
                        + "WHERE i.stato = 'IN_CODA' AND i.mittente_id = :m AND i.programmato_per <= :ora "
                        + "AND (i.campagna_id IS NULL OR EXISTS (SELECT 1 FROM mailing_campagne c WHERE c.id = i.campagna_id "
                        + "AND c.stato IN ('IN_INVIO','TEST_AB'))) "
                        + "AND (i.automazione_email_id IS NULL OR EXISTS (SELECT 1 FROM mailing_automazioni_email e "
                        + "JOIN mailing_automazioni a ON a.id = e.automazione_id "
                        + "WHERE e.id = i.automazione_email_id AND a.stato = 'ATTIVA')) "
                        + "ORDER BY i.programmato_per, i.id LIMIT :n FOR UPDATE SKIP LOCKED) RETURNING id",
                new MapSqlParameterSource("m", mittenteId).addValue("ora", ora).addValue("n", quanti), Long.class);
        List<Long> ordinati = new ArrayList<>(ids);
        ordinati.sort(Long::compareTo);
        return ordinati;
    }

    /** Invii rimasti IN_INVIO da più di 10 minuti (istanza caduta a metà) → di nuovo in coda. */
    void recupera(LocalDateTime ora) {
        int n = jdbc.update("UPDATE mailing_invii SET stato = 'IN_CODA' WHERE stato = 'IN_INVIO' AND programmato_per < :limite",
                new MapSqlParameterSource("limite", ora.minus(RECUPERO_DOPO)));
        if (n > 0) {
            logger.warn("[MAILING] {} invii rimasti a metà rimessi in coda", n);
        }
    }

    /** Invii in coda senza mittente (mittente eliminato): passano al predefinito. */
    private void assegnaMittenteMancante() {
        mittentiService.predefinito().ifPresent(p -> jdbc.update(
                "UPDATE mailing_invii SET mittente_id = :p WHERE stato = 'IN_CODA' AND mittente_id IS NULL",
                Map.of("p", p.getId())));
    }

    private void rimettiInCoda(List<Long> ids) {
        if (ids.isEmpty()) {
            return;
        }
        jdbc.update("UPDATE mailing_invii SET stato = 'IN_CODA' WHERE id IN (:ids) AND stato = 'IN_INVIO'",
                new MapSqlParameterSource("ids", ids));
    }

    private Esito inviaUno(long invioId, MailingMittente m, Long[] campagnaToccata) {
        MailingInvio invio = invioRepository.findById(invioId).orElse(null);
        if (invio == null || invio.getStato() != MailingInvio.Stato.IN_INVIO) {
            return Esito.NIENTE;
        }
        campagnaToccata[0] = invio.getCampagnaId();
        if (invio.getCampagnaId() != null) {
            MailingCampagna.Stato s = campagnaRepository.findById(invio.getCampagnaId()).map(MailingCampagna::getStato).orElse(null);
            if (s == null || s == MailingCampagna.Stato.ANNULLATA) {
                chiudi(invio, MailingInvio.Stato.ANNULLATO, "Campagna annullata");
                return Esito.SALTATO;
            }
            if (s != MailingCampagna.Stato.IN_INVIO && s != MailingCampagna.Stato.TEST_AB) {
                rimettiInCoda(List.of(invio.getId()));
                return Esito.NIENTE;
            }
        }
        MailingComposizioneService.Composto composto;
        try {
            MailingComposizioneService.Sorgente sorgente = composizione.sorgente(invio);
            if (!pubblicoService.idoneo(invio.getContattoId(), sorgente.categoriaId())) {
                chiudi(invio, MailingInvio.Stato.SALTATO, "Contatto non più idoneo (disiscritto, rimbalzato o categoria esclusa)");
                return Esito.SALTATO;
            }
            composto = composizione.componi(invio, m);
        } catch (IllegalArgumentException e) {
            chiudi(invio, MailingInvio.Stato.ERRORE, "Email non componibile: " + e.getMessage());
            return Esito.ERRORE;
        } catch (RuntimeException e) {
            logger.warn("[MAILING] Invio {} non composto: {}", invio.getId(), e.getMessage());
            chiudi(invio, MailingInvio.Stato.ERRORE, "Email non componibile: " + e.getMessage());
            return Esito.ERRORE;
        }
        try {
            String idProvider = canali.invia(m, composto.messaggio());
            String messageId = composto.messageId();
            try {
                String vero = composto.messaggio().getMessageID();
                if (vero != null) {
                    messageId = vero;
                }
            } catch (Exception ignorata) {
                // si tiene quello generato
            }
            registraInviato(invio, m, composto.oggetto(), messageId, idProvider);
            return Esito.INVIATO;
        } catch (MailingCanaleException.Temporanea e) {
            return riprova(invio, e.getMessage());
        } catch (MailingCanaleException.Permanente e) {
            if (e.isPerDestinatario()) {
                rimbalzoImmediato(invio, e.getMessage());
            } else {
                chiudi(invio, MailingInvio.Stato.ERRORE, e.getMessage());
            }
            return Esito.ERRORE;
        } catch (MailingCanaleException.NonConfigurato e) {
            mittenteNonConfigurato(invio, m, e.getMessage());
            return Esito.NON_CONFIGURATO;
        } catch (MailingCanaleException e) {
            return riprova(invio, e.getMessage());
        } catch (RuntimeException e) {
            logger.warn("[MAILING] Invio {} fallito: {}", invio.getId(), e.getMessage());
            return riprova(invio, e.getMessage());
        }
    }

    private void registraInviato(MailingInvio invio, MailingMittente m, String oggetto, String messageId, String idProvider) {
        tx.executeWithoutResult(s -> {
            LocalDateTime ora = MailingTempo.adesso();
            MailingInvio i = invioRepository.findById(invio.getId()).orElseThrow();
            i.setStato(MailingInvio.Stato.INVIATO);
            i.setInviatoIl(ora);
            i.setMessageId(tronca(messageId, 255));
            if (m.getCanale() == MailingMittente.Canale.GMAIL_API) {
                i.setGmailId(tronca(idProvider, 100));
            }
            i.setOggetto(tronca(oggetto, 300));
            i.setErrore(null);
            invioRepository.save(i);
            eventoRepository.save(MailingEvento.builder()
                    .tipo(MailingEvento.Tipo.INVIATO)
                    .invioId(i.getId())
                    .contattoId(i.getContattoId())
                    .campagnaId(i.getCampagnaId())
                    .automazioneId(automazioneId(i))
                    .avvenutoIl(ora)
                    .build());
            jdbc.update("UPDATE mailing_contatti SET ultimo_invio_il = :t WHERE id = :id",
                    new MapSqlParameterSource("t", ora).addValue("id", i.getContattoId()));
        });
    }

    private Long automazioneId(MailingInvio i) {
        if (i.getAutomazioneEmailId() == null) {
            return null;
        }
        List<Long> r = jdbc.queryForList("SELECT automazione_id FROM mailing_automazioni_email WHERE id = :id",
                Map.of("id", i.getAutomazioneEmailId()), Long.class);
        return r.isEmpty() ? null : r.get(0);
    }

    private Esito riprova(MailingInvio invio, String errore) {
        int tentativi = (invio.getTentativi() != null ? invio.getTentativi() : 0) + 1;
        if (tentativi >= TENTATIVI_MAX) {
            jdbc.update("UPDATE mailing_invii SET stato = 'ERRORE', tentativi = :t, errore = :e WHERE id = :id",
                    new MapSqlParameterSource("t", tentativi).addValue("e", "Dopo " + tentativi + " tentativi: " + errore)
                            .addValue("id", invio.getId()));
            return Esito.ERRORE;
        }
        jdbc.update("UPDATE mailing_invii SET stato = 'IN_CODA', tentativi = :t, errore = :e, programmato_per = :quando WHERE id = :id",
                new MapSqlParameterSource("t", tentativi).addValue("e", errore)
                        .addValue("quando", MailingTempo.adesso().plus(attesaRitento(tentativi))).addValue("id", invio.getId()));
        return Esito.RIPROVA;
    }

    /** Attesa prima del tentativo successivo: 2, 4, 8, 16 minuti. */
    static Duration attesaRitento(int tentativiFatti) {
        return Duration.ofMinutes(2L << Math.max(0, Math.min(tentativiFatti - 1, 6)));
    }

    /** Indirizzo rifiutato subito dal server: invio RIMBALZATO, evento RIMBALZO, contatto RIMBALZATO. */
    private void rimbalzoImmediato(MailingInvio invio, String errore) {
        tx.executeWithoutResult(s -> {
            jdbc.update("UPDATE mailing_invii SET stato = 'RIMBALZATO', rimbalzo_tipo = 'HARD', errore = :e WHERE id = :id",
                    new MapSqlParameterSource("e", errore).addValue("id", invio.getId()));
            eventoRepository.save(MailingEvento.builder()
                    .tipo(MailingEvento.Tipo.RIMBALZO)
                    .invioId(invio.getId())
                    .contattoId(invio.getContattoId())
                    .campagnaId(invio.getCampagnaId())
                    .automazioneId(automazioneId(invio))
                    .avvenutoIl(MailingTempo.adesso())
                    .build());
        });
        try {
            contattiService.cambiaStato(invio.getContattoId(), MailingContatto.Stato.RIMBALZATO, "Indirizzo rifiutato: " + errore);
        } catch (RuntimeException e) {
            logger.warn("[MAILING] Contatto {} non marcato rimbalzato: {}", invio.getContattoId(), e.getMessage());
        }
    }

    /** Delega o credenziali mancanti: invio di nuovo in coda, campagne del mittente in pausa, errore sul mittente. */
    private void mittenteNonConfigurato(MailingInvio invio, MailingMittente m, String errore) {
        rimettiInCoda(List.of(invio.getId()));
        mittentiSospesi.put(m.getId(), Instant.now().plus(SOSPENSIONE_NON_CONFIGURATO));
        mittentiService.registraErrore(m.getId(), errore);
        List<Long> inPausa = campagneService.pausaPerMittente(m.getId());
        lastError = errore;
        logger.warn("[MAILING] Mittente {} non configurato, campagne in pausa {}: {}", m.getEmail(), inPausa, errore);
    }

    private void chiudi(MailingInvio invio, MailingInvio.Stato stato, String errore) {
        jdbc.update("UPDATE mailing_invii SET stato = :s, errore = :e WHERE id = :id",
                new MapSqlParameterSource("s", stato.name()).addValue("e", errore).addValue("id", invio.getId()));
    }

    /** Avanzamento realtime della campagna, al massimo ogni 2 s (o forzato a fine giro). */
    private void avanzamento(long campagnaId, boolean forza) {
        long adesso = System.currentTimeMillis();
        Long ultimo = ultimoAvanzamento.get(campagnaId);
        if (!forza && ultimo != null && adesso - ultimo < AVANZAMENTO_OGNI_MS) {
            return;
        }
        ultimoAvanzamento.put(campagnaId, adesso);
        try {
            int[] a = campagneService.avanzamento(campagnaId);
            String eta = campagnaRepository.findById(campagnaId).map(c -> campagneService.etaFine(c, a[3])).orElse(null);
        } catch (RuntimeException e) {
            logger.debug("[MAILING] Avanzamento campagna {} non pubblicato: {}", campagnaId, e.getMessage());
        }
    }

    private void dormi(long ms) {
        try {
            long fine = System.currentTimeMillis() + ms;
            while (!fermo && System.currentTimeMillis() < fine) {
                Thread.sleep(Math.min(500, Math.max(1, fine - System.currentTimeMillis())));
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            fermo = true;
        }
    }

    private static String tronca(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }

    // ───────────────────────── Stato per il monitor dei job ─────────────────────────

    public boolean isRunning() {
        return running;
    }

    /** Il thread del ciclo è vivo. */
    public boolean isAttivo() {
        Future<?> f = futuro;
        return f != null && !f.isDone();
    }

    public Instant getLastRunStartedAt() {
        return lastRunStartedAt;
    }

    public Instant getLastRunFinishedAt() {
        return lastRunFinishedAt;
    }

    public String getLastMessage() {
        return lastMessage;
    }

    public String getLastError() {
        return lastError;
    }
}
