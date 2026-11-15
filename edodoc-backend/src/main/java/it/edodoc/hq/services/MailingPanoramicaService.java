package it.edodoc.hq.services;

import it.edodoc.hq.dto.MailingDto;
import it.edodoc.hq.jobs.MailingInvioWorker;
import it.edodoc.hq.jobs.MailingRimbalziJob;
import it.edodoc.hq.models.MailingCampagna;
import it.edodoc.hq.models.MailingMittente;
import it.edodoc.hq.repositories.ConfigRepository;
import it.edodoc.hq.repositories.MailingCampagnaRepository;
import it.edodoc.hq.repositories.MailingContattoRepository;
import it.edodoc.hq.repositories.MailingMittenteRepository;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Stato della pagina (con avvisi utili), panoramica con KPI e salute della lista, feed delle attività recenti. */
@Service
public class MailingPanoramicaService {

    private final MailingConfigService config;
    private final MailingMittenteRepository mittenteRepository;
    private final MailingCampagnaRepository campagnaRepository;
    private final MailingContattoRepository contattoRepository;
    private final ConfigRepository configRepository;
    private final MailingMetricheService metriche;
    private final MailingMittentiService mittentiService;
    private final MailingCampagneService campagneService;
    private final ObjectProvider<MailingAutomazioniService> automazioniService;
    private final NamedParameterJdbcTemplate jdbc;

    private final it.edodoc.hq.ai.AiClient aiClient;

    public MailingPanoramicaService(MailingConfigService config, MailingMittenteRepository mittenteRepository,
                                    MailingCampagnaRepository campagnaRepository, MailingContattoRepository contattoRepository,
                                    ConfigRepository configRepository, it.edodoc.hq.ai.AiClient aiClient,
                                    MailingMetricheService metriche, MailingMittentiService mittentiService,
                                    MailingCampagneService campagneService,
                                    ObjectProvider<MailingAutomazioniService> automazioniService,
                                    NamedParameterJdbcTemplate jdbc) {
        this.config = config;
        this.mittenteRepository = mittenteRepository;
        this.campagnaRepository = campagnaRepository;
        this.contattoRepository = contattoRepository;
        this.aiClient = aiClient;
        this.configRepository = configRepository;
        this.metriche = metriche;
        this.mittentiService = mittentiService;
        this.campagneService = campagneService;
        this.automazioniService = automazioniService;
        this.jdbc = jdbc;
    }

    // ───────────────────────── Stato ─────────────────────────

    @Transactional(readOnly = true)
    public MailingDto.Stato stato() {
        List<MailingMittente> attivi = mittenteRepository.findByAttivoTrueOrderByEmailAsc();
        boolean invio = config.invioAbilitato();
        Integer inCoda = jdbc.queryForObject("SELECT COUNT(*) FROM mailing_invii WHERE stato IN ('IN_CODA','IN_INVIO')",
                Map.of(), Integer.class);
        List<String> avvisi = new ArrayList<>();
        if (!config.invioEmailDiSistemaAttivo()) {
            avvisi.add("L'invio delle email è disabilitato a livello di sistema (" + MailingConfigService.CONFIG_INVIO_EMAIL_ENABLED
                    + " nel database): puoi preparare tutto, ma nessuna email parte, nemmeno le prove.");
        }
        if (attivi.isEmpty()) {
            avvisi.add("Nessun mittente attivo: aggiungine uno in Impostazioni → Mittenti per poter inviare.");
        }
        for (MailingMittente m : attivi) {
            if (StringUtils.hasText(m.getUltimoErrore())) {
                avvisi.add("Il mittente " + m.getEmail() + " ha un problema: " + abbrevia(m.getUltimoErrore(), 220));
            } else if (m.getVerificatoIl() == null) {
                avvisi.add("Il mittente " + m.getEmail() + " non è ancora verificato: premi \"Verifica\" prima della prima campagna.");
            }
        }
        if (!invio && inCoda != null && inCoda > 0) {
            avvisi.add((inCoda == 1 ? "C'è un'email" : "Ci sono " + inCoda + " email") + " in coda ma gli invii sono spenti: accendili in Impostazioni.");
        } else if (!invio && !attivi.isEmpty()) {
            avvisi.add("Gli invii sono spenti: accendili in Impostazioni quando sei pronto a spedire.");
        }
        if (!configAttiva(MailingInvioWorker.CONFIG_JOB_ENABLED)) {
            avvisi.add("Il motore di invio è disattivato (" + MailingInvioWorker.CONFIG_JOB_ENABLED + "): la coda non avanza.");
        }
        if (!configAttiva(MailingRimbalziJob.CONFIG_JOB_ENABLED)) {
            avvisi.add("La lettura di rimbalzi e risposte è disattivata (" + MailingRimbalziJob.CONFIG_JOB_ENABLED + ").");
        }
        long inPausa = campagnaRepository.findByStato(MailingCampagna.Stato.IN_PAUSA).size();
        if (inPausa > 0) {
            avvisi.add(inPausa == 1 ? "Una campagna è in pausa." : inPausa + " campagne sono in pausa.");
        }
        String indirizzo = config.indirizzoPostale();
        if (!StringUtils.hasText(indirizzo) || indirizzo.trim().length() < 20 || !indirizzo.matches(".*\\d.*")) {
            avvisi.add("Completa l'indirizzo postale in Impostazioni: nome, partita IVA e indirizzo vanno in fondo a ogni email.");
        }
        String url = config.urlPubblico();
        if (url != null && url.contains(".run.app")) {
            avvisi.add("I link tracciati usano " + url + ": un sottodominio vostro (es. link.edodoc.it) migliora la consegna.");
        }
        return new MailingDto.Stato(invio, aiClient.isDisponibile(),
                attivi.size(), url, avvisi);
    }

