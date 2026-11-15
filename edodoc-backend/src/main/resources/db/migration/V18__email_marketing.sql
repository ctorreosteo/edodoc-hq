-- Email Marketing, portato da Mobilitas HQ: contatti con consenso e disiscrizione, tag, segmenti sui dati del
-- gestionale, template a blocchi, campagne (anche A/B), automazioni a grafo, coda di invio dalla casella Google
-- Workspace (Service Account + delega di dominio) o da SMTP, tracciamento aperture e click, rimbalzi e risposte,
-- attribuzione a conoscitive, visite e percorsi. Ogni contatto e un paziente (anche lead) o un indirizzo importato.
-- Tutto spento: nessuna email parte finche MAILING_INVIO_ENABLED (solo da DB) e MAILING_INVIO_ABILITATO
-- (pagina Email Marketing > Impostazioni) non sono entrambi true.

-- ───────────────────────── Mittenti ─────────────────────────
-- canale: GMAIL_API (casella Workspace via delega), SMTP_RELAY_GOOGLE (smtp-relay.gmail.com con XOAUTH2 via delega),
--         SMTP (server esterno, per domini fuori da Workspace: la password sta nella env indicata da smtp_password_env)
CREATE TABLE IF NOT EXISTS mailing_mittenti (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    nome_visualizzato VARCHAR(120) NOT NULL,
    rispondi_a VARCHAR(255) NULL,
    casella_delegata VARCHAR(255) NULL,
    canale VARCHAR(30) NOT NULL DEFAULT 'GMAIL_API',
    smtp_host VARCHAR(255) NULL,
    smtp_porta INTEGER NULL,
    smtp_utente VARCHAR(255) NULL,
    smtp_password_env VARCHAR(120) NULL,
    limite_giornaliero INTEGER NOT NULL DEFAULT 1500,
    limite_al_minuto INTEGER NOT NULL DEFAULT 20,
    predefinito BOOLEAN NOT NULL DEFAULT FALSE,
    attivo BOOLEAN NOT NULL DEFAULT TRUE,
    verificato_il TIMESTAMP WITHOUT TIME ZONE NULL,
    ultimo_errore TEXT NULL,
    rimbalzi_controllati_fino_al TIMESTAMP WITHOUT TIME ZONE NULL,
    creato_da_utente_id BIGINT NULL,
    creato_il TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    aggiornato_il TIMESTAMP WITHOUT TIME ZONE NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mailing_mittenti_email ON mailing_mittenti (LOWER(email));

-- ───────────────────────── Contatti ─────────────────────────
-- stato: ISCRITTO, DISISCRITTO, RIMBALZATO, SEGNALATO_SPAM, ARCHIVIATO
-- base_giuridica: CONSENSO (form o import con consenso), CLIENTE_SOFT_SPAM (paziente), MANUALE
CREATE TABLE IF NOT EXISTS mailing_contatti (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    nome VARCHAR(120) NULL,
    cognome VARCHAR(120) NULL,
    paziente_id BIGINT NULL REFERENCES pazienti (id) ON DELETE SET NULL,
    stato VARCHAR(20) NOT NULL DEFAULT 'ISCRITTO',
    base_giuridica VARCHAR(30) NOT NULL DEFAULT 'CLIENTE_SOFT_SPAM',
    fonte VARCHAR(60) NULL,
    consenso_il TIMESTAMP WITHOUT TIME ZONE NULL,
    disiscritto_il TIMESTAMP WITHOUT TIME ZONE NULL,
    motivo_disiscrizione VARCHAR(500) NULL,
    rimbalzi_temporanei INTEGER NOT NULL DEFAULT 0,
    token VARCHAR(64) NOT NULL,
    punteggio INTEGER NOT NULL DEFAULT 50,
    ora_apertura_preferita SMALLINT NULL,
    ultimo_invio_il TIMESTAMP WITHOUT TIME ZONE NULL,
    ultima_apertura_il TIMESTAMP WITHOUT TIME ZONE NULL,
    ultimo_click_il TIMESTAMP WITHOUT TIME ZONE NULL,
    note TEXT NULL,
    creato_il TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    aggiornato_il TIMESTAMP WITHOUT TIME ZONE NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mailing_contatti_email ON mailing_contatti (LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS uq_mailing_contatti_token ON mailing_contatti (token);
CREATE INDEX IF NOT EXISTS idx_mailing_contatti_paziente ON mailing_contatti (paziente_id);
CREATE INDEX IF NOT EXISTS idx_mailing_contatti_stato ON mailing_contatti (stato);

-- Categorie del centro preferenze: il contatto può escluderne alcune senza disiscriversi da tutto.
CREATE TABLE IF NOT EXISTS mailing_categorie (
    id BIGSERIAL PRIMARY KEY,
    nome VARCHAR(80) NOT NULL,
    descrizione VARCHAR(300) NULL,
    ordine INTEGER NOT NULL DEFAULT 0,
    attiva BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS mailing_contatti_categorie_escluse (
    contatto_id BIGINT NOT NULL REFERENCES mailing_contatti (id) ON DELETE CASCADE,
    categoria_id BIGINT NOT NULL REFERENCES mailing_categorie (id) ON DELETE CASCADE,
    escluso_il TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (contatto_id, categoria_id)
);

-- ───────────────────────── Tag ─────────────────────────
-- sistema = assegnato dal gestionale (LEAD, PAZIENTE, CONOSCITIVA_PRENOTATA, PERCORSO_*), non rinominabile.
CREATE TABLE IF NOT EXISTS mailing_tag (
    id BIGSERIAL PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    colore VARCHAR(20) NULL,
    sistema BOOLEAN NOT NULL DEFAULT FALSE,
    creato_il TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mailing_tag_nome ON mailing_tag (LOWER(nome));

CREATE TABLE IF NOT EXISTS mailing_contatti_tag (
    contatto_id BIGINT NOT NULL REFERENCES mailing_contatti (id) ON DELETE CASCADE,
    tag_id BIGINT NOT NULL REFERENCES mailing_tag (id) ON DELETE CASCADE,
    aggiunto_il TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    aggiunto_da_utente_id BIGINT NULL,
    PRIMARY KEY (contatto_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_mailing_contatti_tag_tag ON mailing_contatti_tag (tag_id);

-- ───────────────────────── Segmenti ─────────────────────────
-- regole: JSON {"operatore":"E"|"O","condizioni":[{"campo":..,"op":..,"valore":..} | gruppo annidato]}
CREATE TABLE IF NOT EXISTS mailing_segmenti (
    id BIGSERIAL PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    descrizione VARCHAR(500) NULL,
    colore VARCHAR(20) NULL,
    regole TEXT NOT NULL,
    ultimo_conteggio INTEGER NULL,
    contato_il TIMESTAMP WITHOUT TIME ZONE NULL,
    creato_da_utente_id BIGINT NULL,
    creato_il TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    aggiornato_il TIMESTAMP WITHOUT TIME ZONE NULL
);

-- ───────────────────────── Template ─────────────────────────
-- design: JSON del documento a blocchi dell'editor; html: resa compilata dall'editor (con i segnaposto {{...}})
CREATE TABLE IF NOT EXISTS mailing_template (
    id BIGSERIAL PRIMARY KEY,
    nome VARCHAR(160) NOT NULL,
    categoria VARCHAR(60) NULL,
    design TEXT NULL,
    html TEXT NOT NULL,
    origine VARCHAR(20) NOT NULL DEFAULT 'EDITOR',
    creato_da_utente_id BIGINT NULL,
    creato_il TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    aggiornato_il TIMESTAMP WITHOUT TIME ZONE NULL
);

-- Immagini caricate dall'editor, servite pubblicamente (i client di posta non sono autenticati).
CREATE TABLE IF NOT EXISTS mailing_immagini (
    id BIGSERIAL PRIMARY KEY,
    token VARCHAR(64) NOT NULL,
    nome_file VARCHAR(255) NULL,
    mime_type VARCHAR(60) NOT NULL,
    larghezza INTEGER NULL,
    altezza INTEGER NULL,
    byte_dimensione INTEGER NOT NULL,
    contenuto BYTEA NOT NULL,
    creato_da_utente_id BIGINT NULL,
    creato_il TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mailing_immagini_token ON mailing_immagini (token);

-- ───────────────────────── Campagne ─────────────────────────
-- stato: BOZZA, PROGRAMMATA, IN_INVIO, TEST_AB (in attesa del vincitore), IN_PAUSA, INVIATA, ANNULLATA
-- pubblico: JSON {"segmentiIds":[],"tagIds":[],"regole":{..}|null,"esclusiSegmentiIds":[],"esclusiTagIds":[],"tutti":bool}
-- test_ab: JSON {"varianti":[{"chiave":"A","oggetto":..,"preheader":..}],"percentualeTest":20,"metrica":"APERTURE"|"CLICK","oreAttesa":4,"vincitore":"A"|null}
CREATE TABLE IF NOT EXISTS mailing_campagne (
    id BIGSERIAL PRIMARY KEY,
    nome VARCHAR(200) NOT NULL,
    stato VARCHAR(20) NOT NULL DEFAULT 'BOZZA',
    mittente_id BIGINT NULL REFERENCES mailing_mittenti (id) ON DELETE SET NULL,
    categoria_id BIGINT NULL REFERENCES mailing_categorie (id) ON DELETE SET NULL,
    oggetto VARCHAR(300) NULL,
    preheader VARCHAR(300) NULL,
    design TEXT NULL,
    html TEXT NULL,
    pubblico TEXT NULL,
    test_ab TEXT NULL,
    invio_intelligente BOOLEAN NOT NULL DEFAULT FALSE,
    utm_campaign VARCHAR(120) NULL,
    programmata_il TIMESTAMP WITHOUT TIME ZONE NULL,
    invio_iniziato_il TIMESTAMP WITHOUT TIME ZONE NULL,
    invio_completato_il TIMESTAMP WITHOUT TIME ZONE NULL,
    destinatari_totali INTEGER NULL,
    creato_da_utente_id BIGINT NULL,
    creato_il TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    aggiornato_il TIMESTAMP WITHOUT TIME ZONE NULL
);

CREATE INDEX IF NOT EXISTS idx_mailing_campagne_stato ON mailing_campagne (stato, programmata_il);

-- ───────────────────────── Automazioni ─────────────────────────
-- stato: BOZZA, ATTIVA, IN_PAUSA, ARCHIVIATA
-- trigger: JSON {"tipo":"TAG_AGGIUNTO"|"NUOVO_LEAD"|"CONOSCITIVA_PRENOTATA"|"CONOSCITIVA_SVOLTA"|"ESITO_CONOSCITIVA"
--               |"PRIMA_VISITA_PRENOTATA"|"PRIMA_VISITA_EFFETTUATA"|"VISITA_EFFETTUATA"|"ACQUISTO"|"COMPLEANNO"
--               |"INATTIVO_DA_GIORNI"|"ENTRATA_SEGMENTO"|"ISCRIZIONE"|"MANUALE", "parametri":{..}}
-- grafo: JSON {"nodi":[{"id","tipo":"EMAIL"|"ATTESA"|"ATTESA_FINO_A"|"CONDIZIONE"|"AGGIUNGI_TAG"|"RIMUOVI_TAG"
--               |"NOTIFICA_STAFF" (crea un task)|"FINE","config":{..},"x","y"}],"archi":[{"da","a","ramo":"SI"|"NO"|null}]}
-- uscita: JSON regole che fanno uscire il contatto (es. {"tipo":"ACQUISTO"}), null = nessuna
CREATE TABLE IF NOT EXISTS mailing_automazioni (
    id BIGSERIAL PRIMARY KEY,
    nome VARCHAR(200) NOT NULL,
    descrizione VARCHAR(500) NULL,
    stato VARCHAR(20) NOT NULL DEFAULT 'BOZZA',
    mittente_id BIGINT NULL REFERENCES mailing_mittenti (id) ON DELETE SET NULL,
    categoria_id BIGINT NULL REFERENCES mailing_categorie (id) ON DELETE SET NULL,
    trigger_config TEXT NOT NULL,
    grafo TEXT NOT NULL,
    uscita TEXT NULL,
    rientro_consentito BOOLEAN NOT NULL DEFAULT FALSE,
    solo_orari_lavorativi BOOLEAN NOT NULL DEFAULT TRUE,
    attivata_il TIMESTAMP WITHOUT TIME ZONE NULL,
    creato_da_utente_id BIGINT NULL,
    creato_il TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    aggiornato_il TIMESTAMP WITHOUT TIME ZONE NULL
);

-- stato: ATTIVA, IN_ATTESA, COMPLETATA, USCITA, ERRORE
CREATE TABLE IF NOT EXISTS mailing_automazioni_iscrizioni (
    id BIGSERIAL PRIMARY KEY,
    automazione_id BIGINT NOT NULL REFERENCES mailing_automazioni (id) ON DELETE CASCADE,
    contatto_id BIGINT NOT NULL REFERENCES mailing_contatti (id) ON DELETE CASCADE,
    nodo_corrente VARCHAR(60) NULL,
    stato VARCHAR(20) NOT NULL DEFAULT 'ATTIVA',
    prossima_azione_il TIMESTAMP WITHOUT TIME ZONE NULL,
    contesto TEXT NULL,
    errore TEXT NULL,
    iniziata_il TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    conclusa_il TIMESTAMP WITHOUT TIME ZONE NULL
);

CREATE INDEX IF NOT EXISTS idx_mailing_iscrizioni_prossime ON mailing_automazioni_iscrizioni (stato, prossima_azione_il);
CREATE INDEX IF NOT EXISTS idx_mailing_iscrizioni_automazione ON mailing_automazioni_iscrizioni (automazione_id, stato);
CREATE INDEX IF NOT EXISTS idx_mailing_iscrizioni_contatto ON mailing_automazioni_iscrizioni (contatto_id);

-- Contenuto delle email delle automazioni (un nodo EMAIL punta qui con config.emailId).
CREATE TABLE IF NOT EXISTS mailing_automazioni_email (
    id BIGSERIAL PRIMARY KEY,
    automazione_id BIGINT NOT NULL REFERENCES mailing_automazioni (id) ON DELETE CASCADE,
    nome VARCHAR(200) NULL,
    oggetto VARCHAR(300) NOT NULL,
    preheader VARCHAR(300) NULL,
    design TEXT NULL,
    html TEXT NOT NULL,
    creato_il TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    aggiornato_il TIMESTAMP WITHOUT TIME ZONE NULL
);

-- ───────────────────────── Invii (uno per destinatario e messaggio) ─────────────────────────
-- stato: IN_CODA, IN_INVIO, INVIATO, RIMBALZATO, ERRORE, SALTATO, ANNULLATO
CREATE TABLE IF NOT EXISTS mailing_invii (
    id BIGSERIAL PRIMARY KEY,
    token VARCHAR(40) NOT NULL,
    contatto_id BIGINT NOT NULL REFERENCES mailing_contatti (id) ON DELETE CASCADE,
    campagna_id BIGINT NULL REFERENCES mailing_campagne (id) ON DELETE CASCADE,
    automazione_email_id BIGINT NULL REFERENCES mailing_automazioni_email (id) ON DELETE SET NULL,
    iscrizione_id BIGINT NULL REFERENCES mailing_automazioni_iscrizioni (id) ON DELETE SET NULL,
    mittente_id BIGINT NULL REFERENCES mailing_mittenti (id) ON DELETE SET NULL,
    email VARCHAR(255) NOT NULL,
    variante VARCHAR(5) NULL,
    oggetto VARCHAR(300) NULL,
    stato VARCHAR(20) NOT NULL DEFAULT 'IN_CODA',
    programmato_per TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    tentativi SMALLINT NOT NULL DEFAULT 0,
    message_id VARCHAR(255) NULL,
    gmail_id VARCHAR(100) NULL,
    inviato_il TIMESTAMP WITHOUT TIME ZONE NULL,
    prima_apertura_il TIMESTAMP WITHOUT TIME ZONE NULL,
    aperture INTEGER NOT NULL DEFAULT 0,
    primo_click_il TIMESTAMP WITHOUT TIME ZONE NULL,
    click INTEGER NOT NULL DEFAULT 0,
    risposto_il TIMESTAMP WITHOUT TIME ZONE NULL,
    disiscritto_il TIMESTAMP WITHOUT TIME ZONE NULL,
    rimbalzo_tipo VARCHAR(10) NULL,
    errore TEXT NULL,
    creato_il TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mailing_invii_token ON mailing_invii (token);
CREATE INDEX IF NOT EXISTS idx_mailing_invii_coda ON mailing_invii (stato, programmato_per) WHERE stato IN ('IN_CODA', 'IN_INVIO');
CREATE INDEX IF NOT EXISTS idx_mailing_invii_campagna ON mailing_invii (campagna_id, stato);
CREATE INDEX IF NOT EXISTS idx_mailing_invii_automazione_email ON mailing_invii (automazione_email_id);
CREATE INDEX IF NOT EXISTS idx_mailing_invii_contatto ON mailing_invii (contatto_id, creato_il DESC);
CREATE INDEX IF NOT EXISTS idx_mailing_invii_mittente_giorno ON mailing_invii (mittente_id, inviato_il);
CREATE INDEX IF NOT EXISTS idx_mailing_invii_message_id ON mailing_invii (message_id);
-- Lo stesso messaggio di campagna non parte due volte allo stesso contatto.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mailing_invii_campagna_contatto ON mailing_invii (campagna_id, contatto_id) WHERE campagna_id IS NOT NULL;

-- Link tracciati: l'URL originale per indice, per messaggio (campagna o email di automazione).
CREATE TABLE IF NOT EXISTS mailing_link (
    id BIGSERIAL PRIMARY KEY,
    campagna_id BIGINT NULL REFERENCES mailing_campagne (id) ON DELETE CASCADE,
    automazione_email_id BIGINT NULL REFERENCES mailing_automazioni_email (id) ON DELETE CASCADE,
    indice INTEGER NOT NULL,
    url TEXT NOT NULL,
    etichetta VARCHAR(300) NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mailing_link_campagna ON mailing_link (campagna_id, indice) WHERE campagna_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mailing_link_auto_email ON mailing_link (automazione_email_id, indice) WHERE automazione_email_id IS NOT NULL;

-- ───────────────────────── Eventi ─────────────────────────
-- tipo: INVIATO, APERTURA, CLICK, RISPOSTA, DISISCRIZIONE, RIMBALZO, SPAM, CONVERSIONE_VISITA, CONVERSIONE_ACQUISTO
-- automatico: apertura/click attribuibile a proxy o scanner (Apple Mail Privacy, antivirus), escluso dalle metriche "umane"
CREATE TABLE IF NOT EXISTS mailing_eventi (
    id BIGSERIAL PRIMARY KEY,
    tipo VARCHAR(30) NOT NULL,
    invio_id BIGINT NULL REFERENCES mailing_invii (id) ON DELETE CASCADE,
    contatto_id BIGINT NULL REFERENCES mailing_contatti (id) ON DELETE CASCADE,
    campagna_id BIGINT NULL,
    automazione_id BIGINT NULL,
    link_indice INTEGER NULL,
    url TEXT NULL,
    dispositivo VARCHAR(20) NULL,
    client VARCHAR(60) NULL,
    automatico BOOLEAN NOT NULL DEFAULT FALSE,
    valore NUMERIC(12, 2) NULL,
    riferimento_id BIGINT NULL,
    avvenuto_il TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mailing_eventi_campagna ON mailing_eventi (campagna_id, tipo, avvenuto_il);
CREATE INDEX IF NOT EXISTS idx_mailing_eventi_automazione ON mailing_eventi (automazione_id, tipo, avvenuto_il);
CREATE INDEX IF NOT EXISTS idx_mailing_eventi_contatto ON mailing_eventi (contatto_id, avvenuto_il DESC);
CREATE INDEX IF NOT EXISTS idx_mailing_eventi_tempo ON mailing_eventi (avvenuto_il DESC);

-- ───────────────────────── Dati iniziali ─────────────────────────
INSERT INTO mailing_categorie (nome, descrizione, ordine)
SELECT v.nome, v.descrizione, v.ordine
FROM (VALUES
    ('Newsletter', 'Contenuti, consigli su alimentazione e mentalita, novita dal Dr. Bo', 1),
    ('Promozioni', 'Offerte, masterclass e iniziative riservate', 2),
    ('Percorso', 'Email legate al tuo percorso: promemoria, consigli dopo la visita', 3)
) AS v(nome, descrizione, ordine)
WHERE NOT EXISTS (SELECT 1 FROM mailing_categorie);

-- Tag di sistema assegnati dal gestionale: esistono già, così i trigger TAG_AGGIUNTO si possono scegliere da subito.
INSERT INTO mailing_tag (nome, colore, sistema) VALUES
    ('LEAD', NULL, TRUE),
    ('PAZIENTE', NULL, TRUE),
    ('CONOSCITIVA_PRENOTATA', NULL, TRUE),
    ('PERCORSO_METODO_BUSSOLA', NULL, TRUE),
    ('PERCORSO_RINNOVO', NULL, TRUE),
    ('PERCORSO_MANTENIMENTO', NULL, TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO config (chiave, valore, descrizione) VALUES
    ('MAILING_INVIO_ENABLED', 'false',
     'Email Marketing: interruttore di sistema (solo da DB). Se non e true nessuna email parte, nemmeno prove'),
    ('MAILING_INVIO_ABILITATO', 'false',
     'Email Marketing: interruttore degli invii (campagne e automazioni). Spento = la coda resta ferma'),
    ('JOB_MAILING_INVIO_ENABLED', 'true',
     'Email Marketing: worker che smaltisce la coda di invio rispettando i limiti di ogni mittente'),
    ('JOB_MAILING_AUTOMAZIONI_ENABLED', 'true',
     'Email Marketing: job che fa avanzare i contatti nelle automazioni'),
    ('JOB_MAILING_RIMBALZI_ENABLED', 'true',
     'Email Marketing: job che legge rimbalzi e risposte dalle caselle mittenti'),
    ('MAILING_INDIRIZZO_POSTALE', 'Dr. Edoardo Bo',
     'Email Marketing: nome e indirizzo in fondo a ogni email (obbligatorio per legge)'),
    ('MAILING_FINESTRA_ATTRIBUZIONE_GIORNI', '7',
     'Email Marketing: giorni dopo un click entro cui conoscitiva, visita o acquisto si attribuiscono alla email')
ON CONFLICT (chiave) DO NOTHING;
