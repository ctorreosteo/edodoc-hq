import { sessione, urlApi } from './api-client';

/*
  Planner social (/planner): piano editoriale e pubblicazione su tutti i canali, diviso in spazi
  («EdoDoc», …). Portato da Mobilitas HQ: stessi path API (/api/planner/**, /api/pubblico/planner/**). Le date in uscita sono ISO con offset; quelle che si mandano sono ora
  locale di Roma "yyyy-MM-ddTHH:mm". Gli url dei media sono relativi all'API (pubblici per token).
*/

export type PlannerCanale =
  | 'FACEBOOK'
  | 'INSTAGRAM'
  | 'YOUTUBE'
  | 'GOOGLE_BUSINESS'
  | 'TIKTOK'
  | 'LINKEDIN'
  | 'X'
  | 'THREADS'
  | 'PINTEREST';

export type PlannerFormato =
  | 'POST'
  | 'CAROSELLO'
  | 'REEL'
  | 'STORIA'
  | 'VIDEO'
  | 'SHORT'
  | 'AGGIORNAMENTO'
  | 'EVENTO'
  | 'OFFERTA';

export type PlannerStatoPost =
  | 'IDEA'
  | 'BOZZA'
  | 'IN_APPROVAZIONE'
  | 'PROGRAMMATO'
  | 'IN_PUBBLICAZIONE'
  | 'DA_COMPLETARE'
  | 'PUBBLICATO'
  | 'PARZIALE'
  | 'ERRORE';

export type PlannerStatoCanale = 'IN_ATTESA' | 'IN_PUBBLICAZIONE' | 'DA_PUBBLICARE' | 'PUBBLICATO' | 'ERRORE';
export type PlannerModalita = 'AUTOMATICA' | 'MANUALE';
export type PlannerAzione = 'IDEA' | 'BOZZA' | 'APPROVAZIONE' | 'PROGRAMMA' | 'PUBBLICA_ORA';

export type PlannerDestinazione = {
  canale: PlannerCanale;
  /** page id, id studio, open_id TikTok, "m<id>" profilo manuale, null canale generico a mano */
  account: string | null;
  nome: string;
  dettaglio: string | null;
  immagine: string | null;
  urlProfilo: string | null;
  automatica: boolean;
  motivo: string | null;
  formati: PlannerFormato[];
};

export type PlannerTipoAccount = 'INTEGRATO' | 'OAUTH' | 'MANUALE';

export type PlannerAccountSpazio = {
  id: number;
  canale: PlannerCanale;
  tipo: PlannerTipoAccount;
  account: string | null;
  nome: string;
  dettaglio: string | null;
  immagine: string | null;
  urlProfilo: string | null;
  collegato: boolean;
  scadenza: string | null;
};

export type PlannerSpazio = {
  id: number;
  nome: string;
  colore: string;
  descrizione: string | null;
  predefinito: boolean;
  posizione: number;
  account: PlannerAccountSpazio[];
};

export type PlannerAccountIntegrato = {
  canale: PlannerCanale;
  account: string | null;
  nome: string;
  dettaglio: string | null;
  immagine: string | null;
  brandId: number | null;
  assegnato: boolean;
};

export type PlannerEtichetta = {
  id: number;
  nome: string;
  colore: string;
  descrizione: string | null;
  obiettivoSettimanale: number | null;
  posizione: number;
};

export type PlannerPersona = { id: number; nome: string };

export type PlannerContatori = {
  idee: number;
  bozze: number;
  inApprovazione: number;
  programmatiSettimana: number;
  daPubblicare: number;
  errori: number;
  pubblicatiMese: number;
};

export type PlannerStato = {
  brandId: number;
  spazi: PlannerSpazio[];
  tiktokConfigurato: boolean;
  aiDisponibile: boolean;
  approvazioneObbligatoria: boolean;
  puoApprovare: boolean;
  puoImpostare: boolean;
  destinazioni: PlannerDestinazione[];
  etichette: PlannerEtichetta[];
  persone: PlannerPersona[];
  contatori: PlannerContatori;
  prossimoProgrammato: string | null;
};