    private boolean configAttiva(String chiave) {
        return configRepository.findByChiave(chiave).map(c -> c.getValore() != null && "TRUE".equalsIgnoreCase(c.getValore().trim()))
                .orElse(false);
    }

    // ───────────────────────── Panoramica ─────────────────────────

    @Transactional(readOnly = true)
    public MailingDto.Panoramica panoramica(int giorniRichiesti) {
        int giorni = Math.max(7, Math.min(365, giorniRichiesti));
        LocalDateTime ora = MailingTempo.adesso();
        LocalDateTime da = ora.toLocalDate().minusDays(giorni - 1L).atStartOfDay();
        LocalDateTime daPrima = da.minusDays(giorni);
        MapSqlParameterSource p = new MapSqlParameterSource("da", da).addValue("a", ora).addValue("daPrima", daPrima)
                .addValue("g30", ora.minusDays(30)).addValue("g90", ora.minusDays(90));

        Map<String, Object> c = jdbc.queryForMap("SELECT "
                + "COUNT(*) FILTER (WHERE stato = 'ISCRITTO') AS iscritti, "
                + "COUNT(*) FILTER (WHERE stato <> 'ARCHIVIATO') AS totali, "
                + "COUNT(*) FILTER (WHERE creato_il >= :da) AS nuovi, "
                + "COUNT(*) FILTER (WHERE creato_il >= :daPrima AND creato_il < :da) AS nuovi_prima, "
                + "COUNT(*) FILTER (WHERE disiscritto_il >= :da) AS disiscritti_periodo, "
                + "COUNT(*) FILTER (WHERE stato = 'ISCRITTO' AND ultima_apertura_il >= :g30) AS attivi, "
                + "COUNT(*) FILTER (WHERE stato = 'ISCRITTO' AND ultima_apertura_il >= :g90 AND ultima_apertura_il < :g30) AS tiepidi, "
                + "COUNT(*) FILTER (WHERE stato = 'ISCRITTO' AND ultima_apertura_il < :g90) AS dormienti, "
                + "COUNT(*) FILTER (WHERE stato = 'ISCRITTO' AND ultima_apertura_il IS NULL AND ultimo_invio_il IS NOT NULL) AS mai, "
                + "COUNT(*) FILTER (WHERE stato = 'RIMBALZATO') AS rimbalzati, "
                + "COUNT(*) FILTER (WHERE stato = 'DISISCRITTO') AS disiscritti "
                + "FROM mailing_contatti", p);

        MailingDto.Metriche m = metriche.perPeriodo(da, ora);
        MailingDto.Metriche mPrima = metriche.perPeriodo(daPrima, da);
        MailingDto.Metriche m30 = metriche.perPeriodo(ora.minusDays(30), ora);

        Map<String, Map<String, Number>> crescita = giorniVuoti(da.toLocalDate(), ora.toLocalDate(), "iscritti", "disiscritti");
        jdbc.query("SELECT creato_il::date AS g, COUNT(*) AS n FROM mailing_contatti WHERE creato_il >= :da GROUP BY 1", p,
                rs -> {
                    metti(crescita, rs.getDate("g").toLocalDate(), "iscritti", rs.getInt("n"));
                });
        jdbc.query("SELECT disiscritto_il::date AS g, COUNT(*) AS n FROM mailing_contatti WHERE disiscritto_il >= :da GROUP BY 1", p,
                rs -> {
                    metti(crescita, rs.getDate("g").toLocalDate(), "disiscritti", rs.getInt("n"));
                });

        Map<String, Map<String, Number>> attivita = giorniVuoti(da.toLocalDate(), ora.toLocalDate(), "inviati", "aperture", "click");
        jdbc.query("SELECT inviato_il::date AS g, COUNT(*) AS n FROM mailing_invii WHERE inviato_il >= :da GROUP BY 1", p,
                rs -> {
                    metti(attivita, rs.getDate("g").toLocalDate(), "inviati", rs.getInt("n"));
                });
        jdbc.query("SELECT avvenuto_il::date AS g, COUNT(DISTINCT invio_id) FILTER (WHERE tipo = 'APERTURA') AS a, "
                        + "COUNT(DISTINCT invio_id) FILTER (WHERE tipo = 'CLICK') AS k FROM mailing_eventi "
                        + "WHERE avvenuto_il >= :da AND tipo IN ('APERTURA','CLICK') AND NOT automatico GROUP BY 1", p,
                rs -> {
                    metti(attivita, rs.getDate("g").toLocalDate(), "aperture", rs.getInt("a"));
                    metti(attivita, rs.getDate("g").toLocalDate(), "click", rs.getInt("k"));
                });

        int iscritti = n(c.get("iscritti"));
        MailingDto.SaluteLista salute = salute(iscritti, n(c.get("attivi")), n(c.get("tiepidi")), n(c.get("dormienti")),
                n(c.get("mai")), n(c.get("rimbalzati")), n(c.get("disiscritti")), m30);

        List<MailingCampagna> tutte = new ArrayList<>(campagnaRepository.findAll());
        tutte.removeIf(x -> x.getStato() == MailingCampagna.Stato.BOZZA);
        tutte.sort(Comparator.comparing((MailingCampagna x) -> x.getInvioIniziatoIl() != null ? x.getInvioIniziatoIl()
                : x.getCreatoIl()).reversed());
        List<MailingDto.CampagnaRiga> recenti = campagneService.righe(tutte.subList(0, Math.min(6, tutte.size())));
        List<MailingCampagna> prog = new ArrayList<>(campagnaRepository.findByStato(MailingCampagna.Stato.PROGRAMMATA));
        prog.sort(Comparator.comparing(MailingCampagna::getProgrammataIl, Comparator.nullsLast(Comparator.naturalOrder())));
        List<MailingDto.CampagnaRiga> programmate = campagneService.righe(prog);

        List<MailingDto.AutomazioneRiga> automazioni = List.of();
        MailingAutomazioniService a = automazioniService.getIfAvailable();
        if (a != null) {
            try {
                automazioni = a.attive();
            } catch (RuntimeException e) {
                automazioni = List.of();
            }
        }
        Integer inCoda = jdbc.queryForObject("SELECT COUNT(*) FROM mailing_invii WHERE stato IN ('IN_CODA','IN_INVIO')",
                Map.of(), Integer.class);

        return new MailingDto.Panoramica(giorni, iscritti, n(c.get("totali")), n(c.get("nuovi")), n(c.get("nuovi_prima")),
                n(c.get("disiscritti_periodo")), m, mPrima, serie(crescita), serie(attivita), salute, recenti, programmate,
                automazioni, mittentiService.lista(), inCoda != null ? inCoda : 0);
    }

