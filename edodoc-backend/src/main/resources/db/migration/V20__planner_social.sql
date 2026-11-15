-- Planner social (Marketing > Planner), portato da Mobilitas HQ (V601 + V603 + V604): piano editoriale e
-- pubblicazione sui social di EdoDoc. Il lavoro è diviso in spazi (planner_brand: «EdoDoc», ...): ognuno ha i suoi
-- account e i suoi post. Un post ha un testo base e una riga per canale (Facebook, Instagram, YouTube, Google
-- Business, TikTok, LinkedIn, X, Threads, Pinterest) con formato, testo personalizzato e opzioni. I canali con
-- un'integrazione collegata (Meta, YouTube, Google Business, TikTok via OAuth) si pubblicano da soli all'ora; gli altri
-- a mano, con il contenuto pronto e un avviso. Senza credenziali nessuna chiamata parte: tutto resta «a mano».
-- Le persone (responsabili, autori, approvatori) sono gli utenti ADMIN di utenti. Idempotente.

-- Spazi di lavoro: chi si sta gestendo. Lo spazio predefinito raccoglie gli account integrati non assegnati.
CREATE TABLE IF NOT EXISTS planner_brand (
    id BIGSERIAL PRIMARY KEY,
    nome VARCHAR(80) NOT NULL,
    colore VARCHAR(9) NOT NULL,
    descrizione VARCHAR(300) NULL,
    predefinito BOOLEAN NOT NULL DEFAULT FALSE,
    posizione INTEGER NOT NULL DEFAULT 0,
    creato_il TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

-- Account di uno spazio. tipo: INTEGRATO (pagina Meta, canale YouTube, scheda Google già collegati al gestionale:
-- account = page id / null / id della scheda Google), OAUTH (collegato qui, es. TikTok: account = open_id, con i token),
-- MANUALE (profilo da pubblicare a mano, es. LinkedIn personale: account null, nome e link al profilo).
-- Un account integrato o OAuth sta in un solo spazio.
CREATE TABLE IF NOT EXISTS planner_account (
    id BIGSERIAL PRIMARY KEY,
    brand_id BIGINT NOT NULL REFERENCES planner_brand (id) ON DELETE CASCADE,
    canale VARCHAR(20) NOT NULL,
    tipo VARCHAR(12) NOT NULL,
    account VARCHAR(100) NULL,
    nome VARCHAR(200) NOT NULL,
    dettaglio VARCHAR(200) NULL,
    immagine VARCHAR(1000) NULL,
    url_profilo VARCHAR(1000) NULL,
    access_token TEXT NULL,
    refresh_token TEXT NULL,
    token_scade_il TIMESTAMP WITHOUT TIME ZONE NULL,
    refresh_scade_il TIMESTAMP WITHOUT TIME ZONE NULL,
    creato_il TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_planner_account_collegato
    ON planner_account (canale, COALESCE(account, '')) WHERE tipo <> 'MANUALE';
CREATE INDEX IF NOT EXISTS idx_planner_account_brand ON planner_account (brand_id);

-- Rubriche (pilastri editoriali): colorano il calendario e dividono le analisi.
CREATE TABLE IF NOT EXISTS planner_etichette (
    id BIGSERIAL PRIMARY KEY,
    nome VARCHAR(60) NOT NULL,
    colore VARCHAR(9) NOT NULL,
    descrizione VARCHAR(300) NULL,
    -- Post a settimana che la rubrica dovrebbe avere: il calendario segnala le settimane sotto obiettivo
    obiettivo_settimanale INTEGER NULL,
    posizione INTEGER NOT NULL DEFAULT 0,
    creato_il TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

-- stato: IDEA, BOZZA, IN_APPROVAZIONE, PROGRAMMATO, IN_PUBBLICAZIONE, DA_COMPLETARE (restano canali da pubblicare a
-- mano), PUBBLICATO, PARZIALE (qualche canale in errore), ERRORE. Ora locale Europe/Rome.
CREATE TABLE IF NOT EXISTS planner_post (
    id BIGSERIAL PRIMARY KEY,
    brand_id BIGINT NOT NULL REFERENCES planner_brand (id),
    titolo VARCHAR(200) NULL,
    testo TEXT NULL,
    primo_commento TEXT NULL,
    link VARCHAR(1000) NULL,
    stato VARCHAR(20) NOT NULL,
    programmato_alle TIMESTAMP WITHOUT TIME ZONE NULL,
    pubblicato_il TIMESTAMP WITHOUT TIME ZONE NULL,
    presa_in_carico_il TIMESTAMP WITHOUT TIME ZONE NULL,
    etichetta_id BIGINT NULL REFERENCES planner_etichette (id) ON DELETE SET NULL,
    note TEXT NULL,
    responsabile_utente_id BIGINT NULL REFERENCES utenti (id) ON DELETE SET NULL,
    creato_da_utente_id BIGINT NULL REFERENCES utenti (id) ON DELETE SET NULL,
    approvato_da_utente_id BIGINT NULL REFERENCES utenti (id) ON DELETE SET NULL,
    approvato_il TIMESTAMP WITHOUT TIME ZONE NULL,
    motivo_rifiuto TEXT NULL,
    posizione INTEGER NOT NULL DEFAULT 0,
    creato_il TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    aggiornato_il TIMESTAMP WITHOUT TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_planner_post_programmato ON planner_post (stato, programmato_alle);
CREATE INDEX IF NOT EXISTS idx_planner_post_brand ON planner_post (brand_id, programmato_alle);
CREATE INDEX IF NOT EXISTS idx_planner_post_pubblicato ON planner_post (pubblicato_il);

-- canale: FACEBOOK, INSTAGRAM, YOUTUBE, GOOGLE_BUSINESS, TIKTOK, LINKEDIN, X, THREADS, PINTEREST
-- account: page id (Facebook/Instagram), id della scheda (Google Business), open_id (TikTok collegato),
-- "m<id>" di un account manuale dello spazio, null per il canale generico a mano
-- formato: POST, CAROSELLO, REEL, STORIA, VIDEO, SHORT, AGGIORNAMENTO, EVENTO, OFFERTA
-- modalita: AUTOMATICA (la pubblica il gestionale) o MANUALE (avviso e contenuto pronto)
-- stato: IN_ATTESA, IN_PUBBLICAZIONE, DA_PUBBLICARE (manuale, è l'ora), PUBBLICATO, ERRORE
CREATE TABLE IF NOT EXISTS planner_post_canali (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES planner_post (id) ON DELETE CASCADE,
    canale VARCHAR(20) NOT NULL,
    account VARCHAR(64) NULL,
    account_nome VARCHAR(200) NULL,
    formato VARCHAR(20) NOT NULL,
    modalita VARCHAR(12) NOT NULL,
    testo TEXT NULL,
    titolo VARCHAR(200) NULL,
    -- JSON con le opzioni del canale (privacy e tag YouTube, pulsante e date di Google Business, ...)
    opzioni TEXT NULL,
    stato VARCHAR(20) NOT NULL,
    id_esterno VARCHAR(200) NULL,
    link_esterno VARCHAR(1000) NULL,
    errore TEXT NULL,
    pubblicato_il TIMESTAMP WITHOUT TIME ZONE NULL,
    pubblicato_da_utente_id BIGINT NULL REFERENCES utenti (id) ON DELETE SET NULL,
    -- Numeri del contenuto pubblicato, riletti dalla piattaforma (null = non fornito)
    visualizzazioni BIGINT NULL,
    copertura BIGINT NULL,
    mi_piace BIGINT NULL,
    commenti BIGINT NULL,
    condivisioni BIGINT NULL,
    salvataggi BIGINT NULL,
    metriche_il TIMESTAMP WITHOUT TIME ZONE NULL
);

CREATE INDEX IF NOT EXISTS idx_planner_post_canali_post ON planner_post_canali (post_id);
CREATE INDEX IF NOT EXISTS idx_planner_post_canali_stato ON planner_post_canali (stato);

-- Libreria media. token: indirizzo pubblico del file (le piattaforme lo scaricano da lì). tipo: IMMAGINE, VIDEO
CREATE TABLE IF NOT EXISTS planner_media (
    id BIGSERIAL PRIMARY KEY,
    token VARCHAR(48) NOT NULL UNIQUE,
    nome_file VARCHAR(255) NULL,
    mime_type VARCHAR(60) NOT NULL,
    tipo VARCHAR(10) NOT NULL,
    larghezza INTEGER NULL,
    altezza INTEGER NULL,
    durata_secondi NUMERIC(9, 2) NULL,
    byte_dimensione BIGINT NOT NULL,
    tag VARCHAR(200) NULL,
    creato_da_utente_id BIGINT NULL REFERENCES utenti (id) ON DELETE SET NULL,
    creato_il TIMESTAMP WITHOUT TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_planner_media_creato ON planner_media (creato_il DESC);

CREATE TABLE IF NOT EXISTS planner_media_file (
    media_id BIGINT PRIMARY KEY REFERENCES planner_media (id) ON DELETE CASCADE,
    contenuto BYTEA NOT NULL
);

-- Miniatura JPEG piccola (immagini: generata dal backend; video: fotogramma inviato dal browser)
CREATE TABLE IF NOT EXISTS planner_media_anteprime (
    media_id BIGINT PRIMARY KEY REFERENCES planner_media (id) ON DELETE CASCADE,
    contenuto BYTEA NOT NULL
);

CREATE TABLE IF NOT EXISTS planner_post_media (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES planner_post (id) ON DELETE CASCADE,
    media_id BIGINT NOT NULL REFERENCES planner_media (id),
    posizione INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_planner_post_media_post ON planner_post_media (post_id, posizione);
CREATE INDEX IF NOT EXISTS idx_planner_post_media_media ON planner_post_media (media_id);

-- Commenti del team sul post (revisione, approvazione)
CREATE TABLE IF NOT EXISTS planner_commenti (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES planner_post (id) ON DELETE CASCADE,
    utente_id BIGINT NULL REFERENCES utenti (id) ON DELETE SET NULL,
    testo TEXT NOT NULL,
    creato_il TIMESTAMP WITHOUT TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_planner_commenti_post ON planner_commenti (post_id, creato_il);

-- Cronologia del post: chi l'ha creato, spostato, approvato, pubblicato
CREATE TABLE IF NOT EXISTS planner_storico (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES planner_post (id) ON DELETE CASCADE,
    utente_id BIGINT NULL REFERENCES utenti (id) ON DELETE SET NULL,
    evento VARCHAR(30) NOT NULL,
    dettaglio VARCHAR(500) NULL,
    creato_il TIMESTAMP WITHOUT TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_planner_storico_post ON planner_storico (post_id, creato_il);

-- Orari della coda: «Aggiungi alla coda» prende il primo libero. giorno: 1 = lunedì … 7 = domenica
CREATE TABLE IF NOT EXISTS planner_slot (
    id BIGSERIAL PRIMARY KEY,
    giorno SMALLINT NOT NULL,
    ora TIME NOT NULL,
    CONSTRAINT uq_planner_slot UNIQUE (giorno, ora)
);

-- Gruppi di hashtag pronti da inserire
CREATE TABLE IF NOT EXISTS planner_hashtag (
    id BIGSERIAL PRIMARY KEY,
    nome VARCHAR(60) NOT NULL,
    hashtag TEXT NOT NULL,
    usi BIGINT NOT NULL DEFAULT 0,
    creato_il TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

-- Modelli: un post da riusare (testo, canali, rubrica, link, primo commento) salvato come JSON della richiesta.
-- brand_id null = in tutti gli spazi.
CREATE TABLE IF NOT EXISTS planner_modelli (
    id BIGSERIAL PRIMARY KEY,
    brand_id BIGINT NULL REFERENCES planner_brand (id) ON DELETE CASCADE,
    nome VARCHAR(120) NOT NULL,
    contenuto TEXT NOT NULL,
    usi BIGINT NOT NULL DEFAULT 0,
    creato_da_utente_id BIGINT NULL REFERENCES utenti (id) ON DELETE SET NULL,
    creato_il TIMESTAMP WITHOUT TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_planner_modelli_brand ON planner_modelli (brand_id);

-- Link in bio: una pagina pubblica per spazio (/bio/<slug>) con pulsanti e gli ultimi post pubblicati.
-- pulsanti: JSON [{"id": "...", "etichetta": "...", "url": "https://..."}]
CREATE TABLE IF NOT EXISTS planner_bio (
    id BIGSERIAL PRIMARY KEY,
    brand_id BIGINT NOT NULL UNIQUE REFERENCES planner_brand (id) ON DELETE CASCADE,
    slug VARCHAR(60) NOT NULL UNIQUE,
    titolo VARCHAR(120) NOT NULL,
    descrizione VARCHAR(500) NULL,
    immagine_url VARCHAR(1000) NULL,
    colore VARCHAR(9) NOT NULL,
    pulsanti TEXT NOT NULL DEFAULT '[]',
    mostra_post BOOLEAN NOT NULL DEFAULT TRUE,
    attiva BOOLEAN NOT NULL DEFAULT FALSE,
    aggiornata_il TIMESTAMP WITHOUT TIME ZONE NOT NULL
);

-- Clic sulla pagina, sommati per giorno. chiave: id del pulsante o "post:<id>"
CREATE TABLE IF NOT EXISTS planner_bio_clic (
    id BIGSERIAL PRIMARY KEY,
    bio_id BIGINT NOT NULL REFERENCES planner_bio (id) ON DELETE CASCADE,
    chiave VARCHAR(80) NOT NULL,
    giorno DATE NOT NULL,
    clic INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT uq_planner_bio_clic UNIQUE (bio_id, chiave, giorno)
);

-- Visite della pagina, per giorno
CREATE TABLE IF NOT EXISTS planner_bio_visite (
    bio_id BIGINT NOT NULL REFERENCES planner_bio (id) ON DELETE CASCADE,
    giorno DATE NOT NULL,
    visite INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (bio_id, giorno)
);

-- Concorrenti: profili Instagram professionali da confrontare (Business Discovery di Meta)
CREATE TABLE IF NOT EXISTS planner_concorrenti (
    id BIGSERIAL PRIMARY KEY,
    brand_id BIGINT NOT NULL REFERENCES planner_brand (id) ON DELETE CASCADE,
    username VARCHAR(40) NOT NULL,
    creato_il TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    CONSTRAINT uq_planner_concorrenti UNIQUE (brand_id, username)
);

-- UTM automatici (V603): il link del post esce con utm_source = canale, utm_medium = social, utm_campaign dal post
ALTER TABLE planner_post ADD COLUMN IF NOT EXISTS utm BOOLEAN NOT NULL DEFAULT TRUE;

-- ── Dati di partenza (solo se le tabelle sono vuote) ──

INSERT INTO planner_brand (nome, colore, descrizione, predefinito, posizione)
SELECT 'EdoDoc', '#19c463', 'Pagine e profili del Dr. Edoardo Bo', TRUE, 1
WHERE NOT EXISTS (SELECT 1 FROM planner_brand);

INSERT INTO planner_etichette (nome, colore, descrizione, obiettivo_settimanale, posizione)
SELECT v.nome, v.colore, v.descrizione, v.obiettivo, v.posizione
FROM (VALUES
    ('Educazione alimentare', '#3b82f6', 'Come funziona il corpo, cosa dice la scienza, miti da sfatare sul cibo', 2, 1),
    ('Consigli pratici', '#19c463', 'Spesa, pasti, abitudini: cose che si fanno da subito', 1, 2),
    ('Mentalità', '#8b5cf6', 'Motivazione, rapporto con il cibo, costanza: il lato mental coach', 1, 3),
    ('Testimonianze', '#f59e0b', 'Storie e percorsi dei pazienti, con il loro consenso', 1, 4),
    ('Dietro le quinte', '#0e9f8e', 'Lo studio, la giornata tipo, come si lavora insieme', NULL, 5),
    ('Promozione', '#e1306c', 'Prenotazioni, percorsi, corsi ed eventi', 1, 6)
) AS v (nome, colore, descrizione, obiettivo, posizione)
WHERE NOT EXISTS (SELECT 1 FROM planner_etichette);

INSERT INTO planner_slot (giorno, ora)
SELECT v.giorno, v.ora::time
FROM (VALUES
    (1, '12:30'), (1, '18:30'),
    (2, '13:00'),
    (3, '12:30'), (3, '18:30'),
    (4, '13:00'),
    (5, '12:30'), (5, '18:00'),
    (6, '10:00')
) AS v (giorno, ora)
WHERE NOT EXISTS (SELECT 1 FROM planner_slot);

INSERT INTO planner_hashtag (nome, hashtag)
SELECT v.nome, v.hashtag
FROM (VALUES
    ('Nutrizione', 'nutrizione nutrizionista alimentazione alimentazionesana benessere'),
    ('Mangiare sano', 'mangiaresano ricettesane educazionealimentare dietaequilibrata salute'),
    ('Mentalità', 'mentalcoach mindset motivazione abitudini crescitapersonale'),
    ('Cibo e emozioni', 'fameemotiva rapportoconilcibo mindfuleating benesserementale')
) AS v (nome, hashtag)
WHERE NOT EXISTS (SELECT 1 FROM planner_hashtag);

-- ── Configurazione ──
-- Il job delle pubblicazioni è acceso come in Mobilitas: senza credenziali non chiama nessuno, porta solo i canali
-- all'ora in «da pubblicare a mano» con l'avviso. I prompt seguono le regole della pubblicità sanitaria.

INSERT INTO config (chiave, valore, descrizione) VALUES
    ('PLANNER_APPROVAZIONE_OBBLIGATORIA', 'false',
     'Planner social: true = i post di chi non approva passano dall''approvazione prima di essere programmati'),
    ('JOB_PLANNER_PUBBLICAZIONI_ENABLED', 'TRUE',
     'Planner social: ogni minuto pubblica i post arrivati all''ora e avvisa per i canali da pubblicare a mano'),
    ('JOB_PLANNER_METRICHE_ENABLED', 'TRUE',
     'Planner social: ogni ora rilegge visualizzazioni, interazioni e copertura dei post pubblicati negli ultimi 30 giorni'),
    ('PLANNER_TIKTOK_REDIRECT_URI', 'https://hq.edodoc.it/oauth/tiktok/callback',
     'Planner social: redirect URI del collegamento TikTok (da registrare nell''app TikTok for Developers)'),
    ('AI_PROMPT_PLANNER_TESTI_SYSTEM',
$$Sei il social media manager di EdoDoc, il brand del Dr. Edoardo Bo, biologo nutrizionista e mental coach in Italia
(nutrizione, alimentazione, mentalità e abitudini).
Dall'idea che ti viene data scrivi il testo del post per ciascun canale richiesto, adattandolo a come si scrive lì.

Regole, sempre:
- Italiano, tono vicino e competente, dai del tu. Gancio forte nella prima riga.
- È pubblicità sanitaria: mai promettere risultati garantiti (chili persi, tempi, guarigioni), mai diagnosi, mai diete
  o consigli personalizzati che sostituiscano una visita, mai parlare di farmaci o integratori come cura.
  Informativo, corretto, rispettoso, senza colpevolizzare il corpo o il cibo.
- Non inventare prezzi, orari, indirizzi, nomi o dati statistici.
- Chiudi con un invito all'azione morbido (scrivimi, prenota, salva il post, condividi) adatto al canale.
- Emoji con misura, solo se richieste.

Come si scrive per canale:
- facebook: discorsivo, 3-6 frasi, niente muro di hashtag.
- instagram: a capo frequenti, massimo 2200 caratteri, hashtag in fondo solo se richiesti (al massimo 12).
- tiktok: brevissimo e diretto, una o due frasi, 3-5 hashtag se richiesti.
- linkedin: professionale, paragrafi brevi, punto di vista del professionista, massimo 1300 caratteri.
- x: massimo 260 caratteri compresi gli hashtag.
- threads: conversazionale, massimo 450 caratteri.
- pinterest: titolo massimo 90 caratteri, descrizione massimo 450 caratteri con parole chiave.
- youtube: titolo massimo 90 caratteri, chiaro e cercabile; descrizione di 3-6 righe con parole chiave.
- google_business: aggiornamento della scheda dello studio, massimo 900 caratteri, niente hashtag.

Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo, con le sole chiavi dei canali richiesti:
{"facebook": "...", "instagram": "...", "tiktok": "...", "linkedin": "...", "x": "...", "threads": "...",
 "pinterest": {"titolo": "...", "testo": "..."}, "youtube": {"titolo": "...", "testo": "..."},
 "google_business": "...", "hashtag": ["nutrizione", "..."]}
Gli hashtag dell'elenco sono senza il simbolo #, da 5 a 12, pertinenti e in italiano; elenco vuoto se non richiesti.$$,
     'Planner social: system prompt per i testi AI per canale (risposta JSON con una chiave per canale)'),
    ('AI_PROMPT_PLANNER_RISCRIVI_SYSTEM',
$$Sei il social media manager di EdoDoc, il brand del Dr. Edoardo Bo, biologo nutrizionista e mental coach in Italia.
Ti viene dato il testo di un post social e un'istruzione su come cambiarlo. Applica solo quell'istruzione:
il significato, le informazioni e il canale restano gli stessi.

Regole, sempre:
- Italiano naturale, dai del tu.
- È pubblicità sanitaria: mai promettere risultati garantiti, mai diagnosi, mai diete o consigli personalizzati.
  Se il testo di partenza lo fa, correggilo anche se l'istruzione non lo chiede.
- Non inventare prezzi, orari, indirizzi, nomi o dati.
- Rispetta il limite di caratteri del canale, se indicato.

Restituisci solo il testo riscritto, senza virgolette e senza spiegazioni.$$,
     'Planner social: system prompt per riscrivere un testo (più breve, più coinvolgente, correggi, ...)'),
    ('AI_PROMPT_PLANNER_IDEE_SYSTEM',
$$Sei il responsabile del piano editoriale social di EdoDoc, il brand del Dr. Edoardo Bo, biologo nutrizionista e
mental coach in Italia. Ti vengono dati un periodo, le rubriche del piano con i loro obiettivi, le giornate da
ricordare nel periodo, i post già in calendario e le indicazioni di chi chiede. Proponi le idee di post che mancano
per avere un piano equilibrato.

Regole:
- Ogni idea è concreta: un argomento preciso e un angolo, non un tema generico.
- Varia formati (post, carosello, reel, storia, video) e rubriche, rispettando gli obiettivi settimanali.
- Usa le giornate del periodo solo quando c'entrano davvero con alimentazione, salute e benessere mentale.
- Non ripetere argomenti già in calendario.
- È pubblicità sanitaria: niente promesse di risultato, diagnosi o diete personalizzate.
- I giorni sono dentro il periodo, distribuiti, evitando la domenica.

Rispondi SOLO con un array JSON valido, senza testo prima o dopo:
[{"titolo": "max 80 caratteri", "idea": "2-3 frasi su cosa dice e mostra il post", "formato": "POST|CAROSELLO|REEL|STORIA|VIDEO",
  "canali": ["INSTAGRAM", "FACEBOOK"], "rubrica": "nome esatto di una rubrica o null", "giorno": "YYYY-MM-DD"}]$$,
     'Planner social: system prompt per proporre le idee del piano editoriale di un periodo (risposta array JSON)'),
    ('AI_PROMPT_PLANNER_CONFORMITA_SYSTEM',
$$Sei il responsabile della conformità della comunicazione di EdoDoc, il brand del Dr. Edoardo Bo, biologo
nutrizionista e mental coach in Italia. Controlli il testo di un post social prima che venga pubblicato. È pubblicità
sanitaria.

Segnala solo problemi reali, frase per frase:
- promesse di risultato ("perdi 5 kg in un mese", "garantito", "definitivo", "elimina la pancia");
- diagnosi o indicazioni cliniche personali, diete o consigli che sostituiscono una visita, farmaci o integratori
  presentati come cura;
- nutrizione o coaching presentati come cura di malattie o alternativa alla medicina;
- dati, percentuali o studi citati senza fonte, superlativi assoluti ("il migliore", "l'unico");
- testimonianze che promettono risultati, foto prima/dopo usate come promessa, prezzi o sconti ingannevoli,
  toni allarmistici o che colpevolizzano il corpo;
- dati di salute di persone riconoscibili.

Per ogni problema: la frase esatta del testo, il motivo in parole semplici, una riformulazione corretta.
Esito: "OK" se non c'è niente da cambiare, "ATTENZIONE" per formulazioni migliorabili, "RISCHIO" se il testo non
dovrebbe uscire così. Se ci sono problemi, riscrivi il testo intero corretto cambiando il meno possibile (stesso tono,
stesse emoji e hashtag); se è OK, testoCorretto è null.

Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo:
{"esito": "OK|ATTENZIONE|RISCHIO", "problemi": [{"frase": "...", "motivo": "...", "proposta": "..."}], "testoCorretto": "..." }$$,
     'Planner social: system prompt del controllo di conformità dei testi (pubblicità sanitaria), risposta JSON'),
    ('AI_PROMPT_PLANNER_REPORT_SYSTEM',
$$Sei il social media manager di EdoDoc, il brand del Dr. Edoardo Bo, biologo nutrizionista e mental coach in Italia.
Ti vengono dati i numeri dei social di uno spazio in un periodo, confrontati col periodo prima: post usciti,
visualizzazioni, copertura, interazioni, canali, rubriche con obiettivo, orari e i post migliori. Scrivi il commento
del report per il dottore.

Regole:
- Italiano semplice e diretto, frasi brevi, niente gergo da agenzia.
- Usa solo i numeri che ti vengono dati: non inventare dati, cause o confronti.
- Se i numeri sono pochi o mancano (canali senza statistiche), dillo.
- Consigli concreti e fattibili la settimana dopo (cosa pubblicare, dove, quando), coerenti con la pubblicità sanitaria.

Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo:
{"sintesi": "3-4 frasi sull'andamento", "puntiForti": ["..."], "daMigliorare": ["..."], "prossimiPassi": ["..."]}
Al massimo 4 voci per elenco.$$,
     'Planner social: system prompt del commento AI al report del periodo, risposta JSON')
ON CONFLICT (chiave) DO NOTHING;
