package it.edodoc.hq.repositories;

import it.edodoc.hq.models.Pagamento;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface PagamentoRepository extends JpaRepository<Pagamento, Long> {

    @Query("select p from Pagamento p join fetch p.paziente where p.id = :id")
    Optional<Pagamento> findConPaziente(@Param("id") Long id);

    @Query("""
            select p from Pagamento p join fetch p.paziente
            where p.stato <> 'ANNULLATO' and coalesce(p.dataPagamento, p.scadenza) between :da and :a
            order by coalesce(p.dataPagamento, p.scadenza) desc, p.id desc
            """)
    List<Pagamento> findNelPeriodo(@Param("da") LocalDate da, @Param("a") LocalDate a);

    @Query("""
            select p from Pagamento p join fetch p.paziente
            where p.paziente.id = :pazienteId and p.stato <> 'ANNULLATO'
            order by p.scadenza, p.id
            """)
    List<Pagamento> findDelPaziente(@Param("pazienteId") Long pazienteId);

    @Query("""
            select p from Pagamento p join fetch p.paziente pz left join fetch p.percorso
            where p.stato <> 'ANNULLATO' and pz.attivo = true
            order by p.scadenza, p.id
            """)
    List<Pagamento> findDeiPazienti();

    @Query("select p from Pagamento p join fetch p.paziente where p.stato = 'DA_PAGARE' order by p.scadenza")
    List<Pagamento> findDaPagare();

    @Query("""
            select p from Pagamento p join fetch p.paziente
            where p.stato = 'PAGATO' and p.dataPagamento between :da and :a
            """)
    List<Pagamento> findPagatiNelPeriodo(@Param("da") LocalDate da, @Param("a") LocalDate a);

    @Query("""
            select coalesce(sum(p.importo), 0) from Pagamento p
            where p.stato = 'DA_PAGARE' and p.scadenza between :da and :a
            """)
    BigDecimal sommaDaPagare(@Param("da") LocalDate da, @Param("a") LocalDate a);
}
