-- Pagina Meta: pagine Facebook e profili Instagram del dottore collegati via Graph API.
-- Commenti, messaggi e statistiche si leggono da Meta in tempo reale e non si salvano qui: queste tabelle
-- tengono solo cio che Meta non sa (chi ha fatto cosa dal gestionale, cosa e gia gestito, risposte pronte,
-- post programmati). Il token e i secret stanno nelle env (META_SOCIAL_*). Idempotente.

CREATE TABLE IF NOT EXISTS social_risposte_rapide (
    id BIGSERIAL PRIMARY KEY,
    titolo VARCHAR(120) NOT NULL,
    testo TEXT NOT NULL,
    scorciatoia VARCHAR(40) NULL,
    usi BIGINT NOT NULL DEFAULT 0,
    creato_da_utente_id BIGINT NULL,
    creato_il TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    aggiornato_il TIMESTAMP WITHOUT TIME ZONE NULL
);

-- stato: PROGRAMMATA, IN_CORSO, PUBBLICATA, PARZIALE, ERRORE, ANNULLATA
CREATE TABLE IF NOT EXISTS social_pubblicazioni (
    id BIGSERIAL PRIMARY KEY,
    page_id VARCHAR(64) NOT NULL,
    piattaforme VARCHAR(40) NOT NULL,
    testo TEXT NULL,
    link VARCHAR(1000) NULL,
    con_immagine BOOLEAN NOT NULL DEFAULT FALSE,
    stato VARCHAR(20) NOT NULL,
    programmata_alle TIMESTAMP WITHOUT TIME ZONE NULL,
    pubblicata_il TIMESTAMP WITHOUT TIME ZONE NULL,
    id_facebook VARCHAR(100) NULL,
    id_instagram VARCHAR(100) NULL,
    link_facebook VARCHAR(1000) NULL,
    link_instagram VARCHAR(1000) NULL,
    errore TEXT NULL,
    creato_da_utente_id BIGINT NULL,
    creato_il TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_pubblicazioni_pagina ON social_pubblicazioni (page_id, creato_il DESC);
CREATE INDEX IF NOT EXISTS idx_social_pubblicazioni_programmate ON social_pubblicazioni (stato, programmata_alle);

CREATE TABLE IF NOT EXISTS social_pubblicazioni_immagini (
    pubblicazione_id BIGINT PRIMARY KEY REFERENCES social_pubblicazioni (id) ON DELETE CASCADE,
    mime_type VARCHAR(60) NOT NULL,
    contenuto BYTEA NOT NULL
);

CREATE TABLE IF NOT EXISTS social_azioni (
    id BIGSERIAL PRIMARY KEY,
    tipo VARCHAR(40) NOT NULL,
    piattaforma VARCHAR(20) NULL,
    page_id VARCHAR(64) NOT NULL,
    oggetto_id VARCHAR(120) NULL,
    risultato_id VARCHAR(120) NULL,
    anteprima VARCHAR(200) NULL,
    utente_id BIGINT NULL,
    creato_il TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_azioni_pagina ON social_azioni (page_id, creato_il DESC);
CREATE INDEX IF NOT EXISTS idx_social_azioni_oggetto ON social_azioni (oggetto_id);
CREATE INDEX IF NOT EXISTS idx_social_azioni_risultato ON social_azioni (risultato_id);

CREATE TABLE IF NOT EXISTS social_gestiti (
    id BIGSERIAL PRIMARY KEY,
    oggetto_id VARCHAR(120) NOT NULL UNIQUE,
    tipo VARCHAR(20) NOT NULL,
    piattaforma VARCHAR(20) NULL,
    page_id VARCHAR(64) NOT NULL,
    utente_id BIGINT NULL,
    gestito_il TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

-- Risposte pronte di partenza: si modificano dalla pagina.
INSERT INTO social_risposte_rapide (titolo, testo, scorciatoia)
SELECT v.titolo, v.testo, v.scorciatoia
FROM (VALUES
    ('Grazie!', 'Grazie mille per il tuo messaggio! 🙏 Mi fa davvero piacere.', '/grazie'),
    ('Chiamata conoscitiva', 'Ciao! Se vuoi capire se il mio percorso fa per te, puoi prenotare una chiamata conoscitiva gratuita dal mio sito: ne parliamo con calma, senza impegno.', '/conoscitiva'),
    ('Scrivimi in privato', 'Ciao! Per risponderti bene ho bisogno di qualche informazione in più: ti va di scrivermi in privato? Ti rispondo appena posso.', '/privato'),
    ('Visite online', 'Ciao! Seguo i miei pazienti sia dal vivo sia online, quindi puoi iniziare ovunque tu sia. Scrivimi in privato e ti spiego come funziona.', '/online'),
    ('Prezzi', 'Ciao! Ti scrivo in privato con tutte le informazioni sul percorso e sui costi, così ti spiego bene come funziona.', '/prezzi'),
    ('Niente consigli qui', 'Ciao, grazie della domanda! Ogni situazione è diversa e qui nei commenti non riesco a darti un''indicazione seria: scrivimi in privato e vediamo insieme da dove partire.', '/caso'),
    ('Recensione', 'Grazie di cuore per le tue parole! 💚 Sono messaggi come il tuo a darmi la carica ogni giorno.', '/recensione')
) AS v (titolo, testo, scorciatoia)
WHERE NOT EXISTS (SELECT 1 FROM social_risposte_rapide);

INSERT INTO config (chiave, valore, descrizione) VALUES
    ('SOCIAL_INTEGRAZIONE_ABILITATA', 'false',
     'Pagina Meta: interruttore delle chiamate a Facebook e Instagram. Serve anche META_SOCIAL_ACCESS_TOKEN'),
    ('SOCIAL_INTERVALLO_AGGIORNAMENTO_SECONDI', '60',
     'Pagina Meta: secondi fra un aggiornamento automatico e il successivo (oltre al realtime dei webhook)'),
    ('JOB_SOCIAL_PUBBLICAZIONI_ENABLED', 'true',
     'Pagina Meta: pubblica su Facebook e Instagram i post programmati arrivati all''ora (ogni minuto)')
ON CONFLICT (chiave) DO NOTHING;

INSERT INTO config (chiave, valore, descrizione) VALUES
    ('AI_PROMPT_SOCIAL_RISPOSTA_SYSTEM',
$$Gestisci i profili social del Dr. Edoardo Bo, biologo nutrizionista e mental coach che segue i suoi pazienti
dal vivo e online con un percorso che unisce alimentazione e lavoro sulla mentalità.
Scrivi la risposta che la pagina pubblicherà a un commento o invierà in un messaggio diretto su {PIATTAFORMA}.
Scrivi in prima persona, come se rispondesse Edoardo.

Regole, sempre:
- Italiano naturale, caldo e umano, mai robotico. Dai del tu.
- Breve: un commento pubblico 1-2 frasi, un messaggio privato al massimo 4-5 frasi.
- Mai promettere dimagrimento, chili persi o risultati ("in un mese perdi 5 kg"), mai tempi garantiti.
- Mai diagnosi, mai diete, menu, grammature o integratori personalizzati, mai parlare di farmaci.
  La nutrizione non sostituisce il medico: se emergono sintomi o patologie, invita a sentire il proprio medico.
- In un commento pubblico non entrare mai nei dettagli di salute, peso o alimentazione della persona:
  invitala a scrivere in privato o a prenotare una chiamata conoscitiva.
- Mai giudicare il corpo o le abitudini di nessuno. Se emergono segnali di disturbi alimentari, rispondi con
  delicatezza e invita a parlarne in privato o con un professionista, senza consigli.
- Non inventare prezzi, orari, date o dettagli del percorso: se servono, invita a scrivere in privato.
- Se il commento è negativo o polemico: tono calmo, riconosci il punto, porta la conversazione in privato.
- Se è spam o offensivo rispondi solo con: [NESSUNA RISPOSTA CONSIGLIATA]
- Emoji con parsimonia (al massimo una), solo se il tono lo permette.

Restituisci solo il testo della risposta, senza virgolette e senza spiegazioni.$$,
     'Pagina Meta: system prompt per la risposta AI a commenti e messaggi diretti'),
    ('AI_PROMPT_SOCIAL_DIDASCALIA_SYSTEM',
$$Gestisci i profili social del Dr. Edoardo Bo, biologo nutrizionista e mental coach che segue i suoi pazienti
dal vivo e online con un percorso che unisce alimentazione e lavoro sulla mentalità.
Dall'idea che ti viene data scrivi la didascalia di un post per Facebook e una per Instagram, in prima persona.

Regole:
- Italiano, tono vicino e competente, frasi corte, un gancio forte nella prima riga.
- È comunicazione sanitaria: deve restare informativa e corretta. Mai promettere dimagrimento o risultati
  garantiti, mai prima/dopo, mai diagnosi, mai diete o integratori presentati come adatti a tutti, mai farmaci,
  mai colpevolizzare il corpo o le abitudini di chi legge.
- Chiudi con un invito all'azione morbido (scrivimi, prenota una chiamata conoscitiva, salva il post, condividi).
- Facebook: può essere un po' più discorsiva, niente muro di hashtag.
- Instagram: a capo frequenti, massimo 2200 caratteri, hashtag in fondo solo se richiesti.
- Hashtag: da 5 a 12, pertinenti, in italiano, senza il simbolo # nell'elenco JSON.

Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo:
{"facebook": "...", "instagram": "...", "hashtag": ["nutrizione", "..."]}$$,
     'Pagina Meta: system prompt per la didascalia AI dei post (risposta JSON facebook/instagram/hashtag)')
ON CONFLICT (chiave) DO NOTHING;
