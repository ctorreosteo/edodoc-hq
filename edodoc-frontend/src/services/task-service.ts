import { api, ApiError } from "./api-client"

/**
 * Gestione task (/api/task): cartelle, liste, task, commenti, allegati, checklist, dipendenze.
 * Date in formato ISO locale: scadenza e dataInizio "YYYY-MM-DD", scadenzaOra e inizioOra "HH:mm:ss" (nessun fuso orario).
 * Gli utenti del gestionale (il dottore e Carlos) si assegnano i task; niente permessi o notifiche.
 */

export type TaskStato = 'DA_FARE' | 'IN_CORSO' | 'IN_ATTESA' | 'COMPLETATO' | 'ANNULLATO';
export type TaskPriorita = 'URGENTE' | 'ALTA' | 'NORMALE' | 'BASSA';
export type TaskEventoTipo =
  | 'CREATO'
  | 'COMMENTO'
  | 'STATO'
  | 'PRIORITA'
  | 'SCADENZA'
  | 'TITOLO'
  | 'DESCRIZIONE'
  | 'LISTA'
  | 'ETICHETTE'
  | 'PAZIENTE'
  | 'ALLEGATO'
  | 'ALLEGATO_RIMOSSO'
  | 'CHECKLIST'
  | 'STIMA'
  | 'ASSEGNATARI'
  | 'SOTTOTASK'
  | 'INIZIO'
  | 'DIPENDENZA';

export const TASK_STATI: { value: TaskStato; label: string; chiuso: boolean }[] = [
  { value: 'DA_FARE', label: 'Da fare', chiuso: false },
  { value: 'IN_CORSO', label: 'In corso', chiuso: false },
  { value: 'IN_ATTESA', label: 'In attesa', chiuso: false },
  { value: 'COMPLETATO', label: 'Completato', chiuso: true },
  { value: 'ANNULLATO', label: 'Annullato', chiuso: true },
];

export const TASK_PRIORITA: { value: TaskPriorita; label: string }[] = [
  { value: 'URGENTE', label: 'Urgente' },
  { value: 'ALTA', label: 'Alta' },
  { value: 'NORMALE', label: 'Normale' },
  { value: 'BASSA', label: 'Bassa' },
];

export const isStatoChiuso = (stato: TaskStato) => stato === 'COMPLETATO' || stato === 'ANNULLATO';

/**
 * MIEI = assegnati a me oppure senza assegnatari (i promemoria automatici li vedono tutti); TUTTI = tutto.
 */
export type TaskVista = 'MIEI' | 'TUTTI';

export interface TaskPersona {
  id: number;
  nome: string;
  cognome: string;
  iniziali: string;
}

/** Utente del gestionale a cui si può assegnare un task. */
export interface TaskOperatore extends TaskPersona {
  ruoli: string[];
}

export interface TaskLista {
  id: number;
  /** Liste di sistema, dove i job mettono i promemoria: non si archiviano né si eliminano */
  codice: string | null;
  nome: string;
  descrizione: string | null;
  colore: string;
  icona: string | null;
  ordine: number;
  archiviata: boolean;
  /** Cartella che la contiene (null = radice) */
  cartellaId: number | null;
  /** Task aperti della lista */
  aperti: number;
}

/** Cartella annidabile con parentId (null = radice). */
export interface TaskCartella {
  id: number;
  parentId: number | null;
  nome: string;
  descrizione: string | null;
  colore: string;
  icona: string | null;
  ordine: number;
  archiviata: boolean;
}

export type TaskTipoStruttura = 'LISTA' | 'CARTELLA';

export interface TaskEtichetta {
  id: number;
  nome: string;
  colore: string;
}

export interface TaskConfig {
  cartelle: TaskCartella[];
  liste: TaskLista[];
  etichette: TaskEtichetta[];
  /** Utenti del gestionale assegnabili */
  operatori: TaskOperatore[];
}

export interface TaskPaziente {
  id: number;
  nome: string;
  cognome: string;
}

export interface TaskRiga {
  id: number;
  listaId: number;
  titolo: string;
  stato: TaskStato;
  priorita: TaskPriorita | null;
  scadenza: string | null;
  scadenzaOra: string | null;
  /** Stima di durata in minuti, null se non stimato */
  stimaMinuti: number | null;
  /** Inizio del lavoro (Gantt), null se non pianificato; la fine è la scadenza */
  dataInizio: string | null;
  /** Ora d'inizio, solo con dataInizio */
  inizioOra: string | null;
  assegnatari: TaskPersona[];
  etichette: TaskEtichetta[];
  paziente: TaskPaziente | null;
  /** Creato da un job (rinnovi, esami, scadenze fiscali) */
  automatico: boolean;
  ordine: number;
  creatoDa: TaskPersona | null;
  creatoIl: string;
  aggiornatoIl: string;
  completatoIl: string | null;
  commenti: number;
  allegati: number;
  checklistTotale: number;
  checklistCompletati: number;
  /** Task principale (null se non è un sottotask) e il suo titolo */
  parentId: number | null;
  parentTitolo: string | null;
  sottotaskTotale: number;
  sottotaskCompletati: number;
  /** Sottotask né completati né annullati: completando il principale si chiede se chiudere anche questi */
  sottotaskAperti: number;
  /** Task da cui dipende (fine → inizio) non ancora completati né annullati */
  inAttesaDi: number;
}

