package it.edodoc.hq.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import it.edodoc.hq.dto.ApiResponseDto;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Il limite multipart di Spring è uno solo e deve bastare agli allegati email (Gmail arriva a 25 MB):
 * qui gli altri upload, come le copertine dei corsi, restano al limite stretto. Gli allegati dei task arrivano a 20 MB.
 */
@Component
public class LimiteUploadFilter extends OncePerRequestFilter {

    static final long LIMITE_BYTES = 6L * 1024 * 1024;
    /** 20 MB di file più il margine della richiesta multipart. */
    static final long LIMITE_TASK_BYTES = 21L * 1024 * 1024;
    /** Allegati email: era il limite multipart di Spring (34 MB), che ora è più alto per i video del Planner. */
    static final long LIMITE_CASELLA_BYTES = 34L * 1024 * 1024;
    /** Video del Planner social: fino a 100 MB più l'anteprima. */
    static final long LIMITE_PLANNER_BYTES = 110L * 1024 * 1024;
    private static final String CASELLA = "/api/casella/";
    private static final String PLANNER_MEDIA = "/api/planner/media";
    private static final java.util.regex.Pattern ALLEGATI_TASK = java.util.regex.Pattern.compile("^/api/task/\\d+/allegati$");

    private final ObjectMapper objectMapper;

    public LimiteUploadFilter(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response,
                                    @NonNull FilterChain chain) throws ServletException, IOException {
        String tipo = request.getContentType();
        boolean multipart = tipo != null && tipo.toLowerCase().startsWith("multipart/");
        String percorso = request.getServletPath();
        long limite = ALLEGATI_TASK.matcher(percorso).matches() ? LIMITE_TASK_BYTES
                : percorso.startsWith(PLANNER_MEDIA) ? LIMITE_PLANNER_BYTES
                : percorso.startsWith(CASELLA) ? LIMITE_CASELLA_BYTES : LIMITE_BYTES;
        if (multipart && request.getContentLengthLong() > limite) {
            response.setStatus(HttpStatus.PAYLOAD_TOO_LARGE.value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding("UTF-8");
            String messaggio = "Il file è troppo grande";
            objectMapper.writeValue(response.getWriter(), ApiResponseDto.error(messaggio, messaggio));
            return;
        }
        chain.doFilter(request, response);
    }
}
