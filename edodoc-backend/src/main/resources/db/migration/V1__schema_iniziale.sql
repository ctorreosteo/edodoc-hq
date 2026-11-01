CREATE TABLE config (
    id          BIGSERIAL PRIMARY KEY,
    chiave      VARCHAR(100) NOT NULL UNIQUE,
    valore      TEXT,
    descrizione VARCHAR(255)
);

CREATE TABLE pazienti (
    id                BIGSERIAL PRIMARY KEY,
    nome              VARCHAR(100) NOT NULL,
    cognome           VARCHAR(100) NOT NULL,
    email             VARCHAR(255),
    cellulare         VARCHAR(30),
    codice_fiscale    VARCHAR(16),
    data_nascita      DATE,
    indirizzo         VARCHAR(255),
    cap               VARCHAR(10),
    citta             VARCHAR(100),
    provincia         VARCHAR(5),
    stato             VARCHAR(30) NOT NULL DEFAULT 'LEAD',
    fonte             VARCHAR(30),
    situazione        TEXT,
    nota              TEXT,
    peso_iniziale_kg  NUMERIC(5,2),
    peso_obiettivo_kg NUMERIC(5,2),
    attivo            BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMP NOT NULL DEFAULT now(),
    updated_at        TIMESTAMP NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_pazienti_codice_fiscale ON pazienti (codice_fiscale) WHERE attivo AND codice_fiscale IS NOT NULL;
CREATE INDEX idx_pazienti_stato ON pazienti (stato) WHERE attivo;

-- ruolo: ADMIN (dottore, gestionale) oppure PAZIENTE (solo app mobile, /api/app/**)
CREATE TABLE utenti (
    id                BIGSERIAL PRIMARY KEY,
    username          VARCHAR(255) NOT NULL UNIQUE,
    password_hash     VARCHAR(100),
    nome              VARCHAR(100) NOT NULL,
    cognome           VARCHAR(100) NOT NULL,
    ruolo             VARCHAR(20) NOT NULL,
    paziente_id       BIGINT UNIQUE REFERENCES pazienti (id),
    attivo            BOOLEAN NOT NULL DEFAULT TRUE,
    invito_token_hash VARCHAR(64) UNIQUE,
    invito_scadenza   TIMESTAMP,
    created_at        TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT ck_utente_paziente CHECK (ruolo <> 'PAZIENTE' OR paziente_id IS NOT NULL)
);

CREATE TABLE percorsi (
    id              BIGSERIAL PRIMARY KEY,
    paziente_id     BIGINT NOT NULL REFERENCES pazienti (id),
    tipo            VARCHAR(30) NOT NULL,
    piano_pagamento VARCHAR(30) NOT NULL,
    data_inizio     DATE NOT NULL,
    data_fine       DATE NOT NULL,
    visite_totali   INTEGER NOT NULL,
    importo_totale  NUMERIC(10,2) NOT NULL,
    stato           VARCHAR(20) NOT NULL DEFAULT 'ATTIVO',
    note            TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_percorsi_paziente ON percorsi (paziente_id);
CREATE INDEX idx_percorsi_stato_fine ON percorsi (stato, data_fine);

CREATE TABLE visite (
    id                 BIGSERIAL PRIMARY KEY,
    paziente_id        BIGINT NOT NULL REFERENCES pazienti (id),
    percorso_id        BIGINT REFERENCES percorsi (id),
    tipo               VARCHAR(30) NOT NULL,
    modalita           VARCHAR(20) NOT NULL,
    stato              VARCHAR(20) NOT NULL DEFAULT 'PROGRAMMATA',
    inizio             TIMESTAMP NOT NULL,
    fine               TIMESTAMP NOT NULL,
    numero_visita      INTEGER,
    con_meet           BOOLEAN NOT NULL DEFAULT FALSE,
    meet_url           VARCHAR(255),
    invita_paziente    BOOLEAN NOT NULL DEFAULT TRUE,
    note               TEXT,
    google_event_id    VARCHAR(255) UNIQUE,
    google_sync_stato  VARCHAR(30) NOT NULL DEFAULT 'DA_SINCRONIZZARE',
    google_sync_errore TEXT,
    created_at         TIMESTAMP NOT NULL DEFAULT now(),
    updated_at         TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT ck_visita_orari CHECK (fine > inizio)
);
CREATE INDEX idx_visite_inizio ON visite (inizio);
CREATE INDEX idx_visite_paziente ON visite (paziente_id, inizio);
CREATE INDEX idx_visite_percorso ON visite (percorso_id);
CREATE INDEX idx_visite_sync ON visite (google_sync_stato);

-- settimana: lunedì a cui il check appartiene. Le risposte seguono le domande del Google Form.
CREATE TABLE check_settimanali (
    id                    BIGSERIAL PRIMARY KEY,
    paziente_id           BIGINT NOT NULL REFERENCES pazienti (id),
    settimana             DATE NOT NULL,
    compilato_il          TIMESTAMP NOT NULL DEFAULT now(),
    fonte                 VARCHAR(20) NOT NULL DEFAULT 'APP',
    pasti_ottimali        INTEGER,
    pasti_liberi          TEXT,
    energia               INTEGER,
    allenamento           TEXT,
    peso_kg               NUMERIC(5,2),
    andamento_peso        TEXT,
    percezione            TEXT,
    percezione_migliorata BOOLEAN,
    impegno               INTEGER,
    peso_fermo            BOOLEAN NOT NULL DEFAULT FALSE,
    percezione_negativa   BOOLEAN NOT NULL DEFAULT FALSE,
    energia_bassa         BOOLEAN NOT NULL DEFAULT FALSE,
    letto_il              TIMESTAMP,
    CONSTRAINT uq_check_paziente_settimana UNIQUE (paziente_id, settimana),
    CONSTRAINT ck_check_energia CHECK (energia BETWEEN 1 AND 5),
    CONSTRAINT ck_check_impegno CHECK (impegno BETWEEN 1 AND 5),
    CONSTRAINT ck_check_pasti CHECK (pasti_ottimali BETWEEN 0 AND 21)
);
CREATE INDEX idx_check_settimana ON check_settimanali (settimana);

-- Lista del lunedì e del mercoledì: chi ha già ricevuto il messaggio di questa settimana
CREATE TABLE contatti_settimana (
    id                 BIGSERIAL PRIMARY KEY,
    paziente_id        BIGINT NOT NULL REFERENCES pazienti (id),
    settimana          DATE NOT NULL,
    lunedi_fatto_il    TIMESTAMP,
    mercoledi_fatto_il TIMESTAMP,
    CONSTRAINT uq_contatto_paziente_settimana UNIQUE (paziente_id, settimana)
);

CREATE TABLE pagamenti (
    id             BIGSERIAL PRIMARY KEY,
    paziente_id    BIGINT NOT NULL REFERENCES pazienti (id),
    percorso_id    BIGINT REFERENCES percorsi (id),
    tipo           VARCHAR(30) NOT NULL,
    descrizione    VARCHAR(255) NOT NULL,
    importo        NUMERIC(10,2) NOT NULL,
    scadenza       DATE NOT NULL,
    stato          VARCHAR(20) NOT NULL DEFAULT 'DA_PAGARE',
    data_pagamento DATE,
    metodo         VARCHAR(20),
    contabile      BOOLEAN NOT NULL DEFAULT FALSE,
    note           TEXT,
    created_at     TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT ck_pagamento_importo CHECK (importo > 0),
    CONSTRAINT ck_pagamento_data CHECK (stato <> 'PAGATO' OR data_pagamento IS NOT NULL)
);
CREATE INDEX idx_pagamenti_paziente ON pagamenti (paziente_id);
CREATE INDEX idx_pagamenti_stato_scadenza ON pagamenti (stato, scadenza);
CREATE INDEX idx_pagamenti_data ON pagamenti (data_pagamento);

-- Intestatario e importi sono una fotografia: una fattura emessa non cambia se cambia l'anagrafica.
CREATE TABLE fatture (
    id                    BIGSERIAL PRIMARY KEY,
    numero                INTEGER NOT NULL UNIQUE,
    data_emissione        DATE NOT NULL,
    stato                 VARCHAR(20) NOT NULL DEFAULT 'EMESSA',
    paziente_id           BIGINT NOT NULL REFERENCES pazienti (id),
    pagamento_id          BIGINT REFERENCES pagamenti (id),
    intestatario          VARCHAR(255) NOT NULL,
    indirizzo             VARCHAR(255) NOT NULL,
    codice_fiscale        VARCHAR(16) NOT NULL,
    descrizione           VARCHAR(255) NOT NULL,
    imponibile            NUMERIC(10,2) NOT NULL,
    contributo            NUMERIC(10,2) NOT NULL,
    bollo                 NUMERIC(10,2) NOT NULL,
    importo_totale        NUMERIC(10,2) NOT NULL,
    motivo_annullamento   TEXT,
    email_destinatario    VARCHAR(255),
    email_inviata_il      TIMESTAMP,
    ts_stato              VARCHAR(20) NOT NULL DEFAULT 'DA_INSERIRE',
    ts_inserita_il        TIMESTAMP,
    ts_opposizione        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMP NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_fattura_pagamento ON fatture (pagamento_id) WHERE stato = 'EMESSA' AND pagamento_id IS NOT NULL;
CREATE INDEX idx_fatture_data ON fatture (data_emissione);
CREATE INDEX idx_fatture_paziente ON fatture (paziente_id);

CREATE TABLE task_tipi (
    id             BIGSERIAL PRIMARY KEY,
    codice         VARCHAR(40) NOT NULL UNIQUE,
    etichetta      VARCHAR(100) NOT NULL,
    titolo_default VARCHAR(255) NOT NULL,
    giorni_default INTEGER NOT NULL DEFAULT 0,
    priorita       VARCHAR(10) NOT NULL DEFAULT 'MEDIA',
    icona          VARCHAR(40) NOT NULL DEFAULT 'circle-check',
    ordine         INTEGER NOT NULL DEFAULT 0,
    attivo         BOOLEAN NOT NULL DEFAULT TRUE
);

-- chiave_automatica: impedisce di ricreare lo stesso promemoria generato dai job
CREATE TABLE task (
    id                BIGSERIAL PRIMARY KEY,
    titolo            VARCHAR(255) NOT NULL,
    descrizione       TEXT,
    tipo_id           BIGINT NOT NULL REFERENCES task_tipi (id),
    stato             VARCHAR(20) NOT NULL DEFAULT 'DA_FARE',
    priorita          VARCHAR(10) NOT NULL DEFAULT 'MEDIA',
    scadenza          DATE,
    paziente_id       BIGINT REFERENCES pazienti (id),
    chiave_automatica VARCHAR(100) UNIQUE,
    completato_il     TIMESTAMP,
    created_at        TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_task_stato_scadenza ON task (stato, scadenza);
CREATE INDEX idx_task_paziente ON task (paziente_id);

-- Entrate fuori dai pazienti (YouTube, consulenze) e uscite (tasse, cassa, commercialista)
CREATE TABLE movimenti_cassa (
    id          BIGSERIAL PRIMARY KEY,
    data        DATE NOT NULL,
    tipo        VARCHAR(10) NOT NULL,
    categoria   VARCHAR(30) NOT NULL,
    descrizione VARCHAR(255) NOT NULL,
    importo     NUMERIC(10,2) NOT NULL,
    note        TEXT,
    created_at  TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT ck_movimento_importo CHECK (importo > 0)
);
CREATE INDEX idx_movimenti_data ON movimenti_cassa (data);

CREATE TABLE scadenze_fiscali (
    id             BIGSERIAL PRIMARY KEY,
    titolo         VARCHAR(255) NOT NULL,
    categoria      VARCHAR(30) NOT NULL,
    data_scadenza  DATE NOT NULL,
    importo_stimato NUMERIC(10,2),
    stato          VARCHAR(20) NOT NULL DEFAULT 'DA_PAGARE',
    pagata_il      DATE,
    movimento_id   BIGINT REFERENCES movimenti_cassa (id),
    note           TEXT,
    created_at     TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_scadenze_data ON scadenze_fiscali (stato, data_scadenza);