/** Una colonna della vista lista scelta dall'utente; `larghezza` in px, null = quella della colonna. */
export interface TaskColonnaScelta {
  id: string;
  larghezza: number | null;
}

/** Colonne di un utente: `contesto` è "predefinita" (vale ovunque) o "lista:<id>" (su misura per una lista). */
export interface TaskDisposizioneColonne {
  contesto: string;
  colonne: TaskColonnaScelta[];
  aggiornatoIl: string;
}

/** Una pagina dell'archivio dei chiusi (completati e annullati), dal più recente. */
export interface TaskPaginaChiusi {
  righe: TaskRiga[];
  totale: number;
  pagina: number;
  altre: boolean;
}

export interface TaskChecklistVoce {
  id: number;
  testo: string;
  completato: boolean;
  ordine: number;
  completatoIl: string | null;
}

export interface TaskAllegato {
  id: number;
  nomeFile: string;
  contentType: string | null;
  estensione: string | null;
  dimensione: number;
  /** Id dell'evento COMMENTO a cui è legato, se caricato con un commento */
  commentoId: number | null;
  creatoIl: string;
}

export interface TaskEvento {
  id: number;
  tipo: TaskEventoTipo;
  /** Commento in markdown o descrizione della modifica */
  testo: string | null;
  valorePrecedente: string | null;
  valoreNuovo: string | null;
  creatoIl: string;
  modificatoIl: string | null;
  allegati: TaskAllegato[];
}

export interface TaskDettaglio {
  task: TaskRiga;
  descrizione: string | null;
  checklist: TaskChecklistVoce[];
  allegati: TaskAllegato[];
  eventi: TaskEvento[];
  /** Sottotask, nell'ordine in cui stanno (vuoto per un sottotask) */
  sottotask: TaskRiga[];
  /** I task che aspetta e quelli che blocca */
  dipendenze: TaskDipendenze;
}

/** Capo di una dipendenza; `titolo` null se non puoi vedere quel task. */
export interface TaskDipendenzaVoce {
  id: number;
  titolo: string | null;
  stato: TaskStato;
  dataInizio: string | null;
  scadenza: string | null;
  listaId: number | null;
}

export interface TaskDipendenze {
  attende: TaskDipendenzaVoce[];
  blocca: TaskDipendenzaVoce[];
}

/** Dipendenza fine → inizio: `successoreId` parte quando `predecessoreId` è finito. */
export interface TaskDipendenza {
  predecessoreId: number;
  successoreId: number;
}

export interface TaskPianificaVoce {
  id: number;
  dataInizio: string | null;
  scadenza: string | null;
}

/** Messaggio leggibile di un errore. */
export function messaggioErroreTask(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message.trim()) return e.message;
  return fallback;
}

/** Contatori sui task aperti della vista MIEI (prossimi7Giorni = da domani a +7; oggi escluso). */
export interface TaskRiepilogo {
  inRitardo: number;
  oggi: number;
  prossimi7Giorni: number;
  senzaScadenza: number;
}

export interface TaskFiltri {
  vista?: TaskVista;
  listaId?: number;
  assegnatoA?: number;
  stati?: TaskStato[];
  priorita?: TaskPriorita;
  etichettaId?: number;
  pazienteId?: number;
  q?: string;
  /** YYYY-MM-DD, inclusivo */
  scadenzaDa?: string;
  scadenzaA?: string;
  /** Include completati/annullati (default false) */
  includiChiusi?: boolean;
  /** Con includiChiusi: solo i chiusi aggiornati negli ultimi N giorni (default 30, 0 = tutti). Gli aperti arrivano sempre tutti. */
  chiusiGiorni?: number;
  /** Solo i task senza scadenza */
  senzaScadenza?: boolean;
  /** Solo i task delle liste dentro questa cartella (sottocartelle comprese) */
  cartellaId?: number;
}

export interface CreaTaskRequest {
  listaId: number;
  titolo: string;
  descrizione?: string | null;
  stato?: TaskStato;
  priorita?: TaskPriorita | null;
  scadenza?: string | null;
  scadenzaOra?: string | null;
  stimaMinuti?: number | null;
  dataInizio?: string | null;
  inizioOra?: string | null;
  assegnatariIds?: number[];
  etichettaIds?: number[];
  pazienteId?: number | null;
  checklist?: string[];
  /** Task principale: il nuovo task è un suo sottotask, nella stessa lista */
  parentId?: number | null;
}

