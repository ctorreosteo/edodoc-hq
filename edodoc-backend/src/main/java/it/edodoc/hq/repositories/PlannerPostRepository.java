package it.edodoc.hq.repositories;

import it.edodoc.hq.models.PlannerPost;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

public interface PlannerPostRepository extends JpaRepository<PlannerPost, Long> {

    /** Calendario: i post con un'ora nel periodo, in qualsiasi stato (anche le idee con un giorno). */
    @Query("SELECT p FROM PlannerPost p WHERE p.brandId = :brandId AND p.programmatoAlle >= :dal AND p.programmatoAlle < :al "
            + "ORDER BY p.programmatoAlle, p.id")
    List<PlannerPost> nelPeriodo(@Param("brandId") Long brandId, @Param("dal") LocalDateTime dal, @Param("al") LocalDateTime al);

    List<PlannerPost> findByBrandIdAndStatoInOrderByPosizioneAscIdDesc(Long brandId, Collection<String> stati);

    @Query("SELECT p FROM PlannerPost p WHERE p.brandId = :brandId AND p.stato IN :stati AND p.pubblicatoIl >= :dal "
            + "ORDER BY p.pubblicatoIl DESC")
    List<PlannerPost> pubblicatiDal(@Param("brandId") Long brandId, @Param("stati") Collection<String> stati,
                                    @Param("dal") LocalDateTime dal);

    boolean existsByBrandId(Long brandId);

    @Query("SELECT p.id FROM PlannerPost p WHERE p.stato = 'PROGRAMMATO' AND p.programmatoAlle <= :adesso ORDER BY p.programmatoAlle")
    List<Long> idProgrammatiScaduti(@Param("adesso") LocalDateTime adesso);

    /**
     * 1 se questa istanza l'ha passato a IN_PUBBLICAZIONE, 0 se qualcun altro l'ha già preso o non è più programmato.
     * Svuota il contesto JPA: con open-in-view la richiesta che chiama «Pubblica ora» rilegge poi il post aggiornato.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("UPDATE PlannerPost p SET p.stato = 'IN_PUBBLICAZIONE', p.presaInCaricoIl = :adesso "
            + "WHERE p.id = :id AND p.stato = 'PROGRAMMATO'")
    int prendiInCarico(@Param("id") Long id, @Param("adesso") LocalDateTime adesso);

    @Query("SELECT p.id FROM PlannerPost p WHERE p.stato = 'IN_PUBBLICAZIONE' AND p.presaInCaricoIl < :limite")
    List<Long> idBloccati(@Param("limite") LocalDateTime limite);

    /** Orari già occupati da qualcosa che uscirà (per la coda). */
    @Query("SELECT p.programmatoAlle FROM PlannerPost p WHERE p.brandId = :brandId AND p.programmatoAlle >= :dal "
            + "AND p.programmatoAlle < :al AND p.stato NOT IN ('IDEA', 'ERRORE')")
    List<LocalDateTime> orariOccupati(@Param("brandId") Long brandId, @Param("dal") LocalDateTime dal, @Param("al") LocalDateTime al);

    @Query("SELECT p.stato, COUNT(p) FROM PlannerPost p WHERE p.brandId = :brandId GROUP BY p.stato")
    List<Object[]> contaPerStato(@Param("brandId") Long brandId);

    @Query("SELECT COUNT(p) FROM PlannerPost p WHERE p.brandId = :brandId AND p.stato = 'PROGRAMMATO' "
            + "AND p.programmatoAlle >= :dal AND p.programmatoAlle < :al")
    long programmatiNelPeriodo(@Param("brandId") Long brandId, @Param("dal") LocalDateTime dal, @Param("al") LocalDateTime al);

    @Query("SELECT MIN(p.programmatoAlle) FROM PlannerPost p WHERE p.brandId = :brandId AND p.stato = 'PROGRAMMATO' "
            + "AND p.programmatoAlle >= :dal")
    LocalDateTime prossimoProgrammato(@Param("brandId") Long brandId, @Param("dal") LocalDateTime dal);

    @Query("SELECT COALESCE(MIN(p.posizione), 0) FROM PlannerPost p WHERE p.brandId = :brandId AND p.stato = :stato")
    int posizioneMinima(@Param("brandId") Long brandId, @Param("stato") String stato);

    @Query("SELECT p FROM PlannerPost p WHERE p.brandId = :brandId AND (LOWER(COALESCE(p.titolo, '')) LIKE :q "
            + "OR LOWER(COALESCE(p.testo, '')) LIKE :q OR LOWER(COALESCE(p.note, '')) LIKE :q) ORDER BY p.aggiornatoIl DESC")
    List<PlannerPost> cerca(@Param("brandId") Long brandId, @Param("q") String q, org.springframework.data.domain.Pageable pageable);

    @Query("SELECT COUNT(c) FROM PlannerPostCanale c, PlannerPost p WHERE c.postId = p.id AND p.brandId = :brandId "
            + "AND c.stato = :stato")
    long canaliInStato(@Param("brandId") Long brandId, @Param("stato") String stato);
}
