import type { AgendaCalendario, AgendaEvento, AgendaStato } from '@/services/agenda-service'
import { isoConOffset, isoData } from '@/services/agenda-service'

export type Vista = 'giorno' | '3giorni' | 'settimana' | 'mese' | 'anno' | 'elenco'

export const VISTE: { id: Vista; nome: string; tasto: string }[] = [
  { id: 'giorno', nome: 'Giorno', tasto: 'D' },
  { id: '3giorni', nome: '3 giorni', tasto: 'X' },
  { id: 'settimana', nome: 'Settimana', tasto: 'W' },
  { id: 'mese', nome: 'Mese', tasto: 'M' },
  { id: 'anno', nome: 'Anno', tasto: 'Y' },
  { id: 'elenco', nome: 'Elenco', tasto: 'A' },
]

/** Evento pronto per la vista: date già calcolate nel fuso del browser e colore risolto. */
export interface EventoVista extends AgendaEvento {
  chiave: string
  start: Date
  end: Date
  colore: string
}

export const MINUTI_SCATTO = 15
export const MS_GIORNO = 86_400_000

/** Viste sul telefono: Anno resta solo da computer, Elenco viene prima. */
export const VISTE_MOBILE: { id: Vista; nome: string }[] = [
  { id: 'elenco', nome: 'Elenco' },
  { id: 'giorno', nome: 'Giorno' },
  { id: '3giorni', nome: '3 gg' },
  { id: 'settimana', nome: 'Sett.' },
  { id: 'mese', nome: 'Mese' },
]

// ───────────────────────── Date ─────────────────────────

export const inizioGiorno = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
export const aggiungiGiorni = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes())
export const aggiungiMinuti = (d: Date, n: number) => new Date(d.getTime() + n * 60_000)
export const stessoGiorno = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
export const minutiDelGiorno = (d: Date) => d.getHours() * 60 + d.getMinutes()

/** Lunedì della settimana. */
export function inizioSettimana(d: Date): Date {
  const g = inizioGiorno(d)
  const dow = (g.getDay() + 6) % 7
  return aggiungiGiorni(g, -dow)
}

export const inizioMese = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)

/** Giorni di calendario tra due date (ignora l'ora legale). */
export function giorniTra(a: Date, b: Date): number {
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / MS_GIORNO)
}

export function scatta(minuti: number, passo = MINUTI_SCATTO): number {
  return Math.round(minuti / passo) * passo
}

export function conMinuti(giorno: Date, minuti: number): Date {
  return new Date(giorno.getFullYear(), giorno.getMonth(), giorno.getDate(), 0, minuti)
}

/** Primo e ultimo giorno (escluso) mostrati dalla vista. */
export function finestra(vista: Vista, data: Date): { da: Date; a: Date; giorni: Date[] } {
  let da: Date
  let n: number
  switch (vista) {
    case 'giorno':
      da = inizioGiorno(data)
      n = 1
      break
    case '3giorni':
      da = inizioGiorno(data)
      n = 3
      break
    case 'settimana':
      da = inizioSettimana(data)
      n = 7
      break
    case 'mese': {
      da = inizioSettimana(inizioMese(data))
      const fineMese = new Date(data.getFullYear(), data.getMonth() + 1, 0)
      const ultimo = aggiungiGiorni(inizioSettimana(fineMese), 7)
      n = giorniTra(da, ultimo)
      break
    }
    case 'anno':
      da = new Date(data.getFullYear(), 0, 1)
      n = giorniTra(da, new Date(data.getFullYear() + 1, 0, 1))
      break
    case 'elenco':
      da = inizioGiorno(data)
      n = 42
      break
  }
  const giorni = Array.from({ length: n }, (_, i) => aggiungiGiorni(da, i))
  return { da, a: aggiungiGiorni(da, n), giorni }
}

export function sposta(vista: Vista, data: Date, verso: 1 | -1): Date {
  switch (vista) {
    case 'giorno':
      return aggiungiGiorni(data, verso)
    case '3giorni':
      return aggiungiGiorni(data, 3 * verso)
    case 'settimana':
      return aggiungiGiorni(data, 7 * verso)
    case 'mese':
      return new Date(data.getFullYear(), data.getMonth() + verso, 1)
    case 'anno':
      return new Date(data.getFullYear() + verso, 0, 1)
    case 'elenco':
      return aggiungiGiorni(data, 14 * verso)
  }
}

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
export const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']
export const GIORNI_BREVI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']
export const INIZIALI_LUN = ['L', 'M', 'M', 'G', 'V', 'S', 'D']

