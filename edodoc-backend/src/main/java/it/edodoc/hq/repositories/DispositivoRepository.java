package it.edodoc.hq.repositories;

import it.edodoc.hq.models.Dispositivo;
import it.edodoc.hq.models.Utente;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface DispositivoRepository extends JpaRepository<Dispositivo, Long> {
    Optional<Dispositivo> findByPushToken(String pushToken);

    void deleteByUtenteId(Long utenteId);

    void deleteByUtenteIdAndPushToken(Long utenteId, String pushToken);

    @Query("select d from Dispositivo d where d.utente.paziente.id = :pazienteId and d.utente.attivo = true")
    List<Dispositivo> findDelPaziente(@Param("pazienteId") Long pazienteId);

    @Query("select d from Dispositivo d where d.utente.ruolo = :ruolo and d.utente.attivo = true")
    List<Dispositivo> findPerRuolo(@Param("ruolo") Utente.Ruolo ruolo);

    @Transactional
    @Modifying
    @Query("delete from Dispositivo d where d.pushToken in :token")
    void eliminaToken(@Param("token") Collection<String> token);
}
