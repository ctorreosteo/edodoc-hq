-- Il modulo di prenotazione del sito diventa un questionario: l'obiettivo è una risposta aperta e si aggiungono
-- le domande che servono al dottore per arrivare preparato alla chiamata. Le prenotazioni già arrivate restano come sono.
ALTER TABLE prenotazioni ALTER COLUMN obiettivo TYPE TEXT;
ALTER TABLE prenotazioni
    ADD COLUMN professione          VARCHAR(120),
    ADD COLUMN conosciuto_da        VARCHAR(40),
    ADD COLUMN percorsi_precedenti  TEXT,
    ADD COLUMN investimento         VARCHAR(40),
    ADD COLUMN priorita             VARCHAR(80),
    ADD COLUMN perche_ora           TEXT;
