import { api, ApiError } from "@/services/api-client"

/**
 * Google Calendar del dottore (/api/agenda), in diretta: niente copia nel gestionale, ogni lettura e scrittura
 * va a Google. Id di calendari ed eventi sono quelli di Google ("primary" per il suo). Orari ISO con offset;
 * gli eventi di tutto il giorno hanno solo la data e la fine esclusa, come in Google.
 */

export type AgendaAccesso = 'owner' | 'writer' | 'reader' | 'freeBusyReader'
export type AgendaRisposta = 'needsAction' | 'declined' | 'tentative' | 'accepted'
export type AgendaAmbito = 'QUESTO' | 'SEGUENTI' | 'TUTTI'
export type AgendaTipoEvento = 'default' | 'outOfOffice' | 'focusTime' | 'workingLocation' | 'birthday' | 'fromGmail'

export interface AgendaPromemoria {
  metodo: 'popup' | 'email'
  minuti: number
}

export interface AgendaCalendario {
  id: string
  nome: string
  descrizione: string | null
  coloreSfondo: string | null
  coloreTesto: string | null
  accesso: AgendaAccesso
  principale: boolean
  selezionato: boolean
  fusoOrario: string | null
  promemoriaPredefiniti: AgendaPromemoria[]
}

export interface AgendaColore {
  sfondo: string
  testo: string
}

export interface AgendaStato {
  email: string
  nome: string
  fusoOrario: string
  calendari: AgendaCalendario[]
  coloriEventi: Record<string, AgendaColore>
  demo: boolean
}

export interface AgendaPersona {
  email: string
  nome: string | null
  risposta: AgendaRisposta | null
  organizzatore: boolean
  io: boolean
  facoltativo: boolean
  risorsa: boolean
  commento: string | null
  pazienteId: number | null
}

export interface AgendaAllegato {
  titolo: string | null
  url: string
  icona: string | null
  mimeType: string | null
}

export interface AgendaEvento {
  id: string
  calendarioId: string
  titolo: string | null
  descrizione: string | null
  luogo: string | null
  inizio: string
  fine: string
  tuttoIlGiorno: boolean
  colorId: string | null
  stato: 'confirmed' | 'tentative' | 'cancelled'
  trasparenza: 'opaque' | 'transparent'
  visibilita: 'default' | 'public' | 'private' | 'confidential'
  tipo: AgendaTipoEvento
  serieId: string | null
  ricorrenza: string[] | null
  organizzatore: AgendaPersona | null
  partecipanti: AgendaPersona[]
  miaRisposta: AgendaRisposta | null
  meet: string | null
  htmlLink: string | null
  promemoriaPredefiniti: boolean
  promemoria: AgendaPromemoria[]
  allegati: AgendaAllegato[]
  modificabile: boolean
  ospitiPossonoModificare: boolean
  ospitiPossonoInvitare: boolean
  ospitiVedonoAltri: boolean
  aggiornato: number | null
  visitaId: number | null
  pazienteId: number | null
  pazienteNome: string | null
}

export interface AgendaEventi {
  eventi: AgendaEvento[]
  calendariNonLetti: string[]
}

export interface AgendaNovita {
  cambiato: boolean
  controllatoIl: number
  calendariCambiati: string[]
}

export interface AgendaEventoRequest {
  titolo?: string
  descrizione?: string
  luogo?: string
  inizio?: string
  fine?: string
  tuttoIlGiorno?: boolean
  fusoOrario?: string
  colorId?: string
  partecipanti?: { email: string; facoltativo?: boolean }[]
  conMeet?: boolean
  promemoriaPredefiniti?: boolean
  promemoria?: AgendaPromemoria[]
  ricorrenza?: string[]
  trasparenza?: 'opaque' | 'transparent'
  visibilita?: AgendaEvento['visibilita']
  tipo?: AgendaTipoEvento
  ospitiPossonoModificare?: boolean
  ospitiPossonoInvitare?: boolean
  ospitiVedonoAltri?: boolean
}

