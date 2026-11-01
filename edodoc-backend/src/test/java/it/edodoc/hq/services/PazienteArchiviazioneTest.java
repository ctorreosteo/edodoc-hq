package it.edodoc.hq.services;

import it.edodoc.hq.exception.ConflittoException;
import it.edodoc.hq.models.Pagamento;
import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.models.Task;
import it.edodoc.hq.models.Utente;
import it.edodoc.hq.models.Visita;
import it.edodoc.hq.repositories.CheckSettimanaleRepository;
import it.edodoc.hq.repositories.DispositivoRepository;
import it.edodoc.hq.repositories.FatturaRepository;
import it.edodoc.hq.repositories.PagamentoRepository;
import it.edodoc.hq.repositories.PazienteRepository;
import it.edodoc.hq.repositories.PercorsoRepository;
import it.edodoc.hq.repositories.SessioneAppRepository;
import it.edodoc.hq.repositories.TaskRepository;
import it.edodoc.hq.repositories.UtenteRepository;
import it.edodoc.hq.repositories.VisitaRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PazienteArchiviazioneTest {

    private final PazienteRepository pazienti = mock(PazienteRepository.class);
    private final VisitaRepository visite = mock(VisitaRepository.class);
    private final PagamentoRepository pagamenti = mock(PagamentoRepository.class);
    private final UtenteRepository utenti = mock(UtenteRepository.class);
    private final SessioneAppRepository sessioni = mock(SessioneAppRepository.class);
    private final DispositivoRepository dispositivi = mock(DispositivoRepository.class);
    private final FatturaRepository fatture = mock(FatturaRepository.class);
    private final TaskRepository taskRepository = mock(TaskRepository.class);
    private final TaskService taskService = mock(TaskService.class);
    private final PazienteService service = new PazienteService(pazienti, mock(PercorsoRepository.class), visite, pagamenti,
            mock(CheckSettimanaleRepository.class), utenti, sessioni, dispositivi, fatture, taskRepository, taskService);

    private Paziente paziente;
    private Utente utente;

    @BeforeEach
    void prepara() {
        paziente = new Paziente();
        paziente.setId(7L);
        paziente.setNome("Anna");
        paziente.setCognome("Verdi");
        paziente.setEmail("anna@esempio.it");
        paziente.setCodiceFiscale("VRDNNA90A41F205X");
        paziente.setNota("Nota clinica");
        utente = new Utente();
        utente.setId(3L);
        utente.setUsername("anna@esempio.it");
        utente.setPasswordHash("hash");
        utente.setInvitoTokenHash("invito");
        when(utenti.findByPazienteId(7L)).thenReturn(Optional.of(utente));
        when(pazienti.findByIdAndAttivoTrue(7L)).thenReturn(Optional.of(paziente));
        when(pazienti.findById(7L)).thenReturn(Optional.of(paziente));
    }

    private void archiviato() {
        paziente.setAttivo(false);
    }

    @Test
    void chiudereLAccountTagliaTuttiGliAccessiETienePerOraIDati() {
        service.chiudiAccount(7L);

        assertThat(paziente.getAttivo()).isFalse();
        assertThat(paziente.getArchiviatoIl()).isNotNull();
        assertThat(paziente.getCognome()).isEqualTo("Verdi");
        assertThat(utente.getAttivo()).isFalse();
        assertThat(utente.getInvitoTokenHash()).isNull();
        verify(sessioni).deleteByUtenteId(3L);
        verify(dispositivi).deleteByUtenteId(3L);
        verify(taskService).creaAutomatico(eq("anonimizza-7"), eq("FISCO"), any(), eq(Task.Priorita.ALTA), any(), eq(paziente));
    }

    @Test
    void anonimizzareTogliePersonaEAccountSenzaEliminareRighe() {
        archiviato();
        Task task = new Task();
        task.setTitolo("Rinnovo Anna Verdi");
        when(taskRepository.findDelPaziente(7L)).thenReturn(List.of(task));

        String email = service.anonimizza(7L);

        assertThat(email).isEqualTo("anna@esempio.it");
        assertThat(paziente.getNomeCompleto()).isEqualTo("Paziente Anonimizzato 7");
        assertThat(paziente.getEmail()).isNull();
        assertThat(paziente.getCodiceFiscale()).isNull();
        assertThat(paziente.getNota()).isNull();
        assertThat(paziente.getAnonimizzatoIl()).isNotNull();
        assertThat(utente.getUsername()).isEqualTo("anonimizzato-7");
        assertThat(utente.getPasswordHash()).isNull();
        assertThat(task.getTitolo()).doesNotContain("Verdi");
        assertThat(task.getStato()).isEqualTo(Task.Stato.FATTO);
    }

    @Test
    void nonSiAnonimizzaUnPazienteAncoraAttivo() {
        assertThatThrownBy(() -> service.anonimizza(7L)).hasMessageContaining("non trovato");
        assertThat(paziente.getCognome()).isEqualTo("Verdi");
    }

    @Test
    void lAnonimizzazioneNonSiRipete() {
        archiviato();
        paziente.setAnonimizzatoIl(LocalDateTime.now());

        assertThatThrownBy(() -> service.anonimizza(7L)).isInstanceOf(ConflittoException.class);
    }

    @Test
    void unaVisitaInProgrammaBloccaLAnonimizzazione() {
        archiviato();
        Visita visita = new Visita();
        visita.setStato(Visita.Stato.PROGRAMMATA);
        visita.setInizio(LocalDateTime.now().plusDays(3));
        when(visite.findDelPaziente(7L)).thenReturn(List.of(visita));

        assertThatThrownBy(() -> service.anonimizza(7L)).isInstanceOf(ConflittoException.class);
        assertThat(paziente.getCognome()).isEqualTo("Verdi");
    }

    @Test
    void unPagamentoRicevutoSenzaFatturaBloccaLAnonimizzazione() {
        archiviato();
        Pagamento pagamento = new Pagamento();
        pagamento.setId(9L);
        pagamento.setStato(Pagamento.Stato.PAGATO);
        when(pagamenti.findDelPaziente(7L)).thenReturn(List.of(pagamento));

        assertThatThrownBy(() -> service.anonimizza(7L)).isInstanceOf(ConflittoException.class);
        assertThat(paziente.getCognome()).isEqualTo("Verdi");
    }
}
