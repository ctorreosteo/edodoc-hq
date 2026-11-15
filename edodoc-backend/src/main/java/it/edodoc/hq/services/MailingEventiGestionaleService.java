package it.edodoc.hq.services;

import it.edodoc.hq.models.MailingContatto;
import it.edodoc.hq.models.MailingEvento;
import it.edodoc.hq.repositories.MailingEventoRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Agganci del gestionale all'Email Marketing: PazienteService, ConoscitivaService (prenotazione dal sito),
 * VisitaService, PrenotazioneService (esito della chiamata) e PercorsoService.
 *
 * <p>I metodi pubblici sono chiamati dal gestionale e non bloccano mai: pubblicano un {@link Aggancio} e tornano.
 * Il lavoro vero (contatto, tag di sistema, eventi per le automazioni, conversioni) gira dopo il commit della
 * transazione del chiamante, su un thread separato, in una transazione propria, dentro un try/catch: un errore qui
 * non tocca mai il salvataggio di paziente, visita, prenotazione o percorso.
 */
@Service
public class MailingEventiGestionaleService {

    private static final Logger logger = LoggerFactory.getLogger(MailingEventiGestionaleService.class);

    /** Richiesta di lavoro interna: eseguita dopo il commit da {@link #esegui(Aggancio)}. */
    public record Aggancio(String tipo, Long id) {
    }

    static final String PAZIENTE_CREATO = "PAZIENTE_CREATO";
    static final String PAZIENTE_SALVATO = "PAZIENTE_SALVATO";
    static final String VISITA_CREATA = "VISITA_CREATA";
    static final String VISITA_EFFETTUATA = "VISITA_EFFETTUATA";
    static final String ESITO_CONOSCITIVA = "ESITO_CONOSCITIVA";
    static final String PERCORSO_CREATO = "PERCORSO_CREATO";

    private final ApplicationEventPublisher publisher;
    private final MailingContattiService contattiService;
    private final MailingConfigService configService;
    private final MailingEventoRepository eventoRepository;
    private final NamedParameterJdbcTemplate jdbc;
    private final TransactionTemplate transazione;

    public MailingEventiGestionaleService(ApplicationEventPublisher publisher,
                                          MailingContattiService contattiService,
                                          MailingConfigService configService,
                                          MailingEventoRepository eventoRepository,
                                          NamedParameterJdbcTemplate jdbc,
                                          PlatformTransactionManager transactionManager) {
        this.publisher = publisher;
        this.contattiService = contattiService;
        this.configService = configService;
        this.eventoRepository = eventoRepository;
        this.jdbc = jdbc;
        this.transazione = new TransactionTemplate(transactionManager);
    }

    // ═════════════════════════ Punti di aggancio (chiamati dal gestionale) ═════════════════════════

    /** Paziente nuovo: contatto e, se è un lead senza chiamata conoscitiva già fissata, NUOVO_LEAD con la fonte. */
    public void pazienteCreato(Long pazienteId) {
        accoda(PAZIENTE_CREATO, pazienteId);
    }

    /**
     * Paziente modificato, archiviato o anonimizzato: allinea il contatto (email, nome, tag LEAD/PAZIENTE). Archiviato o
     * anonimizzato, il contatto si scollega e, se era nato dal gestionale, si archivia.
     */
    public void pazienteSalvato(Long pazienteId) {
        accoda(PAZIENTE_SALVATO, pazienteId);
    }

    /**
     * Visita creata: VISITA_PRENOTATA; per la chiamata conoscitiva anche CONOSCITIVA_PRENOTATA e il tag
     * CONOSCITIVA_PRENOTATA, per la prima visita PRIMA_VISITA_PRENOTATA; conversione se c'è un click recente.
     */
    public void visitaCreata(Long visitaId) {
        accoda(VISITA_CREATA, visitaId);
    }

    /** Visita passata a EFFETTUATA: CONOSCITIVA_SVOLTA per la chiamata, altrimenti VISITA_EFFETTUATA con il numero. */
    public void visitaEffettuata(Long visitaId) {
        accoda(VISITA_EFFETTUATA, visitaId);
    }

    /** Esito della chiamata conoscitiva scritto dal dottore: ESITO_CONOSCITIVA con l'esito. */
    public void esitoConoscitiva(Long prenotazioneId) {
        accoda(ESITO_CONOSCITIVA, prenotazioneId);
    }

    /** Percorso acquistato: ACQUISTO (tipoPercorso, importo), tag PERCORSO_&lt;TIPO&gt;, conversione se c'è un click. */
    public void percorsoCreato(Long percorsoId) {
        accoda(PERCORSO_CREATO, percorsoId);
    }

    private void accoda(String tipo, Long id) {
        if (id == null) {
            return;
        }
        try {
            publisher.publishEvent(new Aggancio(tipo, id));
        } catch (Exception e) {
            logger.error("Mailing: aggancio {} id={} non accodato: {}", tipo, id, e.getMessage(), e);
        }
    }

