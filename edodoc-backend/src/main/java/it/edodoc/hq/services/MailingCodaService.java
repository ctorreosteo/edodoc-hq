package it.edodoc.hq.services;

import it.edodoc.hq.models.MailingAutomazioneEmail;
import it.edodoc.hq.models.MailingContatto;
import it.edodoc.hq.models.MailingInvio;
import it.edodoc.hq.models.MailingMittente;
import it.edodoc.hq.repositories.MailingAutomazioneEmailRepository;
import it.edodoc.hq.repositories.MailingContattoRepository;
import it.edodoc.hq.repositories.MailingInvioRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Lazy;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Array;
import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * Coda di invio (mailing_invii): accodamento delle email di automazione (una alla volta) e delle campagne (in
 * blocchi, con INSERT multipli che saltano chi ha già un invio della stessa campagna), annullamenti.
 * Lo smaltimento è di {@link it.edodoc.hq.jobs.MailingInvioWorker}.
 */
@Service
public class MailingCodaService {

    private static final Logger logger = LoggerFactory.getLogger(MailingCodaService.class);
    static final int BLOCCO = 1000;

    private final JdbcTemplate jdbcTemplate;
    private final MailingInvioRepository invioRepository;
    private final MailingContattoRepository contattoRepository;
    private final MailingAutomazioneEmailRepository automazioneEmailRepository;
    private final MailingPubblicoService pubblicoService;
    private final MailingMittentiService mittentiService;

    public MailingCodaService(JdbcTemplate jdbcTemplate, MailingInvioRepository invioRepository,
                              MailingContattoRepository contattoRepository,
                              MailingAutomazioneEmailRepository automazioneEmailRepository,
                              @Lazy MailingPubblicoService pubblicoService, MailingMittentiService mittentiService) {
        this.jdbcTemplate = jdbcTemplate;
        this.invioRepository = invioRepository;
        this.contattoRepository = contattoRepository;
        this.automazioneEmailRepository = automazioneEmailRepository;
        this.pubblicoService = pubblicoService;
        this.mittentiService = mittentiService;
    }

    /**
     * Accoda un'email di automazione. Null se il contatto non è idoneo (non iscritto, email non valida, categoria
     * esclusa) o l'email non esiste più.
     */
    @Transactional
    public MailingInvio accodaEmailAutomazione(long automazioneEmailId, long iscrizioneId, long contattoId,
                                               Long mittenteId, Long categoriaId, LocalDateTime quando) {
        if (!pubblicoService.idoneo(contattoId, categoriaId)) {
            return null;
        }
        MailingAutomazioneEmail email = automazioneEmailRepository.findById(automazioneEmailId).orElse(null);
        MailingContatto contatto = contattoRepository.findById(contattoId).orElse(null);
        if (email == null || contatto == null) {
            return null;
        }
        MailingMittente mittente = mittentiService.risolvi(mittenteId);
        LocalDateTime ora = MailingTempo.adesso();
        MailingInvio invio = MailingInvio.builder()
                .token(MailingToken.nuovo(MailingToken.INVIO))
                .contattoId(contattoId)
                .automazioneEmailId(automazioneEmailId)
                .iscrizioneId(iscrizioneId)
                .mittenteId(mittente.getId())
                .email(contatto.getEmail())
                .oggetto(tronca(email.getOggetto(), 300))
                .stato(MailingInvio.Stato.IN_CODA)
                .programmatoPer(quando != null && quando.isAfter(ora) ? quando : ora)
                .creatoIl(ora)
                .build();
        return invioRepository.save(invio);
    }

    /** Annulla gli invii ancora in coda del contatto (disiscrizione, rimbalzo, cambio di stato). */
    @Transactional
    public void annullaInCodaPerContatto(long contattoId) {
        jdbcTemplate.update("UPDATE mailing_invii SET stato = 'ANNULLATO', errore = COALESCE(errore, 'Annullato: contatto non più iscritto') "
                + "WHERE contatto_id = ? AND stato = 'IN_CODA'", contattoId);
    }

    /** Annulla gli invii ancora in coda della campagna. Ritorna quanti. */
    @Transactional
    public int annullaInCodaPerCampagna(long campagnaId) {
        return jdbcTemplate.update("UPDATE mailing_invii SET stato = 'ANNULLATO', errore = COALESCE(errore, 'Campagna annullata') "
                + "WHERE campagna_id = ? AND stato = 'IN_CODA'", campagnaId);
    }

    /**
     * Accoda una campagna in blocchi da {@value #BLOCCO}: un INSERT ... SELECT da unnest() per blocco, con
     * ON CONFLICT sull'indice unico (campagna, contatto) così rilanci e code già presenti non duplicano.
     * {@code programmati}: orario per contatto (invio intelligente); chi non c'è parte a {@code quando}.
     * Ritorna quanti invii sono stati creati davvero.
     */
    @Transactional
    public int accodaCampagna(long campagnaId, long mittenteId, List<Long> contattoIds, String variante, String oggetto,
                              Map<Long, LocalDateTime> programmati, LocalDateTime quando) {
        if (contattoIds == null || contattoIds.isEmpty()) {
            return 0;
        }
        LocalDateTime ora = MailingTempo.adesso();
        LocalDateTime base = quando != null ? quando : ora;
        String sql = "INSERT INTO mailing_invii (token, contatto_id, campagna_id, mittente_id, email, variante, oggetto, "
                + "stato, programmato_per, tentativi, aperture, click, creato_il) "
                + "SELECT v.token, c.id, ?, ?, c.email, ?, ?, 'IN_CODA', v.quando, 0, 0, 0, ? "
                + "FROM unnest(?::bigint[], ?::text[], ?::timestamp[]) AS v(contatto_id, token, quando) "
                + "JOIN mailing_contatti c ON c.id = v.contatto_id "
                + "ON CONFLICT (campagna_id, contatto_id) WHERE campagna_id IS NOT NULL DO NOTHING";
        int creati = 0;
        for (int da = 0; da < contattoIds.size(); da += BLOCCO) {
            List<Long> blocco = contattoIds.subList(da, Math.min(da + BLOCCO, contattoIds.size()));
            Long[] ids = blocco.toArray(Long[]::new);
            String[] token = new String[ids.length];
            Timestamp[] tempi = new Timestamp[ids.length];
            for (int i = 0; i < ids.length; i++) {
                token[i] = MailingToken.nuovo(MailingToken.INVIO);
                LocalDateTime t = programmati != null ? programmati.get(ids[i]) : null;
                tempi[i] = Timestamp.valueOf(t != null ? t : base);
            }
            String oggettoTroncato = tronca(oggetto, 300);
            Integer n = jdbcTemplate.execute((java.sql.Connection con) -> {
                try (PreparedStatement ps = con.prepareStatement(sql)) {
                    Array arrIds = con.createArrayOf("bigint", ids);
                    Array arrToken = con.createArrayOf("text", token);
                    Array arrTempi = con.createArrayOf("timestamp", tempi);
                    ps.setLong(1, campagnaId);
                    ps.setLong(2, mittenteId);
                    ps.setString(3, variante);
                    ps.setString(4, oggettoTroncato);
                    ps.setTimestamp(5, Timestamp.valueOf(ora));
                    ps.setArray(6, arrIds);
                    ps.setArray(7, arrToken);
                    ps.setArray(8, arrTempi);
                    return ps.executeUpdate();
                }
            });
            creati += n != null ? n : 0;
        }
        logger.info("[MAILING] Campagna {}: {} invii accodati (variante {})", campagnaId, creati, variante);
        return creati;
    }

    static String tronca(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }
}
