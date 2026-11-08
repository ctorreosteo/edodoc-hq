-- Accesso admin per Carlos Torre. Password iniziale 0000 (hash BCrypt): va cambiata al primo accesso.
-- ON CONFLICT: se l'utente esiste già, la migrazione non tocca nulla.
INSERT INTO utenti (username, password_hash, nome, cognome, ruolo, attivo)
VALUES ('c.torre@studiomobilitas.it',
        '$2a$10$fwx9R1YWJXMtG1.uNFoHR.PbTO63kzp0.WSbWadaojYp3awM91baq',
        'Carlos', 'Torre', 'ADMIN', TRUE)
ON CONFLICT (username) DO NOTHING;
