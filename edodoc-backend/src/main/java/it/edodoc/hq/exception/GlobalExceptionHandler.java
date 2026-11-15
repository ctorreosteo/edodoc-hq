package it.edodoc.hq.exception;

import it.edodoc.hq.dto.ApiResponseDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.stream.Collectors;

/** Messaggi sempre leggibili per il frontend; il dettaglio tecnico resta nei log. */
@ControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger logger = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private static ResponseEntity<ApiResponseDto<Object>> risposta(HttpStatus status, String titolo, String dettaglio) {
        return ResponseEntity.status(status).body(ApiResponseDto.error(titolo, dettaglio));
    }

    @ExceptionHandler(RisorsaNonTrovataException.class)
    public ResponseEntity<ApiResponseDto<Object>> nonTrovata(RisorsaNonTrovataException e) {
        return risposta(HttpStatus.NOT_FOUND, e.getMessage(), e.getMessage());
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiResponseDto<Object>> nessunaRisorsa(NoResourceFoundException e) {
        return risposta(HttpStatus.NOT_FOUND, "Risorsa non trovata", "La risorsa richiesta non esiste.");
    }

    @ExceptionHandler({ConflittoException.class, IntegrazioneDisattivataException.class})
    public ResponseEntity<ApiResponseDto<Object>> conflitto(RuntimeException e) {
        return risposta(HttpStatus.CONFLICT, e.getMessage(), e.getMessage());
    }

    @ExceptionHandler(GoogleRifiutoException.class)
    public ResponseEntity<ApiResponseDto<Object>> rifiutoGoogle(GoogleRifiutoException e) {
        return risposta(e.getStato(), e.getMessage(), e.getMessage());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiResponseDto<Object>> nonValido(IllegalArgumentException e) {
        return risposta(HttpStatus.BAD_REQUEST, e.getMessage(), e.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponseDto<Object>> validazione(MethodArgumentNotValidException e) {
        String dettaglio = e.getBindingResult().getFieldErrors().stream()
                .map(f -> f.getDefaultMessage())
                .distinct()
                .collect(Collectors.joining(" · "));
        return risposta(HttpStatus.BAD_REQUEST, dettaglio, dettaglio);
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class,
            MissingServletRequestParameterException.class, MissingServletRequestPartException.class, MultipartException.class})
    public ResponseEntity<ApiResponseDto<Object>> formato(Exception e) {
        return risposta(HttpStatus.BAD_REQUEST, "Dati non validi", "Controlla i valori inseriti.");
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiResponseDto<Object>> fileTroppoGrande(MaxUploadSizeExceededException e) {
        return risposta(HttpStatus.PAYLOAD_TOO_LARGE, "Il file è troppo grande (massimo 5 MB)", "Il file è troppo grande (massimo 5 MB)");
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiResponseDto<Object>> integrita(DataIntegrityViolationException e) {
        logger.warn("Vincolo DB violato: {}", e.getMostSpecificCause().getMessage());
        return risposta(HttpStatus.CONFLICT, "Dato già presente o non coerente", "Il dato è in conflitto con uno esistente.");
    }

    /** Errori con stato esplicito (Email Marketing): il motivo è già scritto per il dottore. */
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ApiResponseDto<Object>> conStato(ResponseStatusException e) {
        HttpStatus status = HttpStatus.resolve(e.getStatusCode().value());
        String motivo = e.getReason() != null ? e.getReason() : "Richiesta non valida";
        return risposta(status != null ? status : HttpStatus.BAD_REQUEST, motivo, motivo);
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponseDto<Object>> negato(AccessDeniedException e) {
        return risposta(HttpStatus.FORBIDDEN, "Operazione non consentita", "Operazione non consentita");
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponseDto<Object>> generico(Exception e) {
        logger.error("Errore non gestito", e);
        return risposta(HttpStatus.INTERNAL_SERVER_ERROR, "Errore interno", "Si è verificato un errore. Riprova.");
    }
}
