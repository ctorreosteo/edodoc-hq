package it.edodoc.hq.services;

import it.edodoc.hq.dto.MailingDto;
import it.edodoc.hq.models.MailingAutomazioneEmail;
import it.edodoc.hq.models.MailingCampagna;
import it.edodoc.hq.models.MailingCategoria;
import it.edodoc.hq.models.MailingContatto;
import it.edodoc.hq.models.MailingContattoCategoriaEsclusa;
import it.edodoc.hq.models.MailingEvento;
import it.edodoc.hq.models.MailingInvio;
import it.edodoc.hq.models.MailingLink;
import it.edodoc.hq.repositories.MailingAutomazioneEmailRepository;
import it.edodoc.hq.repositories.MailingCampagnaRepository;
import it.edodoc.hq.repositories.MailingCategoriaRepository;
import it.edodoc.hq.repositories.MailingContattoCategoriaEsclusaRepository;
import it.edodoc.hq.repositories.MailingContattoRepository;
import it.edodoc.hq.repositories.MailingEventoRepository;
import it.edodoc.hq.repositories.MailingInvioRepository;
import it.edodoc.hq.repositories.MailingLinkRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Tracciamento pubblico dell'Email Marketing: aperture (pixel), click (redirect), disiscrizione (pagina e one-click
 * RFC 8058), centro preferenze, versione web. Ogni evento finisce in mailing_eventi, aggiorna invio e contatto
 * e va nel feed realtime. Aperture e click "automatici" (scanner, proxy, prefetch) restano registrati ma fuori dalle
 * metriche umane. Nessuna risposta pubblica contiene un'email completa.
 */
@Service
public class MailingTracciamentoService {

    private static final Logger logger = LoggerFactory.getLogger(MailingTracciamentoService.class);

    /** Parole degli user agent di scanner, antivirus, link checker e client non umani. */
    static final List<String> UA_AUTOMATICI = List.of("bot", "crawler", "spider", "scanner", "barracuda", "mimecast",
            "proofpoint", "symantec", "messagelabs", "forcepoint", "trendmicro", "sophos", "fortiguard", "fortinet",
            "zscaler", "cisco", "ironport", "safelinks", "urldefense", "python-requests", "python-urllib", "curl/",
            "wget", "go-http-client", "java/", "okhttp", "apache-httpclient", "headlesschrome", "phantomjs", "libwww",
            "httpclient", "preview", "slurp", "facebookexternalhit", "linkexpander", "microsoft office existence",
            "ms-office", "outlook-ios-linkpreview", "skypeuripreview", "whatsapp", "telegrambot", "discordbot");

    private final MailingInvioRepository invioRepository;
    private final MailingContattoRepository contattoRepository;
    private final MailingLinkRepository linkRepository;
    private final MailingEventoRepository eventoRepository;
    private final MailingCampagnaRepository campagnaRepository;
    private final MailingAutomazioneEmailRepository automazioneEmailRepository;
    private final MailingCategoriaRepository categoriaRepository;
    private final MailingContattoCategoriaEsclusaRepository esclusaRepository;
    private final MailingContattiService contattiService;
    private final MailingConfigService config;
    private final MailingComposizioneService composizione;
    private final MailingMittentiService mittentiService;
    private final NamedParameterJdbcTemplate jdbc;

    public MailingTracciamentoService(MailingInvioRepository invioRepository, MailingContattoRepository contattoRepository,
                                      MailingLinkRepository linkRepository, MailingEventoRepository eventoRepository,
                                      MailingCampagnaRepository campagnaRepository,
                                      MailingAutomazioneEmailRepository automazioneEmailRepository,
                                      MailingCategoriaRepository categoriaRepository,
                                      MailingContattoCategoriaEsclusaRepository esclusaRepository,
                                      MailingContattiService contattiService, 
                                      MailingConfigService config, MailingComposizioneService composizione,
                                      MailingMittentiService mittentiService, NamedParameterJdbcTemplate jdbc) {
        this.invioRepository = invioRepository;
        this.contattoRepository = contattoRepository;
        this.linkRepository = linkRepository;
        this.eventoRepository = eventoRepository;
        this.campagnaRepository = campagnaRepository;
        this.automazioneEmailRepository = automazioneEmailRepository;
        this.categoriaRepository = categoriaRepository;
        this.esclusaRepository = esclusaRepository;
        this.contattiService = contattiService;
        this.config = config;
        this.composizione = composizione;
        this.mittentiService = mittentiService;
        this.jdbc = jdbc;
    }

