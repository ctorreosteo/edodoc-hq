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
 * qui gli altri upload, come le copertine dei corsi, restano al limite stretto.
 */
@Component
public class LimiteUploadFilter extends OncePerRequestFilter {

    static final long LIMITE_BYTES = 6L * 1024 * 1024;
    private static final String CASELLA = "/api/casella/";

    private final ObjectMapper objectMapper;

    public LimiteUploadFilter(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response,
                                    @NonNull FilterChain chain) throws ServletException, IOException {
        String tipo = request.getContentType();
        boolean multipart = tipo != null && tipo.toLowerCase().startsWith("multipart/");
        if (multipart && request.getContentLengthLong() > LIMITE_BYTES && !request.getServletPath().startsWith(CASELLA)) {
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
