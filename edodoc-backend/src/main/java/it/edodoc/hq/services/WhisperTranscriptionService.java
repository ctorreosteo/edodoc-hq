package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Servizio dedicato alla trascrizione audio tramite OpenAI (endpoint HTTP ufficiale /audio/transcriptions).
 * <p>
 * Con ffmpeg sul server ogni registrazione non breve si spezza in segmenti di circa due minuti, tagliati nelle
 * pause, trascritti in parallelo e riuniti in ordine. Con un audio lungo in un'unica richiesta il modello smette
 * di scrivere a metà e il resto si perde senza errore; i segmenti brevi evitano il taglio e, in parallelo,
 * rendono la trascrizione molto più rapida. I segmenti di solo silenzio non si mandano: sul silenzio il modello
 * tende a inventare frasi.
 * <p>
 * Senza ffmpeg il file va in una sola richiesta (limite OpenAI 25 MB).
 * <p>
 * In EdoDoc serve al Planner social (testo dal video): senza OPENAI_API_KEY è spento, nessuna chiamata parte e
 * {@link #trascrivi} risponde con un IllegalStateException leggibile.
 */
@Service
public class WhisperTranscriptionService {

    private static final Logger logger = LoggerFactory.getLogger(WhisperTranscriptionService.class);

    /** Limite hard OpenAI per file singolo (25 MB). */
    public static final long OPENAI_WHISPER_MAX_BYTES = 25L * 1024 * 1024;

    private static final String LINGUA_TRASCRIZIONE = "it";
    private static final String WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";

    /** Pause cercate da ffmpeg (silencedetect) per scegliere dove tagliare. */
    private static final String SILENCEDETECT = "silencedetect=noise=-35dB:d=0.4";
    /** Un segmento si salta solo se è silenzio quasi per intero: nel dubbio si trascrive. */
    private static final double QUOTA_SILENZIO_SEGMENTO_SALTATO = 0.98;

    private static final Pattern SILENCE_START = Pattern.compile("silence_start: (-?[\\d.]+)");
    private static final Pattern SILENCE_END = Pattern.compile("silence_end: (-?[\\d.]+)");
    private static final Pattern TIME_STAT = Pattern.compile("time=(\\d+):(\\d{2}):(\\d{2}(?:\\.\\d+)?)");

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final String openAiApiKey;
    private final String whisperModel;
    private final String whisperLanguage;
    private final long maxChunkBytes;
    private final int chunkSegmentSeconds;
    private final String ffmpegCommand;
    private final boolean chunkingEnabled;
    private final long directMaxBytes;
    private final int parallelRequests;
    private volatile Boolean ffmpegDisponibile;

    public WhisperTranscriptionService(
            @Value("${OPENAI_API_KEY:}") String openAiApiKey,
            @Value("${openai.whisper.model:gpt-transcribe}") String whisperModel,
            @Value("${openai.whisper.language:it}") String whisperLanguage,
            @Value("${openai.whisper.max-chunk-bytes:24117248}") long maxChunkBytes,
            @Value("${openai.whisper.chunk-segment-seconds:120}") int chunkSegmentSeconds,
            @Value("${openai.whisper.ffmpeg-command:ffmpeg}") String ffmpegCommand,
            @Value("${openai.whisper.chunking-enabled:true}") boolean chunkingEnabled,
            @Value("${openai.whisper.direct-max-bytes:524288}") long directMaxBytes,
            @Value("${openai.whisper.parallel-requests:8}") int parallelRequests
    ) {
        this.restTemplate = new RestTemplate();
        this.objectMapper = new ObjectMapper();
        this.openAiApiKey = openAiApiKey != null ? openAiApiKey.trim() : "";
        this.whisperModel = whisperModel;
        this.whisperLanguage = (whisperLanguage != null && !whisperLanguage.isBlank())
                ? whisperLanguage.trim().toLowerCase()
                : LINGUA_TRASCRIZIONE;
        this.maxChunkBytes = maxChunkBytes > 0 ? maxChunkBytes : 24L * 1024 * 1024;
        this.chunkSegmentSeconds = chunkSegmentSeconds > 0 ? chunkSegmentSeconds : 120;
        this.ffmpegCommand = (ffmpegCommand != null && !ffmpegCommand.isBlank()) ? ffmpegCommand.trim() : "ffmpeg";
        this.chunkingEnabled = chunkingEnabled;
        this.directMaxBytes = Math.max(0, directMaxBytes);
        this.parallelRequests = parallelRequests > 0 ? parallelRequests : 8;
    }

    /** C'è la chiave OpenAI: senza, la trascrizione è spenta. */
    public boolean configurato() {
        return !openAiApiKey.isBlank();
    }

    /** Trascrive byte già in memoria (es. il video della libreria del Planner): l'audio lo estrae ffmpeg. */
    public String trascrivi(byte[] dati, String nomeFile) {
        if (dati == null || dati.length == 0) {
            throw new IllegalArgumentException("Il file audio è obbligatorio");
        }
        if (!configurato()) {
            throw new IllegalStateException("OPENAI_API_KEY non configurata");
        }
        String filename = nomeFile != null && !nomeFile.isBlank() ? nomeFile : "audio.webm";
        try {
            return trascriviByte(dati, filename);
        } catch (IOException e) {
            logger.error("Errore lettura file audio per Whisper", e);
            throw new IllegalArgumentException("Errore nella lettura del file audio: " + e.getMessage(), e);
        }
    }

    public String trascrivi(MultipartFile audioFile) {
        if (audioFile == null || audioFile.isEmpty()) {
            throw new IllegalArgumentException("Il file audio è obbligatorio");
        }
        if (openAiApiKey == null || openAiApiKey.isBlank()) {
            throw new IllegalStateException("OPENAI_API_KEY non configurata");
        }

        String filename = audioFile.getOriginalFilename() != null
                ? audioFile.getOriginalFilename()
                : "audio.webm";

        try {
            return trascriviByte(audioFile.getBytes(), filename);
        } catch (IOException e) {
            logger.error("Errore lettura file audio per Whisper", e);
            throw new IllegalArgumentException("Errore nella lettura del file audio: " + e.getMessage(), e);
        }
    }

    private String trascriviByte(byte[] audioBytes, String filename) throws IOException {
        // Un audio breve va diretto: segmentarlo non serve.
        if (audioBytes.length <= directMaxBytes || !chunkingEnabled || !ffmpegDisponibile()) {
            if (audioBytes.length > maxChunkBytes) {
                throw fileTroppoGrande(audioBytes.length);
            }
            return invocaWhisper(audioBytes, filename);
        }
        return trascriviInSegmenti(audioBytes, filename);
    }

    private record Intervallo(double inizio, double fine) {
        double durata() {
            return fine - inizio;
        }
    }

    private String trascriviInSegmenti(byte[] audioBytes, String filename) throws IOException {
        long t0 = System.currentTimeMillis();
        Path workDir = Files.createTempDirectory("whisper-chunks-");
        try {
            Path inputFile = workDir.resolve("input." + estensioneDaFilename(filename));
            Files.write(inputFile, audioBytes);

            // Un solo passaggio: mono 16 kHz in Opus voce (segmenti piccoli, upload rapidi) e mappa delle pause.
            // compression_level 0: codifica circa 4 volte più veloce, per la trascrizione non cambia nulla.
            Path normalizzato = workDir.resolve("audio.ogg");
            Esito conversione = eseguiComando(List.of(
                    ffmpegCommand, "-hide_banner", "-y",
                    "-i", inputFile.toAbsolutePath().toString(),
                    "-vn", "-ac", "1", "-ar", "16000",
                    "-af", SILENCEDETECT,
                    "-c:a", "libopus", "-b:a", "24k", "-application", "voip", "-compression_level", "0",
                    normalizzato.toAbsolutePath().toString()
            ), workDir);
            if (conversione.exit() != 0 || !Files.isRegularFile(normalizzato)) {
                throw new IllegalStateException(
                        "ffmpeg non è riuscito a leggere l'audio (exit code " + conversione.exit() + ")");
            }

            double durata = durataDaOutput(conversione.output());
            List<Intervallo> pause = pauseDaOutput(conversione.output(), durata);
            List<Double> tagli = scegliTagli(durata, pause);

            List<Path> chunks;
            if (tagli.isEmpty()) {
                chunks = List.of(normalizzato);
            } else {
                Esito split = eseguiComando(List.of(
                        ffmpegCommand, "-hide_banner", "-loglevel", "error", "-y",
                        "-i", normalizzato.toAbsolutePath().toString(),
                        "-f", "segment",
                        "-segment_times", tagli.stream()
                                .map(t -> String.format(Locale.ROOT, "%.2f", t))
                                .collect(Collectors.joining(",")),
                        "-reset_timestamps", "1",
                        "-c", "copy",
                        workDir.resolve("chunk_%03d.ogg").toAbsolutePath().toString()
                ), workDir);
                if (split.exit() != 0) {
                    throw new IllegalStateException(
                            "ffmpeg non è riuscito a segmentare l'audio (exit code " + split.exit() + ")");
                }
                chunks = elencaChunk(workDir);
            }
            if (chunks.isEmpty()) {
                throw new IllegalStateException("Segmentazione audio fallita: nessun chunk prodotto");
            }

            List<Intervallo> segmenti = new ArrayList<>();
            double inizio = 0;
            for (double t : tagli) {
                segmenti.add(new Intervallo(inizio, t));
                inizio = t;
            }
            segmenti.add(new Intervallo(inizio, Math.max(inizio, durata)));
            // Se ffmpeg ha prodotto un numero diverso di segmenti non si sa quali sono muti: si trascrivono tutti
            if (segmenti.size() != chunks.size()) {
                segmenti = List.of();
            }

            String testo = trascriviInParallelo(chunks, segmenti, pause);
            logger.info("Whisper: {}s di audio in {} segmenti, trascritto in {} ms",
                    Math.round(durata), chunks.size(), System.currentTimeMillis() - t0);
            return testo;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Segmentazione audio interrotta", e);
        } finally {
            eliminaDirectory(workDir);
        }
    }

    private String trascriviInParallelo(List<Path> chunks, List<Intervallo> segmenti, List<Intervallo> pause)
            throws IOException, InterruptedException {
        ExecutorService pool = Executors.newFixedThreadPool(Math.min(chunks.size(), parallelRequests));
        try {
            List<Future<String>> parziali = new ArrayList<>();
            for (int i = 0; i < chunks.size(); i++) {
                if (chunks.size() > 1 && !segmenti.isEmpty()
                        && quotaSilenzio(segmenti.get(i), pause) >= QUOTA_SILENZIO_SEGMENTO_SALTATO) {
                    logger.info("Whisper: segmento {} saltato (solo silenzio, {}s)",
                            i, Math.round(segmenti.get(i).durata()));
                    continue;
                }
                byte[] chunkBytes = Files.readAllBytes(chunks.get(i));
                String chunkName = "chunk_" + i + ".ogg";
                parziali.add(pool.submit(() -> invocaWhisperConRiprova(chunkBytes, chunkName)));
            }

            StringBuilder testoCompleto = new StringBuilder();
            for (Future<String> f : parziali) {
                String parziale = f.get();
                if (parziale != null && !parziale.isBlank()) {
                    if (!testoCompleto.isEmpty()) {
                        testoCompleto.append(' ');
                    }
                    testoCompleto.append(parziale.trim());
                }
            }
            return testoCompleto.toString();
        } catch (ExecutionException e) {
            if (e.getCause() instanceof RuntimeException re) {
                throw re;
            }
            throw new IllegalStateException("Errore nella trascrizione di un segmento audio", e.getCause());
        } finally {
            pool.shutdownNow();
        }
    }

    /** Un segmento fallito non deve far perdere tutta la registrazione: un secondo tentativo, salvo credito esaurito. */
    private String invocaWhisperConRiprova(byte[] chunkBytes, String chunkName) {
        try {
            return invocaWhisper(chunkBytes, chunkName);
        } catch (IllegalStateException e) {
            if (e.getMessage() != null && e.getMessage().startsWith("Credito OpenAI esaurito")) {
                throw e;
            }
            logger.warn("Whisper: {} fallito ({}), secondo tentativo", chunkName, e.getMessage());
            return invocaWhisper(chunkBytes, chunkName);
        }
    }

    /**
     * Un taglio ogni circa {@code chunkSegmentSeconds}, a metà della pausa più vicina al punto ideale così da
     * non spezzare le parole; senza pause utili si taglia al punto ideale.
     */
    private List<Double> scegliTagli(double durata, List<Intervallo> pause) {
        List<Double> tagli = new ArrayList<>();
        double target = chunkSegmentSeconds;
        double ultimo = 0;
        while (durata - ultimo > target * 1.25) {
            double ideale = ultimo + target;
            double min = ultimo + target * 0.6;
            double max = Math.min(ultimo + target * 1.25, durata - 5);
            double scelto = ideale;
            double distanzaMigliore = Double.MAX_VALUE;
            for (Intervallo p : pause) {
                double centro = (p.inizio() + p.fine()) / 2;
                if (centro < min || centro > max) {
                    continue;
                }
                double distanza = Math.abs(centro - ideale);
                if (distanza < distanzaMigliore) {
                    distanzaMigliore = distanza;
                    scelto = centro;
                }
            }
            tagli.add(scelto);
            ultimo = scelto;
        }
        return tagli;
    }

    private static double quotaSilenzio(Intervallo segmento, List<Intervallo> pause) {
        if (segmento.durata() <= 0) {
            return 1;
        }
        double silenzio = 0;
        for (Intervallo p : pause) {
            double inizio = Math.max(segmento.inizio(), p.inizio());
            double fine = Math.min(segmento.fine(), p.fine());
            if (fine > inizio) {
                silenzio += fine - inizio;
            }
        }
        return silenzio / segmento.durata();
    }

    private static List<Intervallo> pauseDaOutput(String output, double durata) {
        List<Intervallo> pause = new ArrayList<>();
        Double inizio = null;
        for (String riga : output.split("[\\r\\n]+")) {
            Matcher start = SILENCE_START.matcher(riga);
            if (start.find()) {
                inizio = Math.max(0, Double.parseDouble(start.group(1)));
                continue;
            }
            Matcher end = SILENCE_END.matcher(riga);
            if (end.find() && inizio != null) {
                pause.add(new Intervallo(inizio, Double.parseDouble(end.group(1))));
                inizio = null;
            }
        }
        // Silenzio fino in fondo: ffmpeg apre la pausa ma non la chiude
        if (inizio != null && durata > inizio) {
            pause.add(new Intervallo(inizio, durata));
        }
        return pause;
    }

    /** Durata dall'ultima riga di avanzamento di ffmpeg: le registrazioni del browser spesso non la dichiarano. */
    private static double durataDaOutput(String output) {
        Matcher m = TIME_STAT.matcher(output);
        double durata = 0;
        while (m.find()) {
            durata = Integer.parseInt(m.group(1)) * 3600 + Integer.parseInt(m.group(2)) * 60
                    + Double.parseDouble(m.group(3));
        }
        return durata;
    }

    private List<Path> elencaChunk(Path workDir) throws IOException {
        try (Stream<Path> stream = Files.list(workDir)) {
            return stream
                    .filter(p -> {
                        String name = p.getFileName().toString().toLowerCase(Locale.ROOT);
                        return name.startsWith("chunk_") && name.endsWith(".ogg");
                    })
                    .sorted(Comparator.comparing(p -> p.getFileName().toString()))
                    .toList();
        }
    }

    private boolean ffmpegDisponibile() {
        Boolean disponibile = ffmpegDisponibile;
        if (disponibile == null) {
            try {
                disponibile = eseguiComando(List.of(ffmpegCommand, "-version"), null).exit() == 0;
            } catch (Exception e) {
                logger.warn("ffmpeg non disponibile ({}): {}", ffmpegCommand, e.getMessage());
                disponibile = false;
            }
            if (!disponibile) {
                logger.warn("Senza ffmpeg gli audio lunghi vanno a OpenAI in un'unica richiesta");
            }
            ffmpegDisponibile = disponibile;
        }
        return disponibile;
    }

    private record Esito(int exit, String output) {}

    private Esito eseguiComando(List<String> command, Path workDir) throws IOException, InterruptedException {
        ProcessBuilder pb = new ProcessBuilder(command);
        if (workDir != null) {
            pb.directory(workDir.toFile());
        }
        pb.redirectErrorStream(true);
        Process process = pb.start();
        String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        int exit = process.waitFor();
        if (exit != 0 && !output.isBlank()) {
            logger.warn("Comando fallito (exit {}): {}\n{}", exit, command, output);
        }
        return new Esito(exit, output);
    }

    private static void eliminaDirectory(Path dir) {
        if (dir == null || !Files.isDirectory(dir)) {
            return;
        }
        try (Stream<Path> walk = Files.walk(dir)) {
            List<Path> paths = new ArrayList<>(walk.sorted(Comparator.reverseOrder()).toList());
            for (Path p : paths) {
                Files.deleteIfExists(p);
            }
        } catch (IOException e) {
            logger.warn("Impossibile eliminare directory temporanea {}: {}", dir, e.getMessage());
        }
    }

    private String invocaWhisper(byte[] audioBytes, String filename) {
        ByteArrayResource fileResource = new ByteArrayResource(audioBytes) {
            @Override
            public String getFilename() {
                return filename;
            }
        };

        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", fileResource);
        body.add("model", whisperModel);
        body.add("language", whisperLanguage);

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(openAiApiKey);

        HttpEntity<MultiValueMap<String, Object>> requestEntity = new HttpEntity<>(body, headers);

        logger.info("Chiamata OpenAI Whisper: model={}, language={}, filename={}, sizeBytes={}",
                whisperModel, whisperLanguage, filename, audioBytes.length);

        try {
            ResponseEntity<String> response = restTemplate.postForEntity(WHISPER_URL, requestEntity, String.class);
            if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
                throw new IllegalStateException(
                        "Errore nella risposta OpenAI Whisper: status=" + response.getStatusCode());
            }
            return estraiCampoTextDaJson(response.getBody());
        } catch (RestClientResponseException e) {
            gestisciErroreHttpWhisper(e, audioBytes.length);
            throw new IllegalStateException("unreachable");
        }
    }

    private void gestisciErroreHttpWhisper(RestClientResponseException e, long sizeBytes) {
        String responseBody = e.getResponseBodyAsString(StandardCharsets.UTF_8);
        logger.error("Errore HTTP da OpenAI Whisper: status={}, body={}", e.getStatusCode(), responseBody);

        if (responseBody != null && responseBody.contains("insufficient_quota")) {
            throw new IllegalStateException(
                    "Credito OpenAI esaurito o piano senza fatturazione attiva. "
                            + "Verifica billing e quota su https://platform.openai.com/account/billing");
        }
        if (e.getStatusCode().value() == 429) {
            throw new IllegalStateException(
                    "OpenAI ha rifiutato la richiesta (troppo traffico o quota). Riprova tra qualche minuto.");
        }
        if (responseBody != null && (responseBody.contains("maximum")
                || responseBody.contains("too large")
                || responseBody.contains("size limit"))) {
            throw fileTroppoGrande(sizeBytes);
        }
        throw new IllegalStateException(
                "Errore nella chiamata a OpenAI Whisper: " + e.getStatusCode()
                        + (responseBody != null && !responseBody.isBlank() ? " — " + estraiMessaggioErrore(responseBody) : "")
        );
    }

    private IllegalStateException fileTroppoGrande(long sizeBytes) {
        return new IllegalStateException(
                "File audio troppo grande per Whisper/OpenAI ("
                        + formatMb(sizeBytes)
                        + ", limite "
                        + formatMb(OPENAI_WHISPER_MAX_BYTES)
                        + " per richiesta). Usa una registrazione più breve, comprimi l'audio, "
                        + "oppure installa ffmpeg sul server per la segmentazione automatica."
        );
    }

    private static String estraiMessaggioErrore(String responseBody) {
        try {
            JsonNode root = new ObjectMapper().readTree(responseBody);
            JsonNode err = root.path("error").path("message");
            if (!err.isMissingNode() && !err.isNull()) {
                return err.asText();
            }
        } catch (Exception ignored) {
            // body non JSON
        }
        return responseBody.length() > 200 ? responseBody.substring(0, 200) + "…" : responseBody;
    }

    private static String formatMb(long bytes) {
        return String.format(Locale.ROOT, "%.1f MB", bytes / (1024.0 * 1024.0));
    }

    private static String estensioneDaFilename(String filename) {
        if (filename == null) {
            return "webm";
        }
        int dot = filename.lastIndexOf('.');
        if (dot < 0 || dot == filename.length() - 1) {
            return "webm";
        }
        String ext = filename.substring(dot + 1).toLowerCase(Locale.ROOT);
        return ext.matches("[a-z0-9]+") ? ext : "webm";
    }

    private String estraiCampoTextDaJson(String json) {
        if (json == null || json.isBlank()) {
            throw new IllegalStateException("Risposta OpenAI Whisper vuota");
        }
        try {
            JsonNode root = objectMapper.readTree(json);
            JsonNode textNode = root.get("text");
            if (textNode != null && !textNode.isNull()) {
                return textNode.asText();
            }
        } catch (Exception e) {
            logger.warn("Impossibile parsare JSON risposta Whisper, uso body grezzo: {}", e.getMessage());
        }
        return json.trim();
    }
}
