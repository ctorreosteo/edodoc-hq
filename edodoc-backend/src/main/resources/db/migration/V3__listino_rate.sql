-- Percorso: 1500 € in anticipo o 3 rate da 700 € ogni due mesi.
-- Mantenimento: 600 € in anticipo o 2 rate da 400 € semestrali.
DELETE FROM config WHERE chiave IN ('LISTINO_TRANCHE_1', 'LISTINO_TRANCHE_2', 'LISTINO_TRANCHE_3');

UPDATE config SET descrizione = 'Percorso 6 mesi, pagamento in anticipo' WHERE chiave = 'LISTINO_PAGAMENTO_UNICO';
UPDATE config SET descrizione = 'Mantenimento, pagamento in anticipo (4 visite nell''anno)' WHERE chiave = 'LISTINO_MANTENIMENTO';

INSERT INTO config (chiave, valore, descrizione) VALUES
('LISTINO_RATA_PERCORSO',     '700', 'Percorso 6 mesi, importo di ciascuna delle 3 rate (ogni due mesi)'),
('LISTINO_RATA_MANTENIMENTO', '400', 'Mantenimento, importo di ciascuna delle 2 rate (semestrali)');

UPDATE percorsi SET piano_pagamento = 'RATE' WHERE piano_pagamento = 'TRE_TRANCHE';
UPDATE pagamenti SET tipo = 'RATA' WHERE tipo = 'TRANCHE';
