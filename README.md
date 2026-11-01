# EdoDoc HQ

Gestionale del Dr. Edoardo Bo: pazienti, percorsi, visite, check settimanale, corsi, pagamenti, fatture, task, finance e dashboard.

| Cartella | Cosa contiene | Stack |
|----------|---------------|-------|
| [edodoc-backend/](edodoc-backend/) | API REST | Java 21, Spring Boot 3.4, PostgreSQL, Flyway, JWT |
| [edodoc-frontend/](edodoc-frontend/) | Gestionale web | React 19, Vite 7, TypeScript, Tailwind 4 |

Stessa architettura e stesso design system (Lux) di Mobilitas HQ, con i colori EdoDoc. Le porte sono diverse, così i due gestionali girano insieme in locale.

## Avvio locale

Servono Docker, Java 21+ e Node 20+.

```bash
./dev.sh
```

| Servizio | Indirizzo |
|----------|-----------|
| Gestionale | http://localhost:5174 (`edoardo@edodoc.it` / `0000`) |
| API | http://localhost:8081/api (salute: `/health`) |
| PostgreSQL | `localhost:5433`, database `edodochq`, utente e password `admin` |

Al primo avvio il profilo `local` crea l'utente del dottore e dati dimostrativi con pazienti inventati. Per ripartire da zero: `cd edodoc-backend && docker compose down -v`.

Test del backend: `cd edodoc-backend && ./mvnw test`. Controlli del frontend: `cd edodoc-frontend && npm run typecheck && npm run lint`.

Stack completo in container, backend compreso: `cd edodoc-backend && docker compose --profile completo up --build`.

## Processi

| Area | Regole principali |
|------|-------------------|
| Acquisti | Pagina con chi ha comprato cosa e le rate collegate. Percorso 6 mesi: 1.500 € in anticipo o 3 rate da 700 € ogni due mesi. Mantenimento (4 visite in un anno): 600 € in anticipo o 2 rate da 400 € semestrali. Importi in `config`. L'acconto si scala dal pagamento in anticipo e si somma alle rate |
| Visite | Titolo `Dottor Bo - nome (n su 6)`. I numeri seguono il calendario: spostare o annullare rinumera le altre. Alla visita 5 di 6 nasce il task del rinnovo |
| Check | Una riga per paziente e settimana. Compilato sabato o domenica vale per il lunedì in arrivo. Segnali: peso non sceso, nessun miglioramento, energia ≤ 2. Dopo il feedback del dottore il paziente non può più cambiare le risposte |
| Corsi | Corso, moduli e lezioni (video o testo in Markdown). Tutto nasce in bozza. Il paziente vede una lezione solo se è pubblicata, completa e sta in un corso pubblicato; tutti i pazienti con l'app vedono tutti i corsi pubblicati |
| Fatture | Solo a pagamento ricevuto. Numero progressivo senza buchi, che non riparte a inizio anno. Una fattura emessa non si modifica: si annulla e il numero resta occupato |
| Finance | Righe del foglio Cassa calcolate da pagamenti e movimenti. Candidature da chiudere quando il margine del Livello 1 scende sotto il valore di un cliente |
| Email | Dal menu contestuale: sollecito pagamento, richiesta dati fatturazione, fattura con PDF. Il popup propone il modello di `config` e si può modificare prima dell'invio |
| Task | Tipi preimpostati in `task_tipi`. I job creano i promemoria di Tessera Sanitaria e scadenze fiscali |

## Integrazioni

Tutte spente: si accendono dalla pagina Impostazioni o dalla tabella `config`, senza rilasci.

| Chiave `config` | Effetto |
|-----------------|---------|
| `GOOGLE_CALENDAR_SYNC_ENABLED` | Scrive le visite su Google Calendar con link Meet e invito al paziente, e rilegge spostamenti e cancellazioni fatti su Google |
| `GOOGLE_GMAIL_INVIO_ENABLED` | Invia fatture e inviti all'app dall'account Google del dottore e apre la sua casella nella pagina Email. Spenta in locale, la pagina usa una casella dimostrativa in memoria; in produzione mostra la guida di collegamento |
| `CLOUDFLARE_STREAM_ENABLED` | Carica e riproduce i video dei corsi con Cloudflare Stream |
| `PUSH_ENABLED` | Invia con APNs e FCM le notifiche di nuovi messaggi e feedback. Finché è spenta, l'app vede tutto all'apertura |
| `TESSERA_SANITARIA_ENABLED` | Predisposta: il client verso il Sistema TS va scritto quando ci saranno credenziali e certificato |

### Collegare Google Workspace

Stesso schema di Mobilitas: Service Account con domain-wide delegation.

