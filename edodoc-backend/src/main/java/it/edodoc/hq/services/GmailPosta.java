package it.edodoc.hq.services;

import com.google.api.client.googleapis.json.GoogleJsonResponseException;
import com.google.api.services.gmail.Gmail;
import com.google.api.services.gmail.model.BatchModifyMessagesRequest;
import com.google.api.services.gmail.model.Draft;
import com.google.api.services.gmail.model.Label;
import com.google.api.services.gmail.model.ListDraftsResponse;
import com.google.api.services.gmail.model.ListThreadsResponse;
import com.google.api.services.gmail.model.Message;
import com.google.api.services.gmail.model.ModifyThreadRequest;
import com.google.api.services.gmail.model.Profile;
import it.edodoc.hq.dto.CasellaDto;
import it.edodoc.hq.exception.IntegrazioneDisattivataException;
import it.edodoc.hq.exception.RisorsaNonTrovataException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.math.BigInteger;
import java.security.GeneralSecurityException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Casella Gmail reale, letta con il Service Account che impersona l'account del dottore. */
@Component
public class GmailPosta implements CasellaPosta {

    private static final Logger logger = LoggerFactory.getLogger(GmailPosta.class);
    private static final String ME = "me";
    private static final List<String> CARTELLE = List.of("INBOX", "STARRED", "SENT", "DRAFT", "SPAM", "TRASH");
    private static final List<String> HEADER_ELENCO = List.of("From", "To", "Subject", "Content-Type");
    private static final long PAGINA = 30;

    private final GoogleClients googleClients;
    private final ConfigService configService;

    public GmailPosta(GoogleClients googleClients, ConfigService configService) {
        this.googleClients = googleClients;
        this.configService = configService;
    }

    @FunctionalInterface
    private interface Chiamata<T> {
        T esegui(Gmail gmail) throws IOException;
    }

    /** Traduce gli errori di Google in quelli del gestionale: il permesso mancante mostra la guida di collegamento. */
    private <T> T con(Chiamata<T> chiamata) {
        try {
            return chiamata.esegui(googleClients.gmail());
        } catch (GoogleJsonResponseException e) {
            int codice = e.getStatusCode();
            logger.warn("Gmail ha risposto {}", codice);
            if (codice == 401 || codice == 403) {
                throw new IntegrazioneDisattivataException("Google non autorizza l'accesso alla casella: controlla la delega gmail.modify");
            }
            if (codice == 404) {
                throw new RisorsaNonTrovataException("Email non trovata: forse è stata eliminata");
            }
            if (codice == 400) {
                throw new IllegalArgumentException("Richiesta non valida per Gmail");
            }
            throw new IllegalStateException("Gmail non risponde, riprova tra poco", e);
        } catch (IOException | GeneralSecurityException e) {
            logger.warn("Gmail non raggiungibile: {}", e.getMessage());
            throw new IllegalStateException("Gmail non risponde, riprova tra poco", e);
        }
    }

    @Override
    public CasellaDto.Casella casella() {
        Profile profilo = con(g -> g.users().getProfile(ME).execute());
        List<Label> tutte = con(g -> g.users().labels().list(ME).execute().getLabels());
        List<String> ids = new ArrayList<>(CARTELLE);
        if (tutte != null) {
            tutte.stream().filter(l -> "user".equals(l.getType())).map(Label::getId).forEach(ids::add);
        }
        List<CasellaDto.Etichetta> etichette = new ArrayList<>();
        for (String id : ids) {
            etichette.add(etichetta(con(g -> g.users().labels().get(ME, id).execute())));
        }
        return new CasellaDto.Casella(googleClients.account(), configService.get("EMITTENTE_NOME"), etichette,
                testo(profilo.getHistoryId()), false);
    }

    private static CasellaDto.Etichetta etichetta(Label l) {
        return new CasellaDto.Etichetta(l.getId(), l.getName(), "system".equals(l.getType()) ? "SYSTEM" : "USER",
                l.getThreadsTotal() != null ? l.getThreadsTotal() : 0, l.getThreadsUnread() != null ? l.getThreadsUnread() : 0,
                l.getColor() != null ? l.getColor().getBackgroundColor() : null,
                l.getColor() != null ? l.getColor().getTextColor() : null);
    }

