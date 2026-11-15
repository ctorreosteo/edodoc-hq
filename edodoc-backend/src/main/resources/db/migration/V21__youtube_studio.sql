-- YouTube (pagina /youtube, portata da Mobilitas HQ): storico dei contatori del canale e piano editoriale.
-- Il collegamento al canale è un consenso OAuth Google del dottore: il refresh token sta in config
-- (YOUTUBE_OAUTH_REFRESH_TOKEN). Il client OAuth è nelle variabili d'ambiente del backend
-- YOUTUBE_OAUTH_CLIENT_ID / YOUTUBE_OAUTH_CLIENT_SECRET: senza, la pagina mostra «non collegato».
-- Idempotente.

-- Contatori pubblici del canale (Data API) rilevati ogni ora e quando la pagina è aperta (al massimo ogni 10 minuti).
-- Le Analytics API arrivano con 2-3 giorni di ritardo: queste righe danno l'andamento delle ultime ore.
CREATE TABLE IF NOT EXISTS youtube_snapshot (
    id BIGSERIAL PRIMARY KEY,
    canale_id VARCHAR(64) NOT NULL,
    rilevato_il TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    iscritti BIGINT NOT NULL,
    visualizzazioni BIGINT NOT NULL,
    video INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_youtube_snapshot_canale_data ON youtube_snapshot (canale_id, rilevato_il);

-- Piano editoriale: una scheda per video, dall'idea alla pubblicazione.
-- stato: IDEA, SCRIPT, RIPRESE, MONTAGGIO, PRONTO, PUBBLICATO
CREATE TABLE IF NOT EXISTS youtube_idee (
    id BIGSERIAL PRIMARY KEY,
    titolo VARCHAR(200) NOT NULL,
    note TEXT NULL,
    stato VARCHAR(20) NOT NULL DEFAULT 'IDEA',
    formato VARCHAR(20) NOT NULL DEFAULT 'VIDEO',
    priorita VARCHAR(10) NOT NULL DEFAULT 'MEDIA',
    data_uscita DATE NULL,
    -- Video YouTube collegato quando esce: la scheda mostra i suoi numeri
    video_id VARCHAR(32) NULL,
    -- In EdoDoc lavora solo il dottore: il responsabile resta facoltativo
    responsabile_utente_id BIGINT NULL REFERENCES utenti (id) ON DELETE SET NULL,
    posizione INTEGER NOT NULL DEFAULT 0,
    creata_da_utente_id BIGINT NULL REFERENCES utenti (id) ON DELETE SET NULL,
    creata_il TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    aggiornata_il TIMESTAMP WITHOUT TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_youtube_idee_stato ON youtube_idee (stato, posizione);

-- ConfigService.salvaDiSistema aggiorna solo righe esistenti: le chiavi scritte dal backend devono esserci già.
INSERT INTO config (chiave, valore, descrizione) VALUES
    ('YOUTUBE_OAUTH_REFRESH_TOKEN', '', 'YouTube: refresh token del canale, scritto dal collegamento nella pagina YouTube'),
    ('YOUTUBE_OAUTH_STATE', '', 'YouTube: state del consenso OAuth in corso (gestito dal sistema)'),
    ('YOUTUBE_OAUTH_REDIRECT_URI', 'https://hq.edodoc.it/oauth/youtube/callback', 'YouTube: redirect URI OAuth (da autorizzare nel client Google)'),
    ('YOUTUBE_OBIETTIVO_ISCRITTI', '', 'YouTube: obiettivo iscritti mostrato nella pagina')
ON CONFLICT (chiave) DO NOTHING;
