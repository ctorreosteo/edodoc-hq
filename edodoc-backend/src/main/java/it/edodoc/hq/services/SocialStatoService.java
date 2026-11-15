package it.edodoc.hq.services;

import it.edodoc.hq.dto.SocialDto;
import it.edodoc.hq.exception.SocialIntegrazioneException;
import org.springframework.stereotype.Service;

import java.util.List;

/** Stato della pagina Meta: se funziona, perche no, e quali pagine si possono gestire. */
@Service
public class SocialStatoService {

    private final SocialConfigService configService;
    private final SocialAccountService accountService;
    private final SocialAiService aiService;

    public SocialStatoService(SocialConfigService configService, SocialAccountService accountService, SocialAiService aiService) {
        this.configService = configService;
        this.accountService = accountService;
        this.aiService = aiService;
    }

    public SocialDto.Stato stato() {
        boolean ai = aiService.isDisponibile();
        boolean webhook = configService.isWebhookConfigurato();
        int intervallo = configService.intervalloAggiornamentoSecondi();
        if (!configService.isUtilizzabile()) {
            return new SocialDto.Stato(false, configService.motivoIndisponibilita(), ai, webhook, intervallo, List.of());
        }
        try {
            List<SocialDto.Account> account = accountService.account().stream().map(SocialAccountService.AccountInterno::dto).toList();
            if (account.isEmpty()) {
                return new SocialDto.Stato(false,
                        "Il token Meta non gestisce nessuna pagina Facebook: assegna le pagine al System User nel Business Manager.",
                        ai, webhook, intervallo, List.of());
            }
            return new SocialDto.Stato(true, "", ai, webhook, intervallo, account);
        } catch (SocialIntegrazioneException e) {
            return new SocialDto.Stato(false, e.getMessage(), ai, webhook, intervallo, List.of());
        }
    }
}
