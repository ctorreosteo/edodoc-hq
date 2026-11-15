package it.edodoc.hq.services;

import it.edodoc.hq.dto.PlannerDto;
import it.edodoc.hq.models.PlannerEtichetta;
import it.edodoc.hq.models.PlannerPost;
import it.edodoc.hq.models.PlannerPostCanale;
import it.edodoc.hq.repositories.PlannerEtichettaRepository;
import it.edodoc.hq.repositories.PlannerPostCanaleRepository;
import it.edodoc.hq.repositories.PlannerPostRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Analisi del piano di uno spazio del Planner social: quanto si è pubblicato, dove, con che risultati, a che ore
 * rende di più e se le rubriche rispettano gli obiettivi. Interazioni = mi piace + commenti + condivisioni +
 * salvataggi; i canali senza numeri (pubblicati a mano, Google, TikTok) contano solo come pubblicazioni.
 */
@Service
public class PlannerAnalisiService {

    private static final int GIORNI_MAX = 370;

    private final PlannerPostCanaleRepository canaleRepository;
    private final PlannerPostRepository postRepository;
    private final PlannerEtichettaRepository etichettaRepository;
    private final PlannerPostService postService;
    private final PlannerSpaziService spazi;

    public PlannerAnalisiService(PlannerPostCanaleRepository canaleRepository, PlannerPostRepository postRepository,
                                 PlannerEtichettaRepository etichettaRepository, PlannerPostService postService,
                                 PlannerSpaziService spazi) {
        this.canaleRepository = canaleRepository;
        this.postRepository = postRepository;
        this.etichettaRepository = etichettaRepository;
        this.postService = postService;
        this.spazi = spazi;
    }