export type PlannerMedia = {
  id: number;
  url: string;
  anteprimaUrl: string | null;
  nomeFile: string | null;
  mimeType: string;
  tipo: 'IMMAGINE' | 'VIDEO';
  larghezza: number | null;
  altezza: number | null;
  durataSecondi: number | null;
  byteDimensione: number;
  tag: string | null;
  usi: number;
  creatoDaNome: string | null;
  creatoIl: string;
};

export type PlannerMetriche = {
  visualizzazioni: number | null;
  copertura: number | null;
  miPiace: number | null;
  commenti: number | null;
  condivisioni: number | null;
  salvataggi: number | null;
  aggiornateIl: string | null;
};

/** Opzioni libere per canale (privacy e tag YouTube, pulsante Google, privacy TikTok, collaboratori Instagram…). */
export type PlannerOpzioni = Record<string, string | boolean | number | null | undefined>;

export type PlannerPostCanale = {
  id: number;
  canale: PlannerCanale;
  account: string | null;
  accountNome: string | null;
  formato: PlannerFormato;
  modalita: PlannerModalita;
  testo: string | null;
  titolo: string | null;
  opzioni: PlannerOpzioni | null;
  stato: PlannerStatoCanale;
  idEsterno: string | null;
  linkEsterno: string | null;
  errore: string | null;
  pubblicatoIl: string | null;
  pubblicatoDaNome: string | null;
  metriche: PlannerMetriche | null;
};

export type PlannerPost = {
  id: number;
  titolo: string | null;
  testo: string | null;
  primoCommento: string | null;
  link: string | null;
  utm: boolean;
  stato: PlannerStatoPost;
  programmatoAlle: string | null;
  pubblicatoIl: string | null;
  etichettaId: number | null;
  note: string | null;
  responsabileId: number | null;
  responsabileNome: string | null;
  creatoDaId: number | null;
  creatoDaNome: string | null;
  approvatoDaNome: string | null;
  approvatoIl: string | null;
  motivoRifiuto: string | null;
  posizione: number;
  commenti: number;
  creatoIl: string;
  aggiornatoIl: string;
  canali: PlannerPostCanale[];
  media: PlannerMedia[];
};

export type PlannerCommento = { id: number; utenteId: number | null; utenteNome: string | null; testo: string; creatoIl: string };
export type PlannerStorico = { id: number; evento: string; dettaglio: string | null; utenteNome: string | null; creatoIl: string };
export type PlannerPostDettaglio = { post: PlannerPost; commenti: PlannerCommento[]; storico: PlannerStorico[] };

export type PlannerVoceYoutube = { id: number; titolo: string; stato: string; formato: string; data: string };
export type PlannerCalendario = { dal: string; al: string; post: PlannerPost[]; youtube: PlannerVoceYoutube[] };

export type PlannerSlot = { id: number; giorno: number; ora: string };
export type PlannerHashtag = { id: number; nome: string; hashtag: string; usi: number };

export type PlannerTotali = {
  post: number;
  pubblicazioni: number;
  visualizzazioni: number;
  copertura: number;
  interazioni: number;
  interazioniMedie: number | null;
};

export type PlannerAnalisi = {
  dal: string;
  al: string;
  totali: PlannerTotali;
  precedente: PlannerTotali;
  canali: { canale: PlannerCanale; pubblicazioni: number; visualizzazioni: number; copertura: number; interazioni: number }[];
  etichette: { etichettaId: number | null; nome: string; colore: string; post: number; interazioni: number; obiettivoSettimanale: number | null }[];
  orari: { giorno: number; ora: number; post: number; interazioniMedie: number }[];
  settimane: { inizio: string; pubblicati: number; programmati: number }[];
  top: {
    postId: number;
    titolo: string | null;
    testo: string | null;
    anteprimaUrl: string | null;
    canale: PlannerCanale;
    linkEsterno: string | null;
    pubblicatoIl: string | null;
    interazioni: number;
    visualizzazioni: number | null;
  }[];
  metricheAggiornateIl: string | null;
};

export type PlannerTiktokCreatore = {
  nome: string;
  username: string | null;
  avatar: string | null;
  privacy: string[];
  durataMassimaSecondi: number | null;
  commentiDisattivati: boolean;
  duetDisattivati: boolean;
  stitchDisattivati: boolean;
};