    // ───────────────────────── Aperture ─────────────────────────

    @Transactional
    public void apertura(String token, String userAgent, String ip) {
        MailingInvio invio = invioValido(token).orElse(null);
        if (invio == null || invio.getInviatoIl() == null) {
            return;
        }
        LocalDateTime ora = MailingTempo.adesso();
        boolean automatico = aperturaAutomatica(userAgent, ip, invio.getInviatoIl(), ora);
        boolean primaUmana = !automatico && invio.getPrimaAperturaIl() == null;
        MailingEvento e = eventoRepository.save(evento(MailingEvento.Tipo.APERTURA, invio, ora, userAgent, automatico));
        if (automatico) {
            return;
        }
        ricalcolaInvio(invio.getId());
        jdbc.update("UPDATE mailing_contatti SET ultima_apertura_il = GREATEST(COALESCE(ultima_apertura_il, :t), :t), "
                        + "punteggio = LEAST(100, punteggio + :p) WHERE id = :id",
                new MapSqlParameterSource("t", ora).addValue("p", primaUmana ? 2 : 0).addValue("id", invio.getContattoId()));
        if (primaUmana) {
            pubblica(e, invio, null);
        }
    }

    /**
     * Apertura non umana: user agent di scanner, apertura entro 2 secondi dall'invio, Apple Mail Privacy Protection
     * (UA "Mozilla/5.0" senza dettagli, oppure IP Apple 17.0.0.0/8 con UA non da browser). GoogleImageProxy è reale.
     */
    static boolean aperturaAutomatica(String userAgent, String ip, LocalDateTime inviatoIl, LocalDateTime ora) {
        String ua = userAgent != null ? userAgent.trim() : "";
        String l = ua.toLowerCase(Locale.ROOT);
        if (l.contains("googleimageproxy")) {
            return inviatoIl != null && ora != null && Duration.between(inviatoIl, ora).toMillis() < 2000;
        }
        if (inviatoIl != null && ora != null && Duration.between(inviatoIl, ora).toMillis() < 2000) {
            return true;
        }
        if (ua.isEmpty() || uaAutomatico(l)) {
            return true;
        }
        boolean uaNudo = ua.equals("Mozilla/5.0");
        boolean ipApple = ip != null && ip.trim().startsWith("17.");
        return uaNudo || (ipApple && !l.contains("applewebkit"));
    }

    static boolean uaAutomatico(String uaMinuscolo) {
        for (String parola : UA_AUTOMATICI) {
            if (uaMinuscolo.contains(parola)) {
                return true;
            }
        }
        return false;
    }

    /** MOBILE, TABLET, DESKTOP o SCONOSCIUTO. */
    static String dispositivo(String userAgent) {
        if (!StringUtils.hasText(userAgent)) {
            return "SCONOSCIUTO";
        }
        String l = userAgent.toLowerCase(Locale.ROOT);
        if (l.contains("ipad") || l.contains("tablet") || (l.contains("android") && !l.contains("mobile"))) {
            return "TABLET";
        }
        if (l.contains("iphone") || l.contains("mobile") || l.contains("android") || l.contains("ipod")) {
            return "MOBILE";
        }
        if (l.contains("windows") || l.contains("macintosh") || l.contains("mac os x") || l.contains("linux")
                || l.contains("cros")) {
            return "DESKTOP";
        }
        return "SCONOSCIUTO";
    }

