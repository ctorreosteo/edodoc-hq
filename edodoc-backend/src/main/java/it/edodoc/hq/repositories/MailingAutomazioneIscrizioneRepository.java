package it.edodoc.hq.repositories;

import it.edodoc.hq.models.MailingAutomazioneIscrizione;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface MailingAutomazioneIscrizioneRepository extends JpaRepository<MailingAutomazioneIscrizione, Long> {

    List<MailingAutomazioneIscrizione> findByAutomazioneId(Long automazioneId);

    List<MailingAutomazioneIscrizione> findByContattoId(Long contattoId);

    Optional<MailingAutomazioneIscrizione> findFirstByAutomazioneIdAndContattoIdOrderByIniziataIlDesc(
            Long automazioneId, Long contattoId);

    boolean existsByAutomazioneIdAndContattoId(Long automazioneId, Long contattoId);

    long countByAutomazioneIdAndStato(Long automazioneId, MailingAutomazioneIscrizione.Stato stato);

    List<MailingAutomazioneIscrizione> findByContattoIdAndStatoIn(Long contattoId,
                                                                  Collection<MailingAutomazioneIscrizione.Stato> stati);

    List<MailingAutomazioneIscrizione> findByAutomazioneIdAndStatoIn(Long automazioneId,
                                                                     Collection<MailingAutomazioneIscrizione.Stato> stati);

    boolean existsByAutomazioneIdAndContattoIdAndStatoIn(Long automazioneId, Long contattoId,
                                                         Collection<MailingAutomazioneIscrizione.Stato> stati);

    /** Blocca l'iscrizione per farla avanzare; vuoto se un'altra transazione la sta già lavorando. */
    @Query(value = "SELECT * FROM mailing_automazioni_iscrizioni WHERE id = :id FOR UPDATE SKIP LOCKED", nativeQuery = true)
    Optional<MailingAutomazioneIscrizione> bloccaPerAvanzamento(@Param("id") Long id);

    /** Iscrizioni pronte per il passo successivo (automazione attiva), saltando quelle già in lavorazione. */
    @Query(value = """
            SELECT i.id FROM mailing_automazioni_iscrizioni i
            JOIN mailing_automazioni a ON a.id = i.automazione_id
            WHERE a.stato = 'ATTIVA' AND i.stato IN ('ATTIVA', 'IN_ATTESA')
              AND i.prossima_azione_il IS NOT NULL AND i.prossima_azione_il <= :adesso
            ORDER BY i.prossima_azione_il
            LIMIT :limite
            FOR UPDATE OF i SKIP LOCKED
            """, nativeQuery = true)
    List<Long> idsDaAvanzare(@Param("adesso") LocalDateTime adesso, @Param("limite") int limite);
}
