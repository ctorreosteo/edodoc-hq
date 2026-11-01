package it.edodoc.hq.services;

import it.edodoc.hq.models.Paziente;
import it.edodoc.hq.models.Utente;
import it.edodoc.hq.repositories.PazienteRepository;
import it.edodoc.hq.repositories.UtenteRepository;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;
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
    private final ConfigService config = mock(ConfigService.class);
    private final VisitaService visite = mock(VisitaService.class);
    private final PercorsoService percorsi = mock(PercorsoService.class);
    private final CorsoService corsi = mock(CorsoService.class);

    private AccountProvaService service(boolean demo, String dottorePassword) {
        return new AccountProvaService(utenti, pazienti, mock(PazienteService.class), percorsi, visite,
                mock(CheckService.class), mock(PagamentoService.class), mock(FatturaService.class),
                mock(ChatService.class), corsi, config, encoder, demo, DOTTORE, dottorePassword, PAZIENTE, "pw-paziente");
    }

    private Utente utente(long id, String password, boolean attivo) {
        Utente utente = new Utente();
        utente.setId(id);
        utente.setPasswordHash(password);
        utente.setAttivo(attivo);
        return utente;
    }

    @Test
    void conDatiRealiNonCreaMaiGliAccount() {
        when(config.get("EMITTENTE_PARTITA_IVA")).thenReturn("12345678901");

        service(true, "pw-dottore").allinea();

        verifyNoInteractions(utenti);
    }

    @Test
    void senzaIlProfiloDemoNonCreaMaiGliAccount() {
        when(config.get("EMITTENTE_PARTITA_IVA")).thenReturn("00000000000");

        service(false, "pw-dottore").allinea();

        verifyNoInteractions(utenti);
    }

    @Test
    void senzaPasswordConfigurataNonFaNulla() {
        service(true, " ").allinea();

        verifyNoInteractions(utenti);
    }

    @Test
    void riportaPasswordEAccessoSeUnaProvaLiHaCambiati() {
        when(config.get("EMITTENTE_PARTITA_IVA")).thenReturn("00000000000");
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
        when(visite.delPaziente(9L)).thenReturn(List.of());
        when(percorsi.delPaziente(9L)).thenReturn(List.of());

        service(true, "pw-dottore").allinea();

        assertThat(dottore.getPasswordHash()).isEqualTo("hash-buono");
        assertThat(dottore.getAttivo()).isTrue();
        assertThat(dottore.getRuolo()).isEqualTo(Utente.Ruolo.ADMIN);
        assertThat(sofia.getPasswordHash()).isEqualTo("hash-buono");
        assertThat(sofia.getInvitoTokenHash()).isNull();
        assertThat(paziente.getAttivo()).isTrue();
    }

    @Test
    void nonRicalcolaLaPasswordSeNienteECambiato() {
        when(config.get("EMITTENTE_PARTITA_IVA")).thenReturn("00000000000");
        Utente dottore = utente(1L, "hash", true);
        when(utenti.findByUsernameIgnoreCase(DOTTORE)).thenReturn(Optional.of(dottore));
        when(encoder.matches(eq("pw-dottore"), eq("hash"))).thenReturn(true);
        when(utenti.findByUsernameIgnoreCase(PAZIENTE)).thenReturn(Optional.empty());
        when(pazienti.getReferenceById(any())).thenThrow(new IllegalStateException("fine del test"));

        service(true, "pw-dottore").allinea();

        verify(encoder, never()).encode(eq("pw-dottore"));
    }

    @Test
    void riconosceGliAccountSenzaBadareAlleMaiuscole() {
        AccountProvaService service = service(true, "pw-dottore");

        assertThat(service.isAccountProva(" Prova.Dottore@Edodoc.it ")).isTrue();
        assertThat(service.isAccountProva("edoardo@edodoc.it")).isFalse();
        assertThat(service.isAccountProva(null)).isFalse();
    }
}
