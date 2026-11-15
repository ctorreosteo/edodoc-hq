-- Accettazione firmata online (stesso impianto di Mobilitas HQ, adattato al lavoro a distanza del Dott. Edoardo Bo).
-- Il dottore invia dal gestionale un link personale per email (o lo copia e lo manda dove vuole); la persona controlla i
-- suoi dati, legge consenso informato e informativa, sceglie i consensi facoltativi, conferma l'email con un codice
-- monouso e traccia la firma. Il PDF viene sigillato (PAdES) con marca temporale e resta nel database, non modificabile.
--
-- accettazioni_documenti    testi versionati (modulo, informativa, fornitori): una versione non cambia mai, ogni firma
--                           punta alla versione letta. I segnaposto {{...}} prendono i dati del titolare da config
--                           (EMITTENTE_*) quando il testo si mostra e si stampa nel PDF firmato.
-- accettazioni_firma        una richiesta di firma: snapshot dei dati, scelte, firma, PDF sigillato, marca temporale.
--                           Dopo la firma il documento non è più modificabile.
-- accettazioni_firma_eventi registro a catena di hash (ogni riga contiene l'hash della precedente), solo inserimenti.
-- pazienti_consensi         storico dei consensi facoltativi, solo inserimenti: lo stato è l'ultima riga per tipo.

CREATE TABLE accettazioni_documenti (
    id          BIGSERIAL PRIMARY KEY,
    tipo        VARCHAR(20)  NOT NULL,
    versione    VARCHAR(20)  NOT NULL,
    titolo      VARCHAR(200) NOT NULL,
    formato     VARCHAR(20)  NOT NULL,
    contenuto   TEXT         NOT NULL,
    sha256      VARCHAR(64)  NOT NULL,
    attivo      BOOLEAN      NOT NULL DEFAULT FALSE,
    valido_dal  DATE         NOT NULL,
    creato_il   TIMESTAMP    NOT NULL DEFAULT now(),
    CONSTRAINT uq_accettazioni_documenti_tipo_versione UNIQUE (tipo, versione),
    CONSTRAINT ck_accettazioni_documenti_tipo CHECK (tipo IN ('MODULO', 'INFORMATIVA', 'FORNITORI')),
    CONSTRAINT ck_accettazioni_documenti_formato CHECK (formato IN ('JSON', 'MARKDOWN'))
);

CREATE UNIQUE INDEX uq_accettazioni_documenti_attivo ON accettazioni_documenti (tipo) WHERE attivo;

CREATE TABLE accettazioni_firma (
    id                        BIGSERIAL PRIMARY KEY,
    paziente_id               BIGINT       NULL REFERENCES pazienti (id) ON DELETE SET NULL,
    stato                     VARCHAR(20)  NOT NULL,
    codice_verifica           VARCHAR(20)  NOT NULL UNIQUE,
    token_hash                VARCHAR(64)  NOT NULL UNIQUE,
    minorenne                 BOOLEAN      NOT NULL DEFAULT FALSE,
    firmatario_ruolo          VARCHAR(30)  NOT NULL,
    dati_snapshot             TEXT         NOT NULL,
    email                     VARCHAR(255) NOT NULL,
    email_inviata_il          TIMESTAMP    NULL,
    modulo_documento_id       BIGINT       NOT NULL REFERENCES accettazioni_documenti (id),
    informativa_documento_id  BIGINT       NOT NULL REFERENCES accettazioni_documenti (id),
    fornitori_documento_id    BIGINT       NOT NULL REFERENCES accettazioni_documenti (id),
    creata_da_utente_id       BIGINT       NULL REFERENCES utenti (id) ON DELETE SET NULL,
    creata_il                 TIMESTAMP    NOT NULL,
    scade_il                  TIMESTAMP    NOT NULL,
    aperta_il                 TIMESTAMP    NULL,
    dati_confermati_il        TIMESTAMP    NULL,
    otp_hash                  VARCHAR(100) NULL,
    otp_scade_il              TIMESTAMP    NULL,
    otp_tentativi             INT          NOT NULL DEFAULT 0,
    otp_invii                 INT          NOT NULL DEFAULT 0,
    otp_ultimo_invio_il       TIMESTAMP    NULL,
    otp_verificato_il         TIMESTAMP    NULL,
    scelte                    TEXT         NULL,
    firma_png                 BYTEA        NULL,
    firma_ip                  VARCHAR(64)  NULL,
    firma_user_agent          VARCHAR(500) NULL,
    firmata_il                TIMESTAMP    NULL,
    pdf                       BYTEA        NULL,
    pdf_sha256                VARCHAR(64)  NULL,
    sigillo_certificato       TEXT         NULL,
    tsa_url                   VARCHAR(255) NULL,
    tsa_ora                   TIMESTAMP    NULL,
    copia_inviata_il          TIMESTAMP    NULL,
    conservare_fino_al        DATE         NULL,
    annullata_il              TIMESTAMP    NULL,
    annullata_da_utente_id    BIGINT       NULL REFERENCES utenti (id) ON DELETE SET NULL,
    motivo_annullamento       VARCHAR(500) NULL,
    CONSTRAINT ck_accettazioni_firma_stato CHECK (stato IN ('INVIATA', 'APERTA', 'FIRMATA', 'ANNULLATA')),
    CONSTRAINT ck_accettazioni_firma_ruolo CHECK (firmatario_ruolo IN ('PAZIENTE', 'GENITORE', 'TUTORE')),
    CONSTRAINT ck_accettazioni_firma_firmata CHECK (stato <> 'FIRMATA' OR
        (firmata_il IS NOT NULL AND pdf IS NOT NULL AND pdf_sha256 IS NOT NULL AND firma_png IS NOT NULL))
);

CREATE INDEX idx_accettazioni_firma_paziente ON accettazioni_firma (paziente_id, creata_il DESC);
CREATE INDEX idx_accettazioni_firma_pdf_sha256 ON accettazioni_firma (pdf_sha256);

CREATE TABLE accettazioni_firma_eventi (
    id               BIGSERIAL PRIMARY KEY,
    accettazione_id  BIGINT       NOT NULL REFERENCES accettazioni_firma (id),
    seq              INT          NOT NULL,
    tipo             VARCHAR(40)  NOT NULL,
    il               TIMESTAMP(6) NOT NULL,
    ip               VARCHAR(64)  NULL,
    user_agent       VARCHAR(500) NULL,
    utente_id        BIGINT       NULL,
    dettagli         TEXT         NULL,
    hash_precedente  VARCHAR(64)  NOT NULL,
    hash             VARCHAR(64)  NOT NULL,
    CONSTRAINT uq_accettazioni_firma_eventi_seq UNIQUE (accettazione_id, seq)
);

CREATE TABLE pazienti_consensi (
    id                      BIGSERIAL PRIMARY KEY,
    paziente_id             BIGINT       NOT NULL REFERENCES pazienti (id) ON DELETE CASCADE,
    tipo                    VARCHAR(40)  NOT NULL,
    concesso                BOOLEAN      NOT NULL,
    il                      TIMESTAMP    NOT NULL,
    fonte                   VARCHAR(30)  NOT NULL,
    accettazione_id         BIGINT       NULL REFERENCES accettazioni_firma (id),
    registrato_da_utente_id BIGINT       NULL REFERENCES utenti (id) ON DELETE SET NULL,
    note                    VARCHAR(500) NULL,
    CONSTRAINT ck_pazienti_consensi_tipo CHECK (tipo IN ('CONTATTO_MEDICO')),
    CONSTRAINT ck_pazienti_consensi_fonte CHECK (fonte IN ('ACCETTAZIONE', 'MANUALE'))
);

CREATE INDEX idx_pazienti_consensi_paziente ON pazienti_consensi (paziente_id, tipo, il DESC);

-- Immutabilità a livello di database: vale anche per chi entra con psql.
CREATE FUNCTION accettazioni_solo_inserimenti() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION '% è un registro a sola aggiunta: % non consentito', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_accettazioni_firma_eventi_immutabili
    BEFORE UPDATE ON accettazioni_firma_eventi
    FOR EACH ROW EXECUTE FUNCTION accettazioni_solo_inserimenti();

-- Gli eventi si cancellano solo insieme a una richiesta mai firmata (eliminazione dal gestionale).
CREATE FUNCTION accettazioni_eventi_cancellabili() RETURNS trigger AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM accettazioni_firma WHERE id = OLD.accettazione_id AND stato = 'FIRMATA') THEN
        RAISE EXCEPTION 'Il registro di un modulo firmato non si cancella';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_accettazioni_firma_eventi_cancellabili
    BEFORE DELETE ON accettazioni_firma_eventi
    FOR EACH ROW EXECUTE FUNCTION accettazioni_eventi_cancellabili();