    /**
     * Salute della lista 0–100: si parte da 100 e si toglie per rimbalzi (fino a 40), segnalazioni spam (fino a 30)
     * e quota di iscritti dormienti o che non aprono mai (fino a 30).
     */
    static MailingDto.SaluteLista salute(int iscritti, int attivi, int tiepidi, int dormienti, int mai, int rimbalzati,
                                         int disiscritti, MailingDto.Metriche m30) {
        Double rimbalzo = m30.tassoRimbalzo();
        int consegnati = Math.max(0, m30.inviati() - m30.rimbalzi());
        Double spam = consegnati > 0 ? Math.round(m30.spam() * 10000.0 / consegnati) / 100.0 : null;
        int contattati = attivi + tiepidi + dormienti + mai;
        double quotaFredda = contattati > 0 ? (dormienti + mai) * 100.0 / contattati : 0;
        double punteggio = 100
                - Math.min(40, (rimbalzo != null ? rimbalzo : 0) * 8)
                - Math.min(30, (spam != null ? spam : 0) * 100)
                - Math.min(30, quotaFredda * 0.4);
        List<String> consigli = new ArrayList<>();
        if (rimbalzo != null && rimbalzo > 2) {
            consigli.add("Rimbalzi al " + rimbalzo + "% negli ultimi 30 giorni: sopra il 2% Gmail inizia a diffidare. "
                    + "Controlla gli indirizzi importati e non riscrivere ai rimbalzati.");
        }
        if (spam != null && spam > 0.1) {
            consigli.add("Segnalazioni di spam al " + spam + "%: manda meno email e solo a chi le apre.");
        }
        if (quotaFredda > 40) {
            consigli.add("Molti iscritti non aprono da mesi: crea un'automazione di riattivazione e, se non rispondono, archiviali.");
        }
        if (attivi == 0 && contattati == 0 && iscritti > 0) {
            consigli.add("Non hai ancora mandato email da qui: parti con una campagna a un segmento piccolo e caldo.");
        }
        if (consigli.isEmpty() && iscritti > 0) {
            consigli.add("La lista è in buona salute: continua a scrivere a chi apre e a togliere chi rimbalza.");
        }
        return new MailingDto.SaluteLista((int) Math.max(0, Math.round(punteggio)), attivi, tiepidi, dormienti, mai, rimbalzati,
                disiscritti, rimbalzo, spam, consigli);
    }

