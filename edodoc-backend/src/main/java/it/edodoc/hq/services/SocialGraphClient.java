package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import it.edodoc.hq.exception.SocialIntegrazioneException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.util.StringUtils;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Unico punto in cui la pagina Meta parla con la Graph API di Meta (Facebook e Instagram).
 *
 * <p>Il token arriva sempre dal chiamante (token di pagina scoperto da {@link SocialAccountService}),
 * mai dal client. <b>Se l'integrazione non e utilizzabile non parte nessuna chiamata di rete.</b>
 *
 * <p>Gli errori di Meta diventano {@link SocialIntegrazioneException} con un messaggio in italiano e il codice
 * Graph originale, cosi i servizi possono riconoscere i casi da ritentare.
 */
@Service
public class SocialGraphClient {

    private static final Logger logger = LoggerFactory.getLogger(SocialGraphClient.class);

    /** Codice Graph per parametro non valido: e quello che Meta restituisce per una metrica deprecata. */
    public static final int CODICE_PARAMETRO_NON_VALIDO = 100;

    private static final int MAX_PAGINE = 10;

    private final SocialConfigService configService;
    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate;

    /** Metriche che Meta ha rifiutato, per tipo di oggetto: non si richiedono piu fino al riavvio. */
    private final Set<String> metricheNonSupportate = ConcurrentHashMap.newKeySet();

