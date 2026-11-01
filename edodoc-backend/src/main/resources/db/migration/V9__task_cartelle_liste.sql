-- I task si organizzano in cartelle annidate e liste: i tipi spariscono, i task esistenti finiscono nella lista corrispondente.
-- codice: identifica le liste di sistema, dove i job mettono i task automatici (non si archiviano né si eliminano)
CREATE TABLE task_cartelle (
    id         BIGSERIAL PRIMARY KEY,
    nome       VARCHAR(100) NOT NULL,
    parent_id  BIGINT REFERENCES task_cartelle (id),
    colore     VARCHAR(7) NOT NULL DEFAULT '#64748B',
    ordine     INTEGER NOT NULL DEFAULT 0,
    archiviata BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_task_cartelle_parent ON task_cartelle (parent_id);

CREATE TABLE task_liste (
    id          BIGSERIAL PRIMARY KEY,
    nome        VARCHAR(100) NOT NULL,
    cartella_id BIGINT REFERENCES task_cartelle (id),
    codice      VARCHAR(40) UNIQUE,
    colore      VARCHAR(7) NOT NULL DEFAULT '#6366F1',
    icona       VARCHAR(40) NOT NULL DEFAULT 'list',
    ordine      INTEGER NOT NULL DEFAULT 0,
    archiviata  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_task_liste_cartella ON task_liste (cartella_id);

INSERT INTO task_cartelle (nome, colore, ordine) VALUES
('Pazienti',        '#10B981', 10),
('Amministrazione', '#F59E0B', 20);

INSERT INTO task_liste (nome, cartella_id, codice, colore, icona, ordine) VALUES
('Contatti e rinnovi',  (SELECT id FROM task_cartelle WHERE nome = 'Pazienti'),        'CONTATTI',  '#10B981', 'phone',       10),
('Piani ed esami',      (SELECT id FROM task_cartelle WHERE nome = 'Pazienti'),        'PIANI',     '#14B8A6', 'stethoscope', 20),
('Fatture e pagamenti', (SELECT id FROM task_cartelle WHERE nome = 'Amministrazione'), 'PAGAMENTI', '#F59E0B', 'wallet',      10),
('Fisco',               (SELECT id FROM task_cartelle WHERE nome = 'Amministrazione'), 'FISCO',     '#EF4444', 'briefcase',   20),
('Generale',            NULL,                                                          'GENERALE',  '#6366F1', 'list',        10);

ALTER TABLE task ADD COLUMN lista_id BIGINT REFERENCES task_liste (id) ON DELETE CASCADE;

UPDATE task t
SET lista_id = l.id
FROM task_tipi tt, task_liste l
WHERE tt.id = t.tipo_id
  AND l.codice = CASE
      WHEN tt.codice IN ('RICONTATTO_POST_CALL', 'MESSAGGIO_SEGNALE', 'PROPOSTA_RINNOVO', 'FISSARE_VISITA') THEN 'CONTATTI'
      WHEN tt.codice IN ('RICHIESTA_ESAMI', 'INVIO_PIANO', 'MODIFICA_PIANO') THEN 'PIANI'
      WHEN tt.codice IN ('RICHIESTA_DATI', 'SOLLECITO_PAGAMENTO', 'EMETTERE_FATTURA') THEN 'PAGAMENTI'
      WHEN tt.codice IN ('TESSERA_SANITARIA', 'SCADENZA_FISCALE') THEN 'FISCO'
      ELSE 'GENERALE'
  END;

-- Nessun job scrive in questa lista: è una lista normale
UPDATE task_liste SET codice = NULL WHERE codice = 'PAGAMENTI';

ALTER TABLE task ALTER COLUMN lista_id SET NOT NULL;
ALTER TABLE task DROP COLUMN tipo_id;
DROP TABLE task_tipi;
CREATE INDEX idx_task_lista ON task (lista_id);