-- pazienti_consensi: niente modifiche; la cancellazione segue solo quella del paziente.
CREATE TRIGGER trg_pazienti_consensi_immutabili
    BEFORE UPDATE ON pazienti_consensi
    FOR EACH ROW EXECUTE FUNCTION accettazioni_solo_inserimenti();

CREATE FUNCTION accettazioni_documenti_immutabili() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Le versioni dei documenti di accettazione non si cancellano';
    END IF;
    IF NEW.contenuto IS DISTINCT FROM OLD.contenuto OR NEW.sha256 IS DISTINCT FROM OLD.sha256
        OR NEW.versione IS DISTINCT FROM OLD.versione OR NEW.tipo IS DISTINCT FROM OLD.tipo THEN
        RAISE EXCEPTION 'Una versione pubblicata non cambia: crea una nuova versione';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_accettazioni_documenti_immutabili
    BEFORE UPDATE OR DELETE ON accettazioni_documenti
    FOR EACH ROW EXECUTE FUNCTION accettazioni_documenti_immutabili();

-- Dopo la firma restano modificabili solo i campi di servizio (copia inviata, paziente scollegato).
CREATE FUNCTION accettazioni_firma_protette() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.stato = 'FIRMATA' THEN
            RAISE EXCEPTION 'Un modulo firmato non si cancella prima del %', OLD.conservare_fino_al;
        END IF;
        RETURN OLD;
    END IF;
    IF OLD.stato = 'FIRMATA' AND (
            NEW.stato IS DISTINCT FROM OLD.stato
            OR NEW.firmata_il IS DISTINCT FROM OLD.firmata_il
            OR NEW.pdf IS DISTINCT FROM OLD.pdf
            OR NEW.pdf_sha256 IS DISTINCT FROM OLD.pdf_sha256
            OR NEW.firma_png IS DISTINCT FROM OLD.firma_png
            OR NEW.scelte IS DISTINCT FROM OLD.scelte
            OR NEW.dati_snapshot IS DISTINCT FROM OLD.dati_snapshot
            OR NEW.tsa_ora IS DISTINCT FROM OLD.tsa_ora
            OR NEW.firma_ip IS DISTINCT FROM OLD.firma_ip
            OR NEW.firma_user_agent IS DISTINCT FROM OLD.firma_user_agent
            OR NEW.sigillo_certificato IS DISTINCT FROM OLD.sigillo_certificato
            OR NEW.codice_verifica IS DISTINCT FROM OLD.codice_verifica
            OR NEW.email IS DISTINCT FROM OLD.email
            OR NEW.otp_verificato_il IS DISTINCT FROM OLD.otp_verificato_il
            OR NEW.modulo_documento_id IS DISTINCT FROM OLD.modulo_documento_id
            OR NEW.informativa_documento_id IS DISTINCT FROM OLD.informativa_documento_id
            OR NEW.fornitori_documento_id IS DISTINCT FROM OLD.fornitori_documento_id
            OR NEW.conservare_fino_al IS DISTINCT FROM OLD.conservare_fino_al) THEN
        RAISE EXCEPTION 'Il modulo firmato % non è modificabile', OLD.codice_verifica;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_accettazioni_firma_protette
    BEFORE UPDATE OR DELETE ON accettazioni_firma
    FOR EACH ROW EXECUTE FUNCTION accettazioni_firma_protette();

