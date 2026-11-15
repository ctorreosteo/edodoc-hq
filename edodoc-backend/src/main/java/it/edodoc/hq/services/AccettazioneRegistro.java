package it.edodoc.hq.services;

import it.edodoc.hq.models.AccettazioneFirmaEvento;
import it.edodoc.hq.repositories.AccettazioneFirmaEventoRepository;
import it.edodoc.hq.repositories.AccettazioneFirmaRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.List;

/**
 * Registro degli eventi di una firma a catena di hash: ogni riga contiene l'hash della precedente, quindi cambiare,
 * togliere o riordinare una riga si vede ricalcolando la catena ({@link #verifica}). Il database vieta le modifiche.
 */
@Service
public class AccettazioneRegistro {

    public static final String HASH_INIZIALE = "0".repeat(64);
    private static final DateTimeFormatter ISO_MICRO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSSSSS");

    private final AccettazioneFirmaEventoRepository eventi;
    private final AccettazioneFirmaRepository accettazioni;

    public AccettazioneRegistro(AccettazioneFirmaEventoRepository eventi, AccettazioneFirmaRepository accettazioni) {
        this.eventi = eventi;
        this.accettazioni = accettazioni;
    }

    /** Chi ha generato l'evento: la persona dal link (ip e browser) o il dottore dal gestionale (utente). */
    public record Origine(String ip, String userAgent, Long utenteId) {
        public static final Origine SISTEMA = new Origine(null, null, null);
    }

    /** Aggiunge un evento in coda. Blocca la riga della richiesta: due eventi concorrenti non prendono lo stesso seq. */
    @Transactional
    public AccettazioneFirmaEvento registra(Long accettazioneId, AccettazioneFirmaEvento.Tipo tipo, Origine origine,
                                           String dettagli) {
        accettazioni.findByIdPerAggiornamento(accettazioneId)
                .orElseThrow(() -> new IllegalArgumentException("Richiesta di firma non trovata"));
        Origine o = origine == null ? Origine.SISTEMA : origine;
        AccettazioneFirmaEvento ultimo = eventi.findFirstByAccettazioneIdOrderBySeqDesc(accettazioneId).orElse(null);

        AccettazioneFirmaEvento e = new AccettazioneFirmaEvento();
        e.setAccettazioneId(accettazioneId);
        e.setSeq(ultimo == null ? 1 : ultimo.getSeq() + 1);
        e.setTipo(tipo);
        e.setIl(LocalDateTime.now().truncatedTo(ChronoUnit.MICROS));
        e.setIp(tronca(o.ip(), 64));
        e.setUserAgent(tronca(o.userAgent(), 500));
        e.setUtenteId(o.utenteId());
        e.setDettagli(dettagli);
        e.setHashPrecedente(ultimo == null ? HASH_INIZIALE : ultimo.getHash());
        e.setHash(hash(e));
        return eventi.save(e);
    }

    /** {@code true} se ogni riga ha l'hash giusto e punta a quella prima, senza buchi nella numerazione. */
    public boolean verifica(List<AccettazioneFirmaEvento> registro) {
        String precedente = HASH_INIZIALE;
        int atteso = 1;
        for (AccettazioneFirmaEvento e : registro) {
            if (e.getSeq() != atteso++ || !precedente.equals(e.getHashPrecedente()) || !hash(e).equals(e.getHash())) {
                return false;
            }
            precedente = e.getHash();
        }
        return true;
    }

    /** Forma canonica dell'evento: una riga per campo, campi vuoti come stringa vuota. */
    static String canonico(AccettazioneFirmaEvento e) {
        return String.join("\n",
                e.getHashPrecedente(),
                String.valueOf(e.getSeq()),
                e.getTipo().name(),
                ISO_MICRO.format(e.getIl()),
                nvl(e.getIp()),
                nvl(e.getUserAgent()),
                e.getUtenteId() == null ? "" : e.getUtenteId().toString(),
                nvl(e.getDettagli()));
    }

    static String hash(AccettazioneFirmaEvento e) {
        return sha256Hex(canonico(e).getBytes(StandardCharsets.UTF_8));
    }

    public static String sha256Hex(byte[] dati) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(dati));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String nvl(String s) {
        return s == null ? "" : s;
    }

    private static String tronca(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }
}