export type TaskCampoModificabile =
  | 'listaId'
  | 'titolo'
  | 'descrizione'
  | 'stato'
  | 'priorita'
  | 'scadenza'
  | 'scadenzaOra'
  | 'stimaMinuti'
  | 'dataInizio'
  | 'inizioOra'
  | 'assegnatariIds'
  | 'etichettaIds'
  | 'pazienteId'
  | 'ordine';

export interface AggiornaTaskValori {
  listaId?: number;
  titolo?: string;
  descrizione?: string | null;
  stato?: TaskStato;
  priorita?: TaskPriorita | null;
  scadenza?: string | null;
  scadenzaOra?: string | null;
  stimaMinuti?: number | null;
  dataInizio?: string | null;
  inizioOra?: string | null;
  assegnatariIds?: number[];
  etichettaIds?: number[];
  pazienteId?: number | null;
  ordine?: number;
  /** Con stato COMPLETATO su un task principale: completa anche i suoi sottotask aperti (non è un campo) */
  completaSottotask?: boolean;
}

/** Creazione: tutti i campi; modifica: solo quelli generali (per spostarla c'è spostaLista). */
export interface ListaRequest {
  nome: string;
  descrizione?: string | null;
  colore?: string;
  icona?: string | null;
  ordine?: number;
  archiviata?: boolean;
  /** Solo in creazione: cartella in cui crearla */
  cartellaId?: number | null;
}

export interface CartellaRequest {
  nome: string;
  descrizione?: string | null;
  colore?: string;
  icona?: string | null;
  ordine?: number;
  archiviata?: boolean;
  /** Solo in creazione: cartella che la contiene */
  parentId?: number | null;
}

/** Le chiavi presenti in `valori` sono i campi da applicare (anche se null = svuota). */
const toAggiornaRequest = (valori: AggiornaTaskValori) => ({
  campi: Object.keys(valori).filter((k) => k !== 'completaSottotask') as TaskCampoModificabile[],
  ...valori,
});

type Parametri = Record<string, string | number | boolean | undefined>;

const parametri = (filtri: Partial<Record<string, unknown>>, ammessi?: string[]): Parametri => {
  const params: Parametri = {};
  Object.entries(filtri).forEach(([k, v]) => {
    if (ammessi && !ammessi.includes(k)) return;
    if (v === undefined || v === null || v === '') return;
    params[k] = Array.isArray(v) ? v.join(',') : String(v);
  });
  return params;
};

export const MAX_ALLEGATO_TASK_BYTES = 20 * 1024 * 1024;

const enc = encodeURIComponent;

class TaskService {
  getConfig = () => api.get<TaskConfig>('/task/config');

  getTask = (filtri: TaskFiltri = {}) => api.get<TaskRiga[]>('/task/elenco', parametri(filtri as Record<string, unknown>));

  /** Archivio di completati e annullati senza limiti di tempo, a pagine; accetta gli stessi filtri dell'elenco. */
  getChiusi = (filtri: TaskFiltri, pagina: number, dimensione = 20) =>
    api.get<TaskPaginaChiusi>('/task/chiusi', {
      ...parametri(filtri as Record<string, unknown>, ['vista', 'listaId', 'cartellaId', 'stati', 'assegnatoA', 'priorita', 'etichettaId', 'pazienteId', 'q']),
      pagina,
      dimensione,
    });

  getRiepilogo = () => api.get<TaskRiepilogo>('/task/riepilogo');

  getDettaglio = (id: number) => api.get<TaskDettaglio>(`/task/${id}`);

  crea = (req: CreaTaskRequest) => api.post<TaskRiga>('/task/crea', req);

  aggiorna = (id: number, valori: AggiornaTaskValori) => api.patch<TaskDettaglio>(`/task/${id}`, toAggiornaRequest(valori));

  bulk = (ids: number[], valori: AggiornaTaskValori | null, elimina = false) =>
    api.post<{ aggiornati: number; saltati: number }>('/task/bulk', { ids, modifica: valori ? toAggiornaRequest(valori) : null, elimina });

  /** Dipendenze fra i task indicati. */
  dipendenze = async (ids: number[]) => (ids.length ? api.post<TaskDipendenza[]>('/task/dipendenze', { ids }) : []);

  /** Il task `id` aspetta `predecessoreId`. */
  aggiungiDipendenza = (id: number, predecessoreId: number) => api.post<TaskDettaglio>(`/task/${id}/dipendenze`, { predecessoreId });

  rimuoviDipendenza = (id: number, predecessoreId: number) => api.delete<TaskDettaglio>(`/task/${id}/dipendenze/${predecessoreId}`);

