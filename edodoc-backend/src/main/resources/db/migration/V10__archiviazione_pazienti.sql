-- archiviato_il: paziente fuori dagli elenchi e accesso all'app chiuso. I dati restano.
-- anonimizzato_il: i dati identificativi sono stati tolti. Le fatture tengono la propria copia dell'intestatario.
ALTER TABLE pazienti
    ADD COLUMN archiviato_il   TIMESTAMP,
    ADD COLUMN anonimizzato_il TIMESTAMP;

UPDATE pazienti SET archiviato_il = updated_at WHERE attivo = FALSE;
