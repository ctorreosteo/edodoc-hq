package it.edodoc.hq.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Thread della pagina Meta: il webhook risponde 200 subito a Meta e fa il lavoro (leggero) fuori dal thread Tomcat.
 * Thread demone: non trattiene lo spegnimento.
 */
@Configuration
public class SocialExecutorConfig {

    @Bean(name = "socialWebhookExecutor", destroyMethod = "shutdown")
    public ExecutorService socialWebhookExecutor() {
        return Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "social-webhook");
            t.setDaemon(true);
            return t;
        });
    }
}
