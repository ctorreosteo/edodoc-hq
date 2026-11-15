package it.edodoc.hq.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Thread dell'Email Marketing: il worker di invio (ciclo continuo su un thread suo) e le esecuzioni manuali dei job
 * delle automazioni, una alla volta. Thread demone: non trattengono lo spegnimento.
 */
@Configuration
public class MailingExecutorConfig {

    @Bean(name = "mailingInvioExecutor")
    public ExecutorService mailingInvioExecutor() {
        return Executors.newSingleThreadExecutor(r -> demone(r, "mailing-invio"));
    }

    @Bean(name = "mailingJobExecutor")
    public ExecutorService mailingJobExecutor() {
        return Executors.newSingleThreadExecutor(r -> demone(r, "mailing-job"));
    }

    private static Thread demone(Runnable r, String nome) {
        Thread t = new Thread(r, nome);
        t.setDaemon(true);
        return t;
    }
}