INSERT INTO config (chiave, valore, descrizione) VALUES
    ('ACCETTAZIONE_URL_FIRMA', 'https://hq.edodoc.it/firma',
     'Accettazione: indirizzo della pagina di firma (il link personale aggiunge /token)'),
    ('ACCETTAZIONE_LINK_VALIDITA_GIORNI', '14', 'Accettazione: giorni di validità del link di firma'),
    ('ACCETTAZIONE_EMAIL_PRIVACY', 'supporto@edodoc.it',
     'Accettazione: email per privacy e diritti, scritta nell''informativa e nel modulo'),
    ('ACCETTAZIONE_PEC', '', 'Accettazione: PEC del dottore nell''informativa (vuota = non compare)'),
    ('ACCETTAZIONE_DISDETTA_ORE', '24', 'Accettazione: ore di preavviso per spostare o disdire una videochiamata'),
    ('ACCETTAZIONE_EMAIL_OGGETTO', 'Il tuo modulo di accettazione da firmare', 'Accettazione: oggetto dell''email con il link'),
    ('ACCETTAZIONE_EMAIL_TESTO',
     E'Ciao {nome},\n\nprima di iniziare il percorso ti chiedo di leggere e firmare online il modulo di accettazione: consenso informato alla consulenza nutrizionale a distanza e informativa privacy. Ci vogliono pochi minuti, da telefono o computer:\n\n{link}\n\nIl link è personale e vale fino al {scadenza}. Ti chiederò un codice che arriva a questa email.\n\nUn caro saluto,\nDott. Edoardo Bo',
     'Accettazione: testo dell''email con il link ({nome}, {link}, {scadenza})'),
    ('ACCETTAZIONE_TSA_URLS', 'http://timestamp.digicert.com,http://timestamp.sectigo.com',
     'Accettazione: autorità di marcatura temporale RFC 3161, in ordine di tentativo'),
    ('ACCETTAZIONE_TSA_UTENTE', '', 'Accettazione: utente della TSA (solo TSA a pagamento)'),
    ('ACCETTAZIONE_TSA_PASSWORD', '', 'Accettazione: password della TSA (solo TSA a pagamento)'),
    ('ACCETTAZIONE_CONSERVAZIONE_ANNI', '15', 'Accettazione: anni di conservazione dei moduli firmati e delle prove'),
    ('ACCETTAZIONE_SIGILLO_P12', '', 'Accettazione: certificato del sigillo (PKCS#12 base64). Vuoto = autofirmato al primo uso'),
    ('ACCETTAZIONE_SIGILLO_P12_PASSWORD', '', 'Accettazione: password del certificato del sigillo')
