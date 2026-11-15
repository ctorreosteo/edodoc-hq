-- Prenotazione della chiamata conoscitiva dal sito edodoc.it: orari in cui il dottore la offre e regole.
-- CONOSCITIVA_ORARI: blocchi separati da ";", ognuno "giorni fasce". Giorni: lun mar mer gio ven sab dom,
-- a intervallo (lun-ven) o elenco (lun,mer). Esempio: "lun-ven 09:00-13:00 14:30-19:00; sab 09:00-12:00".
-- Gli slot liberi sono quelli dentro le fasce, senza impegni sul Google Calendar del dottore né visite in agenda.
INSERT INTO config (chiave, valore, descrizione) VALUES
('CONOSCITIVA_ORARI',          'lun-ven 09:00-13:00 14:30-19:00', 'Chiamata conoscitiva dal sito: giorni e fasce orarie (es. "lun-ven 09:00-13:00 14:30-19:00; sab 09:00-12:00")'),
('CONOSCITIVA_PREAVVISO_ORE',  '12', 'Chiamata conoscitiva dal sito: ore minime tra la prenotazione e la chiamata'),
('CONOSCITIVA_GIORNI',         '21', 'Chiamata conoscitiva dal sito: quanti giorni avanti si può prenotare'),
('CONOSCITIVA_MARGINE_MINUTI', '10', 'Chiamata conoscitiva dal sito: minuti liberi prima e dopo gli altri impegni'),
('CONOSCITIVA_MAX_AL_GIORNO',  '4',  'Chiamata conoscitiva dal sito: chiamate al massimo in un giorno')
ON CONFLICT (chiave) DO NOTHING;