    private static String testo(BigInteger valore) {
        return valore != null ? valore.toString() : null;
    }

    @Override
    public CasellaDto.Stato stato(String dalHistoryId) {
        String historyId = testo(con(g -> g.users().getProfile(ME).execute()).getHistoryId());
        Label inbox = con(g -> g.users().labels().get(ME, "INBOX").execute());
        long nonLetti = inbox.getThreadsUnread() != null ? inbox.getThreadsUnread() : 0;
        boolean cambiato = dalHistoryId != null && !dalHistoryId.isBlank() && !dalHistoryId.equals(historyId);
        return new CasellaDto.Stato(historyId, nonLetti, cambiato);
    }

    @Override
    public CasellaDto.PaginaThread elenco(String cartella, String q, String pagina) {
        ListThreadsResponse risposta = con(g -> {
            Gmail.Users.Threads.List lista = g.users().threads().list(ME).setMaxResults(PAGINA);
            if (cartella != null && !cartella.isBlank()) {
                lista.setLabelIds(List.of(cartella));
                lista.setIncludeSpamTrash("SPAM".equals(cartella) || "TRASH".equals(cartella));
            }
            if (q != null && !q.isBlank()) {
                lista.setQ(q.trim());
            }
            if (pagina != null && !pagina.isBlank()) {
                lista.setPageToken(pagina);
            }
            return lista.execute();
        });
        List<CasellaDto.ThreadRiga> righe = new ArrayList<>();
        if (risposta.getThreads() != null) {
            String mia = googleClients.account().toLowerCase(Locale.ROOT);
            for (com.google.api.services.gmail.model.Thread t : risposta.getThreads()) {
                com.google.api.services.gmail.model.Thread dettaglio = con(g -> g.users().threads().get(ME, t.getId())
                        .setFormat("metadata").setMetadataHeaders(HEADER_ELENCO)
                        .setFields("id,messages(id,labelIds,snippet,internalDate,payload/headers)").execute());
                if (dettaglio.getMessages() != null && !dettaglio.getMessages().isEmpty()) {
                    righe.add(riga(dettaglio, mia));
                }
            }
        }
        long stima = risposta.getResultSizeEstimate() != null ? risposta.getResultSizeEstimate() : righe.size();
        return new CasellaDto.PaginaThread(righe, risposta.getNextPageToken(), stima);
    }

    static CasellaDto.ThreadRiga riga(com.google.api.services.gmail.model.Thread t, String mia) {
        List<Message> messaggi = t.getMessages();
        Message ultimo = messaggi.stream().max(Comparator.comparing(m -> m.getInternalDate() != null ? m.getInternalDate() : 0L))
                .orElse(messaggi.get(messaggi.size() - 1));
        Set<String> etichette = new LinkedHashSet<>();
        boolean allegati = false;
        boolean nonLetto = false;
        int veri = 0;
        for (Message m : messaggi) {
            List<String> lab = m.getLabelIds() != null ? m.getLabelIds() : List.of();
            etichette.addAll(lab);
            String tipo = CasellaMime.header(m, "Content-Type");
            allegati |= tipo != null && tipo.toLowerCase(Locale.ROOT).startsWith("multipart/mixed");
            // Una bozza non rende "da leggere" la conversazione né conta tra i messaggi
            if (!lab.contains("DRAFT")) {
                veri++;
                nonLetto |= lab.contains("UNREAD");
            }
        }
        return new CasellaDto.ThreadRiga(t.getId(), CasellaMime.header(messaggi.get(0), "Subject"), ultimo.getSnippet(),
                partecipanti(messaggi, mia), CasellaMime.primo(CasellaMime.header(ultimo, "From")), veri,
                ultimo.getInternalDate() != null ? ultimo.getInternalDate() : 0, nonLetto, etichette.contains("STARRED"),
                allegati, etichette.contains("DRAFT"), new ArrayList<>(etichette));
    }

