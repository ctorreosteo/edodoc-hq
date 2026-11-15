-- Prenotazioni della chiamata conoscitiva arrivate dal sito. La chiamata vera è la visita collegata:
-- orario, stato e sincronizzazione con Google stanno lì. Qui restano quello che la persona ha scritto,
-- la sua risposta all'invito, la disdetta, l'esito commerciale della chiamata e la cronologia.
CREATE TABLE prenotazioni (
    id               BIGSERIAL PRIMARY KEY,
    visita_id        BIGINT NOT NULL UNIQUE REFERENCES visite (id),
    paziente_id      BIGINT NOT NULL REFERENCES pazienti (id),
    obiettivo        VARCHAR(80),
    messaggio        TEXT,
    nuovo_contatto   BOOLEAN NOT NULL DEFAULT TRUE,
    -- IN_ATTESA, ACCETTATO, FORSE, RIFIUTATO: letta dall'invitato sull'evento di Google
    risposta_invito  VARCHAR(20) NOT NULL DEFAULT 'IN_ATTESA',
    -- disdetta_da: PERSONA (detto al dottore), INVITO (ha rifiutato su Google)
    disdetta_il      TIMESTAMP,
    disdetta_da      VARCHAR(20),
    disdetta_motivo  VARCHAR(255),
    -- INTERESSATO, CI_PENSA, ACQUISTATO, NON_ADATTO: si sceglie dopo la chiamata
    esito            VARCHAR(20),
    note_dottore     TEXT,
    created_at       TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_prenotazioni_paziente ON prenotazioni (paziente_id);

CREATE TABLE prenotazione_eventi (
    id               BIGSERIAL PRIMARY KEY,
    prenotazione_id  BIGINT NOT NULL REFERENCES prenotazioni (id) ON DELETE CASCADE,
    tipo             VARCHAR(30) NOT NULL,
    testo            VARCHAR(500) NOT NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_prenotazione_eventi ON prenotazione_eventi (prenotazione_id, created_at);

-- Le chiamate già prenotate dal sito prima di questa tabella (riconoscibili dalla nota)
INSERT INTO prenotazioni (visita_id, paziente_id, obiettivo, messaggio, created_at)
SELECT v.id, v.paziente_id,
       substring(v.note from 'Obiettivo: ([^\n]*)'),
       nullif(trim(substring(v.note from '\n\n(.*)$')), ''),
       v.created_at
FROM visite v
WHERE v.tipo = 'CHIAMATA_CONOSCITIVA' AND v.note LIKE 'Prenotata dal sito%';

INSERT INTO prenotazione_eventi (prenotazione_id, tipo, testo, created_at)
SELECT p.id, 'CREATA', 'Prenotata dal sito edodoc.it', p.created_at FROM prenotazioni p;