export const nomeMese = (m: number) => MESI[m]
export const nomeMeseBreve = (m: number) => MESI_BREVI[m]
export const maiuscola = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

export function titoloFinestra(vista: Vista, data: Date): string {
  const { da, a } = finestra(vista, data)
  const ultimo = aggiungiGiorni(a, -1)
  switch (vista) {
    case 'giorno':
      return `${maiuscola(GIORNI[data.getDay()])} ${data.getDate()} ${MESI[data.getMonth()]} ${data.getFullYear()}`
    case 'mese':
      return `${maiuscola(MESI[data.getMonth()])} ${data.getFullYear()}`
    case 'anno':
      return String(data.getFullYear())
    default:
      if (da.getMonth() === ultimo.getMonth()) return `${da.getDate()} – ${ultimo.getDate()} ${MESI[da.getMonth()]} ${da.getFullYear()}`
      if (da.getFullYear() === ultimo.getFullYear()) return `${da.getDate()} ${MESI_BREVI[da.getMonth()]} – ${ultimo.getDate()} ${MESI_BREVI[ultimo.getMonth()]} ${da.getFullYear()}`
      return `${da.getDate()} ${MESI_BREVI[da.getMonth()]} ${da.getFullYear()} – ${ultimo.getDate()} ${MESI_BREVI[ultimo.getMonth()]} ${ultimo.getFullYear()}`
  }
}

export const ora = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
export const oraPadded = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

export function dataLunga(d: Date): string {
  return `${maiuscola(GIORNI[d.getDay()])} ${d.getDate()} ${MESI[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ''}`
}

export function etichettaGiorno(d: Date, oggi = new Date()): string {
  const diff = giorniTra(oggi, d)
  if (diff === 0) return 'Oggi'
  if (diff === 1) return 'Domani'
  if (diff === -1) return 'Ieri'
  return dataLunga(d)
}

/** "Mar 27 ottobre · 9:30 – 10:30", "Tutto il giorno", su più giorni con entrambe le date. */
export function quando(e: Pick<EventoVista, 'start' | 'end' | 'tuttoIlGiorno'>): string {
  if (e.tuttoIlGiorno) {
    const ultimo = aggiungiGiorni(e.end, -1)
    return stessoGiorno(e.start, ultimo) ? `${dataLunga(e.start)} · Tutto il giorno` : `${dataLunga(e.start)} – ${dataLunga(ultimo)}`
  }
  if (stessoGiorno(e.start, e.end) || (e.end.getHours() === 0 && e.end.getMinutes() === 0 && giorniTra(e.start, e.end) === 1)) {
    return `${dataLunga(e.start)} · ${ora(e.start)} – ${ora(e.end)}`
  }
  return `${dataLunga(e.start)}, ${ora(e.start)} – ${dataLunga(e.end)}, ${ora(e.end)}`
}

export function durata(minuti: number): string {
  if (minuti < 60) return `${minuti} min`
  const h = Math.floor(minuti / 60)
  const m = minuti % 60
  return m ? `${h} h ${m}` : `${h} h`
}

