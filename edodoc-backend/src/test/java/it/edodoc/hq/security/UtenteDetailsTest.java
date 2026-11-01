package it.edodoc.hq.security;

import it.edodoc.hq.models.Utente;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class UtenteDetailsTest {

    @Test
    void ilRevisoreNonHaMaiIlRuoloCheApreIDati() {
        Utente revisore = new Utente();
        revisore.setRuolo(Utente.Ruolo.REVISORE);

        assertThat(new UtenteDetails(revisore).getAuthorities()).extracting("authority")
                .containsExactly("ROLE_REVISORE");
    }
}
