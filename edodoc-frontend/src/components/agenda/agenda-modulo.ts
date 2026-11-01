import {
  isoConOffset, isoData, type AgendaEvento, type AgendaEventoRequest, type AgendaPromemoria, type AgendaRisposta, type AgendaTipoEvento,
} from '@/services/agenda-service'
import { aggiungiGiorni, daGoogle, oraPadded } from './agenda-utils'
import type { Bozza } from './agenda-tempo'

/** Lo stato dell'editor di un evento e la sua traduzione nella richiesta per Google. */

export interface Invitato {
  email: string
  nome: string | null
  facoltativo: boolean
  pazienteId: number | null
  /** Risposta già data (solo per chi era invitato prima della modifica). */
  risposta?: AgendaRisposta | null
  commento?: string | null
}

export interface Modulo {
  titolo: string
  tipo: AgendaTipoEvento
  tuttoIlGiorno: boolean
  dataInizio: string
  oraInizio: string
  dataFine: string
  oraFine: string
  ricorrenza: string[]
  calendarioId: string
  colorId: string
  luogo: string
  conMeet: boolean
  invitati: Invitato[]
  promemoriaPredefiniti: boolean
  promemoria: AgendaPromemoria[]
  trasparenza: 'opaque' | 'transparent'
  visibilita: AgendaEvento['visibilita']
  descrizione: string
  ospitiPossonoModificare: boolean
  ospitiPossonoInvitare: boolean
  ospitiVedonoAltri: boolean
}

