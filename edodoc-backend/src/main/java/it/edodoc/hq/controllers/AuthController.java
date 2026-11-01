package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.ApiResponseDto;
import it.edodoc.hq.dto.AuthDto;
import it.edodoc.hq.security.UtenteDetails;
import it.edodoc.hq.services.AuthService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public ApiResponseDto<AuthDto.Sessione> login(@Valid @RequestBody AuthDto.Login richiesta) {
        return ApiResponseDto.success(authService.login(richiesta));
    }

    @PostMapping("/rinnova")
    public ApiResponseDto<AuthDto.Sessione> rinnova(@Valid @RequestBody AuthDto.Rinnova richiesta) {
        return ApiResponseDto.success(authService.rinnova(richiesta));
    }

    @PostMapping("/logout")
    public ApiResponseDto<Void> logout(@Valid @RequestBody AuthDto.Logout richiesta) {
        authService.logout(richiesta);
        return ApiResponseDto.success(null);
    }

    @PostMapping("/dispositivi")
    public ApiResponseDto<Void> registraDispositivo(@AuthenticationPrincipal UtenteDetails utente,
                                                    @Valid @RequestBody AuthDto.RegistraDispositivo richiesta) {
        authService.registraDispositivo(utente.getId(), richiesta);
        return ApiResponseDto.success(null);
    }

    @GetMapping("/me")
    public ApiResponseDto<AuthDto.Utente> me(@AuthenticationPrincipal UtenteDetails utente) {
        return ApiResponseDto.success(authService.profilo(utente.getId()));
    }

    @PostMapping("/cambia-password")
    public ApiResponseDto<Void> cambiaPassword(@AuthenticationPrincipal UtenteDetails utente,
                                               @Valid @RequestBody AuthDto.CambiaPassword richiesta) {
        authService.cambiaPassword(utente.getId(), richiesta);
        return ApiResponseDto.success("Password aggiornata", null);
    }

    @PostMapping("/app/imposta-password")
    public ApiResponseDto<AuthDto.Sessione> impostaPassword(@Valid @RequestBody AuthDto.ImpostaPassword richiesta) {
        return ApiResponseDto.success(authService.impostaPasswordApp(richiesta));
    }
}
