-- La casella e il calendario del gestionale sono quelli di supporto@edodoc.it.
UPDATE config SET valore = 'supporto@edodoc.it' WHERE chiave = 'GOOGLE_ACCOUNT_EMAIL' AND valore = '';
UPDATE config SET valore = 'true' WHERE chiave IN ('GOOGLE_GMAIL_INVIO_ENABLED', 'GOOGLE_CALENDAR_SYNC_ENABLED');
