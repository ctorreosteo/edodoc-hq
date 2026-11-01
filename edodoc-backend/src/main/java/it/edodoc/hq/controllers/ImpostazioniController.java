package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.ApiResponseDto;
import it.edodoc.hq.dto.ImpostazioniDto;
import it.edodoc.hq.models.Config;
import it.edodoc.hq.services.CloudflareStreamService;
import it.edodoc.hq.services.ConfigService;
import it.edodoc.hq.services.GmailService;
import it.edodoc.hq.services.GoogleCalendarService;
import it.edodoc.hq.services.GoogleClients;
import it.edodoc.hq.services.PushService;
import it.edodoc.hq.services.TesseraSanitariaService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/impostazioni")
public class ImpostazioniController {

    private final ConfigService configService;
    private final GoogleClients googleClients;
    private final GoogleCalendarService calendarService;
    private final GmailService gmailService;
    private final TesseraSanitariaService tesseraService;
    private final CloudflareStreamService cloudflareService;
    private final PushService pushService;

    public ImpostazioniController(ConfigService configService, GoogleClients googleClients,
                                  GoogleCalendarService calendarService, GmailService gmailService,
                                  TesseraSanitariaService tesseraService, CloudflareStreamService cloudflareService,
                                  PushService pushService) {
        this.configService = configService;
        this.googleClients = googleClients;
        this.calendarService = calendarService;
        this.gmailService = gmailService;
        this.tesseraService = tesseraService;
        this.cloudflareService = cloudflareService;
        this.pushService = pushService;
    }

    @GetMapping
    public ApiResponseDto<ImpostazioniDto.Panoramica> panoramica() {
        boolean google = googleClients.isConfigurato();
        String notaGoogle = google ? "Account collegato" : "Mancano il file del Service Account o l'account del dottore";
        List<ImpostazioniDto.Integrazione> integrazioni = List.of(
                new ImpostazioniDto.Integrazione(ConfigService.CALENDAR_ENABLED, "Google Calendar e Meet", calendarService.isAttivo(), google, notaGoogle),
                new ImpostazioniDto.Integrazione(ConfigService.GMAIL_ENABLED, "Invio email da Gmail", gmailService.isAttivo(), google, notaGoogle),
                new ImpostazioniDto.Integrazione(ConfigService.TESSERA_ENABLED, "Sistema Tessera Sanitaria", tesseraService.isAttiva(), false, "Servono credenziali e certificato del Sistema TS"),
                new ImpostazioniDto.Integrazione(ConfigService.CLOUDFLARE_STREAM_ENABLED, "Video dei corsi su Cloudflare Stream", cloudflareService.isAttivo(), cloudflareService.isConfigurato(),
                        cloudflareService.isConfigurato() ? "Account collegato" : "Mancano CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_STREAM_API_TOKEN"),
                new ImpostazioniDto.Integrazione(ConfigService.PUSH_ENABLED, "Notifiche push dell'app", pushService.isAttivo(), pushService.isConfigurato(),
                        pushService.isConfigurato() ? "Avvisi di nuovi messaggi e feedback, senza dati del paziente" : "Mancano le credenziali di Apple (APNS_*) o Google (FCM_CREDENTIALS_PATH)"));
        return ApiResponseDto.success(new ImpostazioniDto.Panoramica(
                configService.modificabili().stream().map(ImpostazioniController::voce).toList(), integrazioni));
    }

    @PutMapping
    public ApiResponseDto<ImpostazioniDto.Voce> aggiorna(@Valid @RequestBody ImpostazioniDto.Aggiorna richiesta) {
        return ApiResponseDto.success("Impostazione salvata", voce(configService.aggiorna(richiesta.chiave(), richiesta.valore())));
    }

    private static ImpostazioniDto.Voce voce(Config c) {
        return new ImpostazioniDto.Voce(c.getChiave(), c.getValore(), c.getDescrizione());
    }
}
