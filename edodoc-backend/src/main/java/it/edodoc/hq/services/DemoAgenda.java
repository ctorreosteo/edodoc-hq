package it.edodoc.hq.services;

import it.edodoc.hq.dto.AgendaDto;
import it.edodoc.hq.exception.RisorsaNonTrovataException;
import it.edodoc.hq.models.Visita;
import it.edodoc.hq.repositories.VisitaRepository;
import org.springframework.stereotype.Component;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Calendario dimostrativo in memoria, per provare la pagina in locale senza Google. Le visite sono quelle vere del
 * database, in sola lettura; gli altri eventi si possono creare, spostare ed eliminare. Le ricorrenze non si espandono.
 */
@Component
public class DemoAgenda implements AgendaFonte {

    private static final String MIA = "supporto@edodoc.it";
    private static final ZoneId ROMA = ZoneId.of("Europe/Rome");
    private static final String SECONDO = "personale@demo";
    private static final String FESTIVITA = "festivita@demo";
    private static final String PREFISSO_VISITA = "visita-";

    private final VisitaRepository visitaRepository;
    private final List<AgendaDto.Evento> eventi = new CopyOnWriteArrayList<>();
    private volatile long ultimaModifica = System.currentTimeMillis();

    public DemoAgenda(VisitaRepository visitaRepository) {
        this.visitaRepository = visitaRepository;
        semina();
    }

    private void semina() {
        LocalDate lunedi = LocalDate.now(ROMA).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        aggiungi(PRINCIPALE, "Blocco scrittura piani alimentari", lunedi.atTime(8, 30), lunedi.atTime(10, 0), "9", null, false);
        aggiungi(PRINCIPALE, "Call commercialista", lunedi.plusDays(1).atTime(12, 30), lunedi.plusDays(1).atTime(13, 0), "6", "Studio Rossi", true);
        aggiungi(PRINCIPALE, "Registrazione video YouTube", lunedi.plusDays(2).atTime(14, 0), lunedi.plusDays(2).atTime(17, 30), "4", "Studio", false);
        aggiungi(PRINCIPALE, "Revisione check settimanali", lunedi.plusDays(3).atTime(8, 0), lunedi.plusDays(3).atTime(9, 0), null, null, false);
        aggiungi(SECONDO, "Palestra", lunedi.plusDays(1).atTime(7, 0), lunedi.plusDays(1).atTime(8, 0), null, null, false);
        aggiungi(SECONDO, "Cena con amici", lunedi.plusDays(4).atTime(20, 30), lunedi.plusDays(4).atTime(22, 30), null, "Torino", false);
        eventi.add(evento(FESTIVITA, "Giornata di studio", lunedi.plusDays(4).toString(), lunedi.plusDays(5).toString(), true, null, null, false, null));
    }

    private void aggiungi(String calendario, String titolo, LocalDateTime inizio, LocalDateTime fine, String colore, String luogo, boolean meet) {
        eventi.add(evento(calendario, titolo, iso(inizio), iso(fine), false, colore, luogo, meet, null));
    }

    private static String iso(LocalDateTime valore) {
        return valore.atZone(ROMA).toOffsetDateTime().toString();
    }

    private static AgendaDto.Evento evento(String calendario, String titolo, String inizio, String fine, boolean tuttoIlGiorno,
                                           String colore, String luogo, boolean meet, String descrizione) {
        return new AgendaDto.Evento(UUID.randomUUID().toString(), calendario, titolo, descrizione, luogo, inizio, fine, tuttoIlGiorno,
                colore, "confirmed", "opaque", "default", "default", null, null, null, List.of(), null,
                meet ? "https://meet.google.com/demo-demo-demo" : null, null, true, List.of(), List.of(),
                !FESTIVITA.equals(calendario), false, true, true, System.currentTimeMillis(), null, null, null);
    }

    /** Le visite del periodo come le mostrerebbe Google dopo la pubblicazione. */
    private List<AgendaDto.Evento> visite(LocalDateTime da, LocalDateTime a) {
        return visitaRepository.findNelPeriodo(da, a).stream()
                .filter(v -> v.getStato() != Visita.Stato.ANNULLATA)
                .map(v -> new AgendaDto.Evento(PREFISSO_VISITA + v.getId(), PRINCIPALE, VisitaService.titoloCalendario(v), v.getNote(),
                        null, iso(v.getInizio()), iso(v.getFine()), false, null, "confirmed", "opaque", "default", "default",
                        null, null, null, List.of(), null, v.getMeetUrl(), null, true, List.of(), List.of(), false, false, true, true,
                        null, v.getId(), v.getPaziente().getId(), v.getPaziente().getNomeCompleto()))
                .toList();
    }