  /** Nuove date di più task insieme, tutto o niente (Gantt). */
  pianifica = (voci: TaskPianificaVoce[]) => api.post<TaskRiga[]>('/task/pianifica', { voci });

  elimina = async (id: number) => {
    await api.delete<string>(`/task/${id}`);
  };

  /** Con `allegati` > 0 il testo può essere vuoto: i file arrivano subito dopo con `caricaAllegato`. */
  commenta = (id: number, testo: string, allegati = 0) => api.post<TaskDettaglio>(`/task/${id}/commenti`, { testo, allegati });

  modificaCommento = (id: number, commentoId: number, testo: string) => api.put<TaskDettaglio>(`/task/${id}/commenti/${commentoId}`, { testo });

  eliminaCommento = (id: number, commentoId: number) => api.delete<TaskDettaglio>(`/task/${id}/commenti/${commentoId}`);

  /** Un file per richiesta. Con `commentoId` l'allegato compare sotto quel commento. */
  caricaAllegato = async (id: number, file: File, commentoId?: number) => {
    if (file.size > MAX_ALLEGATO_TASK_BYTES) throw new ApiError('File troppo grande (max 20 MB)', 413);
    if (file.size === 0) throw new ApiError('Il file è vuoto', 400);
    const formData = new FormData();
    formData.append('file', file, file.name);
    if (commentoId) formData.append('commentoId', String(commentoId));
    return api.post<TaskAllegato>(`/task/${id}/allegati`, formData);
  };

  /** Scarica il file come Blob (per anteprime immagini/PDF o download). */
  scaricaAllegato = (id: number, allegatoId: number) => api.blob(`/task/${id}/allegati/${allegatoId}/file`);

  eliminaAllegato = (id: number, allegatoId: number) => api.delete<TaskDettaglio>(`/task/${id}/allegati/${allegatoId}`);

  aggiungiChecklist = (id: number, testo: string) => api.post<TaskDettaglio>(`/task/${id}/checklist`, { testo });

  aggiornaChecklist = (id: number, voceId: number, valori: { testo?: string; completato?: boolean; ordine?: number }) =>
    api.patch<TaskDettaglio>(`/task/${id}/checklist/${voceId}`, valori);

  eliminaChecklist = (id: number, voceId: number) => api.delete<TaskDettaglio>(`/task/${id}/checklist/${voceId}`);

  creaLista = (req: ListaRequest) => api.post<TaskLista>('/task/liste', req);

  aggiornaLista = (id: number, req: ListaRequest) => api.put<TaskLista>(`/task/liste/${id}`, req);

  /**
   * Elimina la lista con TUTTI i suoi task. Irreversibile; le liste di sistema non si eliminano.
   * Se la lista contiene task, `confermaNome` deve essere il suo nome (il backend rifiuta altrimenti).
   */
  eliminaLista = (id: number, confermaNome?: string) =>
    api.delete<{ id: number; nome: string; taskEliminati: number }>(`/task/liste/${id}${confermaNome ? `?conferma=${enc(confermaNome)}` : ''}`);

  /** Sposta una lista in una cartella (null = radice); ordine facoltativo per riordinare. */
  spostaLista = (id: number, destinazioneId: number | null, ordine?: number) => api.post<TaskLista>(`/task/liste/${id}/sposta`, { destinazioneId, ordine });

  creaCartella = (req: CartellaRequest) => api.post<TaskCartella>('/task/cartelle', req);

  aggiornaCartella = (id: number, req: CartellaRequest) => api.put<TaskCartella>(`/task/cartelle/${id}`, req);

  /** Sposta una cartella dentro un'altra (null = radice); non si può mettere dentro sé stessa. */
  spostaCartella = (id: number, destinazioneId: number | null, ordine?: number) =>
    api.post<TaskCartella>(`/task/cartelle/${id}/sposta`, { destinazioneId, ordine });

  /** Solo cartelle vuote. */
  eliminaCartella = async (id: number) => {
    await api.delete<string>(`/task/cartelle/${id}`);
  };

  getColonne = () => api.get<TaskDisposizioneColonne[]>('/task/colonne');

  salvaColonne = (contesto: string, colonne: TaskColonnaScelta[]) => api.put<TaskDisposizioneColonne>(`/task/colonne/${enc(contesto)}`, { colonne });

  ripristinaColonne = async (contesto: string) => {
    await api.delete<string>(`/task/colonne/${enc(contesto)}`);
  };

  creaEtichetta = (nome: string, colore: string) => api.post<TaskEtichetta>('/task/etichette', { nome, colore });

  eliminaEtichetta = async (id: number) => {
    await api.delete<string>(`/task/etichette/${id}`);
  };
}

export const taskService = new TaskService();