    @Transactional
    public PlannerDto.Analisi analisi(Long brandIdRichiesto, LocalDate dal, LocalDate al) {
        if (dal == null || al == null || al.isBefore(dal) || ChronoUnit.DAYS.between(dal, al) > GIORNI_MAX) {
            throw new IllegalArgumentException("Periodo non valido.");
        }
        Long brandId = spazi.risolvi(brandIdRichiesto).getId();
        long giorni = ChronoUnit.DAYS.between(dal, al) + 1;
        List<PlannerPostCanale> righe = canaleRepository.pubblicatiNelPeriodo(brandId, dal.atStartOfDay(), al.plusDays(1).atStartOfDay());
        List<PlannerPostCanale> prima = canaleRepository.pubblicatiNelPeriodo(brandId,
                dal.minusDays(giorni).atStartOfDay(), dal.atStartOfDay());
        Map<Long, PlannerPost> post = postRepository.findAllById(righe.stream().map(PlannerPostCanale::getPostId).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(PlannerPost::getId, Function.identity()));

        // Canali
        Map<String, long[]> perCanale = new LinkedHashMap<>();
        for (PlannerPostCanale c : righe) {
            long[] v = perCanale.computeIfAbsent(c.getCanale(), k -> new long[4]);
            v[0]++;
            v[1] += n(c.getVisualizzazioni());
            v[2] += n(c.getCopertura());
            v[3] += interazioni(c);
        }
        List<PlannerDto.PerCanale> canali = perCanale.entrySet().stream()
                .map(e -> new PlannerDto.PerCanale(e.getKey(), e.getValue()[0], e.getValue()[1], e.getValue()[2], e.getValue()[3]))
                .sorted(Comparator.comparingLong(PlannerDto.PerCanale::pubblicazioni).reversed())
                .toList();

        // Rubriche
        Map<Long, PlannerEtichetta> etichette = etichettaRepository.findAllByOrderByPosizioneAscIdAsc().stream()
                .collect(Collectors.toMap(PlannerEtichetta::getId, Function.identity(), (x, y) -> x, LinkedHashMap::new));
        Map<Long, long[]> perEtichetta = new HashMap<>();
        Map<Long, Long> interazioniPost = new HashMap<>();
        righe.forEach(c -> interazioniPost.merge(c.getPostId(), interazioni(c), Long::sum));
        for (PlannerPost p : post.values()) {
            long[] v = perEtichetta.computeIfAbsent(p.getEtichettaId() == null ? -1L : p.getEtichettaId(), k -> new long[2]);
            v[0]++;
            v[1] += interazioniPost.getOrDefault(p.getId(), 0L);
        }
        List<PlannerDto.PerEtichetta> rubriche = new ArrayList<>();
        for (PlannerEtichetta e : etichette.values()) {
            long[] v = perEtichetta.getOrDefault(e.getId(), new long[2]);
            rubriche.add(new PlannerDto.PerEtichetta(e.getId(), e.getNome(), e.getColore(), v[0], v[1], e.getObiettivoSettimanale()));
        }
        if (perEtichetta.containsKey(-1L)) {
            long[] v = perEtichetta.get(-1L);
            rubriche.add(new PlannerDto.PerEtichetta(null, "Senza rubrica", "#94a3b8", v[0], v[1], null));
        }

        // Orari: quando sono usciti i post e quanto hanno reso
        Map<String, double[]> orari = new HashMap<>();
        for (PlannerPostCanale c : righe) {
            if (c.getPubblicatoIl() == null) {
                continue;
            }
            LocalDateTime t = c.getPubblicatoIl();
            double[] v = orari.computeIfAbsent(t.getDayOfWeek().getValue() + "|" + t.getHour(), k -> new double[2]);
            v[0]++;
            v[1] += interazioni(c);
        }
        List<PlannerDto.CellaOrario> celle = orari.entrySet().stream().map(e -> {
            String[] k = e.getKey().split("\\|");
            return new PlannerDto.CellaOrario(Integer.parseInt(k[0]), Integer.parseInt(k[1]), (int) e.getValue()[0],
                    e.getValue()[0] == 0 ? 0 : e.getValue()[1] / e.getValue()[0]);
        }).toList();

        // Settimane: pubblicati e programmati, da lunedì a domenica
        List<PlannerPost> nelPeriodo = postRepository.nelPeriodo(brandId, dal.atStartOfDay(), al.plusDays(1).atStartOfDay());
        List<PlannerDto.Settimana> settimane = new ArrayList<>();
        Set<String> usciti = Set.of(PlannerPost.STATO_PUBBLICATO, PlannerPost.STATO_PARZIALE, PlannerPost.STATO_DA_COMPLETARE);
        for (LocalDate s = dal.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)); !s.isAfter(al); s = s.plusWeeks(1)) {
            LocalDateTime da = s.atStartOfDay();
            LocalDateTime a = s.plusWeeks(1).atStartOfDay();
            long pubblicati = nelPeriodo.stream().filter(p -> usciti.contains(p.getStato()) && dentro(p.getProgrammatoAlle(), da, a)).count();
            long programmati = nelPeriodo.stream().filter(p -> PlannerPost.STATO_PROGRAMMATO.equals(p.getStato())
                    && dentro(p.getProgrammatoAlle(), da, a)).count();
            settimane.add(new PlannerDto.Settimana(s, pubblicati, programmati));
        }

        // I migliori
        Map<Long, PlannerDto.Post> dto = postService.dto(new ArrayList<>(post.values())).stream()
                .collect(Collectors.toMap(PlannerDto.Post::id, Function.identity()));
        List<PlannerDto.TopPost> top = righe.stream()
                .filter(c -> c.getMetricheIl() != null)
                .sorted(Comparator.comparingLong(PlannerAnalisiService::interazioni).reversed()
                        .thenComparing(c -> n(c.getVisualizzazioni()), Comparator.reverseOrder()))
                .limit(8)
                .map(c -> {
                    PlannerDto.Post p = dto.get(c.getPostId());
                    String anteprima = p == null || p.media().isEmpty() ? null
                            : p.media().get(0).anteprimaUrl() != null ? p.media().get(0).anteprimaUrl() : p.media().get(0).url();
                    return new PlannerDto.TopPost(c.getPostId(), p == null ? null : p.titolo(),
                            p == null ? null : PlannerUtenti.tronca(PlannerPostService.testoDi(post.get(c.getPostId()), c), 160),
                            anteprima, c.getCanale(), c.getLinkEsterno(), PlannerCanali.iso(c.getPubblicatoIl()),
                            interazioni(c), c.getVisualizzazioni());
                })
                .toList();

        LocalDateTime aggiornate = righe.stream().map(PlannerPostCanale::getMetricheIl).filter(Objects::nonNull)
                .max(Comparator.naturalOrder()).orElse(null);
        return new PlannerDto.Analisi(dal, al, totali(righe), totali(prima), canali, rubriche, celle, settimane, top,
                PlannerCanali.iso(aggiornate));
    }

    private static PlannerDto.Totali totali(List<PlannerPostCanale> righe) {
        long conMetriche = righe.stream().filter(c -> c.getMetricheIl() != null).count();
        long interazioni = righe.stream().mapToLong(PlannerAnalisiService::interazioni).sum();
        return new PlannerDto.Totali(
                righe.stream().map(PlannerPostCanale::getPostId).distinct().count(),
                righe.size(),
                righe.stream().mapToLong(c -> n(c.getVisualizzazioni())).sum(),
                righe.stream().mapToLong(c -> n(c.getCopertura())).sum(),
                interazioni,
                conMetriche == 0 ? null : (double) interazioni / conMetriche);
    }

    static long interazioni(PlannerPostCanale c) {
        return n(c.getMiPiace()) + n(c.getCommenti()) + n(c.getCondivisioni()) + n(c.getSalvataggi());
    }

    private static boolean dentro(LocalDateTime t, LocalDateTime da, LocalDateTime a) {
        return t != null && !t.isBefore(da) && t.isBefore(a);
    }

    private static long n(Long v) {
        return v == null ? 0 : v;
    }
}
