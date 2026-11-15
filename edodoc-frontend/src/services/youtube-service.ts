import { api } from './api-client'

/*
  YouTube (/youtube): tipi e chiamate di /api/youtube (YoutubeController), portati da Mobilitas HQ.
  Ogni tipo è lo specchio di un record in edodoc-backend/src/main/java/it/edodoc/hq/dto/YoutubeDto.java: cambiarli insieme.
*/

export type YoutubeCanale = {
  id: string
  titolo: string
  descrizione: string
  handle: string | null
  avatar: string | null
  banner: string | null
  iscritti: number
  iscrittiNascosti: boolean
  visualizzazioni: number
  video: number
  creatoIl: string | null
  paese: string | null
}

export type YoutubeStato = {
  clientConfigurato: boolean
  collegato: boolean
  redirectUri: string
  canale: YoutubeCanale | null
  puoGestire: boolean
  puoCollegare: boolean
  obiettivoIscritti: number | null
  errore: string | null
}

export type YoutubeVideoLive = {
  id: string
  titolo: string
  miniatura: string | null
  pubblicatoIl: string | null
  visualizzazioni: number
  like: number
  commenti: number
}

export type YoutubePunto = { t: number; iscritti: number; visualizzazioni: number }

export type YoutubeLive = {
  rilevatoIl: number
  iscritti: number
  iscrittiNascosti: boolean
  visualizzazioni: number
  video: number
  iscrittiEsatti: number | null
  iscrittiEsattiAl: string | null
  ultimiVideo: YoutubeVideoLive[]
  storico: YoutubePunto[]
}

export type YoutubeTotali = {
  visualizzazioni: number
  minutiVisti: number
  durataMediaSec: number
  percentualeMedia: number
  iscrittiGuadagnati: number
  iscrittiPersi: number
  like: number
  dislike: number
  commenti: number
  condivisioni: number
  ricavi: number | null
}

export type YoutubeGiorno = {
  data: string
  visualizzazioni: number
  minutiVisti: number
  durataMediaSec: number
  iscrittiGuadagnati: number
  iscrittiPersi: number
  like: number
  commenti: number
  condivisioni: number
  ricavi: number | null
}

export type YoutubeVoce = { chiave: string; etichetta: string; valore: number; secondario: number | null }

export type YoutubePanoramica = {
  dal: string
  al: string
  corrente: YoutubeTotali
  precedente: YoutubeTotali
  serie: YoutubeGiorno[]
  ricaviDisponibili: boolean
  tipiContenuto: YoutubeVoce[]
}

export type YoutubeVideo = {
  id: string
  titolo: string
  miniatura: string | null
  pubblicatoIl: string | null
  durataSec: number
  breve: boolean
  privacy: 'public' | 'unlisted' | 'private' | string
  programmatoIl: string | null
  visualizzazioni: number
  like: number
  commenti: number
  periodoVisualizzazioni: number | null
  periodoMinutiVisti: number | null
  periodoDurataMediaSec: number | null
  periodoPercentualeMedia: number | null
  periodoIscritti: number | null
  periodoCondivisioni: number | null
}

export type YoutubePuntoRitenzione = { t: number; ritenzione: number; relativa: number | null }

export type YoutubeVideoDettaglio = {
  video: YoutubeVideo
  descrizione: string
  tag: string[]
  categoriaId: string | null
  totali: YoutubeTotali | null
  serie: YoutubeGiorno[]
  ritenzione: YoutubePuntoRitenzione[]
  fonti: YoutubeVoce[]
  ricerche: YoutubeVoce[]
  dispositivi: YoutubeVoce[]
  paesi: YoutubeVoce[]
}

export type YoutubeModificaVideo = {
  titolo: string
  descrizione: string
  tag: string[]
  privacy: string
}

export type YoutubeDemografia = { fascia: string; maschi: number; femmine: number; altro: number }

export type YoutubePubblico = {
  demografia: YoutubeDemografia[]
  paesi: YoutubeVoce[]
  dispositivi: YoutubeVoce[]
  sistemiOperativi: YoutubeVoce[]
  fonti: YoutubeVoce[]
  ricerche: YoutubeVoce[]
  sitiEsterni: YoutubeVoce[]
  luoghiRiproduzione: YoutubeVoce[]
  iscrizione: YoutubeVoce[]
  condivisioni: YoutubeVoce[]
}

export type YoutubeRisposta = {
  id: string
  autore: string
  autoreAvatar: string | null
  testo: string
  like: number
  pubblicatoIl: string | null
  delCanale: boolean
}

export type YoutubeCommento = {
  id: string
  commentoId: string
  videoId: string
  videoTitolo: string
  autore: string
  autoreAvatar: string | null
  autoreCanale: string | null
  testo: string
  like: number
  pubblicatoIl: string | null
  risposte: number
  rispostoDalCanale: boolean
  ultimeRisposte: YoutubeRisposta[]
  moderazione: string
}

export type YoutubePaginaCommenti = { commenti: YoutubeCommento[]; prossimaPagina: string | null }

export type YoutubeStatoIdea = 'IDEA' | 'SCRIPT' | 'RIPRESE' | 'MONTAGGIO' | 'PRONTO' | 'PUBBLICATO'
export type YoutubeFormato = 'VIDEO' | 'SHORT' | 'LIVE'
export type YoutubePriorita = 'BASSA' | 'MEDIA' | 'ALTA'

export type YoutubeIdea = {
  id: number
  titolo: string
  note: string | null
  stato: YoutubeStatoIdea
  formato: YoutubeFormato
  priorita: YoutubePriorita
  dataUscita: string | null
  videoId: string | null
  responsabileId: number | null
  responsabileNome: string | null
  posizione: number
  creataIl: string | null
  aggiornataIl: string | null
}