    /** Client di posta o browser riconosciuto dal User-Agent. */
    static String client(String userAgent) {
        if (!StringUtils.hasText(userAgent)) {
            return "Sconosciuto";
        }
        String l = userAgent.toLowerCase(Locale.ROOT);
        if (l.contains("googleimageproxy")) {
            return "Gmail";
        }
        if (l.contains("yahoomailproxy") || l.contains("yahoo")) {
            return "Yahoo Mail";
        }
        if (l.contains("outlook") || l.contains("microsoft office") || l.contains("ms-office") || l.contains("msoffice")) {
            return "Outlook";
        }
        if (l.contains("thunderbird")) {
            return "Thunderbird";
        }
        if (l.contains("libero")) {
            return "Libero Mail";
        }
        if (l.equals("mozilla/5.0") || (l.contains("applewebkit") && !l.contains("safari") && (l.contains("iphone")
                || l.contains("ipad") || l.contains("macintosh")))) {
            return "Apple Mail";
        }
        if (l.contains("samsungbrowser")) {
            return "Samsung";
        }
        if (l.contains("edg/")) {
            return "Edge";
        }
        if (l.contains("firefox")) {
            return "Firefox";
        }
        if (l.contains("chrome") || l.contains("crios")) {
            return "Chrome";
        }
        if (l.contains("safari")) {
            return "Safari";
        }
        return "Altro";
    }

    // ───────────────────────── Click ─────────────────────────

    /**
     * Registra il click e ritorna l'URL a cui reindirizzare. Solo URL registrati in mailing_link per quel messaggio:
     * token o indice sconosciuti → home del sito. Mai un URL preso dalla richiesta.
     */
    @Transactional
    public String click(String token, int indice, String userAgent, String ip, boolean registra) {
        MailingInvio invio = invioValido(token).orElse(null);
        if (invio == null) {
            return MailingComposizioneService.HOME_SITO;
        }
        Optional<MailingLink> link = invio.getCampagnaId() != null
                ? linkRepository.findByCampagnaIdAndIndice(invio.getCampagnaId(), indice)
                : invio.getAutomazioneEmailId() != null
                ? linkRepository.findByAutomazioneEmailIdAndIndice(invio.getAutomazioneEmailId(), indice)
                : Optional.empty();
        String utm = null;
        if (invio.getCampagnaId() != null) {
            utm = campagnaRepository.findById(invio.getCampagnaId()).map(MailingCampagna::getUtmCampaign).orElse(null);
        }
        String destinazione = destinazioneSicura(link.map(MailingLink::getUrl).orElse(null), utm);
        if (!registra || link.isEmpty() || invio.getInviatoIl() == null) {
            return destinazione;
        }
        LocalDateTime ora = MailingTempo.adesso();
        boolean automatico = clickAutomatico(userAgent, invio.getInviatoIl(), ora);
        boolean primoUmano = invio.getPrimoClickIl() == null;
        MailingEvento e = evento(MailingEvento.Tipo.CLICK, invio, ora, userAgent, automatico);
        e.setLinkIndice(indice);
        e.setUrl(link.get().getUrl());
        e = eventoRepository.save(e);
        if (!automatico) {
            // Più link diversi cliccati nello stesso secondo: è uno scanner che apre tutto.
            Integer diversi = jdbc.queryForObject("SELECT COUNT(DISTINCT link_indice) FROM mailing_eventi "
                            + "WHERE invio_id = :id AND tipo = 'CLICK' AND avvenuto_il >= :da",
                    new MapSqlParameterSource("id", invio.getId()).addValue("da", ora.minusSeconds(1)), Integer.class);
            if (diversi != null && diversi >= 2) {
                jdbc.update("UPDATE mailing_eventi SET automatico = TRUE WHERE invio_id = :id AND tipo = 'CLICK' AND avvenuto_il >= :da",
                        new MapSqlParameterSource("id", invio.getId()).addValue("da", ora.minusSeconds(1)));
                automatico = true;
            }
        }
        ricalcolaInvio(invio.getId());
        if (!automatico) {
            jdbc.update("UPDATE mailing_contatti SET ultimo_click_il = GREATEST(COALESCE(ultimo_click_il, :t), :t), "
                            + "ultima_apertura_il = GREATEST(COALESCE(ultima_apertura_il, :t), :t), "
                            + "punteggio = LEAST(100, punteggio + :p) WHERE id = :id",
                    new MapSqlParameterSource("t", ora).addValue("p", primoUmano ? 5 : 0).addValue("id", invio.getContattoId()));
            pubblica(e, invio, link.get().getEtichetta() != null ? link.get().getEtichetta() : link.get().getUrl());
        }
        return destinazione;
    }

