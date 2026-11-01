package it.edodoc.hq.services;

import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.models.Utente;
import it.edodoc.hq.repositories.PazienteRepository;
import it.edodoc.hq.repositories.UtenteRepository;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class AccountProvaServiceTest {

    private static final String DOTTORE = "prova.dottore@edodoc.it";
    private static final String PAZIENTE = "prova.paziente@edodoc.it";

    private final UtenteRepository utenti = mock(UtenteRepository.class);
    private final PazienteRepository pazienti = mock(PazienteRepository.class);
    private final PasswordEncoder encoder = mock(PasswordEncoder.class);
    private final PercorsoService percorsi = mock(PercorsoService.class);

    private AccountProvaService service(String dottorePassword) {
        return new AccountProvaService(utenti, pazienti, mock(PazienteService.class), percorsi,
                mock(CheckService.class), mock(PagamentoService.class), mock(ChatService.class), encoder,
                DOTTORE, dottorePassword, PAZIENTE, "pw-paziente");
    }

    private Utente utente(long id, String password, boolean attivo) {
        Utente utente = new Utente();
        utente.setId(id);
        utente.setPasswordHash(password);
        utente.setAttivo(attivo);
        return utente;
    }

    @Test
    void senzaPasswordConfigurataNonFaNulla() {
        service(" ").allinea();

        verifyNoInteractions(utenti);
    }

    @Test
    void riportaPasswordEAccessoSeUnaProvaLiHaCambiati() {
        Utente dottore = utente(1L, "hash-cambiato", false);
        Paziente paziente = new Paziente();
        paziente.setId(9L);
        paziente.setAttivo(false);
        Utente sofia = utente(2L, "hash-cambiato", true);
        sofia.setPaziente(paziente);
        sofia.setInvitoTokenHash("invito");
        when(utenti.findByUsernameIgnoreCase(DOTTORE)).thenReturn(Optional.of(dottore));
        when(utenti.findByUsernameIgnoreCase(PAZIENTE)).thenReturn(Optional.of(sofia));
        when(pazienti.findById(9L)).thenReturn(Optional.of(paziente));
        when(encoder.encode(any())).thenReturn("hash-buono");

        service("pw-dottore").allinea();

        assertThat(dottore.getPasswordHash()).isEqualTo("hash-buono");
        assertThat(dottore.getAttivo()).isTrue();
        assertThat(dottore.getRuolo()).isEqualTo(Utente.Ruolo.REVISORE);
        assertThat(sofia.getPasswordHash()).isEqualTo("hash-buono");
        assertThat(sofia.getInvitoTokenHash()).isNull();
        assertThat(paziente.getAttivo()).isTrue();
    }

    @Test
    void nonRicalcolaLaPasswordSeNienteECambiato() {
        Utente dottore = utente(1L, "hash", true);
        when(utenti.findByUsernameIgnoreCase(DOTTORE)).thenReturn(Optional.of(dottore));
        when(encoder.matches(eq("pw-dottore"), eq("hash"))).thenReturn(true);
        when(utenti.findByUsernameIgnoreCase(PAZIENTE)).thenReturn(Optional.empty());
        when(pazienti.getReferenceById(any())).thenThrow(new IllegalStateException("fine del test"));

        service("pw-dottore").allinea();

        verify(encoder, never()).encode(eq("pw-dottore"));
    }

    @Test
    void riconosceGliAccountSenzaBadareAlleMaiuscole() {
        AccountProvaService service = service("pw-dottore");

        assertThat(service.isAccountProva(" Prova.Dottore@Edodoc.it ")).isTrue();
        assertThat(service.isAccountProva("edoardo@edodoc.it")).isFalse();
        assertThat(service.isAccountProva(null)).isFalse();
    }
}