1. In Google Cloud abilita Calendar API e Gmail API e crea un Service Account con chiave JSON.
2. In Google Workspace Admin, sotto Domain-wide delegation, autorizza il suo client ID con questi scope:
   `https://www.googleapis.com/auth/calendar` e `https://www.googleapis.com/auth/gmail.modify` (lettura della casella e invio).
3. Imposta `GOOGLE_CREDENTIALS_PATH` sul percorso assoluto del JSON.
4. In Impostazioni compila l'account del dottore e abilita le integrazioni.

Le visite create prima dell'accensione aspettano: quelle future si pubblicano da sole al primo giro del job, ogni 5 minuti.

### Collegare le notifiche push

1. iOS: su Apple Developer crea una chiave con Apple Push Notifications service e scarica il file `.p8`. Imposta `APNS_TEAM_ID`, `APNS_KEY_ID`, `APNS_KEY_PATH` (percorso assoluto) e, se serve, `APNS_TOPIC`. `APNS_SANDBOX=true` vale solo per le build lanciate da Xcode: TestFlight e App Store sono produzione.
2. Android: nel progetto Firebase dell'app genera una chiave del Service Account e imposta `FCM_CREDENTIALS_PATH` sul percorso assoluto del JSON. Il progetto si legge dal file.
3. Riavvia il backend e in Impostazioni abilita "Notifiche push dell'app".

Se mancano le credenziali di una piattaforma, le sue notifiche si saltano con un avviso nel log e nessun errore.

### Collegare Cloudflare Stream

1. Nell'account Cloudflare attiva Stream e crea un API token con permesso `Stream:Edit`.
2. Imposta `CLOUDFLARE_ACCOUNT_ID` e `CLOUDFLARE_STREAM_API_TOKEN` e riavvia il backend.
3. In Impostazioni abilita "Video dei corsi su Cloudflare Stream".

Il browser carica il file direttamente su Cloudflare. I video sono privati: si guardano solo con un token temporaneo di un'ora, che il backend genera a ogni richiesta. Le copertine stanno nel database e si leggono senza login da `/api/media/copertine/{id}`.

## API per l'app mobile

Una sola app per paziente e dottore: la schermata dipende da `utente.ruolo` nella sessione. Il dottore usa tutta l'API del gestionale con il suo token, il paziente solo `/api/app/**` e `/api/auth/**` (altrove 403). Per il paziente l'id è sempre quello del token, mai un valore passato dal client.

### Accesso

| Metodo | Percorso | Uso |
|--------|----------|-----|
| POST | `/api/pazienti/{id}/invito-app` | Dal gestionale: crea l'accesso e restituisce il link con il token |
| POST | `/api/auth/app/imposta-password` | `{token, password}`: attiva l'accesso e restituisce la sessione |
| POST | `/api/auth/login` | `{username, password, mobile: true}`: restituisce `{token, refreshToken, utente}` |
| POST | `/api/auth/rinnova` | `{refreshToken}`: nuova coppia di token. Il vecchio refresh token smette di valere |
| POST | `/api/auth/logout` | `{refreshToken, pushToken}`: chiude la sessione e sgancia il telefono dalle notifiche |
| POST | `/api/auth/dispositivi` | `{pushToken, piattaforma: IOS o ANDROID}`: da chiamare dopo ogni accesso |

Il token dura 12 ore. Sul 401 l'app chiama `/rinnova` una volta sola anche con più richieste in corso, perché un secondo rinnovo con lo stesso refresh token viene rifiutato; se il rinnovo risponde 400 torna al login. Il refresh token dura 60 giorni dall'ultimo uso (`APP_SESSIONE_GIORNI`) e va tenuto nel secure storage del telefono. Un cambio password chiude tutti i telefoni dell'utente, compreso quello in uso.

`APP_IMPOSTA_PASSWORD_URL` è il link che apre l'app, per impostazione predefinita `edodoc://imposta-password`: il backend aggiunge `?token=...`. I client di posta spesso non rendono cliccabili gli schemi personalizzati, quindi nell'app il link si può anche incollare nella schermata di primo accesso.

### Paziente