    /** Mittenti in ordine; se ho scritto solo io, i destinatari, come la cartella Inviati di Gmail. */
    private static List<CasellaDto.Indirizzo> partecipanti(List<Message> messaggi, String mia) {
        Map<String, CasellaDto.Indirizzo> mittenti = new LinkedHashMap<>();
        Map<String, CasellaDto.Indirizzo> destinatari = new LinkedHashMap<>();
        for (Message m : messaggi) {
            CasellaDto.Indirizzo da = CasellaMime.primo(CasellaMime.header(m, "From"));
            if (da != null) {
                mittenti.putIfAbsent(da.email().toLowerCase(Locale.ROOT), da);
            }
            for (CasellaDto.Indirizzo i : CasellaMime.indirizzi(CasellaMime.header(m, "To"))) {
                destinatari.putIfAbsent(i.email().toLowerCase(Locale.ROOT), i);
            }
        }
        boolean soloIo = mittenti.keySet().stream().allMatch(mia::equals);
        return new ArrayList<>((soloIo && !destinatari.isEmpty() ? destinatari : mittenti).values());
    }

    @Override
    public CasellaDto.Thread thread(String threadId) {
        com.google.api.services.gmail.model.Thread t = con(g -> g.users().threads().get(ME, threadId).setFormat("full").execute());
        List<Message> messaggi = t.getMessages() != null ? t.getMessages() : List.of();
        boolean conBozze = messaggi.stream().anyMatch(m -> m.getLabelIds() != null && m.getLabelIds().contains("DRAFT"));
        Map<String, String> bozze = conBozze ? bozzePerMessaggio(threadId) : Map.of();

        List<CasellaDto.Messaggio> dto = new ArrayList<>();
        Set<String> etichette = new LinkedHashSet<>();
        for (Message m : messaggi) {
            CasellaDto.Messaggio messaggio = daGmail(m);
            if (bozze.containsKey(m.getId())) {
                messaggio = messaggio.conBozza(bozze.get(m.getId()));
            }
            dto.add(messaggio);
            etichette.addAll(messaggio.etichette());
        }
        dto.sort(Comparator.comparingLong(CasellaDto.Messaggio::data));
        return new CasellaDto.Thread(t.getId(), dto.isEmpty() ? null : dto.get(0).oggetto(), dto, new ArrayList<>(etichette));
    }

    private CasellaDto.Messaggio daGmail(Message m) {
        return con(g -> CasellaMime.messaggio(m, (msg, att) ->
                g.users().messages().attachments().get(ME, msg, att).execute().decodeData()));
    }

    private Map<String, String> bozzePerMessaggio(String threadId) {
        Map<String, String> bozze = new HashMap<>();
        ListDraftsResponse risposta = con(g -> g.users().drafts().list(ME).setMaxResults(100L).execute());
        if (risposta.getDrafts() != null) {
            for (Draft d : risposta.getDrafts()) {
                if (d.getMessage() != null && threadId.equals(d.getMessage().getThreadId())) {
                    bozze.put(d.getMessage().getId(), d.getId());
                }
            }
        }
        return bozze;
    }

    @Override
    public byte[] allegato(String messaggioId, String allegatoId) {
        return con(g -> g.users().messages().attachments().get(ME, messaggioId, allegatoId).execute().decodeData());
    }

    @Override
    public void modifica(List<String> threadIds, List<String> aggiungi, List<String> rimuovi) {
        // "Letto" vale per i messaggi, non per le bozze del thread: si applica ai singoli messaggi non letti
        if (aggiungi.isEmpty() && rimuovi.equals(List.of("UNREAD"))) {
            List<String> daLeggere = new ArrayList<>();
            for (String id : threadIds) {
                com.google.api.services.gmail.model.Thread t = con(g -> g.users().threads().get(ME, id)
                        .setFormat("minimal").setFields("messages(id,labelIds)").execute());
                if (t.getMessages() != null) {
                    t.getMessages().stream().filter(m -> m.getLabelIds() != null && m.getLabelIds().contains("UNREAD"))
                            .forEach(m -> daLeggere.add(m.getId()));
                }
            }
            if (!daLeggere.isEmpty()) {
                con(g -> g.users().messages().batchModify(ME, new BatchModifyMessagesRequest()
                        .setIds(daLeggere).setRemoveLabelIds(List.of("UNREAD"))).execute());
            }
            return;
        }
        ModifyThreadRequest corpo = new ModifyThreadRequest().setAddLabelIds(aggiungi).setRemoveLabelIds(rimuovi);
        for (String id : threadIds) {
            con(g -> g.users().threads().modify(ME, id, corpo).execute());
        }
    }