ON CONFLICT (chiave) DO NOTHING;

INSERT INTO accettazioni_documenti (tipo, versione, titolo, formato, contenuto, sha256, attivo, valido_dal)
SELECT tipo, versione, titolo, formato, contenuto,
       encode(sha256(convert_to(contenuto, 'UTF8')), 'hex'), TRUE, DATE '2026-11-15'
FROM (VALUES
('MODULO', '1.0', 'Modulo di accettazione', 'JSON', $modulo$
{
  "titolo": "Modulo di accettazione",
  "sottotitolo": "Consenso informato alla consulenza nutrizionale a distanza, condizioni e informativa privacy · v. 1.0 · novembre 2026",
  "sezioni": [
    {
      "id": "consulenza",
      "titolo": "Consenso informato alla consulenza nutrizionale",
      "testo": "Ti segue il {{TITOLARE}}, biologo nutrizionista iscritto all'Albo dei Biologi ({{ALBO}}), professionista sanitario (L. 3/2018). La consulenza comprende: raccolta della tua storia (abitudini alimentari, stile di vita, salute, obiettivi), valutazione dello stato nutrizionale con i dati e le misure che mi fornisci, elaborazione di un piano alimentare personalizzato, educazione alimentare e controlli periodici con il check settimanale. Al lavoro sull'alimentazione affianco un supporto motivazionale (mental coaching) per aiutarti a costruire abitudini: non è una psicoterapia né un trattamento psicologico. Non formulo diagnosi mediche, non prescrivo né modifico farmaci e non sostituisco il tuo medico. Se hai una patologia, il piano alimentare tiene conto della diagnosi e delle indicazioni del medico: per questo posso chiederti referti ed esami. Puoi fare domande in ogni momento, rifiutare singole indicazioni, interrompere il percorso e revocare questo consenso.",
      "dichiarazione": "Dichiaro di aver ricevuto queste informazioni, di aver potuto fare domande, e acconsento alla consulenza nutrizionale."
    },
    {
      "id": "distanza",
      "titolo": "Un percorso interamente online",
      "testo": "Il percorso si svolge solo a distanza: videochiamate su Google Meet, app EdoDoc (check settimanale, chat, messaggi vocali, piano alimentare, corsi) ed email. Non ci sono visite in presenza né un esame fisico: peso, circonferenze e le altre misure le rilevi tu, seguendo le indicazioni che ti do, e la valutazione dipende dalla loro accuratezza. A distanza non posso notare segni che emergerebbero di persona: se qualcosa lo richiede, ti indirizzo al medico. Collegati da un luogo riservato, con una connessione stabile, e custodisci il tuo dispositivo e le credenziali dell'app. Non registro le videochiamate e ti chiedo di non registrarle. Chat e messaggi non sono un servizio di urgenza: rispondo nei tempi del percorso, non in tempo reale.",
      "dichiarazione": "Dichiaro di aver compreso come funziona la consulenza a distanza e i suoi limiti, e la accetto."
    },
    {
      "id": "salute",
      "titolo": "Le informazioni sulla tua salute",
      "testo": "Un piano sicuro dipende da quello che mi dici. Comunicami in modo completo e vero, all'inizio e a ogni cambiamento: malattie (per esempio diabete, malattie dei reni, del fegato, del cuore, della tiroide, dell'intestino), farmaci e integratori che prendi, in particolare insulina e altri farmaci per il diabete, farmaci per la pressione o anticoagulanti; allergie e intolleranze diagnosticate; gravidanza in corso o cercata e allattamento; interventi chirurgici, compresi quelli bariatrici; disturbi del comportamento alimentare attuali o passati; esami recenti. Informazioni mancanti o non vere aumentano i rischi, perché non posso tenerne conto.",
      "dichiarazione": "Dichiaro che le informazioni sulla salute che ho dato e che darò sono complete e vere, e mi impegno ad aggiornarle."
    },
    {
      "id": "rischi",
      "titolo": "Benefici, possibili disagi e alternative",
      "testo": "L'obiettivo è migliorare abitudini, composizione corporea e benessere, ma non posso garantire un risultato: dipende anche dalla tua costanza e da fattori individuali. Nelle prime settimane di un cambio di alimentazione possono comparire fame, stanchezza, mal di testa o cambiamenti dell'intestino, di solito passeggeri. Se prendi farmaci per il diabete o per la pressione, il cambio di alimentazione e il calo di peso possono richiedere al tuo medico di rivederne le dosi: avvisalo prima di iniziare e segnalami subito cali di zuccheri, capogiri o malesseri. Non propongo diete drastiche o squilibrate. In alternativa puoi rivolgerti al tuo medico, a un medico specialista in scienza dell'alimentazione o ai servizi del Servizio sanitario.",
      "dichiarazione": "Dichiaro di aver compreso benefici, possibili disagi e alternative."
    },
    {
      "id": "segnali",
      "titolo": "Quando fermarsi e chiedere aiuto",
      "testo": "Se durante il percorso emergono segnali di un disturbo del comportamento alimentare (abbuffate, vomito provocato, uso di lassativi o diuretici per controllare il peso, restrizione estrema, pensieri ossessivi su cibo e peso), te lo dico apertamente e ti indirizzo a uno specialista; il percorso può essere sospeso finché non sei seguito. Se compaiono svenimenti, palpitazioni, dolore al petto, fiato corto o un malessere forte, chiama subito il 112 o il tuo medico: non usare la chat dell'app.",
      "dichiarazione": "Ho capito quando fermarmi e a chi rivolgermi."
    },
    {
      "id": "minori",
      "titolo": "Percorso di un minore",
      "condizione": "MINORENNE",
      "testo": "Con un minore il piano tiene conto della crescita, senza restrizioni non adatte all'età, ed è coordinato con il pediatra. Il genitore o il tutore partecipa alle videochiamate, sempre se il minore ha meno di 14 anni. Il minore viene ascoltato e coinvolto secondo la sua età. Chi firma comunica la salute del minore e ogni cambiamento.",
      "dichiarazione": "Dichiaro di aver compreso come si svolge il percorso del minore e acconsento per lui o per lei."
    },
    {
      "id": "appuntamenti",
      "titolo": "Videochiamate e pagamenti",
      "testo": "Le videochiamate si spostano o si disdicono almeno {{DISDETTA_ORE}} ore prima, rispondendo all'invito o scrivendomi. Senza preavviso, salvo malattia improvvisa o altra causa di forza maggiore, la videochiamata può essere considerata svolta. Prezzi, rate e durata del percorso sono quelli concordati all'acquisto; la fattura arriva dopo ogni pagamento.",
      "dichiarazione": "Accetto queste condizioni."
    },
    {
      "id": "privacy",
      "titolo": "Privacy",
      "testo": "I tuoi dati, compresi quelli sulla salute, sono trattati dal {{TITOLARE}} per seguirti nel percorso e tenere la tua documentazione, organizzare videochiamate, app e pagamenti e adempiere agli obblighi di legge (artt. 6.1.b, 6.1.c e 9.2.h GDPR): per questo non serve il tuo consenso e senza questi dati non posso seguirti. I dati del gestionale stanno in data center in Italia; alcuni fornitori tecnologici hanno sede negli Stati Uniti, con le garanzie del GDPR. Le videochiamate non vengono registrate. Non uso sistemi di intelligenza artificiale per valutare la tua salute o prendere decisioni su di te. Documentazione e comunicazioni sono conservate 10 anni dall'ultima consulenza; questo modulo firmato e le prove della firma 15 anni. Diritti (accesso, copia, rettifica, cancellazione, limitazione, portabilità, opposizione, reclamo al Garante): {{EMAIL}}. Il contatto con il tuo medico è facoltativo e te lo chiedo qui sotto; newsletter e comunicazioni promozionali te le chiedo a parte. Ogni consenso si può revocare in qualsiasi momento, per il futuro. Informativa completa qui sotto e allegata al documento firmato.",
      "dichiarazione": "Dichiaro di aver ricevuto e letto l'informativa privacy (v. 1.0, novembre 2026) e l'elenco dei fornitori."
    },
    {
      "id": "firma_elettronica",
      "titolo": "Firma elettronica",
      "testo": "Firmo questo modulo online, dal link personale che ho ricevuto: confermo la mia identità con un codice monouso inviato alla mia email e traccio la mia firma. Il documento firmato viene sigillato elettronicamente, riceve una marca temporale e viene conservato in modo non modificabile per 15 anni, insieme alle prove della firma: data e ora, indirizzo email, indirizzo IP e dispositivo, verifica del codice. Della firma tracciata si conserva solo l'immagine, nessun dato biometrico. Ricevo una copia del documento firmato per email e posso verificarne l'autenticità con il codice riportato sul documento.",
      "dichiarazione": "Accetto di firmare questo modulo in forma elettronica e riconosco come mia la firma che traccio."
    }
  ],
  "dichiarazioneRappresentante": "Dichiaro di firmare come genitore o tutore della persona indicata e, se genitore, di agire anche con il consenso dell'altro genitore.",
  "consensiFacoltativi": [
    {
      "id": "CONTATTO_MEDICO",
      "titolo": "Contatto con il tuo medico",
      "testo": "Il {{TITOLARE}} può contattare il tuo medico di base o lo specialista che ti segue, per telefono o email, per confrontarsi sulla tua salute quando è utile al percorso e condividere il piano alimentare. Base: consenso esplicito (art. 9.2.a GDPR). Con «No» non contatto il tuo medico: le informazioni le passi tu, se vuoi."
    }
  ],
  "notaConsensi": "È facoltativo: dire di no non cambia il percorso né la sua qualità. Puoi cambiare idea in ogni momento scrivendo a {{EMAIL}}: la revoca vale per il futuro."
}
$modulo$),
('INFORMATIVA', '1.0', 'Informativa sul trattamento dei dati personali', 'MARKDOWN', $informativa$# Informativa sul trattamento dei dati personali

*Artt. 13 e 14 del Regolamento UE 2016/679 (GDPR) · Persone seguite nel percorso nutrizionale online · v. 1.0 · novembre 2026*

## 1. Chi tratta i tuoi dati

Titolare del trattamento: {{TITOLARE}}, biologo nutrizionista, libero professionista con domicilio professionale in {{INDIRIZZO}}; partita IVA {{PARTITA_IVA}}, codice fiscale {{CODICE_FISCALE}}; iscritto all'Albo dei Biologi ({{ALBO}}). Per ogni richiesta sulla privacy: {{CONTATTI}}. Il titolare lavora da solo e non ha nominato un responsabile della protezione dei dati (DPO), che per un singolo professionista non è obbligatorio.

## 2. Quali dati e da dove

- **Anagrafici e di contatto**: nome, cognome, data di nascita, codice fiscale, indirizzo, email, cellulare.
- **Sulla salute e sul percorso**: storia clinica e abitudini alimentari, obiettivi, peso, misure e altri dati che rilevi tu, referti ed esami che mi invii, farmaci e integratori, piani alimentari e loro versioni, risposte ai check settimanali (pasti, energia, allenamento, peso, percezioni), messaggi e vocali nella chat dell'app, note sulle videochiamate.
- **Amministrativi**: videochiamate in agenda, disdette, acquisti, pagamenti e fatture (i dati completi della carta restano presso i fornitori di pagamento).
- **Uso dell'app**: account, accessi e dispositivo per le notifiche, lezioni dei corsi seguite.
- **Firma elettronica del modulo di accettazione**: data e ora, email a cui è arrivato il codice, indirizzo IP e dispositivo, esito del codice di verifica, scelte espresse e immagine della firma tracciata (non rileviamo pressione, velocità o altri dati biometrici).
- **Scelte sui consensi** facoltativi e opposizioni, con data e modalità.
- Per i minori, i dati del genitore o del tutore che firma.

Li raccolgo da te e, se acconsenti al contatto, dal tuo medico. Se hai prenotato dal sito la chiamata conoscitiva, ho già nome, email ed eventuali risposte che hai dato prenotando.

## 3. Perché li tratto e su quale base

- **Consulenza nutrizionale**: valutazione, piano alimentare, check settimanali, chat e vocali, controlli, documentazione del percorso. Base: contratto (art. 6.1.b) e prestazione da parte di un professionista sanitario tenuto al segreto professionale (art. 9.2.h e 9.3). Necessario: senza questi dati non posso seguirti.
- **Organizzazione del percorso online**: videochiamate su Google Meet con inviti e promemoria, account e notifiche dell'app (sempre generiche, senza dati sulla salute), email di servizio, invio del link e del codice per firmare questo modulo, pagamenti. Base: contratto (art. 6.1.b). Necessario.
- **Obblighi di legge**: fatturazione, contabilità, documentazione del consenso informato (L. 219/2017), prova dei consensi e delle opposizioni (art. 7.1) e, ove previsto, invio delle spese sanitarie al Sistema Tessera Sanitaria. Base: art. 6.1.c. Necessario.
- **Tutela dei miei diritti** in caso di contestazioni, compresa la conservazione del modulo firmato e delle prove della firma. Base: legittimo interesse a potermi difendere (art. 6.1.f) e art. 9.2.f.
- **Su consenso, sempre revocabile**: contatto con il tuo medico di base o con lo specialista che ti segue (art. 9.2.a), chiesto nel modulo di accettazione; newsletter e comunicazioni promozionali (art. 6.1.a), chieste a parte. Sono facoltativi: dire di no non cambia il percorso.

Non prendo decisioni basate unicamente su trattamenti automatizzati (art. 22).

## 4. Come li proteggo

Il gestionale EdoDoc è sviluppato apposta per il mio studio e conserva i dati in data center in Italia (Milano). Accedo con credenziali personali; le connessioni sono cifrate; il database ha copie di sicurezza. L'app ti fa entrare con un tuo account e le notifiche sul telefono non contengono mai dati sulla salute. Le videochiamate non vengono registrate né trascritte. Non scambio dati sulla salute via WhatsApp o SMS: per i contenuti del percorso si usano l'app e l'email.

Il modulo di accettazione si firma con il sistema di firma elettronica del gestionale, senza piattaforme di firma esterne: link personale a scadenza, codice monouso inviato alla tua email, documento finale sigillato elettronicamente con marca temporale e conservato in modo non modificabile, con un registro degli eventi in cui ogni passaggio è concatenato al precedente. All'autorità di marcatura temporale va solo l'impronta crittografica (hash) del documento, mai il contenuto. Ogni modulo firmato riporta un codice con cui chiunque lo riceva può verificarne l'autenticità; la verifica mostra solo le iniziali di chi ha firmato.

## 5. Intelligenza artificiale

Non uso sistemi di intelligenza artificiale per valutare la tua salute, preparare il tuo piano alimentare o prendere decisioni su di te: ogni valutazione è mia. Strumenti di intelligenza artificiale possono aiutarmi a scrivere testi generali, come newsletter o post, senza i tuoi dati sulla salute.

## 6. Chi può vedere i tuoi dati

- **Il titolare**, tenuto al segreto professionale.
- **Fornitori che trattano i dati per mio conto** (responsabili, art. 28), vincolati da contratto: hosting del gestionale e del database, email, calendario e videochiamate, pubblicazione dell'app e notifiche, video dei corsi. L'elenco aggiornato, con nome, sede e garanzie, è allegato al modulo firmato e disponibile su richiesta.
- **Titolari autonomi**: commercialista per gli adempimenti fiscali; Agenzia delle Entrate e Sistema Tessera Sanitaria ove previsto; istituti bancari e di pagamento (per esempio PayPal); autorità giudiziarie o di controllo; assicurazione e legali in caso di contenzioso; il tuo medico, solo con il tuo consenso, e altri professionisti sanitari **solo su tua indicazione**.

I dati non vengono diffusi né ceduti a terzi per loro finalità commerciali.

## 7. Trasferimenti fuori dall'Unione europea

Il database del gestionale e i moduli firmati sono conservati in Italia. Alcuni fornitori (Google, Apple, Cloudflare) hanno sede negli Stati Uniti o vi trasferiscono dati per erogare il servizio. Il trasferimento si basa sulla decisione di adeguatezza della Commissione europea per le società certificate EU-US Data Privacy Framework e/o sulle Clausole contrattuali standard (art. 46), con misure supplementari (dati a riposo in Italia, notifiche senza contenuti sanitari, firma gestita in proprio). Puoi chiederne copia a {{EMAIL}}.

## 8. Per quanto tempo

Conservo i dati per il tempo in cui tu o io possiamo far valere diritti legati alla consulenza: 10 anni, il termine di prescrizione ordinario. Documentazione del percorso (anamnesi, piani alimentari, check, referti, note), chat, vocali ed email, agenda: 10 anni dall'ultima consulenza. Modulo di accettazione firmato e prove della firma: 15 anni dalla firma. Richieste di firma non completate: 10 anni dalla richiesta. Fatture e pagamenti: 10 anni. Scelte sui consensi e opposizioni, con la loro prova: per tutto il rapporto e 10 anni dall'ultima consulenza. Contatti che hanno fatto solo la chiamata conoscitiva, senza iniziare un percorso: 24 mesi. Dati trattati solo su consenso: fino alla revoca, salvo la prova del consenso e della revoca. Alla scadenza i dati vengono cancellati o resi anonimi. I termini si prolungano solo per un contenzioso in corso.

## 9. I tuoi diritti

Scrivendo a {{CONTATTI}} (dopo verifica dell'identità) puoi ottenere: accesso ai dati e copia della documentazione (art. 15), anche del modulo firmato e delle prove della firma; rettifica (art. 16); cancellazione, salvo i dati che devo conservare per legge o per la tutela dei diritti, come il modulo firmato e le fatture (art. 17); limitazione (art. 18); portabilità dei dati che mi hai fornito (art. 20); opposizione all'invio al Sistema Tessera Sanitaria ove previsto. Dall'app puoi anche chiudere il tuo account. Rispondo entro 30 giorni (prorogabili di due mesi nei casi complessi, avvisandoti). Per i minori i diritti si esercitano tramite chi ne ha la responsabilità.

**Diritto di opposizione (art. 21).** Puoi opporti in qualsiasi momento, per motivi legati alla tua situazione particolare, ai trattamenti basati sul legittimo interesse descritti al punto 3.

**Revoca del consenso (art. 7.3).** Puoi revocare in qualsiasi momento i consensi prestati, con la stessa facilità con cui li hai dati. La revoca vale per il futuro e non rende illecito il trattamento svolto prima.

Puoi proporre reclamo al Garante per la protezione dei dati personali (Piazza Venezia 11, 00187 Roma – www.garanteprivacy.it) o ricorso all'autorità giudiziaria.
$informativa$),
('FORNITORI', '1.0', 'Elenco dei fornitori che trattano dati per conto del titolare', 'MARKDOWN', $fornitori$# Elenco dei fornitori che trattano dati per conto del titolare

*Responsabili del trattamento (art. 28 GDPR) · allegato all'informativa v. 1.0 · aggiornato a novembre 2026*

Questo elenco è tenuto aggiornato dal titolare ed è disponibile su richiesta a {{EMAIL}}. La sostituzione di un fornitore con un altro che eroga lo stesso servizio con garanzie equivalenti viene registrata qui e non richiede una nuova firma del modulo. «DPF» indica la certificazione EU-US Data Privacy Framework (decisione di adeguatezza della Commissione europea); «SCC» le Clausole contrattuali standard (art. 46 GDPR).

| Fornitore | Servizio | Sede e garanzie |
|---|---|---|
| Google Cloud | Hosting del gestionale EdoDoc e del database, compresi i moduli firmati | Dati a riposo in Italia (Milano); società USA: DPF + SCC |
| Google Workspace | Email, calendario e videochiamate Google Meet | Data center di Google, anche fuori dall'UE; società USA: DPF + SCC |
| Google Firebase | Pubblicazione dell'app web e notifiche push su Android, sempre generiche | Società USA: DPF + SCC |
| Apple | Notifiche push su iPhone, sempre generiche | Società USA: DPF |
| Cloudflare | Video dei corsi nell'app | Società USA: DPF + SCC |
| Anthropic | Supporto alla scrittura di testi generali (newsletter, post), senza dati sulla salute | Società USA: DPF + SCC |

La firma elettronica del modulo di accettazione è gestita direttamente dal gestionale, senza piattaforme di firma esterne. La marca temporale sui moduli firmati è apposta da un'autorità di marcatura temporale che riceve solo l'impronta crittografica (hash) del documento, senza alcun dato personale. Banche e istituti di pagamento (per esempio PayPal) operano come titolari autonomi.

*Ogni fornitore pubblica il proprio elenco di sub-fornitori, richiamato nel contratto accettato dal titolare. Verifica annuale delle garanzie e della certificazione DPF.*
$fornitori$)
) AS t(tipo, versione, titolo, formato, contenuto);