    // ═════════════════════════ Esecuzione (dopo il commit, thread separato) ═════════════════════════

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void esegui(Aggancio a) {
        try {
            transazione.executeWithoutResult(stato -> {
                switch (a.tipo()) {
                    case PAZIENTE_CREATO -> pazienteCreatoOra(a.id());
                    case PAZIENTE_SALVATO -> contattiService.assicuraPerPaziente(a.id());
                    case VISITA_CREATA -> visitaCreataOra(a.id());
                    case VISITA_EFFETTUATA -> visitaEffettuataOra(a.id());
                    case ESITO_CONOSCITIVA -> esitoOra(a.id());
                    case PERCORSO_CREATO -> percorsoOra(a.id());
                    default -> logger.warn("Mailing: aggancio sconosciuto {}", a.tipo());
                }
            });
        } catch (Exception e) {
            logger.error("Mailing: aggancio {} id={} fallito: {}", a.tipo(), a.id(), e.getMessage(), e);
        }
    }

    private void pazienteCreatoOra(long pazienteId) {
        MailingContatto c = contattiService.assicuraPerPaziente(pazienteId);
        if (c == null) {
            return;
        }
        List<Map<String, Object>> righe = jdbc.queryForList("SELECT stato, fonte FROM pazienti WHERE id = :id",
                Map.of("id", pazienteId));
        if (righe.isEmpty() || !MailingContattiService.STATI_LEAD.contains(String.valueOf(righe.get(0).get("stato")))) {
            return;
        }
        // Chi arriva prenotando subito la chiamata dal sito non è più "da convincere": per lui vale CONOSCITIVA_PRENOTATA,
        // e una sequenza di benvenuto partita in parallelo gli chiederebbe di prenotare ciò che ha già prenotato.
        Boolean conChiamata = jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM visite WHERE paziente_id = :id "
                + "AND tipo = 'CHIAMATA_CONOSCITIVA' AND stato <> 'ANNULLATA')", Map.of("id", pazienteId), Boolean.class);
        if (Boolean.TRUE.equals(conChiamata)) {
            return;
        }
        Map<String, Object> par = new HashMap<>();
        par.put("fonte", righe.get(0).get("fonte"));
        pubblica(MailingEventoGestionale.NUOVO_LEAD, c, par);
    }

    private void visitaCreataOra(long visitaId) {
        Visita v = visita(visitaId);
        if (v == null) {
            return;
        }
        MailingContatto c = contattiService.assicuraPerPaziente(v.pazienteId());
        if (c == null) {
            return;
        }
        Map<String, Object> par = new HashMap<>();
        par.put("visitaId", visitaId);
        pubblica(MailingEventoGestionale.VISITA_PRENOTATA, c, par);
        switch (v.tipo()) {
            case "CHIAMATA_CONOSCITIVA" -> {
                contattiService.aggiungiTag(c.getId(), MailingContattiService.TAG_CONOSCITIVA_PRENOTATA, true, null);
                pubblica(MailingEventoGestionale.CONOSCITIVA_PRENOTATA, c, par);
            }
            case "PRIMA_VISITA" -> pubblica(MailingEventoGestionale.PRIMA_VISITA_PRENOTATA, c, par);
            default -> {
            }
        }
        registraConversione(c, v.pazienteId(), MailingEvento.Tipo.CONVERSIONE_VISITA, visitaId, null);
        if ("EFFETTUATA".equals(v.stato())) {
            visitaEffettuataOra(visitaId);
        }
    }

    private void visitaEffettuataOra(long visitaId) {
        Visita v = visita(visitaId);
        if (v == null || !"EFFETTUATA".equals(v.stato())) {
            return;
        }
        MailingContatto c = contattiService.assicuraPerPaziente(v.pazienteId());
        if (c == null) {
            return;
        }
        Map<String, Object> par = new HashMap<>();
        par.put("visitaId", visitaId);
        if ("CHIAMATA_CONOSCITIVA".equals(v.tipo())) {
            pubblica(MailingEventoGestionale.CONOSCITIVA_SVOLTA, c, par);
            return;
        }
        Integer numero = jdbc.queryForObject("SELECT COUNT(*) FROM visite v WHERE v.paziente_id = :id AND "
                + MailingSegmentiSql.VISITA_CONTA, Map.of("id", v.pazienteId()), Integer.class);
        par.put("numeroVisite", numero == null ? 1 : numero);
        pubblica(MailingEventoGestionale.VISITA_EFFETTUATA, c, par);
        if ("PRIMA_VISITA".equals(v.tipo())) {
            pubblica(MailingEventoGestionale.PRIMA_VISITA_EFFETTUATA, c, par);
        }
    }

    private void esitoOra(long prenotazioneId) {
        List<Map<String, Object>> righe = jdbc.queryForList("SELECT paziente_id, esito FROM prenotazioni WHERE id = :id",
                Map.of("id", prenotazioneId));
        if (righe.isEmpty() || righe.get(0).get("esito") == null) {
            return;
        }
        MailingContatto c = contattiService.assicuraPerPaziente(((Number) righe.get(0).get("paziente_id")).longValue());
        if (c == null) {
            return;
        }
        Map<String, Object> par = new HashMap<>();
        par.put("prenotazioneId", prenotazioneId);
        par.put("esito", righe.get(0).get("esito"));
        pubblica(MailingEventoGestionale.ESITO_CONOSCITIVA, c, par);
    }

    private void percorsoOra(long percorsoId) {
        List<Map<String, Object>> righe = jdbc.queryForList(
                "SELECT paziente_id, tipo, importo_totale FROM percorsi WHERE id = :id AND stato <> 'ANNULLATO'",
                Map.of("id", percorsoId));
        if (righe.isEmpty()) {
            return;
        }
        Map<String, Object> r = righe.get(0);
        long pazienteId = ((Number) r.get("paziente_id")).longValue();
        MailingContatto c = contattiService.assicuraPerPaziente(pazienteId);
        if (c == null) {
            return;
        }
        String tipo = String.valueOf(r.get("tipo"));
        contattiService.aggiungiTag(c.getId(), MailingContattiService.PREFISSO_PERCORSO + tipo, true, null);
        BigDecimal importo = r.get("importo_totale") == null ? null : new BigDecimal(r.get("importo_totale").toString());
        Map<String, Object> par = new HashMap<>();
        par.put("percorsoId", percorsoId);
        par.put("tipoPercorso", tipo);
        par.put("importo", importo);
        pubblica(MailingEventoGestionale.ACQUISTO, c, par);
        registraConversione(c, pazienteId, MailingEvento.Tipo.CONVERSIONE_ACQUISTO, percorsoId, importo);
    }

    // ═════════════════════════ Conversioni ═════════════════════════

    /**
     * Se un contatto del paziente ha cliccato (click umano) un'email negli ultimi N giorni, registra la conversione
     * attribuendola all'ultima email cliccata. Una sola conversione per visita o percorso.
     */
    void registraConversione(MailingContatto c, long pazienteId, MailingEvento.Tipo tipo, long riferimentoId,
                             BigDecimal valore) {
        LocalDateTime adesso = MailingTempo.adesso();
        int giorni = configService.finestraAttribuzioneGiorni();
        MapSqlParameterSource par = new MapSqlParameterSource()
                .addValue("contatto", c.getId())
                .addValue("paziente", pazienteId)
                .addValue("da", Timestamp.valueOf(adesso.minusDays(giorni)))
                .addValue("a", Timestamp.valueOf(adesso))
                .addValue("tipo", tipo.name())
                .addValue("rif", riferimentoId);
        Boolean gia = jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM mailing_eventi WHERE tipo = :tipo AND riferimento_id = :rif)",
                par, Boolean.class);
        if (Boolean.TRUE.equals(gia)) {
            return;
        }
        List<Map<String, Object>> click = jdbc.queryForList("""
                SELECT e.contatto_id, e.invio_id, e.campagna_id, e.automazione_id
                FROM mailing_eventi e
                WHERE e.tipo = 'CLICK' AND e.automatico = FALSE AND e.avvenuto_il >= :da AND e.avvenuto_il <= :a
                  AND (e.contatto_id = :contatto
                       OR e.contatto_id IN (SELECT id FROM mailing_contatti WHERE paziente_id = :paziente))
                ORDER BY e.avvenuto_il DESC, e.id DESC
                LIMIT 1""", par);
        if (click.isEmpty()) {
            return;
        }
        Map<String, Object> k = click.get(0);
        eventoRepository.save(MailingEvento.builder()
                .tipo(tipo)
                .contattoId(c.getId())
                .invioId(lungo(k.get("invio_id")))
                .campagnaId(lungo(k.get("campagna_id")))
                .automazioneId(lungo(k.get("automazione_id")))
                .riferimentoId(riferimentoId)
                .valore(valore)
                .avvenutoIl(adesso)
                .build());
    }

    // ═════════════════════════ Helper ═════════════════════════

    record Visita(long id, long pazienteId, String tipo, String stato) {
    }

    private Visita visita(long visitaId) {
        List<Map<String, Object>> righe = jdbc.queryForList(
                "SELECT id, paziente_id, tipo, stato FROM visite WHERE id = :id", Map.of("id", visitaId));
        if (righe.isEmpty()) {
            return null;
        }
        Map<String, Object> r = righe.get(0);
        return new Visita(visitaId, ((Number) r.get("paziente_id")).longValue(), (String) r.get("tipo"),
                (String) r.get("stato"));
    }

    private void pubblica(String tipo, MailingContatto c, Map<String, Object> parametri) {
        publisher.publishEvent(new MailingEventoGestionale(tipo, c.getId(), c.getPazienteId(), parametri));
    }

    private static Long lungo(Object o) {
        return o == null ? null : ((Number) o).longValue();
    }
}