    @Override
    public void cestina(List<String> threadIds) {
        for (String id : threadIds) {
            con(g -> g.users().threads().trash(ME, id).execute());
        }
    }

    @Override
    public void ripristina(List<String> threadIds) {
        for (String id : threadIds) {
            con(g -> g.users().threads().untrash(ME, id).execute());
        }
    }

    private String nomeMittente() {
        return configService.get("EMITTENTE_NOME");
    }

    @Override
    public CasellaDto.EsitoInvio invia(CasellaDto.Composizione c, List<CasellaMime.FileAllegato> allegati) {
        Message messaggio = new Message().setRaw(CasellaMime.componi(googleClients.account(), nomeMittente(), c, allegati));
        if (c.threadId() != null && !c.threadId().isBlank()) {
            messaggio.setThreadId(c.threadId());
        }
        Message inviato = con(g -> g.users().messages().send(ME, messaggio).execute());
        if (c.bozzaId() != null && !c.bozzaId().isBlank()) {
            try {
                eliminaBozza(c.bozzaId());
            } catch (RisorsaNonTrovataException e) {
                logger.debug("Bozza già eliminata dopo l'invio");
            }
        }
        return new CasellaDto.EsitoInvio(inviato.getId(), inviato.getThreadId());
    }

    @Override
    public CasellaDto.EsitoBozza salvaBozza(CasellaDto.Composizione c, List<CasellaMime.FileAllegato> allegati) {
        Message messaggio = new Message().setRaw(CasellaMime.componi(googleClients.account(), nomeMittente(), c, allegati));
        if (c.threadId() != null && !c.threadId().isBlank()) {
            messaggio.setThreadId(c.threadId());
        }
        Draft bozza = new Draft().setMessage(messaggio);
        Draft salvata;
        if (c.bozzaId() != null && !c.bozzaId().isBlank()) {
            try {
                salvata = con(g -> g.users().drafts().update(ME, c.bozzaId(), bozza).execute());
            } catch (RisorsaNonTrovataException e) {
                // Eliminata altrove nel frattempo: se ne crea una nuova
                salvata = con(g -> g.users().drafts().create(ME, bozza).execute());
            }
        } else {
            salvata = con(g -> g.users().drafts().create(ME, bozza).execute());
        }
        // Gli id degli allegati cambiano a ogni versione della bozza: il client li sostituisce con questi
        List<CasellaDto.Allegato> riferimenti = List.of();
        if (!allegati.isEmpty()) {
            String id = salvata.getId();
            Draft completa = con(g -> g.users().drafts().get(ME, id).setFormat("full").execute());
            riferimenti = daGmail(completa.getMessage()).allegati();
        }
        Message salvato = salvata.getMessage();
        return new CasellaDto.EsitoBozza(salvata.getId(), salvato != null ? salvato.getId() : null,
                salvato != null ? salvato.getThreadId() : c.threadId(), riferimenti);
    }

    @Override
    public CasellaDto.Bozza bozza(String bozzaId) {
        Draft d = con(g -> g.users().drafts().get(ME, bozzaId).setFormat("full").execute());
        CasellaDto.Messaggio m = daGmail(d.getMessage());
        return new CasellaDto.Bozza(d.getId(), m.id(), m.threadId(), m.a(), m.cc(), m.ccn(), m.oggetto(), m.html(),
                CasellaMime.header(d.getMessage(), "In-Reply-To"), m.references(),
                m.allegati().stream().filter(a -> !a.inline()).toList());
    }

    @Override
    public void eliminaBozza(String bozzaId) {
        con(g -> g.users().drafts().delete(ME, bozzaId).execute());
    }
}
