package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.ApiResponseDto;
import it.edodoc.hq.dto.ConoscitivaDto;
import it.edodoc.hq.services.ConoscitivaService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * API pubblica del sito, senza login: slot liberi e prenotazione della chiamata conoscitiva.
 * Un limite per indirizzo IP tiene lontani i bot che riempirebbero l'agenda del dottore.
 */
@RestController
@RequestMapping("/api/pubblico/conoscitiva")
public class PrenotazioneController {

    private static final int MAX_LETTURE_MINUTO = 60;
    private static final int MAX_PRENOTAZIONI_ORA = 5;

    private final ConoscitivaService conoscitivaService;
    private final Map<String, Deque<Long>> letture = new ConcurrentHashMap<>();
    private final Map<String, Deque<Long>> prenotazioni = new ConcurrentHashMap<>();

    public PrenotazioneController(ConoscitivaService conoscitivaService) {
        this.conoscitivaService = conoscitivaService;
    }

    @GetMapping
    public ResponseEntity<ApiResponseDto<ConoscitivaDto.Disponibilita>> disponibilita(HttpServletRequest request) {
        if (troppe(letture, ip(request), MAX_LETTURE_MINUTO, 60_000)) return troppeRichieste();
        return ResponseEntity.ok(ApiResponseDto.success(conoscitivaService.disponibilita()));
    }

    @PostMapping
    public ResponseEntity<ApiResponseDto<ConoscitivaDto.Conferma>> prenota(@Valid @RequestBody ConoscitivaDto.Prenota richiesta,
                                                                           HttpServletRequest request) {
        if (troppe(prenotazioni, ip(request), MAX_PRENOTAZIONI_ORA, 3_600_000)) return troppeRichieste();
        return ResponseEntity.ok(ApiResponseDto.success("Chiamata prenotata", conoscitivaService.prenota(richiesta)));
    }

    private static <T> ResponseEntity<ApiResponseDto<T>> troppeRichieste() {
        String m = "Troppi tentativi in poco tempo. Riprova tra qualche minuto.";
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(ApiResponseDto.error(m, m));
    }

    /** Su Cloud Run l'indirizzo vero è il primo di X-Forwarded-For. */
    private static String ip(HttpServletRequest request) {
        String inoltrato = request.getHeader("X-Forwarded-For");
        return inoltrato != null && !inoltrato.isBlank() ? inoltrato.split(",")[0].trim() : request.getRemoteAddr();
    }

    private static boolean troppe(Map<String, Deque<Long>> registro, String ip, int massimo, long finestraMs) {
        long adesso = System.currentTimeMillis();
        if (registro.size() > 10_000) registro.clear();
        Deque<Long> volte = registro.computeIfAbsent(ip, k -> new ArrayDeque<>());
        synchronized (volte) {
            while (!volte.isEmpty() && adesso - volte.peekFirst() > finestraMs) volte.pollFirst();
            if (volte.size() >= massimo) return true;
            volte.addLast(adesso);
            return false;
        }
    }
}
