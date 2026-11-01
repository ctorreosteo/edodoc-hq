package it.edodoc.hq.repositories;

import it.edodoc.hq.models.CheckSettimanale;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface CheckSettimanaleRepository extends JpaRepository<CheckSettimanale, Long> {
    Optional<CheckSettimanale> findByPazienteIdAndSettimana(Long pazienteId, LocalDate settimana);

    List<CheckSettimanale> findByPazienteIdOrderBySettimanaDesc(Long pazienteId);

    Optional<CheckSettimanale> findByIdAndPazienteId(Long id, Long pazienteId);

    @Query("""
            select count(c) from CheckSettimanale c
            where c.paziente.id = :pazienteId and c.feedbackLettoIl is null
              and (c.feedback is not null or c.feedbackAudioId is not null)
            """)
    long contaFeedbackDaLeggere(@Param("pazienteId") Long pazienteId);

    @Query("select c from CheckSettimanale c join fetch c.paziente where c.settimana = :settimana")
    List<CheckSettimanale> findDellaSettimana(@Param("settimana") LocalDate settimana);

    long countBySettimana(LocalDate settimana);

    /** Ultimo peso dichiarato prima di questa settimana: è il riferimento del segnale "peso fermo". */
    @Query("""
            select c from CheckSettimanale c
            where c.paziente.id = :pazienteId and c.settimana < :settimana and c.pesoKg is not null
            order by c.settimana desc
            limit 1
            """)
    Optional<CheckSettimanale> findPrecedenteConPeso(@Param("pazienteId") Long pazienteId, @Param("settimana") LocalDate settimana);

    @Query("""
            select c from CheckSettimanale c
            where c.settimana >= :da
            order by c.settimana
            """)
    List<CheckSettimanale> findDalla(@Param("da") LocalDate da);
}