    static boolean clickAutomatico(String userAgent, LocalDateTime inviatoIl, LocalDateTime ora) {
        String l = userAgent != null ? userAgent.trim().toLowerCase(Locale.ROOT) : "";
        if (l.isEmpty() || uaAutomatico(l)) {
            return true;
        }
        return inviatoIl != null && ora != null && Duration.between(inviatoIl, ora).toMillis() < 2000;
    }

    /** URL registrato (solo http/https) con le UTM della campagna; altrimenti la home del sito. */
    static String destinazioneSicura(String urlRegistrato, String utmCampaign) {
        if (urlRegistrato == null || !MailingComposizioneService.urlValido(urlRegistrato)) {
            return MailingComposizioneService.HOME_SITO;
        }
        return MailingComposizioneService.conUtm(urlRegistrato.trim(), utmCampaign);
    }

    // ───────────────────────── Disiscrizione ─────────────────────────

    /** Pagina delle preferenze per il link di disiscrizione dell'email. */
    @Transactional(readOnly = true)
    public String urlPaginaDisiscrizione(String token) {
        MailingInvio invio = invioValido(token).orElse(null);
        if (invio == null) {
            return config.urlPreferenze();
        }
        return contattoRepository.findById(invio.getContattoId())
                .map(c -> composizione.linkPreferenze(c.getToken(), invio.getToken()))
                .orElse(config.urlPreferenze());
    }

    /** One-click unsubscribe (RFC 8058): POST dal client di posta, nessuna conferma. */
    @Transactional
    public void disiscriviOneClick(String token) {
        MailingInvio invio = invioValido(token).orElse(null);
        if (invio == null) {
            return;
        }
        MailingContatto c = contattoRepository.findById(invio.getContattoId()).orElse(null);
        if (c == null) {
            return;
        }
        disiscrivi(c, invio, "Disiscrizione con un clic dal client di posta");
    }

    /** Delega a MailingContattiService: stato, evento DISISCRIZIONE, invio.disiscritto_il, coda annullata, feed. */
    private void disiscrivi(MailingContatto c, MailingInvio invio, String motivo) {
        contattiService.disiscrivi(c.getId(), motivo, invio != null ? invio.getId() : null);
    }

    // ───────────────────────── Preferenze ─────────────────────────

    @Transactional(readOnly = true)
    public MailingDto.Preferenze preferenze(String tokenContatto) {
        MailingContatto c = contattoPerToken(tokenContatto);
        Set<Long> escluse = new HashSet<>();
        for (MailingContattoCategoriaEsclusa e : esclusaRepository.findByContattoId(c.getId())) {
            escluse.add(e.getCategoriaId());
        }
        List<MailingDto.PreferenzeCategoria> categorie = categoriaRepository.findByAttivaTrueOrderByOrdineAsc().stream()
                .map(k -> new MailingDto.PreferenzeCategoria(k.getId(), k.getNome(), k.getDescrizione(), !escluse.contains(k.getId())))
                .toList();
        String mittente = mittentiService.predefinito().map(m -> m.getNomeVisualizzato()).orElse("Dr. Edoardo Bo");
        String nome = StringUtils.hasText(c.getNome()) ? c.getNome().trim() : null;
        return new MailingDto.Preferenze(nome, mascheraEmail(c.getEmail()), c.getStato().name(), mittente, categorie);
    }

