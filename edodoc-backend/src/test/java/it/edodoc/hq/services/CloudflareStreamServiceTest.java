package it.edodoc.hq.services;

import it.edodoc.hq.exception.IntegrazioneDisattivataException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class CloudflareStreamServiceTest {

    private static final String BASE = "https://cf.test/accounts/acc/stream";

    private final ConfigService config = mock(ConfigService.class);
    private MockRestServiceServer server;
    private CloudflareStreamService service;

    @BeforeEach
    void prepara() {
        when(config.isAttivo(ConfigService.CLOUDFLARE_STREAM_ENABLED)).thenReturn(true);
        RestClient.Builder builder = RestClient.builder().baseUrl("https://cf.test");
        server = MockRestServiceServer.bindTo(builder).build();
        service = new CloudflareStreamService(config, "acc", "segreto", builder);
    }

    @Test
    void upload_nasceConFirmaObbligatoria() {
        HttpHeaders risposta = new HttpHeaders();
        risposta.set(HttpHeaders.LOCATION, "https://upload.test/tus/abc");
        risposta.set("stream-media-id", "abc");
        server.expect(requestTo(BASE + "?direct_user=true"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer segreto"))
                .andExpect(header("Upload-Length", "1000"))
                .andExpect(header("Upload-Metadata", "maxDurationSeconds MTQ0MDA=,requiresignedurls,name UGFzdGk="))
                .andRespond(withStatus(HttpStatus.CREATED).headers(risposta));

        assertThat(service.creaUpload(1000, "Pasti")).isEqualTo(new CloudflareStreamService.UploadTus("abc", "https://upload.test/tus/abc"));
        server.verify();
    }

    @Test
    void riproduzione_ilTokenSostituisceLIdNegliIndirizzi() {
        server.expect(requestTo(BASE + "/abc")).andRespond(withSuccess(
                "{\"result\":{\"playback\":{\"hls\":\"https://customer-x.cloudflarestream.com/abc/manifest/video.m3u8\"}}}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(BASE + "/abc/token")).andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess("{\"result\":{\"token\":\"firmato\"}}", MediaType.APPLICATION_JSON));

        CloudflareStreamService.Riproduzione r = service.riproduzione("abc");

        assertThat(r.iframeUrl()).isEqualTo("https://customer-x.cloudflarestream.com/firmato/iframe");
        assertThat(r.hlsUrl()).isEqualTo("https://customer-x.cloudflarestream.com/firmato/manifest/video.m3u8");
    }

    @Test
    void leggi_percentualeInStringa() {
        server.expect(requestTo(BASE + "/abc")).andRespond(withSuccess(
                "{\"result\":{\"readyToStream\":false,\"duration\":-1,\"status\":{\"state\":\"inprogress\",\"pctComplete\":\"42.6\"}}}", MediaType.APPLICATION_JSON));

        assertThat(service.leggi("abc")).isEqualTo(new CloudflareStreamService.InfoVideo(false, "inprogress", 43, null, null));
    }

    @Test
    void elimina_unErroreNonBloccaIlDottore() {
        server.expect(requestTo(BASE + "/abc")).andExpect(method(HttpMethod.DELETE)).andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));
        service.elimina("abc");
        server.verify();
    }

    @Test
    void spenta_nonChiamaCloudflareESpiegaPerche() {
        when(config.isAttivo(ConfigService.CLOUDFLARE_STREAM_ENABLED)).thenReturn(false);
        assertThatThrownBy(() -> service.creaUpload(1000, "Pasti"))
                .isInstanceOf(IntegrazioneDisattivataException.class)
                .hasMessageContaining("Impostazioni");
        server.verify();
    }
}
