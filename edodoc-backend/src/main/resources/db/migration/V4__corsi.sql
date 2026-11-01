-- Corsi per i pazienti: corso > moduli > lezioni. Il paziente vede solo ciò che è pubblicato.

-- Copertine nel database: poche, piccole e servite senza login (non sono dati sanitari)
CREATE TABLE copertine (
    id         UUID PRIMARY KEY,
    tipo       VARCHAR(20) NOT NULL,
    dati       BYTEA NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE corsi (
    id           BIGSERIAL PRIMARY KEY,
    titolo       VARCHAR(255) NOT NULL,
    descrizione  TEXT,
    copertina_id UUID REFERENCES copertine (id) ON DELETE SET NULL,
    pubblicato   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE moduli (
    id           BIGSERIAL PRIMARY KEY,
    corso_id     BIGINT NOT NULL REFERENCES corsi (id) ON DELETE CASCADE,
    titolo       VARCHAR(255) NOT NULL,
    descrizione  TEXT,
    copertina_id UUID REFERENCES copertine (id) ON DELETE SET NULL,
    ordine       INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_moduli_corso ON moduli (corso_id, ordine);

-- contenuto: testo in Markdown delle lezioni scritte. cloudflare_uid: video su Cloudflare Stream
CREATE TABLE lezioni (
    id             BIGSERIAL PRIMARY KEY,
    modulo_id      BIGINT NOT NULL REFERENCES moduli (id) ON DELETE CASCADE,
    titolo         VARCHAR(255) NOT NULL,
    descrizione    TEXT,
    tipo           VARCHAR(10) NOT NULL,
    ordine         INTEGER NOT NULL DEFAULT 0,
    pubblicata     BOOLEAN NOT NULL DEFAULT FALSE,
    contenuto      TEXT,
    cloudflare_uid VARCHAR(64),
    video_stato    VARCHAR(20),
    video_errore   VARCHAR(500),
    durata_secondi INTEGER,
    created_at     TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_lezioni_modulo ON lezioni (modulo_id, ordine);

INSERT INTO config (chiave, valore, descrizione) VALUES
('CLOUDFLARE_STREAM_ENABLED', 'false', 'Carica e riproduce i video dei corsi con Cloudflare Stream');
