package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.ApiResponseDto;
import it.edodoc.hq.dto.EmailDto;
import it.edodoc.hq.services.EmailService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;

@RestController
@RequestMapping("/api/email")
public class EmailController {

    private final EmailService emailService;

    public EmailController(EmailService emailService) {
        this.emailService = emailService;
    }

    @PostMapping("/bozza")
    public ApiResponseDto<EmailDto.Bozza> bozza(@Valid @RequestBody EmailDto.Richiesta richiesta) {
        return ApiResponseDto.success(emailService.bozza(richiesta));
    }

    @PostMapping("/invia")
    public ApiResponseDto<Void> invia(@Valid @RequestBody EmailDto.Invia richiesta) throws IOException {
        emailService.invia(richiesta);
        return ApiResponseDto.success("Email inviata", null);
    }
}
