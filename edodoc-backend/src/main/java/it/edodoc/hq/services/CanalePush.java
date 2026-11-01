package it.edodoc.hq.services;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

/** Il servizio che recapita le notifiche a un sistema operativo: Apple per iOS, Google per Android. */
interface CanalePush {

    /** TOKEN_NON_VALIDO: l'app non c'è più su quel telefono e il token si può cancellare. */
    enum Esito { INVIATA, TOKEN_NON_VALIDO, NON_INVIATA }

    boolean isConfigurato();

    Esito invia(String token, Notifica notifica) throws IOException, InterruptedException;

    record RispostaHttp(int stato, String corpo) {
    }

    /** La sola chiamata che serve ai canali: nei test si sostituisce senza aprire connessioni. */
    @FunctionalInterface
    interface PostHttp {
        RispostaHttp post(String url, Map<String, String> intestazioni, String corpo) throws IOException, InterruptedException;

        /** Apple accetta solo HTTP/2: java.net.http lo negozia da solo e riusa la connessione. */
        static PostHttp reale() {
            HttpClient client = HttpClient.newBuilder().version(HttpClient.Version.HTTP_2)
                    .connectTimeout(Duration.ofSeconds(10)).build();
            return (url, intestazioni, corpo) -> {
                HttpRequest.Builder richiesta = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(30))
                        .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(corpo));
                intestazioni.forEach(richiesta::header);
                HttpResponse<String> risposta = client.send(richiesta.build(), HttpResponse.BodyHandlers.ofString());
                return new RispostaHttp(risposta.statusCode(), risposta.body());
            };
        }
    }
}
