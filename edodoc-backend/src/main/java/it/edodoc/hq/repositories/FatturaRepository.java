package it.edodoc.hq.repositories;

import it.edodoc.hq.models.Fattura;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface FatturaRepository extends JpaRepository<Fattura, Long> {

    @Query("select f from Fattura f join fetch f.paziente left join fetch f.pagamento where f.id = :id")
    Optional<Fattura> findConDettagli(@Param("id") Long id);

    @Query("""
            select f from Fattura f join fetch f.paziente left join fetch f.pagamento
            where f.dataEmissione between :da and :a
            order by f.numero desc
            """)
    List<Fattura> findNelPeriodo(@Param("da") LocalDate da, @Param("a") LocalDate a);

    @Query("""
            select f from Fattura f join fetch f.paziente left join fetch f.pagamento
            where f.paziente.id = :pazienteId
            order by f.numero desc
            """)
    List<Fattura> findDelPaziente(@Param("pazienteId") Long pazienteId);

    @Query("select f.pagamento.id from Fattura f where f.stato = 'EMESSA' and f.pagamento.id in :pagamentoIds")
    List<Long> findPagamentiFatturati(@Param("pagamentoIds") Collection<Long> pagamentoIds);

    @Query("""
            select f from Fattura f join fetch f.paziente
            where f.pagamento.id = :pagamentoId and f.stato = 'EMESSA'
            """)
    Optional<Fattura> findEmessaDelPagamento(@Param("pagamentoId") Long pagamentoId);

    boolean existsByPagamentoIdAndStato(Long pagamentoId, Fattura.Stato stato);

    /** Data dell'ultima fattura: le nuove non possono andare prima, la numerazione segue il calendario. */
    @Query("select max(f.dataEmissione) from Fattura f")
    Optional<LocalDate> findUltimaData();

    @Query("""
            select f from Fattura f join fetch f.paziente
            where f.stato = 'EMESSA' and f.tsOpposizione = false and f.tsStato <> 'INSERITA'
              and f.dataEmissione between :da and :a
            order by f.numero
            """)
    List<Fattura> findDaInserireInTessera(@Param("da") LocalDate da, @Param("a") LocalDate a);
}
