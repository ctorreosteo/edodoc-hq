package it.edodoc.hq.services;

import it.edodoc.hq.dto.AuthDto;
import it.edodoc.hq.exception.ConflittoException;
import it.edodoc.hq.exception.RisorsaNonTrovataException;
import it.edodoc.hq.models.Dispositivo;
import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.models.SessioneApp;
import it.edodoc.hq.models.Utente;
import it.edodoc.hq.repositories.DispositivoRepository;
import it.edodoc.hq.repositories.PazienteRepository;
import it.edodoc.hq.repositories.SessioneAppRepository;
import it.edodoc.hq.repositories.UtenteRepository;
import it.edodoc.hq.security.JwtUtil;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class AuthService {

    private static final int MAX_TENTATIVI = 5;
    private static final long BLOCCO_SECONDI = 15 * 60;

    private final UtenteRepository utenteRepository;
    private final PazienteRepository pazienteRepository;
    private final SessioneAppRepository sessioneRepository;
    private final DispositivoRepository dispositivoRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final int invitoValiditaOre;
    private final int sessioneGiorni;
    private final String impostaPasswordUrl;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, Tentativi> tentativi = new ConcurrentHashMap<>();

    private record Tentativi(int errori, Instant dal) {
    }

    public AuthService(UtenteRepository utenteRepository, PazienteRepository pazienteRepository,
                       SessioneAppRepository sessioneRepository, DispositivoRepository dispositivoRepository,
                       PasswordEncoder passwordEncoder, JwtUtil jwtUtil,
                       @Value("${app.applicazione.invito-validita-ore}") int invitoValiditaOre,
                       @Value("${app.applicazione.sessione-giorni}") int sessioneGiorni,
                       @Value("${app.applicazione.imposta-password-url}") String impostaPasswordUrl) {
        this.utenteRepository = utenteRepository;
        this.pazienteRepository = pazienteRepository;
        this.sessioneRepository = sessioneRepository;
        this.dispositivoRepository = dispositivoRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
        this.invitoValiditaOre = invitoValiditaOre;
        this.sessioneGiorni = sessioneGiorni;
        this.impostaPasswordUrl = impostaPasswordUrl;
    }

    @Transactional
    public AuthDto.Sessione login(AuthDto.Login richiesta) {
        String chiave = richiesta.username().trim().toLowerCase(Locale.ROOT);
        Tentativi corrente = tentativi.get(chiave);
        boolean finestraAperta = corrente != null && corrente.dal().plusSeconds(BLOCCO_SECONDI).isAfter(Instant.now());
        if (finestraAperta && corrente.errori() >= MAX_TENTATIVI) {
            throw new ConflittoException("Troppi tentativi: riprova tra qualche minuto");
        }
        Utente utente = utenteRepository.findByUsernameIgnoreCase(chiave)
                .filter(u -> Boolean.TRUE.equals(u.getAttivo()) && u.getPasswordHash() != null)
                .filter(u -> passwordEncoder.matches(richiesta.password(), u.getPasswordHash()))
                .orElse(null);
        if (utente == null) {
            tentativi.put(chiave, new Tentativi(finestraAperta ? corrente.errori() + 1 : 1,
                    finestraAperta ? corrente.dal() : Instant.now()));
            throw new IllegalArgumentException("Credenziali non valide");
        }
        tentativi.remove(chiave);
        return Boolean.TRUE.equals(richiesta.mobile()) ? sessioneMobile(utente) : sessione(utente, null);
    }

    /** Ogni rinnovo cambia il refresh token: quello vecchio non vale più. */
    @Transactional
    public AuthDto.Sessione rinnova(AuthDto.Rinnova richiesta) {
        SessioneApp sessione = sessioneRepository.findByRefreshHash(sha256(richiesta.refreshToken()))
                .filter(s -> s.getScadenza().isAfter(LocalDateTime.now()))
                .filter(s -> Boolean.TRUE.equals(s.getUtente().getAttivo()))
                .orElseThrow(() -> new IllegalArgumentException("Sessione scaduta"));
        String refreshToken = tokenCasuale();
        sessione.setRefreshHash(sha256(refreshToken));
        sessione.setScadenza(LocalDateTime.now().plusDays(sessioneGiorni));
        return sessione(sessione.getUtente(), refreshToken);
    }

    /** Pubblico: deve funzionare anche a token scaduto. Il refresh token dimostra di chi è il telefono. */
    @Transactional
    public void logout(AuthDto.Logout richiesta) {
        sessioneRepository.findByRefreshHash(sha256(richiesta.refreshToken())).ifPresent(sessione -> {
            if (richiesta.pushToken() != null) {
                dispositivoRepository.deleteByUtenteIdAndPushToken(sessione.getUtente().getId(), richiesta.pushToken());
            }
            sessioneRepository.delete(sessione);
        });
    }

    /** Un telefono passato a un'altra persona smette di ricevere le notifiche della precedente. */
    @Transactional
    public void registraDispositivo(Long utenteId, AuthDto.RegistraDispositivo richiesta) {
        Dispositivo dispositivo = dispositivoRepository.findByPushToken(richiesta.pushToken()).orElseGet(Dispositivo::new);
        dispositivo.setUtente(utenteRepository.getReferenceById(utenteId));
        dispositivo.setPushToken(richiesta.pushToken());
        dispositivo.setPiattaforma(richiesta.piattaforma());
        dispositivo.setAggiornatoIl(LocalDateTime.now());
        dispositivoRepository.save(dispositivo);
    }

    @Transactional(readOnly = true)
    public AuthDto.Utente profilo(Long utenteId) {
        return utenteRepository.findById(utenteId).map(AuthService::dto)
                .orElseThrow(() -> new RisorsaNonTrovataException("Utente non trovato"));
    }

    @Transactional
    public void cambiaPassword(Long utenteId, AuthDto.CambiaPassword richiesta) {
        Utente utente = utenteRepository.findById(utenteId)
                .orElseThrow(() -> new RisorsaNonTrovataException("Utente non trovato"));
        if (!passwordEncoder.matches(richiesta.attuale(), utente.getPasswordHash())) {
            throw new IllegalArgumentException("La password attuale non è corretta");
        }
        utente.setPasswordHash(passwordEncoder.encode(richiesta.nuova()));
        revocaTelefoni(utenteId);
    }

    /** Crea o rinnova l'accesso all'app. Il token in chiaro esce solo qui, dentro il link. */
    @Transactional
    public String creaInvitoApp(Long pazienteId) {
        Paziente paziente = pazienteRepository.findByIdAndAttivoTrue(pazienteId)
                .orElseThrow(() -> new RisorsaNonTrovataException("Paziente non trovato"));
        if (paziente.getEmail() == null || paziente.getEmail().isBlank()) {
            throw new IllegalArgumentException("Aggiungi l'email del paziente per invitarlo all'app");
        }
        Utente utente = utenteRepository.findByPazienteId(pazienteId).orElseGet(() -> {
            Utente nuovo = new Utente();
            nuovo.setRuolo(Utente.Ruolo.PAZIENTE);
            nuovo.setPaziente(paziente);
            return nuovo;
        });
        utente.setUsername(paziente.getEmail().trim().toLowerCase(Locale.ROOT));
        utente.setNome(paziente.getNome());
        utente.setCognome(paziente.getCognome());
        String token = tokenCasuale();
        utente.setInvitoTokenHash(sha256(token));
        utente.setInvitoScadenza(LocalDateTime.now().plusHours(invitoValiditaOre));
        utenteRepository.save(utente);
        return impostaPasswordUrl + "?token=" + token;
    }

    @Transactional
    public AuthDto.Sessione impostaPasswordApp(AuthDto.ImpostaPassword richiesta) {
        Utente utente = utenteRepository.findByInvitoTokenHash(sha256(richiesta.token()))
                .filter(u -> u.getInvitoScadenza() != null && u.getInvitoScadenza().isAfter(LocalDateTime.now()))
                .orElseThrow(() -> new IllegalArgumentException("Il link non è valido o è scaduto"));
        utente.setPasswordHash(passwordEncoder.encode(richiesta.password()));
        utente.setInvitoTokenHash(null);
        utente.setInvitoScadenza(null);
        revocaTelefoni(utente.getId());
        return sessioneMobile(utente);
    }

    /** Dopo una nuova password nessun telefono resta collegato con quella vecchia. */
    private void revocaTelefoni(Long utenteId) {
        sessioneRepository.deleteByUtenteId(utenteId);
        dispositivoRepository.deleteByUtenteId(utenteId);
    }

    private AuthDto.Sessione sessioneMobile(Utente utente) {
        sessioneRepository.deleteByUtenteIdAndScadenzaBefore(utente.getId(), LocalDateTime.now());
        String refreshToken = tokenCasuale();
        SessioneApp sessione = new SessioneApp();
        sessione.setUtente(utente);
        sessione.setRefreshHash(sha256(refreshToken));
        sessione.setScadenza(LocalDateTime.now().plusDays(sessioneGiorni));
        sessioneRepository.save(sessione);
        return sessione(utente, refreshToken);
    }

    private AuthDto.Sessione sessione(Utente utente, String refreshToken) {
        boolean paziente = utente.getRuolo() == Utente.Ruolo.PAZIENTE;
        return new AuthDto.Sessione(jwtUtil.generaToken(utente.getUsername(), paziente), refreshToken, dto(utente));
    }

    private String tokenCasuale() {
        byte[] casuali = new byte[32];
        random.nextBytes(casuali);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(casuali);
    }

    /** Il revisore risulta ADMIN solo alle app, che così aprono l'area dottore: i permessi veri stanno nel token. */
    private static AuthDto.Utente dto(Utente u) {
        String ruolo = u.getRuolo() == Utente.Ruolo.REVISORE ? Utente.Ruolo.ADMIN.name() : u.getRuolo().name();
        return new AuthDto.Utente(u.getId(), u.getUsername(), u.getNome(), u.getCognome(), ruolo,
                u.getPaziente() != null ? u.getPaziente().getId() : null);
    }

    private static String sha256(String testo) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(testo.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
