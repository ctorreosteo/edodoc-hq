-- Risposta del dottore al check: una per check, visibile al paziente nell'app
ALTER TABLE check_settimanali
    ADD COLUMN feedback          TEXT,
    ADD COLUMN feedback_il       TIMESTAMP,
    ADD COLUMN feedback_letto_il TIMESTAMP;

-- Chat: il dottore è uno solo, quindi la conversazione coincide con il paziente.
-- client_id: lo genera l'app, così un reinvio dopo una rete caduta non duplica il messaggio.
CREATE TABLE messaggi (
    id          BIGSERIAL PRIMARY KEY,
    paziente_id BIGINT NOT NULL REFERENCES pazienti (id),
    mittente    VARCHAR(20) NOT NULL,
    testo       TEXT NOT NULL,
    client_id   UUID,
    inviato_il  TIMESTAMP NOT NULL DEFAULT now(),
    letto_il    TIMESTAMP,
    CONSTRAINT uq_messaggio_client UNIQUE (paziente_id, client_id)
);
CREATE INDEX idx_messaggi_paziente ON messaggi (paziente_id, id);

-- Accessi dai telefoni: il refresh token resta valido a lungo e si può revocare. Solo lo SHA-256.
CREATE TABLE sessioni_app (
    id           BIGSERIAL PRIMARY KEY,
    utente_id    BIGINT NOT NULL REFERENCES utenti (id) ON DELETE CASCADE,
    refresh_hash VARCHAR(64) NOT NULL UNIQUE,
    scadenza     TIMESTAMP NOT NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessioni_app_utente ON sessioni_app (utente_id);

-- Telefoni a cui recapitare le notifiche. Un token appartiene a chi ha fatto l'ultimo accesso su quel telefono.
CREATE TABLE dispositivi (
    id            BIGSERIAL PRIMARY KEY,
    utente_id     BIGINT NOT NULL REFERENCES utenti (id) ON DELETE CASCADE,
    push_token    VARCHAR(255) NOT NULL UNIQUE,
    piattaforma   VARCHAR(10) NOT NULL,
    aggiornato_il TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_dispositivi_utente ON dispositivi (utente_id);

INSERT INTO config (chiave, valore, descrizione) VALUES
('PUSH_ENABLED', 'false', 'Invia le notifiche push dell''app (messaggi e feedback)');