export function traQuanto(d: Date, adesso = new Date()): string {
  const min = Math.round((d.getTime() - adesso.getTime()) / 60_000)
  if (min <= 0) return 'adesso'
  if (min < 60) return `tra ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `tra ${h} h${min % 60 ? ` ${min % 60}` : ''}`
  const g = giorniTra(adesso, d)
  return g === 1 ? 'domani' : `tra ${g} giorni`
}

// ───────────────────────── Eventi ─────────────────────────

/** Una data "YYYY-MM-DD" è mezzanotte locale (non UTC). */
export function daGoogle(s: string): Date {
  if (s.length <= 10) {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(s)
}

export function perVista(e: AgendaEvento, stato: AgendaStato | null, calendari: Map<string, AgendaCalendario>): EventoVista {
  return {
    ...e,
    chiave: `${e.calendarioId}|${e.id}`,
    start: daGoogle(e.inizio),
    end: daGoogle(e.fine),
    colore: coloreEvento(e, stato, calendari.get(e.calendarioId)),
  }
}

/** Gli eventi che toccano il giorno (per le viste a griglia oraria contano solo quelli con orario). */
export function eventiDelGiorno(eventi: EventoVista[], giorno: Date): EventoVista[] {
  const g0 = inizioGiorno(giorno).getTime()
  const g1 = aggiungiGiorni(inizioGiorno(giorno), 1).getTime()
  return eventi.filter((e) => e.start.getTime() < g1 && e.end.getTime() > g0)
}

export const durataMinuti = (e: { start: Date; end: Date }) => Math.round((e.end.getTime() - e.start.getTime()) / 60_000)

/** Evento "lungo" (tutto il giorno o più di 24 ore): sta nella striscia in alto, non nella griglia oraria. */
export const inStriscia = (e: EventoVista) => e.tuttoIlGiorno || durataMinuti(e) >= 24 * 60

export interface Posizione {
  evento: EventoVista
  top: number
  altezza: number
  sinistra: number
  larghezza: number
  colonne: number
}

/**
 * Disposizione degli eventi con orario in una colonna giorno: gruppi di eventi che si sovrappongono, colonne
 * assegnate in ordine di inizio, e ogni evento si allarga a destra finché trova colonne libere (come Google).
 */
export function disponi(eventi: EventoVista[], giorno: Date): Posizione[] {
  const g0 = inizioGiorno(giorno)
  const ordinati = [...eventi].sort((a, b) => a.start.getTime() - b.start.getTime() || durataMinuti(b) - durataMinuti(a))
  const segmenti = ordinati.map((e) => {
    const s = Math.max(0, (e.start.getTime() - g0.getTime()) / 60_000)
    const f = Math.min(24 * 60, (e.end.getTime() - g0.getTime()) / 60_000)
    // Ogni evento occupa almeno 20 minuti in altezza, sennò il titolo non si legge.
    return { e, s, f: Math.max(f, s + 20) }
  })
  const out: Posizione[] = []
  let gruppo: typeof segmenti = []
  let fineGruppo = -1

  const chiudi = () => {
    if (!gruppo.length) return
    const colonne: number[] = []
    const col = new Map<(typeof segmenti)[number], number>()
    for (const seg of gruppo) {
      let c = colonne.findIndex((fine) => fine <= seg.s)
      if (c < 0) {
        c = colonne.length
        colonne.push(seg.f)
      } else {
        colonne[c] = seg.f
      }
      col.set(seg, c)
    }
    const n = colonne.length
    for (const seg of gruppo) {
      const c = col.get(seg)!
      let span = 1
      while (c + span < n && !gruppo.some((o) => col.get(o) === c + span && o.s < seg.f && o.f > seg.s)) span++
      out.push({ evento: seg.e, top: seg.s, altezza: seg.f - seg.s, sinistra: c / n, larghezza: span / n, colonne: n })
    }
    gruppo = []
    fineGruppo = -1
  }

  for (const seg of segmenti) {
    if (seg.s >= fineGruppo) chiudi()
    gruppo.push(seg)
    fineGruppo = Math.max(fineGruppo, seg.f)
  }
  chiudi()
  return out
}

/** Barre della striscia "tutto il giorno": righe assegnate per non sovrapporsi nella settimana visibile. */
export function righeStriscia(eventi: EventoVista[], giorni: Date[]): { evento: EventoVista; da: number; a: number; riga: number }[] {
  if (!giorni.length) return []
  const primo = giorni[0]
  const n = giorni.length
  const barre = eventi
    .map((e) => {
      const fineIncl = e.tuttoIlGiorno ? aggiungiGiorni(e.end, -1) : new Date(e.end.getTime() - 1)
      return { evento: e, da: Math.max(0, giorniTra(primo, e.start)), a: Math.min(n - 1, giorniTra(primo, fineIncl)) }
    })
    .filter((b) => b.a >= 0 && b.da <= n - 1 && b.a >= b.da)
    .sort((x, y) => x.da - y.da || y.a - y.da - (x.a - x.da))
  const righe: number[][] = []
  return barre.map((b) => {
    let r = righe.findIndex((occ) => occ.every((g) => g < b.da || g > b.a))
    if (r < 0) {
      r = righe.length
      righe.push([])
    }
    for (let g = b.da; g <= b.a; g++) righe[r].push(g)
    return { ...b, riga: r }
  })
}

export function ordinaEventi(a: EventoVista, b: EventoVista): number {
  if (a.tuttoIlGiorno !== b.tuttoIlGiorno) return a.tuttoIlGiorno ? -1 : 1
  return a.start.getTime() - b.start.getTime() || durataMinuti(b) - durataMinuti(a)
}

// ───────────────────────── Colori ─────────────────────────

/** Colori evento di Google con i nomi italiani della sua interfaccia (l'API restituisce ancora i pastello vecchi). */
export const COLORI_EVENTO: { id: string; nome: string; hex: string }[] = [
  { id: '11', nome: 'Pomodoro', hex: '#d50000' },
  { id: '4', nome: 'Fenicottero', hex: '#e67c73' },
  { id: '6', nome: 'Mandarino', hex: '#f4511e' },
  { id: '5', nome: 'Banana', hex: '#f6bf26' },
  { id: '2', nome: 'Salvia', hex: '#33b679' },
  { id: '10', nome: 'Basilico', hex: '#0b8043' },
  { id: '7', nome: 'Pavone', hex: '#039be5' },
  { id: '9', nome: 'Mirtillo', hex: '#3f51b5' },
  { id: '1', nome: 'Lavanda', hex: '#7986cb' },
  { id: '3', nome: 'Uva', hex: '#8e24aa' },
  { id: '8', nome: 'Grafite', hex: '#616161' },
]
const COLORE_EVENTO = new Map(COLORI_EVENTO.map((c) => [c.id, c.hex]))

/** Palette calendari dell'API (vecchia) → colori che Google mostra oggi. */
const CALENDARIO_MODERNO: Record<string, string> = {
  '#ac725e': '#795548', '#d06b64': '#e67c73', '#f83a22': '#d50000', '#fa573c': '#f4511e', '#ff7537': '#ef6c00',
  '#ffad46': '#f09300', '#42d692': '#009688', '#16a765': '#0b8043', '#7bd148': '#7cb342', '#b3dc6c': '#c0ca33',
  '#fbe983': '#e4c441', '#fad165': '#f6bf26', '#92e1c0': '#33b679', '#9fe1e7': '#039be5', '#9fc6e7': '#4285f4',
  '#4986e7': '#3f51b5', '#9a9cff': '#7986cb', '#b99aff': '#b39ddb', '#c2c2c2': '#616161', '#cabdbf': '#a79b8e',
  '#cca6ac': '#ad1457', '#f691b2': '#d81b60', '#cd74e6': '#8e24aa', '#a47ae2': '#9e69af',
}

export function coloreCalendario(c: AgendaCalendario | undefined): string {
  const hex = (c?.coloreSfondo ?? '#4285f4').toLowerCase()
  return CALENDARIO_MODERNO[hex] ?? hex
}

export function coloreEvento(e: AgendaEvento, _stato: AgendaStato | null, cal: AgendaCalendario | undefined): string {
  if (e.colorId && COLORE_EVENTO.has(e.colorId)) return COLORE_EVENTO.get(e.colorId)!
  return coloreCalendario(cal)
}

export const scrivibile = (c: AgendaCalendario | undefined) => c?.accesso === 'owner' || c?.accesso === 'writer'


// ───────────────────────── Ricorrenze ─────────────────────────

const CODICI = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const ORDINALI: Record<string, string> = { '1': 'primo', '2': 'secondo', '3': 'terzo', '4': 'quarto', '-1': 'ultimo' }

export interface PresetRicorrenza {
  id: string
  nome: string
  regole: string[]
}

export function presetRicorrenza(d: Date): PresetRicorrenza[] {
  const g = CODICI[d.getDay()]
  const settimanaDelMese = Math.ceil(d.getDate() / 7)
  const ultima = aggiungiGiorni(d, 7).getMonth() !== d.getMonth()
  const ord = ultima && settimanaDelMese >= 4 ? '-1' : String(settimanaDelMese)
  return [
    { id: 'no', nome: 'Non si ripete', regole: [] },
    { id: 'giorno', nome: 'Ogni giorno', regole: ['RRULE:FREQ=DAILY'] },
    { id: 'feriali', nome: 'Ogni giorno feriale (lun–ven)', regole: ['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'] },
    { id: 'settimana', nome: `Ogni settimana di ${GIORNI[d.getDay()]}`, regole: [`RRULE:FREQ=WEEKLY;BYDAY=${g}`] },
    { id: 'quindici', nome: `Ogni 2 settimane di ${GIORNI[d.getDay()]}`, regole: [`RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=${g}`] },
    { id: 'mese', nome: `Ogni mese il ${ORDINALI[ord]} ${GIORNI[d.getDay()]}`, regole: [`RRULE:FREQ=MONTHLY;BYDAY=${ord}${g}`] },
    { id: 'mesegiorno', nome: `Ogni mese il giorno ${d.getDate()}`, regole: [`RRULE:FREQ=MONTHLY;BYMONTHDAY=${d.getDate()}`] },
    { id: 'anno', nome: `Ogni anno il ${d.getDate()} ${MESI[d.getMonth()]}`, regole: ['RRULE:FREQ=YEARLY'] },
  ]
}

/** Descrizione italiana di una RRULE (i casi comuni; il resto resta "Personalizzata"). */
export function descriviRicorrenza(regole: string[] | null | undefined): string | null {
  const r = regole?.find((x) => x.startsWith('RRULE:'))
  if (!r) return null
  const p = Object.fromEntries(r.slice(6).split(';').map((kv) => kv.split('=') as [string, string]))
  const intervallo = Number(p.INTERVAL ?? 1)
  const giorni = (p.BYDAY ?? '').split(',').filter(Boolean)
  const nomeGiorno = (c: string) => {
    const m = c.match(/^(-?\d)?([A-Z]{2})$/)
    if (!m) return c
    const g = GIORNI[CODICI.indexOf(m[2])] ?? m[2]
    return m[1] ? `il ${ORDINALI[m[1]] ?? m[1]} ${g}` : g
  }
  let testo: string
  switch (p.FREQ) {
    case 'DAILY':
      testo = intervallo > 1 ? `Ogni ${intervallo} giorni` : 'Ogni giorno'
      break
    case 'WEEKLY':
      if (giorni.join(',') === 'MO,TU,WE,TH,FR') testo = 'Ogni giorno feriale'
      else testo = `${intervallo > 1 ? `Ogni ${intervallo} settimane` : 'Ogni settimana'}${giorni.length ? ` di ${giorni.map(nomeGiorno).join(', ')}` : ''}`
      break
    case 'MONTHLY':
      testo = `${intervallo > 1 ? `Ogni ${intervallo} mesi` : 'Ogni mese'}${giorni.length ? ` ${giorni.map(nomeGiorno).join(', ')}` : p.BYMONTHDAY ? ` il giorno ${p.BYMONTHDAY}` : ''}`
      break
    case 'YEARLY':
      testo = intervallo > 1 ? `Ogni ${intervallo} anni` : 'Ogni anno'
      break
    default:
      return 'Ricorrenza personalizzata'
  }
  if (p.COUNT) testo += `, ${p.COUNT} volte`
  if (p.UNTIL) {
    const u = p.UNTIL
    testo += `, fino al ${Number(u.slice(6, 8))} ${MESI[Number(u.slice(4, 6)) - 1]} ${u.slice(0, 4)}`
  }
  return testo
}

export function presetDi(regole: string[] | null | undefined, d: Date): string {
  const norm = (regole ?? []).filter((r) => r.startsWith('RRULE:'))
  if (!norm.length) return 'no'
  const trovato = presetRicorrenza(d).find((p) => p.regole.length && p.regole[0] === norm[0])
  return trovato?.id ?? 'personalizzata'
}

/** Aggiunge o sostituisce la fine della serie (UNTIL o COUNT) nella RRULE. */
export function conFine(regola: string, fine: { tipo: 'mai' } | { tipo: 'data'; data: Date } | { tipo: 'volte'; n: number }): string {
  const parti = regola.slice(6).split(';').filter((x) => !x.startsWith('UNTIL=') && !x.startsWith('COUNT='))
  if (fine.tipo === 'data') parti.push(`UNTIL=${isoData(fine.data).replace(/-/g, '')}T235959Z`)
  if (fine.tipo === 'volte') parti.push(`COUNT=${Math.max(1, fine.n)}`)
  return `RRULE:${parti.join(';')}`
}

// ───────────────────────── Testo ─────────────────────────

/** Iniziali per gli avatar. */
export function iniziali(nome: string | null | undefined, email?: string | null): string {
  const base = (nome && nome.trim()) || (email ? email.split('@')[0].replace(/[._-]+/g, ' ') : '?')
  const parti = base.split(/\s+/).filter(Boolean)
  return ((parti[0]?.[0] ?? '') + (parti.length > 1 ? parti[parti.length - 1][0] : '')).toUpperCase() || '?'
}

export function nomePersona(p: { nome: string | null; email: string }): string {
  if (p.nome && p.nome.trim()) return p.nome.trim()
  const locale = p.email.split('@')[0]
  return locale.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** "Vittorio", "Vittorio e Silvia", "Vittorio, Silvia e Nicolas", "Vittorio, Silvia e altri 3": solo i nomi. */
export function elencoNomi(persone: { nome: string | null; email: string }[], massimo = 3): string {
  const nomi = persone.map((p) => nomePersona(p).split(' ')[0])
  if (nomi.length <= 1) return nomi[0] ?? ''
  if (nomi.length <= massimo) return `${nomi.slice(0, -1).join(', ')} e ${nomi[nomi.length - 1]}`
  const altri = nomi.length - (massimo - 1)
  return `${nomi.slice(0, massimo - 1).join(', ')} e altri ${altri}`
}

const TAG_AMMESSI = new Set(['A', 'B', 'STRONG', 'I', 'EM', 'U', 'BR', 'P', 'UL', 'OL', 'LI', 'SPAN', 'DIV'])

/** Le descrizioni di Google sono HTML: si tengono solo formattazione e link (aperti in una nuova scheda). */
export function descrizioneSicura(html: string | null | undefined): string {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(`<div>${html.includes('<') ? html : html.replace(/\n/g, '<br>')}</div>`, 'text/html')
  const pulisci = (n: Node): Node | null => {
    if (n.nodeType === Node.TEXT_NODE) return document.createTextNode(n.textContent ?? '')
    if (n.nodeType !== Node.ELEMENT_NODE) return null
    const el = n as Element
    const figli = Array.from(el.childNodes).map(pulisci).filter(Boolean) as Node[]
    if (!TAG_AMMESSI.has(el.tagName)) {
      const frag = document.createDocumentFragment()
      figli.forEach((f) => frag.appendChild(f))
      return frag
    }
    const nuovo = document.createElement(el.tagName)
    if (el.tagName === 'A') {
      const href = el.getAttribute('href') ?? ''
      if (/^(https?:|mailto:|tel:)/i.test(href)) {
        nuovo.setAttribute('href', href)
        nuovo.setAttribute('target', '_blank')
        nuovo.setAttribute('rel', 'noopener noreferrer')
      }
    }
    figli.forEach((f) => nuovo.appendChild(f))
    return nuovo
  }
  const radice = pulisci(doc.body.firstChild as Node)
  const box = document.createElement('div')
  if (radice) box.appendChild(radice)
  // Link nudi nel testo → cliccabili
  return box.innerHTML.replace(/(^|[\s>])(https?:\/\/[^\s<]+)(?![^<]*<\/a>)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>')
}

export function mapsUrl(luogo: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(luogo)}`
}

export function testoPromemoria(minuti: number, metodo: string): string {
  const quando =
    minuti === 0 ? "all'inizio"
      : minuti % 10080 === 0 ? `${minuti / 10080} settiman${minuti / 10080 === 1 ? 'a' : 'e'} prima`
        : minuti % 1440 === 0 ? `${minuti / 1440} giorn${minuti / 1440 === 1 ? 'o' : 'i'} prima`
          : minuti % 60 === 0 ? `${minuti / 60} or${minuti / 60 === 1 ? 'a' : 'e'} prima`
            : `${minuti} min prima`
  return metodo === 'email' ? `Email ${quando}` : quando[0].toUpperCase() + quando.slice(1)
}

/** "Ottobre 2026" (o l'anno) per la barra compatta. */
export function titoloMobile(vista: Vista, data: Date): string {
  if (vista === 'anno') return String(data.getFullYear())
  if (vista === 'elenco') return 'Prossimi giorni'
  return `${maiuscola(nomeMese(data.getMonth()))} ${data.getFullYear()}`
}

export { isoConOffset, isoData }
