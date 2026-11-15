package it.edodoc.hq.jobs;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;

/**
 * Lock di cluster per i job: su Cloud Run possono girare più istanze del backend e ognuna eseguirebbe lo stesso
 * {@code @Scheduled}. Usa un advisory lock di PostgreSQL tenuto su una connessione dedicata per tutta la durata del
 * lavoro: chi non lo ottiene salta il giro. Se l'istanza muore, il lock cade con la connessione.
 * Stessa interfaccia del lock ShedLock di Mobilitas; le durate sono accettate per compatibilità e non servono.
 */
@Component
public class ScheduledJobClusterLock {

    private static final Logger logger = LoggerFactory.getLogger(ScheduledJobClusterLock.class);
    private static final int MAX_LOCK_NAME_LENGTH = 64;

    private final DataSource dataSource;

    public ScheduledJobClusterLock(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    public static String name(String jobName) {
        if (jobName == null || jobName.isBlank()) {
            throw new IllegalArgumentException("lock name obbligatorio");
        }
        return jobName.length() <= MAX_LOCK_NAME_LENGTH ? jobName : jobName.substring(0, MAX_LOCK_NAME_LENGTH);
    }

    /** Esegue {@code task} solo se questa istanza ottiene il lock; false se lo tiene già un'altra. */
    public boolean runIfAcquired(String lockName, Runnable task) {
        String nome = name(lockName);
        try (Connection connessione = dataSource.getConnection()) {
            if (!prova(connessione, "SELECT pg_try_advisory_lock(hashtext(?))", nome)) {
                logger.debug("[SCHEDULER LOCK] Salto {}: lo tiene un'altra istanza", nome);
                return false;
            }
            try {
                task.run();
                return true;
            } finally {
                prova(connessione, "SELECT pg_advisory_unlock(hashtext(?))", nome);
            }
        } catch (SQLException e) {
            logger.warn("[SCHEDULER LOCK] {} non acquisito: {}", nome, e.getMessage());
            return false;
        }
    }

    public boolean runIfAcquired(String lockName, Duration lockAtMostFor, Duration lockAtLeastFor, Runnable task) {
        return runIfAcquired(lockName, task);
    }

    private static boolean prova(Connection connessione, String sql, String nome) throws SQLException {
        try (PreparedStatement st = connessione.prepareStatement(sql)) {
            st.setString(1, nome);
            try (ResultSet rs = st.executeQuery()) {
                return rs.next() && rs.getBoolean(1);
            }
        }
    }
}
