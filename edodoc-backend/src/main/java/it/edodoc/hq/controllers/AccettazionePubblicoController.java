package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.AccettazioneDto;
import it.edodoc.hq.dto.ApiResponseDto;
import it.edodoc.hq.services.AccettazionePubblicaService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * Pagina di firma dal link personale, senza login: il token del link è l'unica chiave. Un limite per indirizzo IP
 * frena chi prova token o codici a caso; il codice monouso ha comunque i suoi limiti di invii e tentativi.
 */
@RestController
public class AccettazionePubblicoController {

    private static final int MAX_RICHIESTE_MINUTO = 60;
    private static final int MAX_CODICI_ORA = 12;

    private final AccettazionePubblicaService service;
    private final Map<String, Deque<Long>> richieste = new ConcurrentHashMap<>();
    private final Map<String, Deque<Long>> codici = new ConcurrentHashMap<>();

    public AccettazionePubblicoController(AccettazionePubblicaService service) {
        this.service = service;
    }

    @GetMapping("/api/pubblico/accettazione/{token}")
    public ResponseEntity<ApiResponseDto<AccettazioneDto.Vista>> vista(@PathVariable String token, HttpServletRequest request) {
        return limitato(request, richieste, MAX_RICHIESTE_MINUTO, 60_000,
                () -> service.vista(token, AccettazioniController.origine(request)));
    }

    @PostMapping("/api/pubblico/accettazione/{token}/dati")
    public ResponseEntity<ApiResponseDto<AccettazioneDto.Vista>> dati(@PathVariable String token,
                                                                      @RequestBody AccettazioneDto.DatiRequest req,
                                                                      HttpServletRequest request) {
        return limitato(request, richieste, MAX_RICHIESTE_MINUTO, 60_000,
                () -> service.dati(token, req, AccettazioniController.origine(request)));
    }

    @PostMapping("/api/pubblico/accettazione/{token}/documento-aperto")
    public ResponseEntity<ApiResponseDto<Void>> documentoAperto(@PathVariable String token, @RequestParam String tipo,
                                                                HttpServletRequest request) {
        return limitato(request, richieste, MAX_RICHIESTE_MINUTO, 60_000, () -> {
            service.documentoAperto(token, tipo, AccettazioniController.origine(request));
            return null;
        });
    }

    @PostMapping("/api/pubblico/accettazione/{token}/codice")
    public ResponseEntity<ApiResponseDto<AccettazioneDto.CodiceInviato>> codice(@PathVariable String token,
                                                                                HttpServletRequest request) {
        return limitato(request, codici, MAX_CODICI_ORA, 3_600_000,
                () -> service.inviaCodice(token, AccettazioniController.origine(request)));
    }

    @PostMapping("/api/pubblico/accettazione/{token}/codice/verifica")
    public ResponseEntity<ApiResponseDto<AccettazioneDto.Vista>> verificaCodice(@PathVariable String token,
                                                                                @RequestBody AccettazioneDto.CodiceRequest req,
                                                                                HttpServletRequest request) {
        return limitato(request, codici, MAX_CODICI_ORA * 2, 3_600_000,
                () -> service.verificaCodice(token, req == null ? null : req.codice(), AccettazioniController.origine(request)));
    }

    @PostMapping("/api/pubblico/accettazione/{token}/firma")
    public ResponseEntity<ApiResponseDto<AccettazioneDto.Firmata>> firma(@PathVariable String token,
                                                                         @RequestBody AccettazioneDto.FirmaRequest req,
                                                                         HttpServletRequest request) {
        return limitato(request, richieste, MAX_RICHIESTE_MINUTO, 60_000,
                () -> service.firma(token, req, AccettazioniController.origine(request)));
    }

    @GetMapping("/api/pubblico/accettazione/{token}/copia")
    public ResponseEntity<byte[]> copia(@PathVariable String token, HttpServletRequest request) {
        if (troppe(richieste, AccettazioniController.ip(request), MAX_RICHIESTE_MINUTO, 60_000)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).build();
        }
        return AccettazioniController.pdf(service.copia(token, AccettazioniController.origine(request)));
    }

    @GetMapping("/api/pubblico/verifica-firma/{codice}")
    public ResponseEntity<ApiResponseDto<AccettazioneDto.Verifica>> verifica(@PathVariable String codice,
                                                                             HttpServletRequest request) {
        return limitato(request, richieste, MAX_RICHIESTE_MINUTO, 60_000, () -> service.verifica(codice));
    }

    private <T> ResponseEntity<ApiResponseDto<T>> limitato(HttpServletRequest request, Map<String, Deque<Long>> registro,
                                                           int massimo, long finestraMs, Supplier<T> azione) {
        if (troppe(registro, AccettazioniController.ip(request), massimo, finestraMs)) {
            String m = "Troppi tentativi in poco tempo. Riprova tra qualche minuto.";
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(ApiResponseDto.error(m, m));
        }
        return ResponseEntity.ok(ApiResponseDto.success(azione.get()));
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
