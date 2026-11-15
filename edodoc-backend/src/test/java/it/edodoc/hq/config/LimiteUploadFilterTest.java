package it.edodoc.hq.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;

class LimiteUploadFilterTest {

    private static MockHttpServletResponse esegui(String percorso, int byteDichiarati) throws Exception {
        MockHttpServletRequest richiesta = new MockHttpServletRequest("POST", percorso);
        richiesta.setServletPath(percorso);
        richiesta.setContentType("multipart/form-data; boundary=x");
        richiesta.setContent(new byte[byteDichiarati]);
        MockHttpServletResponse risposta = new MockHttpServletResponse();
        new LimiteUploadFilter(new ObjectMapper()).doFilter(richiesta, risposta, new MockFilterChain());
        return risposta;
    }

    @Test
    void copertinaTroppoGrande_vieneRifiutata() throws Exception {
        assertThat(esegui("/api/corsi/1/copertina", (int) LimiteUploadFilter.LIMITE_BYTES + 1).getStatus()).isEqualTo(413);
    }

    @Test
    void allegatoDellaCasella_passa() throws Exception {
        assertThat(esegui("/api/casella/invia", (int) LimiteUploadFilter.LIMITE_BYTES + 1).getStatus()).isEqualTo(200);
    }

    @Test
    void uploadPiccolo_passa() throws Exception {
        assertThat(esegui("/api/corsi/1/copertina", 1024).getStatus()).isEqualTo(200);
    }

    @Test
    void allegatoDelTask_arrivaA20Mega() throws Exception {
        assertThat(esegui("/api/task/7/allegati", (int) LimiteUploadFilter.LIMITE_BYTES + 1).getStatus()).isEqualTo(200);
        assertThat(esegui("/api/task/7/allegati", (int) LimiteUploadFilter.LIMITE_TASK_BYTES + 1).getStatus()).isEqualTo(413);
    }

    @Test
    void videoDelPlanner_arrivaA100Mega_eLaCasellaResta34() throws Exception {
        assertThat(esegui("/api/planner/media", (int) LimiteUploadFilter.LIMITE_TASK_BYTES + 1).getStatus()).isEqualTo(200);
        assertThat(esegui("/api/casella/invia", (int) LimiteUploadFilter.LIMITE_CASELLA_BYTES + 1).getStatus()).isEqualTo(413);
    }
}