    public SocialGraphClient(SocialConfigService configService, ObjectMapper objectMapper) {
        this.configService = configService;
        this.objectMapper = objectMapper;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10_000);
        factory.setReadTimeout(60_000);
        this.restTemplate = new RestTemplate(factory);
    }

    public JsonNode get(String percorso, Map<String, String> parametri, String token) {
        return esegui(HttpMethod.GET, uri(percorso, parametri), token, null);
    }

    /** POST con parametri form (come li documenta Meta per commenti, like, nascondi, pubblicazione). */
    public JsonNode post(String percorso, Map<String, String> parametri, String token) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        if (parametri != null) {
            parametri.forEach((k, v) -> {
                if (v != null) {
                    form.add(k, v);
                }
            });
        }
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
        return esegui(HttpMethod.POST, uri(percorso, null), token, new HttpEntity<>(form, headers));
    }

    /** POST JSON (Messenger Platform: invio messaggi). */
    public JsonNode postJson(String percorso, JsonNode corpo, String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        return esegui(HttpMethod.POST, uri(percorso, null), token, new HttpEntity<>(corpo.toString(), headers));
    }

    /** POST multipart con un file nel campo {@code source} (foto di pagina). */
    public JsonNode postFile(String percorso, Map<String, String> parametri, byte[] contenuto,
                             String filename, String mimeType, String token) {
        ByteArrayResource file = new ByteArrayResource(contenuto) {
            @Override
            public String getFilename() {
                return filename;
            }
        };
        HttpHeaders fileHeaders = new HttpHeaders();
        fileHeaders.setContentType(MediaType.parseMediaType(
                StringUtils.hasText(mimeType) ? mimeType : MediaType.IMAGE_JPEG_VALUE));
        MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
        if (parametri != null) {
            parametri.forEach((k, v) -> {
                if (v != null) {
                    form.add(k, v);
                }
            });
        }
        form.add("source", new HttpEntity<>(file, fileHeaders));
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);
        return esegui(HttpMethod.POST, uri(percorso, null), token, new HttpEntity<>(form, headers));
    }

    public JsonNode delete(String percorso, Map<String, String> parametri, String token) {
        return esegui(HttpMethod.DELETE, uri(percorso, parametri), token, null);
    }

    /** GET di un edge seguendo {@code paging.next} fino a {@code massimo} elementi. */
    public List<JsonNode> getTutti(String percorso, Map<String, String> parametri, String token, int massimo) {
        List<JsonNode> out = new ArrayList<>();
        JsonNode pagina = get(percorso, parametri, token);
        int pagine = 1;
        while (pagina != null) {
            for (JsonNode n : pagina.path("data")) {
                out.add(n);
                if (out.size() >= massimo) {
                    return out;
                }
            }
            String next = pagina.path("paging").path("next").asText(null);
            if (!StringUtils.hasText(next) || pagine >= MAX_PAGINE) {
                break;
            }
            pagina = esegui(HttpMethod.GET, URI.create(next), token, null);
            pagine++;
        }
        return out;
    }

    /** Massimo di richieste per chiamata batch ammesso da Meta. */
    static final int MAX_BATCH = 50;

    /**
     * Graph Batch API: piu GET in una sola chiamata HTTP (a blocchi di {@value #MAX_BATCH}, i blocchi in parallelo).
     * Ogni elemento ha il suo esito: il corpo JSON della risposta (che puo contenere {@code error}) oppure
     * {@code null} se Meta non l'ha eseguito (timeout interno del batch).
     *
     * @param percorsiRelativi es. {@code "123_456/insights?metric=post_impressions&period=lifetime"}
     */
    public List<JsonNode> batchGet(List<String> percorsiRelativi, String token) {
        List<List<String>> blocchi = new ArrayList<>();
        for (int i = 0; i < percorsiRelativi.size(); i += MAX_BATCH) {
            blocchi.add(percorsiRelativi.subList(i, Math.min(i + MAX_BATCH, percorsiRelativi.size())));
        }
        List<java.util.concurrent.CompletableFuture<List<JsonNode>>> futuri = blocchi.stream()
                .map(b -> java.util.concurrent.CompletableFuture.supplyAsync(() -> batchBlocco(b, token)))
                .toList();
        List<JsonNode> out = new ArrayList<>();
        for (var f : futuri) {
            try {
                out.addAll(f.join());
            } catch (java.util.concurrent.CompletionException e) {
                if (e.getCause() instanceof SocialIntegrazioneException se) {
                    throw se;
                }
                throw e;
            }
        }
        return out;
    }

    private List<JsonNode> batchBlocco(List<String> percorsi, String token) {
        com.fasterxml.jackson.databind.node.ArrayNode richieste = objectMapper.createArrayNode();
        for (String percorso : percorsi) {
            richieste.addObject().put("method", "GET")
                    .put("relative_url", percorso.startsWith("/") ? percorso.substring(1) : percorso);
        }
        Map<String, String> form = new LinkedHashMap<>();
        form.put("batch", richieste.toString());
        form.put("include_headers", "false");
        JsonNode risposta = post("", form, token);
        List<JsonNode> out = new ArrayList<>(percorsi.size());
        for (int i = 0; i < percorsi.size(); i++) {
            JsonNode voce = risposta.path(i);
            String corpo = voce.isObject() ? voce.path("body").asText(null) : null;
            if (corpo == null) {
                out.add(null);
                continue;
            }
            try {
                out.add(objectMapper.readTree(corpo));
            } catch (Exception e) {
                out.add(null);
            }
        }
        return out;
    }

    /** Le metriche dell'elenco che Meta non ha gia rifiutato per quel tipo di oggetto. */
    public List<String> metricheAncoraValide(String tipoOggetto, List<String> metriche) {
        return metriche.stream().filter(m -> !metricheNonSupportate.contains(tipoOggetto + "|" + m)).distinct().toList();
    }

    /** Codice di errore Graph dentro il corpo di una risposta batch (0 se non e un errore). */
    public static int codiceErrore(JsonNode corpo) {
        return corpo == null ? -1 : corpo.path("error").path("code").asInt(0);
    }

    /**
     * Insights tolleranti: chiede tutte le metriche insieme; se Meta rifiuta l'elenco (una metrica deprecata
     * basta a far fallire la chiamata intera) le riprova una per una e ricorda quelle non supportate.
     *
     * @param tipoOggetto chiave per ricordare le metriche rifiutate (es. "fb_page_day", "ig_media_REEL")
     * @return nome metrica → nodo dati restituito da Meta (solo le metriche disponibili)
     */
    public Map<String, JsonNode> metricheTolleranti(String oggettoId, String tipoOggetto, List<String> metriche,
                                                    Map<String, String> parametri, String token) {
        List<String> daChiedere = metriche.stream()
                .filter(m -> !metricheNonSupportate.contains(tipoOggetto + "|" + m))
                .distinct()
                .toList();
        Map<String, JsonNode> out = new LinkedHashMap<>();
        if (daChiedere.isEmpty()) {
            return out;
        }
        try {
            raccogliMetriche(chiediMetriche(oggettoId, daChiedere, parametri, token), out);
            return out;
        } catch (SocialIntegrazioneException e) {
            if (!isMetricaNonValida(e) || daChiedere.size() == 1) {
                if (isMetricaNonValida(e)) {
                    metricheNonSupportate.add(tipoOggetto + "|" + daChiedere.get(0));
                    return out;
                }
                throw e;
            }
        }
        for (String metrica : daChiedere) {
            try {
                raccogliMetriche(chiediMetriche(oggettoId, List.of(metrica), parametri, token), out);
            } catch (SocialIntegrazioneException e) {
                if (isMetricaNonValida(e)) {
                    logger.info("Social: metrica {} non supportata da Meta per {}, non la chiedo più", metrica, tipoOggetto);
                    metricheNonSupportate.add(tipoOggetto + "|" + metrica);
                } else {
                    throw e;
                }
            }
        }
        return out;
    }

    private JsonNode chiediMetriche(String oggettoId, List<String> metriche, Map<String, String> parametri, String token) {
        Map<String, String> p = new LinkedHashMap<>();
        if (parametri != null) {
            p.putAll(parametri);
        }
        p.put("metric", String.join(",", metriche));
        return get(oggettoId + "/insights", p, token);
    }

    private static void raccogliMetriche(JsonNode risposta, Map<String, JsonNode> out) {
        for (JsonNode n : risposta.path("data")) {
            String nome = n.path("name").asText(null);
            if (nome != null) {
                out.put(nome, n);
            }
        }
    }

    /** Metrica non valida, deprecata o non disponibile per quel tipo di oggetto. */
    static boolean isMetricaNonValida(SocialIntegrazioneException e) {
        return e.getCodiceMeta() == CODICE_PARAMETRO_NON_VALIDO || e.getCodiceMeta() == 10 && e.getSottocodiceMeta() == 2108006;
    }

    private URI uri(String percorso, Map<String, String> parametri) {
        String base = String.format("%s/%s/%s",
                trimSlashFinale(configService.getBaseUrl()), configService.getVersione(),
                percorso.startsWith("/") ? percorso.substring(1) : percorso);
        UriComponentsBuilder b = UriComponentsBuilder.fromUriString(base);
        if (parametri != null) {
            parametri.forEach((k, v) -> {
                if (v != null) {
                    b.queryParam(k, v);
                }
            });
        }
        // Niente espansione di template: le field expansion di Graph usano le graffe.
        return b.build().encode().toUri();
    }

    private JsonNode esegui(HttpMethod metodo, URI uri, String token, HttpEntity<?> corpo) {
        if (!configService.isUtilizzabile()) {
            throw new SocialIntegrazioneException(configService.motivoIndisponibilita());
        }
        if (!StringUtils.hasText(token)) {
            throw new SocialIntegrazioneException("Manca il token Meta per questa pagina.");
        }
        HttpHeaders headers = new HttpHeaders();
        if (corpo != null) {
            headers.putAll(corpo.getHeaders());
        }
        headers.setBearerAuth(token);
        HttpEntity<?> entity = new HttpEntity<>(corpo == null ? null : corpo.getBody(), headers);
        try {
            ResponseEntity<String> risposta = restTemplate.exchange(uri, metodo, entity, String.class);
            String body = risposta.getBody();
            return objectMapper.readTree(StringUtils.hasText(body) ? body : "{}");
        } catch (HttpStatusCodeException e) {
            throw traduciErrore(e.getStatusCode().value(), e.getResponseBodyAsString(), e);
        } catch (ResourceAccessException e) {
            logger.warn("Social: Meta non raggiungibile: {}", e.getMessage());
            throw new SocialIntegrazioneException("Meta non risponde in questo momento. Riprova tra poco.", e);
        } catch (RestClientException e) {
            logger.warn("Social: chiamata Graph fallita: {}", e.getMessage());
            throw new SocialIntegrazioneException("La chiamata a Meta non è riuscita. Riprova.", e);
        } catch (SocialIntegrazioneException e) {
            throw e;
        } catch (Exception e) {
            logger.warn("Social: risposta Graph non interpretabile: {}", e.getMessage());
            throw new SocialIntegrazioneException("Risposta non valida da Meta.", e);
        }
    }

    /** Errore Graph → messaggio in italiano, con codice e sottocodice originali. */
    SocialIntegrazioneException traduciErrore(int status, String corpo, Throwable causa) {
        int codice = 0;
        int sottocodice = 0;
        String dettaglio = null;
        try {
            JsonNode err = objectMapper.readTree(corpo == null || corpo.isBlank() ? "{}" : corpo).path("error");
            codice = err.path("code").asInt(0);
            sottocodice = err.path("error_subcode").asInt(0);
            dettaglio = testoOppure(err.path("error_user_msg").asText(null), err.path("message").asText(null));
        } catch (Exception ignored) {
            // corpo non JSON: resta il messaggio generico
        }
        logger.warn("Social: Graph ha risposto HTTP {} code={} subcode={}: {}", status, codice, sottocodice, dettaglio);
        return new SocialIntegrazioneException(messaggioErrore(codice, dettaglio), codice, sottocodice, causa);
    }

    static String messaggioErrore(int codice, String dettaglio) {
        String coda = StringUtils.hasText(dettaglio) ? " (" + dettaglio + ")" : "";
        return switch (codice) {
            case 190, 102 -> "Il token Meta è scaduto o è stato revocato: va rigenerato nel Business Manager." + coda;
            case 4, 17, 32, 613, 80001, 80002, 80005, 80006 ->
                    "Meta sta limitando le richieste di questa pagina. Riprova tra qualche minuto.";
            case 10, 200, 3 -> "Meta non concede questo permesso all'app del gestionale." + coda;
            case 368 -> "Meta ha bloccato temporaneamente l'azione per le sue regole anti-spam." + coda;
            case 1, 2 -> "Meta ha un problema temporaneo. Riprova tra poco.";
            default -> StringUtils.hasText(dettaglio)
                    ? "Meta ha rifiutato la richiesta: " + dettaglio
                    : "Meta ha rifiutato la richiesta.";
        };
    }

    private static String testoOppure(String a, String b) {
        return StringUtils.hasText(a) ? a : b;
    }

    private static String trimSlashFinale(String url) {
        if (url == null) {
            return "";
        }
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
