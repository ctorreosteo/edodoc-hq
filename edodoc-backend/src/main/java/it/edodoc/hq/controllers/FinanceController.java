package it.edodoc.hq.controllers;

import it.edodoc.hq.dto.ApiResponseDto;
import it.edodoc.hq.dto.FinanceDto;
import it.edodoc.hq.services.FinanceService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/finance")
public class FinanceController {

    private final FinanceService financeService;

    public FinanceController(FinanceService financeService) {
        this.financeService = financeService;
    }

    @GetMapping("/riepilogo")
    public ApiResponseDto<FinanceDto.Riepilogo> riepilogo(@RequestParam int anno) {
        return ApiResponseDto.success(financeService.riepilogo(anno, LocalDate.now()));
    }

    @GetMapping("/movimenti")
    public ApiResponseDto<List<FinanceDto.Movimento>> movimenti(@RequestParam int anno) {
        return ApiResponseDto.success(financeService.movimenti(anno));
    }

    @PostMapping("/movimenti")
    public ApiResponseDto<FinanceDto.Movimento> creaMovimento(@Valid @RequestBody FinanceDto.SalvaMovimento richiesta) {
        return ApiResponseDto.success("Movimento salvato", financeService.salvaMovimento(null, richiesta));
    }

    @PutMapping("/movimenti/{id}")
    public ApiResponseDto<FinanceDto.Movimento> aggiornaMovimento(@PathVariable Long id, @Valid @RequestBody FinanceDto.SalvaMovimento richiesta) {
        return ApiResponseDto.success("Movimento salvato", financeService.salvaMovimento(id, richiesta));
    }

    @DeleteMapping("/movimenti/{id}")
    public ApiResponseDto<Void> eliminaMovimento(@PathVariable Long id) {
        financeService.eliminaMovimento(id);
        return ApiResponseDto.success("Movimento eliminato", null);
    }

    @GetMapping("/scadenze")
    public ApiResponseDto<List<FinanceDto.Scadenza>> scadenze(@RequestParam int anno) {
        return ApiResponseDto.success(financeService.scadenze(anno));
    }

    @PostMapping("/scadenze")
    public ApiResponseDto<FinanceDto.Scadenza> creaScadenza(@Valid @RequestBody FinanceDto.SalvaScadenza richiesta) {
        return ApiResponseDto.success("Scadenza salvata", financeService.salvaScadenza(null, richiesta));
    }

    @PutMapping("/scadenze/{id}")
    public ApiResponseDto<FinanceDto.Scadenza> aggiornaScadenza(@PathVariable Long id, @Valid @RequestBody FinanceDto.SalvaScadenza richiesta) {
        return ApiResponseDto.success("Scadenza salvata", financeService.salvaScadenza(id, richiesta));
    }

    @PostMapping("/scadenze/{id}/paga")
    public ApiResponseDto<FinanceDto.Scadenza> pagaScadenza(@PathVariable Long id, @Valid @RequestBody FinanceDto.PagaScadenza richiesta) {
        return ApiResponseDto.success("Scadenza pagata", financeService.pagaScadenza(id, richiesta));
    }

    @DeleteMapping("/scadenze/{id}")
    public ApiResponseDto<Void> eliminaScadenza(@PathVariable Long id) {
        financeService.eliminaScadenza(id);
        return ApiResponseDto.success("Scadenza eliminata", null);
    }
}
