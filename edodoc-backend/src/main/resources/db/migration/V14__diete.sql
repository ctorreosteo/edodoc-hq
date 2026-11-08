-- Diete (piani alimentari) scritte dal dottore. Senza paziente sono modelli da cui partire.
-- contenuto: obiettivo, macro, giornate con pasti e alternative, consigli, alimenti liberi o da evitare, integrazione.
-- consegnata_il: quando il dottore l'ha segnata come consegnata al paziente; una dieta consegnata resta modificabile.
CREATE TABLE diete (
    id             BIGSERIAL PRIMARY KEY,
    paziente_id    BIGINT REFERENCES pazienti (id),
    titolo         VARCHAR(255) NOT NULL,
    data_inizio    DATE,
    contenuto      JSONB NOT NULL DEFAULT '{}'::jsonb,
    consegnata_il  TIMESTAMP,
    created_at     TIMESTAMP NOT NULL DEFAULT now(),
    updated_at     TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_diete_paziente ON diete (paziente_id, created_at DESC);

-- Storico: ogni salvataggio che cambia qualcosa lascia qui la fotografia della dieta, con la sua ora.
-- La versione 1 è la creazione. nota: da dove viene la versione (copia, modello, ripristino), se non è un salvataggio normale. Il PDF di una versione passata si rigenera da questa fotografia.
CREATE TABLE dieta_versioni (
    id          BIGSERIAL PRIMARY KEY,
    dieta_id    BIGINT NOT NULL REFERENCES diete (id) ON DELETE CASCADE,
    numero      INTEGER NOT NULL,
    titolo      VARCHAR(255) NOT NULL,
    data_inizio DATE,
    contenuto   JSONB NOT NULL,
    nota        VARCHAR(255),
    created_at  TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (dieta_id, numero)
);
