-- Modelli delle email al paziente. Il popup li propone e il dottore può cambiarli prima dell'invio.
-- Segnaposto: {nome}, {dettaglio}, {totale}, {iban}.
INSERT INTO config (chiave, valore, descrizione) VALUES
('EMAIL_SOLLECITO_OGGETTO', 'Promemoria pagamento', 'Sollecito pagamento, oggetto'),
('EMAIL_SOLLECITO_TESTO', E'Ciao {nome},\n\nti scrivo perché risulta ancora da saldare:\n\n{dettaglio}\n\nTotale: {totale}\n\nPuoi fare il bonifico sull''IBAN {iban}. Se hai già provveduto, ignora pure questo messaggio.\n\nUn caro saluto,\nDott. Edoardo Bo', 'Sollecito pagamento, testo'),
('EMAIL_DATI_OGGETTO', 'Dati per la fattura', 'Richiesta dati fatturazione, oggetto'),
('EMAIL_DATI_TESTO', E'Ciao {nome},\n\nper preparare la fattura mi servono questi dati:\n\n- nome e cognome\n- indirizzo di residenza\n- codice fiscale\n\nPuoi rispondere direttamente a questa email.\n\nUn caro saluto,\nDott. Edoardo Bo', 'Richiesta dati fatturazione, testo');
