INSERT INTO config (chiave, valore, descrizione) VALUES
-- Integrazioni: spente finché non arrivano gli accessi
('GOOGLE_CALENDAR_SYNC_ENABLED', 'false', 'Sincronizza le visite con Google Calendar'),
('GOOGLE_GMAIL_INVIO_ENABLED',   'false', 'Invia le email dall''account Google del dottore'),
('TESSERA_SANITARIA_ENABLED',    'false', 'Trasmissione delle fatture al Sistema Tessera Sanitaria'),
('GOOGLE_ACCOUNT_EMAIL',         '',      'Account Google Workspace del dottore (impersonato dal Service Account)'),
('GOOGLE_CALENDAR_ID',           'primary', 'Calendario su cui scrivere le visite'),
('GOOGLE_CALENDAR_ULTIMO_SYNC',  '',      'Ultima lettura delle modifiche da Google Calendar (gestito dal job)'),
('VISITA_LUOGO_PRESENZA',        'Milano', 'Luogo delle visite dal vivo nell''invito del calendario'),

-- Listino
('LISTINO_PAGAMENTO_UNICO',  '1500', 'Metodo Bussola, pagamento unico'),
('LISTINO_TRANCHE_1',        '650',  'Metodo Bussola, prima tranche'),
('LISTINO_TRANCHE_2',        '650',  'Metodo Bussola, seconda tranche'),
('LISTINO_TRANCHE_3',        '600',  'Metodo Bussola, terza tranche'),
('LISTINO_ACCONTO_ATTESA',   '50',   'Acconto lista d''attesa'),
('LISTINO_MANTENIMENTO',     '600',  'Mantenimento, pagamento unico (4 visite nell''anno)'),

-- Fattura
('FATTURA_PROSSIMO_NUMERO',    '442', 'Prossimo numero progressivo (non riparte a inizio anno)'),
('FATTURA_ALIQUOTA_CONTRIBUTO','0.04', 'Contributo integrativo ENPAB'),
('FATTURA_BOLLO_SOGLIA',       '77.47', 'Sopra questo importo si applica la marca da bollo'),
('FATTURA_BOLLO_IMPORTO',      '2',    'Importo della marca da bollo'),
('FATTURA_BOLLO_DENTRO_IL_PREZZO', 'false', 'true: il bollo sta dentro il prezzo incassato. false: si aggiunge in fattura'),
('FATTURA_LUOGO',              'Milano', 'Luogo stampato accanto alla data'),
('FATTURA_DESCRIZIONE',        'Consulenza Nutrizionale', 'Descrizione predefinita della prestazione'),
('FATTURA_NOTA_IVA',           'Operazione in franchigia da IVA ai sensi dell''art. 1, commi 54-89, L. 190/2014.', 'Nota fissa IVA'),
('FATTURA_NOTA_RITENUTA',      'Compenso non soggetto a ritenuta d''acconto ai sensi dell''art. 1, comma 67, L. 190/2014.', 'Nota fissa ritenuta'),
('FATTURA_EMAIL_OGGETTO',      'La tua fattura n. {numero}', 'Oggetto dell''email con la fattura'),
('FATTURA_EMAIL_TESTO',        E'Ciao {nome},\n\nin allegato trovi la fattura n. {numero}. Ti ricordo che è detraibile al 19%.\n\nUn caro saluto,\nDott. Edoardo Bo', 'Testo dell''email con la fattura'),

-- Emittente: da compilare in Impostazioni prima di emettere la prima fattura
('EMITTENTE_NOME',          'Dott. Edoardo Bo', 'Nome in fattura'),
('EMITTENTE_TITOLI',        'Biologo Nutrizionista e Mental Coach', 'Titoli professionali in fattura'),
('EMITTENTE_INDIRIZZO',     '', 'Indirizzo in fattura'),
('EMITTENTE_PARTITA_IVA',   '', 'Partita IVA'),
('EMITTENTE_CODICE_FISCALE','', 'Codice fiscale'),
('EMITTENTE_ALBO',          '', 'Iscrizione all''ordine'),
('EMITTENTE_IBAN',          '', 'IBAN per i bonifici'),

-- Fisco (regime forfettario)
('FISCO_COEFFICIENTE_REDDITIVITA', '0.78', 'Coefficiente di redditività'),
('FISCO_ALIQUOTA_SOSTITUTIVA',     '0.05', 'Imposta sostitutiva'),
('FISCO_ALIQUOTA_CASSA',           '0.15', 'Cassa previdenziale'),
('FISCO_SOGLIA_FORFETTARIO',       '85000', 'Soglia del regime forfettario'),
('FISCO_OBIETTIVO_ANNUO',          '70000', 'Obiettivo personale di fatturato'),

-- Check settimanale
('CHECK_SOGLIA_ENERGIA_BASSA', '2', 'Energia uguale o inferiore: segnale di energia bassa');

INSERT INTO task_tipi (codice, etichetta, titolo_default, giorni_default, priorita, icona, ordine) VALUES
('RICONTATTO_POST_CALL', 'Ricontatto dopo la call', 'Ricontattare su WhatsApp dopo la call', 3, 'ALTA', 'phone-call', 10),
('RICHIESTA_DATI',       'Richiesta dati fattura',  'Chiedere nome, indirizzo e codice fiscale', 0, 'ALTA', 'id-card', 20),
('RICHIESTA_ESAMI',      'Richiesta esami',         'Chiedere gli esami del sangue', 1, 'MEDIA', 'test-tube', 30),
('INVIO_PIANO',          'Invio piano',             'Preparare e inviare il piano', 2, 'ALTA', 'file-text', 40),
('MODIFICA_PIANO',       'Modifica piano',          'Aggiornare il piano del paziente', 2, 'MEDIA', 'pencil', 50),
('MESSAGGIO_SEGNALE',    'Messaggio dedicato',      'Scrivere un messaggio dedicato dopo il check', 0, 'ALTA', 'message-circle', 60),
('PROPOSTA_RINNOVO',     'Proposta rinnovo',        'Proporre rinnovo o mantenimento', 7, 'ALTA', 'repeat', 70),
('FISSARE_VISITA',       'Fissare visita',          'Fissare la prossima visita', 3, 'MEDIA', 'calendar-plus', 80),
('SOLLECITO_PAGAMENTO',  'Sollecito pagamento',     'Sollecitare il pagamento', 1, 'ALTA', 'banknote', 90),
('EMETTERE_FATTURA',     'Emettere fattura',        'Emettere la fattura', 0, 'ALTA', 'receipt', 100),
('TESSERA_SANITARIA',    'Tessera Sanitaria',       'Inserire le fatture del mese nel Sistema TS', 5, 'MEDIA', 'landmark', 110),
('SCADENZA_FISCALE',     'Scadenza fiscale',        'Pagare la scadenza fiscale', 7, 'ALTA', 'calendar-clock', 120),
('ALTRO',                'Altro',                   'Nuovo task', 0, 'MEDIA', 'circle-check', 130);