    @Transactional
    public MailingDto.Preferenze aggiornaPreferenze(String tokenContatto, MailingDto.AggiornaPreferenze in) {
        MailingContatto c = contattoPerToken(tokenContatto);
        if (in == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Richiesta vuota");
        }
        MailingInvio invio = null;
        if (StringUtils.hasText(in.invioToken())) {
            invio = invioRepository.findByToken(in.invioToken().trim())
                    .filter(i -> i.getContattoId().equals(c.getId())).orElse(null);
        }
        if (in.categorieEscluse() != null) {
            Set<Long> valide = new HashSet<>();
            for (MailingCategoria k : categoriaRepository.findAll()) {
                valide.add(k.getId());
            }
            esclusaRepository.deleteByContattoId(c.getId());
            esclusaRepository.flush();
            LocalDateTime ora = MailingTempo.adesso();
            for (Long id : new HashSet<>(in.categorieEscluse())) {
                if (id != null && valide.contains(id)) {
                    esclusaRepository.save(MailingContattoCategoriaEsclusa.builder()
                            .contattoId(c.getId()).categoriaId(id).esclusoIl(ora).build());
                }
            }
        }
        if (in.disiscrivi()) {
            String motivo = StringUtils.hasText(in.motivo()) ? in.motivo().trim() : "Dal centro preferenze";
            disiscrivi(c, invio, motivo.length() > 500 ? motivo.substring(0, 500) : motivo);
        } else if (in.reiscrivi() && c.getStato() == MailingContatto.Stato.DISISCRITTO) {
            // Solo su richiesta esplicita del contatto (mai automatica); RIMBALZATO e SPAM restano tali.
            contattiService.cambiaStato(c.getId(), MailingContatto.Stato.ISCRITTO,
                    "Reiscrizione richiesta dal contatto dal centro preferenze");
            contattoRepository.findById(c.getId()).ifPresent(x -> {
                x.setBaseGiuridica(MailingContatto.BaseGiuridica.CONSENSO);
                x.setConsensoIl(MailingTempo.adesso());
                x.setAggiornatoIl(MailingTempo.adesso());
                contattoRepository.save(x);
            });
        }
        return preferenze(tokenContatto);
    }

