package it.edodoc.hq.services;

import it.edodoc.hq.dto.CasellaDto;
import it.edodoc.hq.exception.IntegrazioneDisattivataException;
import it.edodoc.hq.repositories.PazienteRepository;
import jakarta.mail.internet.AddressException;
import jakarta.mail.internet.InternetAddress;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

/** Sceglie la casella (Gmail, oppure quella dimostrativa in locale) e applica le regole comuni alle due. */
@Service
public class CasellaService {

    /** Gmail rifiuta i messaggi oltre ~25 MB, e la codifica base64 fa crescere il MIME di circa un terzo. */
    private static final long LIMITE_ALLEGATI_BYTES = 24L * 1024 * 1024;
    private static final int MAX_THREAD = 500;
    private static final int MAX_SUGGERIMENTI = 8;

    private final GmailService gmailService;
    private final GmailPosta gmailPosta;
    private final DemoPosta demoPosta;
    private final PazienteRepository pazienteRepository;
    private final boolean demoAttiva;

    public CasellaService(GmailService gmailService, GmailPosta gmailPosta, DemoPosta demoPosta,
                          PazienteRepository pazienteRepository,
                          @Value("${app.init.demo-enabled:false}") boolean demoAttiva) {
        this.gmailService = gmailService;
        this.gmailPosta = gmailPosta;
        this.demoPosta = demoPosta;
        this.pazienteRepository = pazienteRepository;
        this.demoAttiva = demoAttiva;
    }

    public CasellaPosta posta() {
        if (gmailService.isAttivo()) {
            return gmailPosta;
        }
        if (demoAttiva) {
            return demoPosta;
        }
        throw new IntegrazioneDisattivataException("La casella non è ancora collegata: collega l'account Google in Impostazioni");
    }

    public CasellaDto.EsitoInvio invia(CasellaDto.Composizione c, List<MultipartFile> file) {
        boolean conDestinatari = !vuota(c.a()) || !vuota(c.cc()) || !vuota(c.ccn());
        if (!conDestinatari) {
            throw new IllegalArgumentException("Aggiungi almeno un destinatario");
        }
        CasellaPosta posta = posta();
        return posta.invia(c, allegati(posta, c, file));
    }

    public CasellaDto.EsitoBozza salvaBozza(CasellaDto.Composizione c, List<MultipartFile> file) {
        CasellaPosta posta = posta();
        return posta.salvaBozza(conDestinatariValidi(c), allegati(posta, c, file));
    }

    public void modifica(CasellaDto.ModificaRequest r) {
        List<String> aggiungi = senzaNull(r.aggiungi());
        List<String> rimuovi = senzaNull(r.rimuovi());
        if (!aggiungi.isEmpty() || !rimuovi.isEmpty()) {
            posta().modifica(idsValidi(r.threadIds()), aggiungi, rimuovi);
        }
    }

    public void cestina(CasellaDto.ThreadIdsRequest r) {
        posta().cestina(idsValidi(r.threadIds()));
    }

    public void ripristina(CasellaDto.ThreadIdsRequest r) {
        posta().ripristina(idsValidi(r.threadIds()));
    }

    /** Pazienti con email: i destinatari tipici di questa casella. */
    public List<CasellaDto.Suggerimento> suggerimenti(String q) {
        String testo = q == null ? "" : q.trim().toLowerCase(Locale.ROOT);
        if (testo.length() < 2) {
            return List.of();
        }
        return pazienteRepository.findByAttivoTrueOrderByCognomeAscNomeAsc().stream()
                .filter(p -> p.getEmail() != null && !p.getEmail().isBlank())
                .filter(p -> (p.getNomeCompleto() + " " + p.getEmail()).toLowerCase(Locale.ROOT).contains(testo))
                .limit(MAX_SUGGERIMENTI)
                .map(p -> new CasellaDto.Suggerimento(p.getNomeCompleto(), p.getEmail(), "PAZIENTE", p.getId()))
                .toList();
    }

    static List<String> idsValidi(Collection<String> ids) {
        if (ids == null || ids.isEmpty()) {
            throw new IllegalArgumentException("Nessuna email selezionata");
        }
        List<String> validi = ids.stream().filter(s -> s != null && s.matches("[A-Za-z0-9_-]{1,64}")).distinct().toList();
        if (validi.isEmpty()) {
            throw new IllegalArgumentException("Nessuna email selezionata");
        }
        if (validi.size() > MAX_THREAD) {
            throw new IllegalArgumentException("Massimo " + MAX_THREAD + " email per volta");
        }
        return validi;
    }

    /** Le bozze si salvano anche con un destinatario scritto a metà: si tengono solo gli indirizzi validi. */
    static CasellaDto.Composizione conDestinatariValidi(CasellaDto.Composizione c) {
        return new CasellaDto.Composizione(validi(c.a()), validi(c.cc()), validi(c.ccn()), c.oggetto(), c.html(), c.threadId(),
                c.inReplyTo(), c.references(), c.allegatiEsistenti(), c.bozzaId());
    }

    private static List<String> validi(List<String> indirizzi) {
        List<String> validi = new ArrayList<>();
        if (indirizzi != null) {
            for (String s : indirizzi) {
                try {
                    if (s != null && !s.isBlank()) {
                        new InternetAddress(s.trim(), true);
                        validi.add(s.trim());
                    }
                } catch (AddressException e) {
                    // Indirizzo incompleto: non va nella bozza
                }
            }
        }
        return validi;
    }

    private List<CasellaMime.FileAllegato> allegati(CasellaPosta posta, CasellaDto.Composizione c, List<MultipartFile> file) {
        List<CasellaMime.FileAllegato> allegati = new ArrayList<>();
        long totale = 0;
        if (c.allegatiEsistenti() != null) {
            for (CasellaDto.AllegatoRif r : c.allegatiEsistenti()) {
                if (r != null && r.messaggioId() != null && r.allegatoId() != null) {
                    byte[] dati = posta.allegato(r.messaggioId(), r.allegatoId());
                    totale += dati.length;
                    allegati.add(new CasellaMime.FileAllegato(r.nome(), r.mimeType(), dati));
                }
            }
        }
        if (file != null) {
            for (MultipartFile f : file.stream().filter(Objects::nonNull).toList()) {
                try {
                    byte[] dati = f.getBytes();
                    totale += dati.length;
                    allegati.add(new CasellaMime.FileAllegato(f.getOriginalFilename(), f.getContentType(), dati));
                } catch (IOException e) {
                    throw new UncheckedIOException(e);
                }
            }
        }
        if (totale > LIMITE_ALLEGATI_BYTES) {
            throw new IllegalArgumentException("Gli allegati superano i 24 MB consentiti da Gmail");
        }
        return allegati;
    }

    private static List<String> senzaNull(List<String> valori) {
        return valori == null ? List.of() : valori.stream().filter(Objects::nonNull).toList();
    }

    private static boolean vuota(List<String> l) {
        return l == null || l.stream().allMatch(s -> s == null || s.isBlank());
    }
}