export interface AgendaContatto {
  email: string
  nome: string
  ruolo: string | null
  pazienteId: number | null
}

export interface AgendaDisponibilita {
  email: string
  occupato: { inizio: string; fine: string }[]
  errore: string | null
}

/** Il backend risponde 409 quando Google non è collegato o la delega non è autorizzata: la pagina mostra la guida. */
export function agendaNonConfigurata(errore: unknown): boolean {
  return errore instanceof ApiError && errore.status === 409
}

export function messaggioErroreAgenda(errore: unknown, ripiego = "Qualcosa è andato storto"): string {
  return errore instanceof Error && errore.message ? errore.message : ripiego
}

const evento = (calendarioId: string, eventoId?: string) =>
  `/agenda/calendari/${encodeURIComponent(calendarioId)}/eventi${eventoId ? `/${encodeURIComponent(eventoId)}` : ""}`

const conCalendari = (calendari: string[], parametri: Record<string, string | number>) => {
  const q = new URLSearchParams(Object.entries(parametri).map(([k, v]) => [k, String(v)]))
  calendari.forEach((c) => q.append("calendario", c))
  return `?${q.toString()}`
}

export const agendaService = {
  stato: () => api.get<AgendaStato>("/agenda/stato"),
  eventi: (calendari: string[], da: string, a: string) => api.get<AgendaEventi>(`/agenda/eventi${conCalendari(calendari, { da, a })}`),
  novita: (calendari: string[], dal: number) => api.get<AgendaNovita>(`/agenda/novita${conCalendari(calendari, { dal })}`),
  cerca: (q: string, calendari: string[]) => api.get<AgendaEvento[]>(`/agenda/cerca${conCalendari(calendari, { q })}`),
  evento: (calendarioId: string, eventoId: string) => api.get<AgendaEvento>(evento(calendarioId, eventoId)),
  crea: (calendarioId: string, req: AgendaEventoRequest, notifica = true) =>
    api.post<AgendaEvento>(`${evento(calendarioId)}?notifica=${notifica}`, req),
  modifica: (calendarioId: string, eventoId: string, req: AgendaEventoRequest, ambito: AgendaAmbito = "QUESTO", notifica = true) =>
    api.patch<AgendaEvento>(`${evento(calendarioId, eventoId)}?ambito=${ambito}&notifica=${notifica}`, req),
  elimina: (calendarioId: string, eventoId: string, ambito: AgendaAmbito = "QUESTO", notifica = true) =>
    api.delete<void>(`${evento(calendarioId, eventoId)}?ambito=${ambito}&notifica=${notifica}`),
  sposta: (calendarioId: string, eventoId: string, destinazione: string, notifica = false) =>
    api.post<AgendaEvento>(`${evento(calendarioId, eventoId)}/sposta?notifica=${notifica}`, { calendarioDestinazione: destinazione }),
  rispondi: (calendarioId: string, eventoId: string, risposta: Exclude<AgendaRisposta, "needsAction">, ambito: AgendaAmbito = "QUESTO", commento?: string) =>
    api.post<AgendaEvento>(`${evento(calendarioId, eventoId)}/risposta?ambito=${ambito}`, { risposta, commento }),
  contatti: () => api.get<AgendaContatto[]>("/agenda/contatti"),
  disponibilita: (email: string[], da: string, a: string) => api.post<AgendaDisponibilita[]>("/agenda/disponibilita", { email, da, a }),
}

/** "2026-10-25T09:30:00+01:00" nel fuso del browser. */
export function isoConOffset(d: Date): string {
  const pad = (n: number) => String(Math.abs(n)).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const segno = off >= 0 ? '+' : '-';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${segno}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`;
}

/** "2026-10-25" nel fuso del browser. */
export function isoData(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
