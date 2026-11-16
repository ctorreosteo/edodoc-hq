-- Chiamata conoscitiva dal sito: si prenota dalle 9:00 alle 19:30 (ultima chiamata alle 19:00), da lunedì a venerdì,
-- e mai per oggi o domani: il primo giorno prenotabile è dopodomani.
UPDATE config
SET valore = 'lun-ven 09:00-19:30'
WHERE chiave = 'CONOSCITIVA_ORARI';

INSERT INTO config (chiave, valore, descrizione) VALUES
('CONOSCITIVA_GIORNI_MINIMI', '2', 'Chiamata conoscitiva dal sito: dopo quanti giorni da oggi si può prenotare (0 = anche oggi, 1 = da domani, 2 = da dopodomani)')
ON CONFLICT (chiave) DO NOTHING;

-- A ogni prenotazione dal sito parte un'email al dottore. Vuoto = l'account Google del gestionale (supporto@edodoc.it).
INSERT INTO config (chiave, valore, descrizione) VALUES
('CONOSCITIVA_EMAIL_AVVISO', '', 'Chiamata conoscitiva dal sito: indirizzo che riceve l''email a ogni nuova prenotazione (vuoto = l''account Google del gestionale)')
ON CONFLICT (chiave) DO NOTHING;
