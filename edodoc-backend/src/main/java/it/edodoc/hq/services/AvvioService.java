package it.edodoc.hq.services;

import it.edodoc.hq.models.Utente;
import it.edodoc.hq.repositories.UtenteRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Locale;

/** Primo avvio: senza un utente il gestionale non è raggiungibile. */
@Configuration
public class AvvioService {

    private static final Logger logger = LoggerFactory.getLogger(AvvioService.class);

    @Bean
    ApplicationRunner creaUtenteDottore(UtenteRepository utenteRepository, PasswordEncoder passwordEncoder,
                                        @Value("${app.admin.email:}") String email,
                                        @Value("${app.admin.password:}") String password,
                                        DemoDataService demo, AccountProvaService accountProva,
                                        @Value("${app.init.demo-enabled:false}") boolean demoAttivo) {
        return args -> {
            if (utenteRepository.count() == 0) {
                if (email.isBlank() || password.isBlank()) {
                    logger.warn("Nessun utente: imposta ADMIN_EMAIL e ADMIN_PASSWORD per il primo accesso");
                } else {
                    Utente dottore = new Utente();
                    dottore.setUsername(email.trim().toLowerCase(Locale.ROOT));
                    dottore.setPasswordHash(passwordEncoder.encode(password));
                    dottore.setNome("Edoardo");
                    dottore.setCognome("Bo");
                    dottore.setRuolo(Utente.Ruolo.ADMIN);
                    utenteRepository.save(dottore);
                    logger.info("Creato l'utente del dottore");
                }
            }
            if (demoAttivo) {
                demo.caricaSeVuoto();
            }
            accountProva.allinea();
        };
    }
}