    private static LocalDateTime locale(String valore) {
        return valore.length() <= 10 ? LocalDate.parse(valore).atStartOfDay()
                : OffsetDateTime.parse(valore).atZoneSameInstant(ROMA).toLocalDateTime();
    }

    @Override
    public AgendaDto.Stato stato() {
        List<AgendaDto.Calendario> calendari = List.of(
                new AgendaDto.Calendario(PRINCIPALE, MIA, null, "#E27A2C", "#ffffff", "owner", true, true, ROMA.getId(), List.of(new AgendaDto.Promemoria("popup", 10))),
                new AgendaDto.Calendario(SECONDO, "Personale", null, "#3b82f6", "#ffffff", "owner", false, true, ROMA.getId(), List.of()),
                new AgendaDto.Calendario(FESTIVITA, "Formazione", null, "#19a463", "#ffffff", "reader", false, true, ROMA.getId(), List.of()));
        Map<String, AgendaDto.Colore> colori = new LinkedHashMap<>();
        colori.put("1", new AgendaDto.Colore("#a4bdfc", "#1d1d1d"));
        colori.put("2", new AgendaDto.Colore("#7ae7bf", "#1d1d1d"));
        colori.put("3", new AgendaDto.Colore("#dbadff", "#1d1d1d"));
        colori.put("4", new AgendaDto.Colore("#ff887c", "#1d1d1d"));
        colori.put("5", new AgendaDto.Colore("#fbd75b", "#1d1d1d"));
        colori.put("6", new AgendaDto.Colore("#ffb878", "#1d1d1d"));
        colori.put("7", new AgendaDto.Colore("#46d6db", "#1d1d1d"));
        colori.put("8", new AgendaDto.Colore("#e1e1e1", "#1d1d1d"));
        colori.put("9", new AgendaDto.Colore("#5484ed", "#1d1d1d"));
        colori.put("10", new AgendaDto.Colore("#51b749", "#1d1d1d"));
        colori.put("11", new AgendaDto.Colore("#dc2127", "#1d1d1d"));
        return new AgendaDto.Stato(MIA, "Casella dimostrativa", ROMA.getId(), calendari, colori, true);
    }

    @Override
    public AgendaDto.Eventi eventi(List<String> calendari, String da, String a) {
        LocalDateTime inizio = locale(da);
        LocalDateTime fine = locale(a);
        List<AgendaDto.Evento> out = new ArrayList<>(visite(inizio, fine));
        eventi.stream()
                .filter(e -> locale(e.inizio()).isBefore(fine) && locale(e.fine()).isAfter(inizio))
                .forEach(out::add);
        return new AgendaDto.Eventi(out.stream().filter(e -> calendari == null || calendari.isEmpty() || calendari.contains(e.calendarioId())).toList(), List.of());
    }

    @Override
    public AgendaDto.Evento evento(String calendarioId, String eventoId) {
        return eventi.stream().filter(e -> e.id().equals(eventoId)).findFirst()
                .or(() -> eventoId.startsWith(PREFISSO_VISITA)
                        ? visitaRepository.findConDettagli(Long.valueOf(eventoId.substring(PREFISSO_VISITA.length())))
                            .flatMap(v -> visite(v.getInizio().minusMinutes(1), v.getInizio().plusMinutes(1)).stream().filter(e -> e.id().equals(eventoId)).findFirst())
                        : java.util.Optional.empty())
                .orElseThrow(() -> new RisorsaNonTrovataException("Evento non trovato: forse è stato eliminato."));
    }

    @Override
    public List<AgendaDto.Evento> cerca(String q, List<String> calendari) {
        String testo = q == null ? "" : q.trim().toLowerCase(Locale.ROOT);
        LocalDateTime adesso = LocalDateTime.now(ROMA);
        List<AgendaDto.Evento> tutti = new ArrayList<>(visite(adesso.minusYears(1), adesso.plusYears(1)));
        tutti.addAll(eventi);
        return tutti.stream()
                .filter(e -> e.titolo() != null && e.titolo().toLowerCase(Locale.ROOT).contains(testo))
                .sorted(Comparator.comparing(e -> locale(e.inizio())))
                .toList();
    }

