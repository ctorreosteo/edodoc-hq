package it.edodoc.hq.services;

import it.edodoc.hq.dto.PagamentiDto;
import it.edodoc.hq.exception.ConflittoException;
import it.edodoc.hq.exception.RisorsaNonTrovataException;
import it.edodoc.hq.models.Fattura;
import it.edodoc.hq.models.Pagamento;
import it.edodoc.hq.repositories.FatturaRepository;
import it.edodoc.hq.repositories.PagamentoRepository;
import it.edodoc.hq.repositories.PazienteRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.HashSet;
import java.util.stream.Collectors;

@Service
public class PagamentoService {

    private final PagamentoRepository pagamentoRepository;
    private final PazienteRepository pazienteRepository;
    private final FatturaRepository fatturaRepository;

    public PagamentoService(PagamentoRepository pagamentoRepository, PazienteRepository pazienteRepository,
                            FatturaRepository fatturaRepository) {
        this.pagamentoRepository = pagamentoRepository;
        this.pazienteRepository = pazienteRepository;
        this.fatturaRepository = fatturaRepository;
    }

    @Transactional(readOnly = true)
    public PagamentiDto.Lista nelPeriodo(LocalDate da, LocalDate a) {
        return lista(pagamentoRepository.findNelPeriodo(da, a));
    }

    @Transactional(readOnly = true)
    public PagamentiDto.Lista delPaziente(Long pazienteId) {
        return lista(pagamentoRepository.findDelPaziente(pazienteId));
    }

    @Transactional(readOnly = true)
    public PagamentiDto.AppLista delPazienteApp(Long pazienteId) {
        Map<Long, Long> fatture = fatturaRepository.findDelPaziente(pazienteId).stream()
                .filter(f -> f.getStato() == Fattura.Stato.EMESSA && f.getPagamento() != null)
                .collect(Collectors.toMap(f -> f.getPagamento().getId(), Fattura::getId));
        PagamentiDto.Lista lista = delPaziente(pazienteId);
        return new PagamentiDto.AppLista(lista.riepilogo(), lista.righe().stream()
                .map(r -> PagamentiDto.AppPagamento.da(r, fatture.get(r.id()))).toList());
    }

    private PagamentiDto.Lista lista(List<Pagamento> pagamenti) {
        LocalDate oggi = LocalDate.now();
        Set<Long> fatturati = pagamenti.isEmpty() ? Set.of()
                : new HashSet<>(fatturaRepository.findPagamentiFatturati(pagamenti.stream().map(Pagamento::getId).toList()));
        BigDecimal pagato = BigDecimal.ZERO, daPagare = BigDecimal.ZERO, scaduto = BigDecimal.ZERO;
        for (Pagamento p : pagamenti) {
            if (p.getStato() == Pagamento.Stato.PAGATO) {
                pagato = pagato.add(p.getImporto());
            } else if (p.isScaduto(oggi)) {
                scaduto = scaduto.add(p.getImporto());
            } else if (p.getStato() == Pagamento.Stato.DA_PAGARE) {
                daPagare = daPagare.add(p.getImporto());
            }
        }
        return new PagamentiDto.Lista(new PagamentiDto.Riepilogo(pagato, daPagare, scaduto),
                pagamenti.stream().map(p -> PagamentiDto.Riga.da(p, oggi, fatturati.contains(p.getId()))).toList());
    }

    @Transactional
    public PagamentiDto.Riga crea(PagamentiDto.Salva richiesta) {
        Pagamento pagamento = new Pagamento();
        pagamento.setPaziente(pazienteRepository.findByIdAndAttivoTrue(richiesta.pazienteId())
                .orElseThrow(() -> new RisorsaNonTrovataException("Paziente non trovato")));
        applica(pagamento, richiesta);
        pagamentoRepository.save(pagamento);
        return PagamentiDto.Riga.da(pagamento, LocalDate.now(), false);
    }

    @Transactional
    public PagamentiDto.Riga aggiorna(Long id, PagamentiDto.Salva richiesta) {
        Pagamento pagamento = trova(id);
        if (isFatturato(id)) {
            throw new ConflittoException("Il pagamento ha una fattura emessa: annulla prima la fattura");
        }
        applica(pagamento, richiesta);
        return PagamentiDto.Riga.da(pagamento, LocalDate.now(), false);
    }

    @Transactional
    public PagamentiDto.Riga registra(Long id, PagamentiDto.Registra richiesta) {
        Pagamento pagamento = trova(id);
        if (pagamento.getStato() == Pagamento.Stato.ANNULLATO) {
            throw new ConflittoException("Il pagamento è annullato");
        }
        pagamento.setStato(Pagamento.Stato.PAGATO);
        pagamento.setDataPagamento(richiesta.dataPagamento());
        pagamento.setMetodo(richiesta.metodo());
        pagamento.setContabile(Boolean.TRUE.equals(richiesta.contabile()));
        if (richiesta.note() != null) {
            pagamento.setNote(richiesta.note());
        }
        return PagamentiDto.Riga.da(pagamento, LocalDate.now(), isFatturato(id));
    }

    @Transactional
    public PagamentiDto.Riga annullaRegistrazione(Long id) {
        Pagamento pagamento = trova(id);
        if (isFatturato(id)) {
            throw new ConflittoException("Il pagamento ha una fattura emessa: annulla prima la fattura");
        }
        pagamento.setStato(Pagamento.Stato.DA_PAGARE);
        pagamento.setDataPagamento(null);
        pagamento.setMetodo(null);
        pagamento.setContabile(false);
        return PagamentiDto.Riga.da(pagamento, LocalDate.now(), false);
    }

    @Transactional
    public void annulla(Long id) {
        Pagamento pagamento = trova(id);
        if (isFatturato(id)) {
            throw new ConflittoException("Il pagamento ha una fattura emessa: annulla prima la fattura");
        }
        pagamento.setStato(Pagamento.Stato.ANNULLATO);
    }

    private void applica(Pagamento pagamento, PagamentiDto.Salva r) {
        pagamento.setTipo(r.tipo() != null ? r.tipo() : Pagamento.Tipo.ALTRO);
        pagamento.setDescrizione(r.descrizione().trim());
        pagamento.setImporto(r.importo());
        pagamento.setScadenza(r.scadenza());
        pagamento.setNote(r.note());
    }

    private boolean isFatturato(Long id) {
        return fatturaRepository.existsByPagamentoIdAndStato(id, Fattura.Stato.EMESSA);
    }

    private Pagamento trova(Long id) {
        return pagamentoRepository.findConPaziente(id)
                .orElseThrow(() -> new RisorsaNonTrovataException("Pagamento non trovato"));
    }
}
