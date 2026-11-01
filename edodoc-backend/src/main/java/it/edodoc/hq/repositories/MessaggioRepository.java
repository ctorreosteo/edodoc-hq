package it.edodoc.hq.repositories;

import it.edodoc.hq.models.Messaggio;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MessaggioRepository extends JpaRepository<Messaggio, Long> {
    List<Messaggio> findByPazienteIdOrderByIdDesc(Long pazienteId, Pageable pagina);

    List<Messaggio> findByPazienteIdAndIdLessThanOrderByIdDesc(Long pazienteId, Long id, Pageable pagina);

    List<Messaggio> findByPazienteIdAndIdGreaterThanOrderByIdAsc(Long pazienteId, Long id, Pageable pagina);

    Optional<Messaggio> findByPazienteIdAndClientId(Long pazienteId, UUID clientId);

    long countByPazienteIdAndMittenteAndLettoIlIsNull(Long pazienteId, Messaggio.Mittente mittente);

    /** Ultimo messaggio di ogni conversazione, dalla più recente. */
    @Query("""
            select m from Messaggio m join fetch m.paziente p
            where p.attivo = true
              and m.id in (select max(x.id) from Messaggio x group by x.paziente.id)
            order by m.id desc
            """)
    List<Messaggio> findUltimi();

    @Query("""
            select m.paziente.id, count(m) from Messaggio m
            where m.mittente = :mittente and m.lettoIl is null
            group by m.paziente.id
            """)
    List<Object[]> contaNonLetti(@Param("mittente") Messaggio.Mittente mittente);

    @Modifying
    @Query("""
            update Messaggio m set m.lettoIl = :ora
            where m.paziente.id = :pazienteId and m.mittente = :mittente and m.lettoIl is null
            """)
    void segnaLetti(@Param("pazienteId") Long pazienteId, @Param("mittente") Messaggio.Mittente mittente,
                    @Param("ora") LocalDateTime ora);
}