    private static Map<String, Map<String, Number>> giorniVuoti(LocalDate da, LocalDate a, String... chiavi) {
        Map<String, Map<String, Number>> out = new LinkedHashMap<>();
        for (LocalDate g = da; !g.isAfter(a); g = g.plusDays(1)) {
            Map<String, Number> v = new LinkedHashMap<>();
            for (String k : chiavi) {
                v.put(k, 0);
            }
            out.put(g.toString(), v);
        }
        return out;
    }

    private static void metti(Map<String, Map<String, Number>> serie, LocalDate g, String chiave, int valore) {
        Map<String, Number> v = serie.get(g.toString());
        if (v != null) {
            v.put(chiave, valore);
        }
    }

    private static List<MailingDto.PuntoSerie> serie(Map<String, Map<String, Number>> m) {
        return m.entrySet().stream().map(e -> new MailingDto.PuntoSerie(e.getKey(), e.getValue())).toList();
    }

    private static int n(Object o) {
        return o instanceof Number x ? x.intValue() : 0;
    }

    // ───────────────────────── Feed ─────────────────────────

    /** Eventi recenti (umani): prime aperture, click, risposte, disiscrizioni, rimbalzi, spam, conversioni. */
    @Transactional(readOnly = true)
    public List<MailingDto.Attivita> attivita(int limite) {
        int n = Math.max(1, Math.min(200, limite));
        return jdbc.query("SELECT e.id, e.tipo, e.avvenuto_il, e.contatto_id, e.campagna_id, e.automazione_id, e.url, "
                        + "e.dispositivo, e.valore, c.nome, c.cognome, c.email, i.oggetto, k.nome AS campagna, l.etichetta "
                        + "FROM mailing_eventi e "
                        + "LEFT JOIN mailing_contatti c ON c.id = e.contatto_id "
                        + "LEFT JOIN mailing_invii i ON i.id = e.invio_id "
                        + "LEFT JOIN mailing_campagne k ON k.id = e.campagna_id "
                        + "LEFT JOIN mailing_link l ON e.tipo = 'CLICK' AND l.indice = e.link_indice "
                        + "AND ((e.campagna_id IS NOT NULL AND l.campagna_id = e.campagna_id) "
                        + "OR (e.campagna_id IS NULL AND l.automazione_email_id = i.automazione_email_id)) "
                        + "WHERE e.tipo <> 'INVIATO' AND NOT e.automatico "
                        + "AND (e.tipo <> 'APERTURA' OR e.avvenuto_il = i.prima_apertura_il) "
                        + "ORDER BY e.avvenuto_il DESC, e.id DESC LIMIT :n",
                Map.of("n", n), (rs, r) -> {
                    String nome = MailingTracciamentoService.nomeBreve(rs.getString("nome"), rs.getString("cognome"), rs.getString("email"));
                    String oggetto = rs.getString("oggetto") != null
                            ? MailingTracciamentoService.oggettoLeggibile(rs.getString("oggetto")) : rs.getString("campagna");
                    String tipo = rs.getString("tipo");
                    String dettaglio = "CLICK".equals(tipo) ? (rs.getString("etichetta") != null ? rs.getString("etichetta") : rs.getString("url"))
                            : "RIMBALZO".equals(tipo) ? rs.getString("url") : null;
                    return new MailingDto.Attivita(rs.getLong("id"), tipo,
                            MailingTempo.iso(rs.getTimestamp("avvenuto_il").toLocalDateTime()),
                            rs.getObject("contatto_id") != null ? rs.getLong("contatto_id") : null, nome, rs.getString("email"),
                            rs.getObject("campagna_id") != null ? rs.getLong("campagna_id") : null,
                            rs.getObject("automazione_id") != null ? rs.getLong("automazione_id") : null,
                            MailingTracciamentoService.messaggio(tipo, nome, oggetto, dettaglio),
                            "RIMBALZO".equals(tipo) ? null : rs.getString("url"), rs.getString("dispositivo"), rs.getBigDecimal("valore"));
                });
    }

    private static String abbrevia(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }
}