    @Override
    public AgendaDto.Novita novita(List<String> calendari, long dal) {
        return new AgendaDto.Novita(ultimaModifica > dal, System.currentTimeMillis(), List.of());
    }

    @Override
    public AgendaDto.Evento crea(String calendarioId, AgendaDto.EventoRequest req, boolean notifica) {
        if (req == null || req.inizio() == null || req.fine() == null) {
            throw new IllegalArgumentException("Inizio e fine sono obbligatori.");
        }
        String titolo = req.titolo() == null || req.titolo().isBlank() ? "(Senza titolo)" : req.titolo().trim();
        AgendaDto.Evento nuovo = evento(calendarioId, titolo, req.inizio(), req.fine(), Boolean.TRUE.equals(req.tuttoIlGiorno()),
                req.colorId(), req.luogo(), Boolean.TRUE.equals(req.conMeet()), req.descrizione());
        eventi.add(nuovo);
        ultimaModifica = System.currentTimeMillis();
        return nuovo;
    }

    @Override
    public AgendaDto.Evento modifica(String calendarioId, String eventoId, AgendaDto.EventoRequest req, Ambito ambito, boolean notifica) {
        if (eventoId.startsWith(PREFISSO_VISITA)) {
            throw new IllegalArgumentException("Nel calendario dimostrativo le visite si modificano dalla pagina Visite.");
        }
        AgendaDto.Evento e = evento(calendarioId, eventoId);
        boolean conMeet = req.conMeet() != null ? req.conMeet() : e.meet() != null;
        AgendaDto.Evento nuovo = new AgendaDto.Evento(e.id(), e.calendarioId(),
                req.titolo() != null ? req.titolo().trim() : e.titolo(),
                req.descrizione() != null ? req.descrizione() : e.descrizione(),
                req.luogo() != null ? req.luogo() : e.luogo(),
                req.inizio() != null ? req.inizio() : e.inizio(),
                req.fine() != null ? req.fine() : e.fine(),
                req.tuttoIlGiorno() != null ? req.tuttoIlGiorno() : e.tuttoIlGiorno(),
                req.colorId() != null ? req.colorId() : e.colorId(),
                e.stato(), e.trasparenza(), e.visibilita(), e.tipo(), null, req.ricorrenza(), null, List.of(), null,
                conMeet ? "https://meet.google.com/demo-demo-demo" : null, null, true, List.of(), List.of(), true, false, true, true,
                System.currentTimeMillis(), null, null, null);
        eventi.replaceAll(x -> x.id().equals(eventoId) ? nuovo : x);
        ultimaModifica = System.currentTimeMillis();
        return nuovo;
    }

    @Override
    public void elimina(String calendarioId, String eventoId, Ambito ambito, boolean notifica) {
        if (eventoId.startsWith(PREFISSO_VISITA)) {
            throw new IllegalArgumentException("Nel calendario dimostrativo le visite si annullano dalla pagina Visite.");
        }
        eventi.removeIf(e -> e.id().equals(eventoId));
        ultimaModifica = System.currentTimeMillis();
    }

    @Override
    public AgendaDto.Evento sposta(String calendarioId, String eventoId, String destinazione, boolean notifica) {
        AgendaDto.Evento e = evento(calendarioId, eventoId);
        AgendaDto.Evento nuovo = new AgendaDto.Evento(e.id(), destinazione, e.titolo(), e.descrizione(), e.luogo(), e.inizio(), e.fine(),
                e.tuttoIlGiorno(), e.colorId(), e.stato(), e.trasparenza(), e.visibilita(), e.tipo(), null, e.ricorrenza(), null, List.of(), null,
                e.meet(), null, true, List.of(), List.of(), true, false, true, true, System.currentTimeMillis(), null, null, null);
        eventi.replaceAll(x -> x.id().equals(eventoId) ? nuovo : x);
        ultimaModifica = System.currentTimeMillis();
        return nuovo;
    }

    @Override
    public AgendaDto.Evento rispondi(String calendarioId, String eventoId, AgendaDto.RispostaRequest req, Ambito ambito) {
        return evento(calendarioId, eventoId);
    }

    @Override
    public List<AgendaDto.Disponibilita> disponibilita(AgendaDto.DisponibilitaRequest req) {
        return req.email().stream().map(email -> new AgendaDto.Disponibilita(email, List.of(), null)).toList();
    }
}
