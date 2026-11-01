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
| Calendario | Il Google Calendar del dottore in diretta, senza copie nel gestionale: viste giorno, settimana, mese, anno ed elenco, eventi ricorrenti, inviti e Meet. Gli eventi delle visite aprono la scheda del paziente; spostarli o cancellarli torna sulla visita al giro successivo del job |
| Email | Dal menu contestuale: sollecito pagamento, richiesta dati fatturazione, fattura con PDF. Il popup propone il modello di `config` e si può modificare prima dell'invio |
| Task | Organizzati in cartelle annidate e liste. I job creano i promemoria (rinnovi, esami, Tessera Sanitaria, scadenze fiscali) nelle liste di sistema (`task_liste.codice`), che non si archiviano né si eliminano |

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

Stesso schema di Mobilitas: Service Account con domain-wide delegation, sull'account `supporto@edodoc.it` (`GOOGLE_ACCOUNT_EMAIL`, impostato dalla migrazione V8 insieme ai due interruttori). In produzione non esistono chiavi: l'organizzazione le vieta, e `GOOGLE_SENZA_CHIAVE=true` fa firmare l'asserzione a IAM. Calendar API e Gmail API sono già abilitate.

1. Dai a `edodoc-backend@endless-grail-513417-e7.iam.gserviceaccount.com` il ruolo Service Account Token Creator su se stesso:
   `gcloud iam service-accounts add-iam-policy-binding edodoc-backend@endless-grail-513417-e7.iam.gserviceaccount.com --project endless-grail-513417-e7 --member serviceAccount:edodoc-backend@endless-grail-513417-e7.iam.gserviceaccount.com --role roles/iam.serviceAccountTokenCreator`
2. In Google Workspace Admin, sotto Domain-wide delegation, autorizza il client ID `117822787658752297703` con questi scope:
   `https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/gmail.modify`

Finché manca uno dei due, le pagine Email e Calendario mostrano la guida di collegamento. In locale serve invece `GOOGLE_CREDENTIALS_PATH` con il percorso assoluto di un JSON; senza, le due pagine usano i dati dimostrativi.

Le visite create prima dell'accensione aspettano: quelle future si pubblicano da sole al primo giro del job, ogni 5 minuti, e il paziente riceve l'invito se la visita lo prevede.

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

## Account per Apple e Google

`prova.dottore@edodoc.it` e `prova.paziente@edodoc.it` servono a chi revisiona le app. Vivono solo su un server demo con database proprio: il dottore vede tutti i pazienti, quindi non devono mai stare accanto a dati reali. Il backend rifiuta di crearli senza `APP_INIT_DEMO_ENABLED=true` e la partita IVA finta dei dati demo.

1. Pubblica una seconda istanza del backend con un database vuoto e `APP_INIT_DEMO_ENABLED=true`. Lascia spente tutte le integrazioni.
2. Imposta `APP_PROVA_DOTTORE_EMAIL`, `APP_PROVA_DOTTORE_PASSWORD`, `APP_PROVA_PAZIENTE_EMAIL` e `APP_PROVA_PAZIENTE_PASSWORD`.
3. Compila le app con l'URL di questa istanza: `API_DEMO_URL` su iOS, `-PEDODOC_API_DEMO_URL` su Android. Chi accede con un account di prova finisce qui, tutti gli altri sul server reale.

All'avvio e ogni ora il backend ripristina password, accessi, paziente archiviata, visita futura e corso. Il cambio password di questi account è rifiutato.

In locale gli stessi account esistono con le password `prova-dottore-locale` e `prova-paziente-locale`.

## Deploy

`./deploy.sh` pubblica backend e frontend sul progetto Google Cloud `endless-grail-513417-e7`, regione `europe-west8`. Non serve il login di gcloud: usa la chiave del service account `edodoc-deploy` in `~/.config/edodoc/edodoc-deploy.json`, fuori dal repo. L'organizzazione blocca la creazione di nuove chiavi: per sostituirla va sospesa la policy `iam.managed.disableServiceAccountKeyCreation` su questo progetto.

| Pezzo | Dove |
|-------|------|
| Backend | Cloud Run `edodoc-backend`, sempre acceso perché i job pianificati devono girare anche senza richieste |
| Database | Cloud SQL `edodoc-db`, PostgreSQL 16. Nessuna rete autorizzata: il backend si collega col suo service account tramite il connettore Cloud SQL |
| Frontend | Firebase Hosting |
| Segreti | Secret Manager: `edodoc-db-password`, `edodoc-jwt-secret`, `edodoc-admin-password` |

Le altre variabili sono in [edodoc-backend/env.example](edodoc-backend/env.example). In produzione `JWT_SECRET` è obbligatoria: l'avvio fallisce senza.
