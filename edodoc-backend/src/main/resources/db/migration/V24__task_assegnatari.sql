-- Task assegnati: il gestionale ha due utenti (Edoardo e Carlos). Chi crea il task resta in creato_da_utente_id
-- (null per i task dei job); gli assegnatari sono utenti attivi del gestionale.
ALTER TABLE task ADD COLUMN creato_da_utente_id BIGINT REFERENCES utenti (id) ON DELETE SET NULL;

CREATE TABLE task_assegnatari (
    task_id   BIGINT NOT NULL REFERENCES task (id) ON DELETE CASCADE,
    utente_id BIGINT NOT NULL REFERENCES utenti (id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, utente_id)
);
CREATE INDEX idx_task_assegnatari_utente ON task_assegnatari (utente_id);