export type PlannerCanaleRichiesta = {
  canale: PlannerCanale;
  account: string | null;
  formato: PlannerFormato;
  modalita: PlannerModalita;
  testo: string | null;
  titolo: string | null;
  opzioni: PlannerOpzioni | null;
};

export type PlannerPostRichiesta = {
  brandId: number;
  titolo: string | null;
  testo: string | null;
  primoCommento: string | null;
  link: string | null;
  etichettaId: number | null;
  note: string | null;
  responsabileId: number | null;
  programmatoAlle: string | null;
  azione: PlannerAzione;
  canali: PlannerCanaleRichiesta[];
  mediaIds: number[];
  utm?: boolean;
};

/** Contenuto di un modello: la richiesta di post senza spazio, ora e media. */
export type PlannerContenutoModello = Partial<Omit<PlannerPostRichiesta, 'brandId' | 'programmatoAlle' | 'azione' | 'mediaIds'>>;
export type PlannerModello = { id: number; brandId: number | null; nome: string; contenuto: PlannerContenutoModello; usi: number; creatoDaNome: string | null; creatoIl: string };

export type PlannerBioPulsante = { id: string; etichetta: string; url: string };
export type PlannerBio = {
  id: number | null;
  slug: string;
  titolo: string;
  descrizione: string | null;
  immagineUrl: string | null;
  colore: string;
  pulsanti: PlannerBioPulsante[];
  mostraPost: boolean;
  attiva: boolean;
  visite30: number;
  clic30: { chiave: string; etichetta: string; clic: number }[];
};
export type PlannerBioPubblica = {
  titolo: string;
  descrizione: string | null;
  immagineUrl: string | null;
  colore: string;
  pulsanti: { id: string; etichetta: string }[];
  post: { id: number; immagineUrl: string; titolo: string | null; canale: PlannerCanale | null }[];
};

export type PlannerPostConcorrente = { permalink: string | null; immagine: string | null; tipo: string; miPiace: number | null; commenti: number | null; data: string | null; testo: string | null };
export type PlannerProfiloConcorrente = {
  id: number | null;
  username: string;
  proprio: boolean;
  nome: string | null;
  immagine: string | null;
  biografia: string | null;
  follower: number | null;
  post: number | null;
  postSettimana: number | null;
  mediaMiPiace: number | null;
  mediaCommenti: number | null;
  tassoInterazione: number | null;
  ultimi: PlannerPostConcorrente[];
  errore: string | null;
};
export type PlannerConformita = {
  esito: 'OK' | 'ATTENZIONE' | 'RISCHIO';
  problemi: { frase: string; motivo: string; proposta: string }[];
  testoCorretto: string | null;
  modello: string | null;
};
export type PlannerReportAi = { sintesi: string; puntiForti: string[]; daMigliorare: string[]; prossimiPassi: string[]; modello: string | null };

export type PlannerConcorrenti = { profili: PlannerProfiloConcorrente[]; motivo: string | null; aggiornatoIl: string | null };

export type PlannerTono = 'CORDIALE' | 'PROFESSIONALE' | 'EMPATICO' | 'DIRETTO' | 'IRONICO';
export type PlannerTestiAi = { testi: Partial<Record<PlannerCanale, string>>; titoli: Partial<Record<PlannerCanale, string>>; hashtag: string[]; modello: string | null };

type ApiResponse<T> = { success: boolean; message?: string; data: T; error?: string };

const unwrap = <T>(response: ApiResponse<T>, fallback: string): T => {
  if (!response.success) throw new Error(response.error || response.message || fallback);
  return response.data;
};

const baseUrl = () => urlApi('');

/*
  Client HTTP del Planner: restituisce la busta { success, data } (come l'api-client di Mobilitas) e in più
  gestisce query, timeout e AbortSignal, che l'api-client di EdoDoc non espone. Token e base url sono quelli
  di services/api-client.ts.
*/
type Parametri = Record<string, string | number | boolean | null | undefined>;
type OpzioniRichiesta = { params?: Parametri; timeoutMs?: number; signal?: AbortSignal };