const testoDaHtml = (html: string | null | undefined) => {
  if (!html) return ''
  if (!html.includes('<')) return html
  const d = document.createElement('div')
  d.innerHTML = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n')
  return (d.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
}

export function moduloDaBozza(b: Bozza, calendarioId: string, extra?: Partial<Modulo>): Modulo {
  const fine = b.tuttoIlGiorno ? aggiungiGiorni(b.end, -1) : b.end
  return {
    titolo: '',
    tipo: 'default',
    tuttoIlGiorno: b.tuttoIlGiorno,
    dataInizio: isoData(b.start),
    oraInizio: oraPadded(b.start),
    dataFine: isoData(fine),
    oraFine: oraPadded(b.end),
    ricorrenza: [],
    calendarioId,
    colorId: '',
    luogo: '',
    conMeet: false,
    invitati: [],
    promemoriaPredefiniti: true,
    promemoria: [],
    trasparenza: b.tuttoIlGiorno ? 'transparent' : 'opaque',
    visibilita: 'default',
    descrizione: '',
    ospitiPossonoModificare: false,
    ospitiPossonoInvitare: true,
    ospitiVedonoAltri: true,
    ...extra,
  }
}

export function moduloDaEvento(e: AgendaEvento): Modulo {
  const start = daGoogle(e.inizio)
  const end = daGoogle(e.fine)
  const fineVisibile = e.tuttoIlGiorno ? aggiungiGiorni(end, -1) : end
  return {
    titolo: e.titolo ?? '',
    tipo: e.tipo,
    tuttoIlGiorno: e.tuttoIlGiorno,
    dataInizio: isoData(start),
    oraInizio: oraPadded(start),
    dataFine: isoData(fineVisibile),
    oraFine: oraPadded(end),
    ricorrenza: e.ricorrenza ?? [],
    calendarioId: e.calendarioId,
    colorId: e.colorId ?? '',
    luogo: e.luogo ?? '',
    conMeet: !!e.meet,
    invitati: e.partecipanti.filter((p) => !p.risorsa && !p.io).map((p) => ({ email: p.email, nome: p.nome, facoltativo: p.facoltativo, pazienteId: p.pazienteId, risposta: p.risposta, commento: p.commento })),
    promemoriaPredefiniti: e.promemoriaPredefiniti,
    promemoria: e.promemoria,
    trasparenza: e.trasparenza,
    visibilita: e.visibilita,
    descrizione: testoDaHtml(e.descrizione),
    ospitiPossonoModificare: e.ospitiPossonoModificare,
    ospitiPossonoInvitare: e.ospitiPossonoInvitare,
    ospitiVedonoAltri: e.ospitiVedonoAltri,
  }
}

/**
 * La modifica riguarda anche gli invitati (titolo, orari, luogo, persone, Meet, descrizione, ripetizione)?
 * Colore, promemoria, disponibilità e visibilità sono solo di chi organizza: per quelli non serve un'email.
 */
export function modificaDaAvvisare(m: Modulo, prima: Modulo | null): boolean {
  if (!prima) return true
  const campi: (keyof Modulo)[] = ['titolo', 'tuttoIlGiorno', 'dataInizio', 'oraInizio', 'dataFine', 'oraFine', 'luogo', 'conMeet', 'descrizione', 'ricorrenza']
  if (campi.some((k) => JSON.stringify(m[k]) !== JSON.stringify(prima[k]))) return true
  const chiavi = (l: Invitato[]) => l.map((i) => `${i.email}|${i.facoltativo}`).sort().join(',')
  return chiavi(m.invitati) !== chiavi(prima.invitati)
}

export function estremiModulo(m: Modulo): { start: Date; end: Date } {
  if (m.tuttoIlGiorno) {
    const s = daGoogle(m.dataInizio)
    return { start: s, end: aggiungiGiorni(daGoogle(m.dataFine), 1) }
  }
  const [hi, mi] = m.oraInizio.split(':').map(Number)
  const [hf, mf] = m.oraFine.split(':').map(Number)
  const s = daGoogle(m.dataInizio)
  const f = daGoogle(m.dataFine)
  return { start: new Date(s.getFullYear(), s.getMonth(), s.getDate(), hi, mi), end: new Date(f.getFullYear(), f.getMonth(), f.getDate(), hf, mf) }
}

/**
 * Richiesta per Google: tutti i campi alla creazione, solo quelli cambiati in modifica (la descrizione HTML di
 * Google non viene riscritta se non la si tocca).
 */
export function richiesta(m: Modulo, prima: Modulo | null, io: string): AgendaEventoRequest {
  const { start, end } = estremiModulo(m)
  const tempi = m.tuttoIlGiorno
    ? { inizio: isoData(start), fine: isoData(end), tuttoIlGiorno: true }
    : { inizio: isoConOffset(start), fine: isoConOffset(end), tuttoIlGiorno: false }
  const tutto: AgendaEventoRequest = {
    titolo: m.titolo.trim(),
    ...tempi,
    fusoOrario: Intl.DateTimeFormat().resolvedOptions().timeZone,
    colorId: m.colorId,
    luogo: m.luogo,
    conMeet: m.conMeet,
    partecipanti: m.invitati.length ? [{ email: io }, ...m.invitati.map((i) => ({ email: i.email, facoltativo: i.facoltativo }))] : [],
    promemoriaPredefiniti: m.promemoriaPredefiniti,
    promemoria: m.promemoria,
    ricorrenza: m.ricorrenza,
    trasparenza: m.trasparenza,
    visibilita: m.visibilita,
    descrizione: m.descrizione,
    tipo: m.tipo,
    ospitiPossonoModificare: m.ospitiPossonoModificare,
    ospitiPossonoInvitare: m.ospitiPossonoInvitare,
    ospitiVedonoAltri: m.ospitiVedonoAltri,
  }
  if (!prima) return tutto
  const out: AgendaEventoRequest = {}
  const diverso = <K extends keyof Modulo>(...k: K[]) => k.some((x) => JSON.stringify(m[x]) !== JSON.stringify(prima[x]))
  if (diverso('titolo')) out.titolo = tutto.titolo
  if (diverso('tuttoIlGiorno', 'dataInizio', 'oraInizio', 'dataFine', 'oraFine')) Object.assign(out, tempi, { fusoOrario: tutto.fusoOrario })
  if (diverso('colorId')) out.colorId = m.colorId
  if (diverso('luogo')) out.luogo = m.luogo
  if (diverso('conMeet')) out.conMeet = m.conMeet
  if (diverso('invitati')) out.partecipanti = tutto.partecipanti
  if (diverso('promemoriaPredefiniti', 'promemoria')) Object.assign(out, { promemoriaPredefiniti: m.promemoriaPredefiniti, promemoria: m.promemoria })
  if (diverso('ricorrenza')) out.ricorrenza = m.ricorrenza
  if (diverso('trasparenza')) out.trasparenza = m.trasparenza
  if (diverso('visibilita')) out.visibilita = m.visibilita
  if (diverso('descrizione')) out.descrizione = m.descrizione
  if (diverso('ospitiPossonoModificare')) out.ospitiPossonoModificare = m.ospitiPossonoModificare
  if (diverso('ospitiPossonoInvitare')) out.ospitiPossonoInvitare = m.ospitiPossonoInvitare
  if (diverso('ospitiVedonoAltri')) out.ospitiVedonoAltri = m.ospitiVedonoAltri
  return out
}

