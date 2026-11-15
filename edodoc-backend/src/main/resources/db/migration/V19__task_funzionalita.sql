-- Task come in Mobilitas HQ: stati e priorità nuovi, orari, inizio, stima, sottotask, ordine del kanban,
-- etichette, checklist, cronologia, allegati nel database, dipendenze e colonne della vista lista.

-- Stati: DA_FARE, IN_CORSO, IN_ATTESA, COMPLETATO, ANNULLATO
UPDATE task SET stato = 'COMPLETATO' WHERE stato = 'FATTO';

-- Priorità: URGENTE, ALTA, NORMALE, BASSA, oppure nessuna (null)
ALTER TABLE task ALTER COLUMN priorita DROP NOT NULL;
ALTER TABLE task ALTER COLUMN priorita DROP DEFAULT;
ALTER TABLE task ALTER COLUMN priorita TYPE VARCHAR(20);
UPDATE task SET priorita = 'NORMALE' WHERE priorita = 'MEDIA';

-- Inizio e scadenza come data + ora facoltativa, senza fuso; stima in minuti; parent_id per i sottotask (un livello)
ALTER TABLE task
    ADD COLUMN scadenza_ora  TIME,
    ADD COLUMN data_inizio   DATE,
    ADD COLUMN inizio_ora    TIME,
    ADD COLUMN stima_minuti  INTEGER CHECK (stima_minuti IS NULL OR stima_minuti BETWEEN 1 AND 60000),
    ADD COLUMN parent_id     BIGINT REFERENCES task (id) ON DELETE CASCADE,
    ADD COLUMN ordine        DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN aggiornato_il TIMESTAMP NOT NULL DEFAULT now();
ALTER TABLE task ADD CONSTRAINT task_parent_diverso CHECK (parent_id IS NULL OR parent_id <> id);

-- I più recenti in cima alla colonna del kanban, come i task nuovi
UPDATE task SET ordine = -id * 1024, aggiornato_il = COALESCE(completato_il, created_at);

CREATE INDEX idx_task_parent ON task (parent_id);
CREATE INDEX idx_task_lista_stato_ordine ON task (lista_id, stato, ordine);

ALTER TABLE task_liste ADD COLUMN descrizione VARCHAR(500);
ALTER TABLE task_liste ALTER COLUMN icona DROP NOT NULL;
ALTER TABLE task_cartelle ADD COLUMN descrizione VARCHAR(500);
ALTER TABLE task_cartelle ADD COLUMN icona VARCHAR(40);

CREATE TABLE task_etichette (
    id        BIGSERIAL PRIMARY KEY,
    nome      VARCHAR(50) NOT NULL UNIQUE,
    colore    VARCHAR(7) NOT NULL DEFAULT '#64748B',
    creata_il TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE task_etichette_task (
    task_id      BIGINT NOT NULL REFERENCES task (id) ON DELETE CASCADE,
    etichetta_id BIGINT NOT NULL REFERENCES task_etichette (id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, etichetta_id)
);
CREATE INDEX idx_task_etichette_task_etichetta ON task_etichette_task (etichetta_id);

CREATE TABLE task_checklist (
    id            BIGSERIAL PRIMARY KEY,
    task_id       BIGINT NOT NULL REFERENCES task (id) ON DELETE CASCADE,
    testo         VARCHAR(500) NOT NULL,
    completato    BOOLEAN NOT NULL DEFAULT FALSE,
    ordine        INTEGER NOT NULL DEFAULT 0,
    completato_il TIMESTAMP
);
CREATE INDEX idx_task_checklist_task ON task_checklist (task_id);

-- Cronologia: COMMENTO (markdown) e modifiche (testo = frase senza autore, es. "ha cambiato lo stato da Da fare a In corso")
CREATE TABLE task_eventi (
    id                BIGSERIAL PRIMARY KEY,
    task_id           BIGINT NOT NULL REFERENCES task (id) ON DELETE CASCADE,
    tipo              VARCHAR(30) NOT NULL,
    testo             TEXT,
    valore_precedente VARCHAR(500),
    valore_nuovo      VARCHAR(500),
    creato_il         TIMESTAMP NOT NULL DEFAULT now(),
    modificato_il     TIMESTAMP
);
CREATE INDEX idx_task_eventi_task ON task_eventi (task_id, id);

-- Allegati: metadati qui, il contenuto a parte così gli elenchi non lo leggono
CREATE TABLE task_allegati (
    id           BIGSERIAL PRIMARY KEY,
    task_id      BIGINT NOT NULL REFERENCES task (id) ON DELETE CASCADE,
    evento_id    BIGINT REFERENCES task_eventi (id) ON DELETE CASCADE,
    nome_file    VARCHAR(255) NOT NULL,
    content_type VARCHAR(150),
    estensione   VARCHAR(20),
    dimensione   BIGINT NOT NULL,
    creato_il    TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_task_allegati_task ON task_allegati (task_id);
CREATE INDEX idx_task_allegati_evento ON task_allegati (evento_id);

CREATE TABLE task_allegati_file (
    allegato_id BIGINT PRIMARY KEY REFERENCES task_allegati (id) ON DELETE CASCADE,
    contenuto   BYTEA NOT NULL
);

-- Dipendenze «fine → inizio»: successore_id aspetta predecessore_id
CREATE TABLE task_dipendenze (
    id              BIGSERIAL PRIMARY KEY,
    predecessore_id BIGINT NOT NULL REFERENCES task (id) ON DELETE CASCADE,
    successore_id   BIGINT NOT NULL REFERENCES task (id) ON DELETE CASCADE,
    creato_il       TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT task_dipendenze_unica UNIQUE (predecessore_id, successore_id),
    CONSTRAINT task_dipendenze_diverse CHECK (predecessore_id <> successore_id)
);
CREATE INDEX idx_task_dipendenze_successore ON task_dipendenze (successore_id);

-- Colonne della vista lista per utente: contesto 'predefinita' o 'lista:<id>', colonne JSON [{id, larghezza}]
CREATE TABLE task_colonne_utente (
    utente_id     BIGINT NOT NULL REFERENCES utenti (id) ON DELETE CASCADE,
    contesto      VARCHAR(40) NOT NULL,
    colonne       TEXT NOT NULL,
    aggiornato_il TIMESTAMP NOT NULL DEFAULT now(),
    PRIMARY KEY (utente_id, contesto)
);