    private MailingContatto contattoPerToken(String token) {
        if (!StringUtils.hasText(token) || token.length() > 64) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Link non valido o scaduto");
        }
        return contattoRepository.findByToken(token.trim())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Link non valido o scaduto"));
    }

    /** {@code maria.rossi@gmail.com} → {@code ma***@gmail.com}. */
    static String mascheraEmail(String email) {
        if (email == null || !email.contains("@")) {
            return null;
        }
        int at = email.indexOf('@');
        String locale = email.substring(0, at);
        String visibile = locale.length() <= 2 ? locale.substring(0, Math.min(1, locale.length())) : locale.substring(0, 2);
        return visibile + "***" + email.substring(at);
    }

    // ───────────────────────── Versione web ─────────────────────────

    @Transactional
    public Optional<String> versioneWeb(String token) {
        return invioValido(token).map(composizione::versioneWeb);
    }

    // ───────────────────────── Supporto ─────────────────────────

    private Optional<MailingInvio> invioValido(String token) {
        if (!StringUtils.hasText(token) || token.length() > 40 || !token.chars().allMatch(Character::isLetterOrDigit)) {
            return Optional.empty();
        }
        return invioRepository.findByToken(token);
    }

    private MailingEvento evento(MailingEvento.Tipo tipo, MailingInvio invio, LocalDateTime ora, String ua, boolean automatico) {
        String client = client(ua);
        return MailingEvento.builder()
                .tipo(tipo)
                .invioId(invio.getId())
                .contattoId(invio.getContattoId())
                .campagnaId(invio.getCampagnaId())
                .automazioneId(automazioneId(invio))
                .dispositivo(dispositivo(ua))
                .client(client.length() > 60 ? client.substring(0, 60) : client)
                .automatico(automatico)
                .avvenutoIl(ora)
                .build();
    }

    private Long automazioneId(MailingInvio invio) {
        if (invio.getAutomazioneEmailId() == null) {
            return null;
        }
        return automazioneEmailRepository.findById(invio.getAutomazioneEmailId())
                .map(MailingAutomazioneEmail::getAutomazioneId).orElse(null);
    }

    /** Contatori dell'invio dagli eventi umani; un click umano vale anche come apertura. */
    void ricalcolaInvio(long invioId) {
        jdbc.update("UPDATE mailing_invii i SET "
                + "aperture = (SELECT COUNT(*) FROM mailing_eventi e WHERE e.invio_id = i.id AND e.tipo = 'APERTURA' AND NOT e.automatico), "
                + "click = (SELECT COUNT(*) FROM mailing_eventi e WHERE e.invio_id = i.id AND e.tipo = 'CLICK' AND NOT e.automatico), "
                + "primo_click_il = (SELECT MIN(e.avvenuto_il) FROM mailing_eventi e WHERE e.invio_id = i.id AND e.tipo = 'CLICK' AND NOT e.automatico), "
                + "prima_apertura_il = LEAST("
                + "(SELECT MIN(e.avvenuto_il) FROM mailing_eventi e WHERE e.invio_id = i.id AND e.tipo = 'APERTURA' AND NOT e.automatico), "
                + "(SELECT MIN(e.avvenuto_il) FROM mailing_eventi e WHERE e.invio_id = i.id AND e.tipo = 'CLICK' AND NOT e.automatico)) "
                + "WHERE i.id = :id", Map.of("id", invioId));
    }

    private void pubblica(MailingEvento e, MailingInvio invio, String etichettaLink) {
        try {
            MailingContatto c = contattoRepository.findById(invio.getContattoId()).orElse(null);
            String nome = c != null ? nomeBreve(c.getNome(), c.getCognome(), c.getEmail()) : "Un contatto";
        } catch (RuntimeException ex) {
            logger.debug("[MAILING] Attività realtime non pubblicata: {}", ex.getMessage());
        }
    }

    /** "Maria R."; senza nome l'email mascherata. */
    public static String nomeBreve(String nome, String cognome, String email) {
        if (StringUtils.hasText(nome)) {
            String n = nome.trim();
            return StringUtils.hasText(cognome) ? n + " " + cognome.trim().substring(0, 1).toUpperCase(Locale.ITALIAN) + "." : n;
        }
        String m = mascheraEmail(email);
        return m != null ? m : "Un contatto";
    }

    /** Oggetto senza segnaposto (per il feed). */
    public static String oggettoLeggibile(String oggetto) {
        if (oggetto == null) {
            return null;
        }
        return MailingComposizioneService.sostituisci(oggetto, Map.of(), false).replaceAll("\\s+", " ").trim();
    }

    /** Frase del feed attività: "Maria R. ha aperto «Novità di ottobre»". */
    public static String messaggio(String tipo, String nome, String oggetto, String dettaglio) {
        String su = oggetto != null && !oggetto.isBlank() ? " «" + oggetto + "»" : " l'email";
        return switch (tipo) {
            case "APERTURA" -> nome + " ha aperto" + su;
            case "CLICK" -> nome + " ha cliccato " + (dettaglio != null ? "«" + abbrevia(dettaglio, 60) + "» in" : "un link in") + su;
            case "RISPOSTA" -> nome + " ha risposto a" + su;
            case "DISISCRIZIONE" -> nome + " si è disiscritto/a" + (oggetto != null ? " da" + su : "");
            case "RIMBALZO" -> "L'email" + su + " a " + nome + " è rimbalzata" + (dettaglio != null ? " (" + dettaglio + ")" : "");
            case "SPAM" -> nome + " ha segnalato come spam" + su;
            case "CONVERSIONE_VISITA" -> nome + " ha prenotato una visita dopo" + su;
            case "CONVERSIONE_ACQUISTO" -> nome + " ha acquistato dopo" + su;
            case "INVIATO" -> "Inviata" + su + " a " + nome;
            default -> nome + ": " + tipo.toLowerCase(Locale.ROOT);
        };
    }

    private static String abbrevia(String s, int max) {
        String t = s.replaceAll("\\s+", " ").trim();
        return t.length() <= max ? t : t.substring(0, max - 1) + "…";
    }
}