| Metodo | Percorso | Uso |
|--------|----------|-----|
| GET | `/api/app/riepilogo` | Settimana, check compilato, feedback e messaggi da leggere |
| GET | `/api/app/percorso` | `{percorso, visite}`: il percorso in corso, altrimenti il più recente, oppure null. Tutte le visite, anche fuori percorso, dalla più vecchia, senza note del dottore né dati Google |
| GET | `/api/app/check/corrente` | Settimana in corso e check già compilato, con il feedback |
| GET | `/api/app/check` | Storico del paziente |
| POST | `/api/app/check` | Invia il check, che si può rifare finché il dottore non risponde (poi 409) |
| POST | `/api/app/check/{id}/feedback-letto` | Il paziente ha aperto il feedback |
| GET | `/api/app/check/{id}/feedback/audio` | Il vocale del dottore, `audio/mp4`. Solo sui propri check, altrimenti 404 |
| GET | `/api/app/corsi`, `/api/app/corsi/{id}`, `/api/app/lezioni/{id}` | Corsi pubblicati, struttura, lezione con URL video firmato |
| GET | `/api/app/pagamenti` | Riepilogo e pagamenti del paziente, con `fatturaId` quando c'è la fattura |
| GET | `/api/app/fatture` | Fatture valide: quelle annullate non compaiono |
| GET | `/api/app/fatture/{id}/pdf` | Scarica il PDF con `Authorization: Bearer` |
| GET | `/api/app/messaggi` | Chat, vedi sotto |
| POST | `/api/app/messaggi` | `{testo, clientId}` |
| POST | `/api/app/messaggi/letti` | Il paziente ha aperto la chat |

Il corpo del check: `pastiOttimali` (0-21), `pastiLiberi`, `energia` (1-5), `allenamento`, `pesoKg`, `andamentoPeso`, `percezione`, `percezioneMigliorata`, `impegno` (1-5).

### Dottore

| Metodo | Percorso | Uso |
|--------|----------|-----|
| GET | `/api/check/settimana` | Lista del lunedì con i check e i segnali |
| PUT | `/api/check/{id}/feedback` | `{testo, inviaEmail?}`: scrive o sostituisce il feedback, compreso un vocale precedente, segna il check come letto e avvisa il paziente |
| POST | `/api/check/{id}/feedback/audio` | Multipart: `file` (AAC in contenitore m4a, massimo 5 MB), `secondi`, `testo?`, `inviaEmail?`. Come sopra, con il vocale |
| GET | `/api/check/{id}/feedback/audio` | Il dottore riascolta il vocale, `audio/mp4` |
| GET | `/api/chat/conversazioni` | Conversazioni dalla più recente, con ultimo messaggio e non letti |
| GET | `/api/chat/{pazienteId}/messaggi` | Chat, vedi sotto |
| POST | `/api/chat/{pazienteId}/messaggi` | `{testo, clientId}` |
| POST | `/api/chat/{pazienteId}/letti` | Il dottore ha aperto la chat |

Il dettaglio del check porta anche `feedbackAudioId`, `feedbackAudioSecondi` e `feedbackEmailIl`. Un feedback può essere solo vocale, quindi con `feedback` null: conta comunque come risposta, blocca le modifiche e risulta da leggere.

Con `inviaEmail: true` il testo parte anche con Gmail, usando i modelli `EMAIL_FEEDBACK_*` di `config`. Per un vocale l'email avvisa soltanto che c'è un messaggio nell'app: i vocali restano dietro login e non si allegano. Se l'email non parte il feedback si salva comunque, `feedbackEmailIl` resta null e `message` spiega il motivo.

### Chat e notifiche

I messaggi arrivano sempre dal più vecchio al più recente. Senza parametri `GET .../messaggi` dà gli ultimi 50 (`limite`, massimo 100), `primaDiId` la pagina precedente, `dopoId` solo i nuovi. A chat aperta l'app chiede `dopoId` ogni pochi secondi, a chat chiusa arriva la push. `clientId` è un UUID generato dall'app per ogni messaggio: reinviare lo stesso `clientId` dopo una rete caduta non crea doppioni. Solo testo, massimo 4.000 caratteri.

Le push passano da Apple e Google, quindi non contengono mai nomi o dati sanitari: solo un testo generico e, in `data`, `tipo` (`MESSAGGIO` o `FEEDBACK`) con `checkId` o `pazienteId` per aprire la schermata giusta. Su iOS `data` è una chiave del payload accanto ad `aps`; su Android è il campo `data` di FCM, dove i valori sono sempre stringhe. Il telefono registra il token di APNs o FCM: il backend sceglie il canale da `piattaforma`, e cancella il token quando Apple risponde 410 o Google 404.

## Deploy

Backend: immagine da [edodoc-backend/Dockerfile](edodoc-backend/Dockerfile), variabili in [edodoc-backend/env.example](edodoc-backend/env.example). In produzione sono obbligatorie `JWT_SECRET` (l'avvio fallisce senza), `ADMIN_EMAIL` e `ADMIN_PASSWORD` per il primo accesso, e `CORS_ALLOWED_ORIGINS`.

Frontend: `VITE_API_BASE_URL=https://.../api npm run build`, poi pubblica `dist/` con redirect delle route su `index.html`.