class PlannerHttpError extends Error {
  status: number;
  details?: string;
  constructor(message: string, status: number, details?: string) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function sessioneScaduta() {
  sessione.cancella();
  window.location.assign('/');
}

async function richiesta<T>(metodo: string, percorso: string, corpo?: unknown, opzioni: OpzioniRichiesta = {}): Promise<T> {
  const voci = Object.entries(opzioni.params ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== '');
  const query = voci.length ? `${percorso.includes('?') ? '&' : '?'}${new URLSearchParams(voci.map(([k, v]) => [k, String(v)]))}` : '';
  const token = sessione.token();
  const controller = new AbortController();
  const timer = opzioni.timeoutMs ? window.setTimeout(() => controller.abort(), opzioni.timeoutMs) : undefined;
  const annullaDaFuori = () => controller.abort();
  opzioni.signal?.addEventListener('abort', annullaDaFuori);
  let r: Response;
  try {
    r = await fetch(`${baseUrl()}${percorso}${query}`, {
      method: metodo,
      headers: {
        ...(corpo !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    if (opzioni.signal?.aborted) throw e;
    throw new PlannerHttpError(controller.signal.aborted ? 'Il server ci sta mettendo troppo: riprova.' : 'Impossibile connettersi al server', 0);
  } finally {
    if (timer) window.clearTimeout(timer);
    opzioni.signal?.removeEventListener('abort', annullaDaFuori);
  }
  if (r.status === 401 && token) {
    sessioneScaduta();
    throw new PlannerHttpError('Sessione scaduta', 401);
  }
  const json = await r.json().catch(() => null);
  if (!r.ok) {
    const motivo = (json?.error || json?.message) as string | undefined;
    throw new PlannerHttpError(motivo || 'Si è verificato un errore. Riprova.', r.status, motivo);
  }
  return json as T;
}

const apiClient = {
  get: <T>(percorso: string, opzioni?: OpzioniRichiesta) => richiesta<T>('GET', percorso, undefined, opzioni),
  post: <T>(percorso: string, corpo?: unknown, opzioni?: OpzioniRichiesta) => richiesta<T>('POST', percorso, corpo, opzioni),
  put: <T>(percorso: string, corpo?: unknown, opzioni?: OpzioniRichiesta) => richiesta<T>('PUT', percorso, corpo, opzioni),
  patch: <T>(percorso: string, corpo?: unknown, opzioni?: OpzioniRichiesta) => richiesta<T>('PATCH', percorso, corpo, opzioni),
  delete: <T>(percorso: string, opzioni?: OpzioniRichiesta) => richiesta<T>('DELETE', percorso, undefined, opzioni),
};

/** Indirizzo assoluto di un media (o della sua miniatura) per <img>/<video>: i media sono pubblici per token. */
export function urlMedia(percorso: string | null | undefined): string | undefined {
  if (!percorso) return undefined;
  return `${baseUrl()}${percorso}`;
}

/** Testo leggibile di un errore dell'api-client (il motivo del backend sta in details). */
export function messaggioErrorePlanner(err: unknown, fallback = 'Qualcosa è andato storto'): string {
  if (!err) return fallback;
  if (typeof err === 'string') return err;
  const e = err as { details?: unknown; message?: unknown };
  const testo = [e.details, e.message].find((v) => typeof v === 'string' && v.trim()) as string | undefined;
  return testo ?? fallback;
}

const LENTO = { timeoutMs: 45000 };
const AI = { timeoutMs: 120000 };

/** Link in bio pubblico: senza login, con fetch semplice (fuori dall'api-client che aggiunge il token). */
export async function bioPubblica(slug: string): Promise<PlannerBioPubblica | null> {
  const r = await fetch(`${baseUrl()}/pubblico/planner/bio/${encodeURIComponent(slug)}`)
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`Pagina non disponibile (${r.status})`)
  return (await r.json()) as PlannerBioPubblica
}

/** Dove porta un clic della pagina pubblica (il backend lo conta e reindirizza). */
export function urlClicBio(slug: string, chiave: string): string {
  return `${baseUrl()}/pubblico/planner/bio/${encodeURIComponent(slug)}/vai?k=${encodeURIComponent(chiave)}`
}

export const plannerService = {
  async stato(brandId: number | null): Promise<PlannerStato> {
    return unwrap(await apiClient.get<ApiResponse<PlannerStato>>('/planner/stato', { params: brandId ? { brandId } : undefined, ...LENTO }), 'Planner non disponibile');
  },

  async calendario(brandId: number, dal: string, al: string): Promise<PlannerCalendario> {
    return unwrap(await apiClient.get<ApiResponse<PlannerCalendario>>('/planner/calendario', { params: { brandId, dal, al } }), 'Calendario non disponibile');
  },

  async board(brandId: number): Promise<PlannerPost[]> {
    return unwrap(await apiClient.get<ApiResponse<PlannerPost[]>>('/planner/board', { params: { brandId } }), 'Idee non disponibili');
  },

  async dettaglio(id: number): Promise<PlannerPostDettaglio> {
    return unwrap(await apiClient.get<ApiResponse<PlannerPostDettaglio>>(`/planner/post/${id}`), 'Post non disponibile');
  },

  async salva(id: number | null, dati: PlannerPostRichiesta): Promise<PlannerPost> {
    const r = id
      ? await apiClient.put<ApiResponse<PlannerPost>>(`/planner/post/${id}`, dati, LENTO)
      : await apiClient.post<ApiResponse<PlannerPost>>('/planner/post', dati, LENTO);
    return unwrap(r, 'Post non salvato');
  },

  async sposta(id: number, programmatoAlle: string | null): Promise<PlannerPost> {
    return unwrap(await apiClient.patch<ApiResponse<PlannerPost>>(`/planner/post/${id}/sposta`, { programmatoAlle }), 'Post non spostato');
  },

  async ordina(ordine: { id: number; stato: PlannerStatoPost; posizione: number }[]): Promise<void> {
    unwrap(await apiClient.post<ApiResponse<null>>('/planner/post/ordine', ordine), 'Ordine non salvato');
  },

  async duplica(id: number): Promise<PlannerPost> {
    return unwrap(await apiClient.post<ApiResponse<PlannerPost>>(`/planner/post/${id}/duplica`), 'Post non duplicato');
  },

  async elimina(id: number): Promise<void> {
    unwrap(await apiClient.delete<ApiResponse<null>>(`/planner/post/${id}`), 'Post non eliminato');
  },

  async annulla(id: number): Promise<PlannerPost> {
    return unwrap(await apiClient.post<ApiResponse<PlannerPost>>(`/planner/post/${id}/annulla`), 'Programmazione non annullata');
  },

  async approva(id: number): Promise<PlannerPost> {
    return unwrap(await apiClient.post<ApiResponse<PlannerPost>>(`/planner/post/${id}/approva`), 'Post non approvato');
  },

  async rifiuta(id: number, motivo: string): Promise<PlannerPost> {
    return unwrap(await apiClient.post<ApiResponse<PlannerPost>>(`/planner/post/${id}/rifiuta`, { motivo }), 'Richiesta non inviata');
  },

  async riprova(id: number): Promise<PlannerPost> {
    return unwrap(await apiClient.post<ApiResponse<PlannerPost>>(`/planner/post/${id}/riprova`), 'Nuovo tentativo non avviato');
  },

  async segnaPubblicato(id: number, canaleId: number, link: string | null): Promise<PlannerPost> {
    return unwrap(await apiClient.post<ApiResponse<PlannerPost>>(`/planner/post/${id}/canali/${canaleId}/pubblicato`, { link }), 'Non segnato');
  },

  async commenta(id: number, testo: string): Promise<PlannerCommento> {
    return unwrap(await apiClient.post<ApiResponse<PlannerCommento>>(`/planner/post/${id}/commenti`, { testo }), 'Commento non aggiunto');
  },

  async eliminaCommento(id: number, commentoId: number): Promise<void> {
    unwrap(await apiClient.delete<ApiResponse<null>>(`/planner/post/${id}/commenti/${commentoId}`), 'Commento non eliminato');
  },

  // ── Media ──

  async media(tipo: 'TUTTI' | 'IMMAGINE' | 'VIDEO', cerca: string): Promise<PlannerMedia[]> {
    return unwrap(await apiClient.get<ApiResponse<PlannerMedia[]>>('/planner/media', { params: { tipo, cerca: cerca || undefined } }), 'Libreria non disponibile');
  },

  /** Multipart con avanzamento (XHR): i video arrivano a 100 MB. */
  caricaMedia(
    file: File,
    extra: { anteprima?: Blob | null; durata?: number | null; larghezza?: number | null; altezza?: number | null },
    onAvanzamento?: (frazione: number) => void,
  ): Promise<PlannerMedia> {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append('file', file, file.name);
      if (extra.anteprima) fd.append('anteprima', extra.anteprima, 'anteprima.jpg');
      const q = new URLSearchParams();
      if (extra.durata) q.set('durata', String(extra.durata));
      if (extra.larghezza) q.set('larghezza', String(extra.larghezza));
      if (extra.altezza) q.set('altezza', String(extra.altezza));
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${baseUrl()}/planner/media${q.toString() ? `?${q}` : ''}`);
      const token = sessione.token();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onAvanzamento) onAvanzamento(e.loaded / e.total);
      };
      xhr.onload = () => {
        if (xhr.status === 401 && token) {
          sessioneScaduta();
          return reject(new Error('Sessione scaduta'));
        }
        if (xhr.status === 413) return reject(new Error('File troppo grande: il massimo è 100 MB.'));
        try {
          const json = JSON.parse(xhr.responseText) as ApiResponse<PlannerMedia>;
          if (xhr.status >= 200 && xhr.status < 300 && json.success) resolve(json.data);
          else reject(new Error(json.error || json.message || `Caricamento non riuscito (${xhr.status})`));
        } catch {
          reject(new Error(`Caricamento non riuscito (${xhr.status})`));
        }
      };
      xhr.onerror = () => reject(new Error('Connessione interrotta durante il caricamento.'));
      xhr.send(fd);
    });
  },

  async tagMedia(id: number, tag: string): Promise<PlannerMedia> {
    return unwrap(await apiClient.put<ApiResponse<PlannerMedia>>(`/planner/media/${id}`, { tag }), 'Media non aggiornato');
  },

  async eliminaMedia(id: number): Promise<void> {
    unwrap(await apiClient.delete<ApiResponse<null>>(`/planner/media/${id}`), 'Media non eliminato');
  },

  // ── Impostazioni ──

  async salvaEtichetta(e: { id?: number; nome: string; colore: string; descrizione: string | null; obiettivoSettimanale: number | null }): Promise<PlannerEtichetta> {
    const r = e.id
      ? await apiClient.put<ApiResponse<PlannerEtichetta>>(`/planner/etichette/${e.id}`, e)
      : await apiClient.post<ApiResponse<PlannerEtichetta>>('/planner/etichette', e);
    return unwrap(r, 'Rubrica non salvata');
  },

  async eliminaEtichetta(id: number): Promise<void> {
    unwrap(await apiClient.delete<ApiResponse<null>>(`/planner/etichette/${id}`), 'Rubrica non eliminata');
  },

  async slot(): Promise<PlannerSlot[]> {
    return unwrap(await apiClient.get<ApiResponse<PlannerSlot[]>>('/planner/slot'), 'Orari non disponibili');
  },

  async salvaSlot(slot: { giorno: number; ora: string }[]): Promise<PlannerSlot[]> {
    return unwrap(await apiClient.put<ApiResponse<PlannerSlot[]>>('/planner/slot', slot), 'Orari non salvati');
  },

  async prossimoSlot(brandId: number, dal?: string): Promise<string> {
    return unwrap(
      await apiClient.get<ApiResponse<{ quando: string }>>('/planner/slot/prossimo', { params: { brandId, dal } }),
      'Nessun orario libero',
    ).quando;
  },

  async hashtag(): Promise<PlannerHashtag[]> {
    return unwrap(await apiClient.get<ApiResponse<PlannerHashtag[]>>('/planner/hashtag'), 'Hashtag non disponibili');
  },

  async salvaHashtag(h: { id?: number; nome: string; hashtag: string }): Promise<PlannerHashtag> {
    const r = h.id
      ? await apiClient.put<ApiResponse<PlannerHashtag>>(`/planner/hashtag/${h.id}`, h)
      : await apiClient.post<ApiResponse<PlannerHashtag>>('/planner/hashtag', h);
    return unwrap(r, 'Gruppo non salvato');
  },

  async eliminaHashtag(id: number): Promise<void> {
    unwrap(await apiClient.delete<ApiResponse<null>>(`/planner/hashtag/${id}`), 'Gruppo non eliminato');
  },

  async usaHashtag(id: number): Promise<void> {
    await apiClient.post<ApiResponse<null>>(`/planner/hashtag/${id}/uso`);
  },

  async salvaImpostazioni(approvazioneObbligatoria: boolean): Promise<void> {
    unwrap(await apiClient.put<ApiResponse<null>>('/planner/impostazioni', { approvazioneObbligatoria }), 'Impostazioni non salvate');
  },

  // ── Spazi e account ──

  async salvaSpazio(s: { id?: number; nome: string; colore: string; descrizione: string | null }): Promise<void> {
    unwrap(
      s.id ? await apiClient.put<ApiResponse<null>>(`/planner/spazi/${s.id}`, s) : await apiClient.post<ApiResponse<PlannerSpazio>>('/planner/spazi', s),
      'Spazio non salvato',
    );
  },

  async eliminaSpazio(id: number): Promise<void> {
    unwrap(await apiClient.delete<ApiResponse<null>>(`/planner/spazi/${id}`), 'Spazio non eliminato');
  },

  async integrati(): Promise<PlannerAccountIntegrato[]> {
    return unwrap(await apiClient.get<ApiResponse<PlannerAccountIntegrato[]>>('/planner/spazi/integrati', LENTO), 'Account non disponibili');
  },

  async assegna(canale: PlannerCanale, account: string | null, brandId: number): Promise<void> {
    unwrap(await apiClient.put<ApiResponse<null>>('/planner/spazi/assegna', { canale, account, brandId }), 'Account non spostato');
  },

  async aggiungiManuale(brandId: number, a: { canale: PlannerCanale; nome: string; dettaglio: string | null; urlProfilo: string | null }): Promise<void> {
    unwrap(await apiClient.post<ApiResponse<PlannerAccountSpazio>>(`/planner/spazi/${brandId}/account-manuali`, a), 'Profilo non aggiunto');
  },

  async eliminaAccount(id: number): Promise<void> {
    unwrap(await apiClient.delete<ApiResponse<null>>(`/planner/spazi/account/${id}`), 'Account non tolto');
  },

  async collegaTiktok(brandId: number): Promise<string> {
    return unwrap(await apiClient.get<ApiResponse<{ url: string }>>('/planner/tiktok/collega', { params: { brandId } }), 'Collegamento non disponibile').url;
  },

  async completaTiktok(code: string, state: string): Promise<PlannerAccountSpazio | null> {
    return unwrap(await apiClient.post<ApiResponse<PlannerAccountSpazio | null>>('/planner/tiktok/callback', { code, state }, LENTO), 'Collegamento non riuscito');
  },

  async creatoreTiktok(openId: string): Promise<PlannerTiktokCreatore> {
    return unwrap(await apiClient.get<ApiResponse<PlannerTiktokCreatore>>(`/planner/tiktok/${encodeURIComponent(openId)}/creatore`), 'Account TikTok non raggiungibile');
  },

  // ── Ricerca, modelli, link in bio, concorrenti ──

  async cerca(brandId: number, q: string, signal?: AbortSignal): Promise<PlannerPost[]> {
    return unwrap(await apiClient.get<ApiResponse<PlannerPost[]>>('/planner/cerca', { params: { brandId, q }, signal }), 'Ricerca non riuscita');
  },

  async modelli(brandId: number): Promise<PlannerModello[]> {
    return unwrap(await apiClient.get<ApiResponse<PlannerModello[]>>('/planner/modelli', { params: { brandId } }), 'Modelli non disponibili');
  },

  async salvaModello(dati: { brandId: number; nome: string; perTuttiGliSpazi: boolean; contenuto: PlannerContenutoModello }): Promise<PlannerModello> {
    return unwrap(await apiClient.post<ApiResponse<PlannerModello>>('/planner/modelli', dati), 'Modello non salvato');
  },

  async eliminaModello(id: number): Promise<void> {
    unwrap(await apiClient.delete<ApiResponse<null>>(`/planner/modelli/${id}`), 'Modello non eliminato');
  },

  async usaModello(id: number): Promise<void> {
    await apiClient.post<ApiResponse<null>>(`/planner/modelli/${id}/uso`);
  },

  async bio(brandId: number): Promise<PlannerBio> {
    return unwrap(await apiClient.get<ApiResponse<PlannerBio>>('/planner/bio', { params: { brandId } }), 'Link in bio non disponibile');
  },

  async salvaBio(brandId: number, b: Omit<PlannerBio, 'id' | 'visite30' | 'clic30'>): Promise<PlannerBio> {
    return unwrap(await apiClient.put<ApiResponse<PlannerBio>>(`/planner/bio?brandId=${brandId}`, b), 'Link in bio non salvato');
  },

  async concorrenti(brandId: number, aggiorna = false): Promise<PlannerConcorrenti> {
    return unwrap(
      await apiClient.get<ApiResponse<PlannerConcorrenti>>('/planner/concorrenti', { params: { brandId, aggiorna: aggiorna || undefined }, ...LENTO }),
      'Concorrenti non disponibili',
    );
  },

  async aggiungiConcorrente(brandId: number, username: string): Promise<void> {
    unwrap(await apiClient.post<ApiResponse<null>>(`/planner/concorrenti?brandId=${brandId}`, { username }), 'Concorrente non aggiunto');
  },

  async eliminaConcorrente(id: number): Promise<void> {
    unwrap(await apiClient.delete<ApiResponse<null>>(`/planner/concorrenti/${id}`), 'Concorrente non tolto');
  },

  // ── Analisi e AI ──

  async analisi(brandId: number, dal: string, al: string): Promise<PlannerAnalisi> {
    return unwrap(await apiClient.get<ApiResponse<PlannerAnalisi>>('/planner/analisi', { params: { brandId, dal, al }, ...LENTO }), 'Analisi non disponibile');
  },

  async testiAi(dati: { brandId: number; idea: string; testo: string; canali: PlannerCanale[]; tono: PlannerTono; hashtag: boolean; emoji: boolean }): Promise<PlannerTestiAi> {
    return unwrap(await apiClient.post<ApiResponse<PlannerTestiAi>>('/planner/ai/testi', dati, AI), 'Testi non generati');
  },

  async riscriviAi(dati: { testo: string; canale: PlannerCanale | null; istruzione: string }): Promise<string> {
    return unwrap(await apiClient.post<ApiResponse<{ testo: string }>>('/planner/ai/riscrivi', dati, AI), 'Testo non riscritto').testo;
  },

  async testiDaVideo(dati: { brandId: number; mediaId: number; canali: PlannerCanale[]; tono: PlannerTono; hashtag: boolean; emoji: boolean }): Promise<{ trascrizione: string; testi: PlannerTestiAi }> {
    return unwrap(
      await apiClient.post<ApiResponse<{ trascrizione: string; testi: PlannerTestiAi }>>('/planner/ai/testi-video', dati, { timeoutMs: 300000 }),
      'Testi non generati dal video',
    );
  },

  async conformita(testo: string, canale: PlannerCanale | null): Promise<PlannerConformita> {
    return unwrap(await apiClient.post<ApiResponse<PlannerConformita>>('/planner/ai/conformita', { testo, canale }, AI), 'Controllo non riuscito');
  },

  async reportAi(brandId: number, dal: string, al: string): Promise<PlannerReportAi> {
    return unwrap(await apiClient.get<ApiResponse<PlannerReportAi>>('/planner/ai/report', { params: { brandId, dal, al }, ...AI }), 'Commento non disponibile');
  },

  async ripeti(id: number, ogniGiorni: number, volte: number): Promise<PlannerPost[]> {
    return unwrap(await apiClient.post<ApiResponse<PlannerPost[]>>(`/planner/post/${id}/ripeti`, { ogniGiorni, volte }), 'Serie non creata');
  },

  async ideeAi(dati: { brandId: number; dal: string; al: string; quante: number; indicazioni: string; canali: PlannerCanale[]; giornate: string[] }): Promise<PlannerPost[]> {
    return unwrap(await apiClient.post<ApiResponse<{ idee: PlannerPost[] }>>('/planner/ai/idee', dati, AI), 'Idee non generate').idee;
  },
};