export type YoutubeIdeaInput = {
  titolo: string
  note?: string | null
  stato?: YoutubeStatoIdea
  formato?: YoutubeFormato
  priorita?: YoutubePriorita
  dataUscita?: string | null
  videoId?: string | null
  responsabileId?: number | null
}

export type YoutubePersona = { id: number; nome: string }

export type YoutubeAiPacchetto = {
  titoli: string[]
  descrizione: string
  tag: string[]
  hook: string[]
  testiMiniatura: string[]
  capitoli: string[]
  consiglio: string
}

export type YoutubeAiAnalisi = {
  voto: string
  sintesi: string
  puntiForza: string[]
  criticita: string[]
  azioni: Array<{ titolo: string; dettaglio: string; impatto: 'ALTO' | 'MEDIO' | 'BASSO' | string }>
  ideeVideo: string[]
}

const BASE = '/youtube'

type Periodo = { dal?: string; al?: string }
type Parametri = Record<string, string | number | boolean | undefined>

/**
 * L'api del gestionale non accetta un AbortSignal: la richiesta parte comunque, ma se nel frattempo la pagina
 * l'ha annullata la risposta viene scartata (chi chiama controlla signal.aborted, come in Mobilitas).
 */
async function conSegnale<T>(richiesta: Promise<T>, signal?: AbortSignal): Promise<T> {
  const r = await richiesta
  if (signal?.aborted) throw new DOMException('Richiesta annullata', 'AbortError')
  return r
}

function parametri(p: object): Parametri {
  const out: Parametri = {}
  for (const [k, v] of Object.entries(p)) if (v != null && v !== '') out[k] = v as string | number | boolean
  return out
}

export const youtubeService = {
  stato: (signal?: AbortSignal) => conSegnale(api.get<YoutubeStato>(`${BASE}/stato`), signal),
  urlConsenso: () => api.get<{ url: string; redirectUri: string }>(`${BASE}/oauth/url`),
  completaConsenso: (code: string, state: string) => api.post<YoutubeStato>(`${BASE}/oauth/callback`, { code, state }),
  scollega: () => api.delete<void>(`${BASE}/oauth`),
  salvaObiettivo: (iscritti: number | null) => api.put<void>(`${BASE}/obiettivo`, { iscritti }),
  live: (giorni: number, signal?: AbortSignal) => conSegnale(api.get<YoutubeLive>(`${BASE}/live`, { giorni }), signal),
  panoramica: (p: Periodo, signal?: AbortSignal) =>
    conSegnale(api.get<YoutubePanoramica>(`${BASE}/panoramica`, parametri(p)), signal),
  video: (p: Periodo, signal?: AbortSignal) => conSegnale(api.get<YoutubeVideo[]>(`${BASE}/video`, parametri(p)), signal),
  dettaglioVideo: (id: string, p: Periodo, signal?: AbortSignal) =>
    conSegnale(api.get<YoutubeVideoDettaglio>(`${BASE}/video/${encodeURIComponent(id)}`, parametri(p)), signal),
  modificaVideo: (id: string, body: YoutubeModificaVideo) =>
    api.put<YoutubeVideoDettaglio>(`${BASE}/video/${encodeURIComponent(id)}`, body),
  pubblico: (p: Periodo, signal?: AbortSignal) => conSegnale(api.get<YoutubePubblico>(`${BASE}/pubblico`, parametri(p)), signal),
  commenti: (
    filtri: { pagina?: string | null; ordine?: 'time' | 'relevance'; videoId?: string; cerca?: string; moderazione?: string },
    signal?: AbortSignal,
  ) => conSegnale(api.get<YoutubePaginaCommenti>(`${BASE}/commenti`, parametri(filtri)), signal),
  rispondi: (commentoId: string, testo: string) =>
    api.post<YoutubeRisposta>(`${BASE}/commenti/${encodeURIComponent(commentoId)}/risposta`, { testo }),
  modera: (commentoId: string, stato: 'published' | 'heldForReview' | 'rejected') =>
    api.post<void>(`${BASE}/commenti/${encodeURIComponent(commentoId)}/moderazione`, { stato }),
  idee: (signal?: AbortSignal) => conSegnale(api.get<YoutubeIdea[]>(`${BASE}/idee`), signal),
  responsabili: (signal?: AbortSignal) => conSegnale(api.get<YoutubePersona[]>(`${BASE}/idee/responsabili`), signal),
  creaIdea: (body: YoutubeIdeaInput) => api.post<YoutubeIdea>(`${BASE}/idee`, body),
  aggiornaIdea: (id: number, body: YoutubeIdeaInput) => api.put<YoutubeIdea>(`${BASE}/idee/${id}`, body),
  eliminaIdea: (id: number) => api.delete<void>(`${BASE}/idee/${id}`),
  riordinaIdee: (ordine: Array<{ id: number; stato: YoutubeStatoIdea; posizione: number }>) =>
    api.put<YoutubeIdea[]>(`${BASE}/idee/ordine`, ordine),
  aiPacchetto: (body: { argomento?: string; videoId?: string; formato?: YoutubeFormato; note?: string }) =>
    api.post<YoutubeAiPacchetto>(`${BASE}/ai/pacchetto`, body),
  aiAnalisi: (p: Periodo) => api.post<YoutubeAiAnalisi>(`${BASE}/ai/analisi`, p),
  aiRisposta: (body: { testo: string; videoTitolo?: string; istruzioni?: string }) =>
    api.post<{ testo: string }>(`${BASE}/ai/risposta`, body),
}
