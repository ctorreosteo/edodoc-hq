package it.edodoc.hq.repositories;

import it.edodoc.hq.models.SocialPubblicazione;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface SocialPubblicazioneRepository extends JpaRepository<SocialPubblicazione, Long> {

    List<SocialPubblicazione> findByPageIdOrderByCreatoIlDesc(String pageId, Pageable pageable);

    @Query("SELECT p.id FROM SocialPubblicazione p WHERE p.stato = 'PROGRAMMATA' AND p.programmataAlle <= :adesso ORDER BY p.programmataAlle")
    List<Long> idProgrammateScadute(@Param("adesso") LocalDateTime adesso);

    /** Prende in carico una programmata: 1 se questa istanza l'ha passata a IN_CORSO, 0 se qualcun altro l'ha gia presa. */
    @Modifying
    @Query("UPDATE SocialPubblicazione p SET p.stato = 'IN_CORSO' WHERE p.id = :id AND p.stato = 'PROGRAMMATA'")
    int prendiInCarico(@Param("id") Long id);
}
