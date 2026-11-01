-- Vocali del dottore. Stanno in una tabella a parte, come le copertine, così le liste dei check non li caricano.
-- A differenza delle copertine non hanno un URL pubblico: si leggono solo passando dal check.
CREATE TABLE feedback_audio (
    id         UUID PRIMARY KEY,
    dati       BYTEA NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Il feedback può essere solo vocale: feedback resta null e il testo non basta più a dire se c'è una risposta
ALTER TABLE check_settimanali
    ADD COLUMN feedback_audio_id      UUID REFERENCES feedback_audio (id),
    ADD COLUMN feedback_audio_secondi INTEGER,
    ADD COLUMN feedback_email_il      TIMESTAMP;

-- Segnaposto: {nome}, {feedback}. Il vocale non si allega: l'email avvisa soltanto che è nell'app.
INSERT INTO config (chiave, valore, descrizione) VALUES
('EMAIL_FEEDBACK_OGGETTO', 'Il tuo check settimanale', 'Feedback al check, oggetto'),
('EMAIL_FEEDBACK_TESTO', E'Ciao {nome},\n\nho letto il tuo check settimanale:\n\n{feedback}\n\nUn caro saluto,\nDott. Edoardo Bo', 'Feedback al check, testo'),
('EMAIL_FEEDBACK_VOCALE_TESTO', E'Ciao {nome},\n\nho letto il tuo check settimanale e ti ho lasciato un messaggio vocale: lo trovi nell''app EdoDoc.\n\nUn caro saluto,\nDott. Edoardo Bo', 'Feedback vocale al check, testo');
