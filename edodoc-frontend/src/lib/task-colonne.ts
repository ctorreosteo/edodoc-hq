import type { LucideIcon } from 'lucide-react'
import {
  Activity, AlarmClock, Bot, CalendarClock, CalendarPlus, CalendarRange, CircleDot, Clock3, Crosshair, Flag, Hash,
  HeartPulse, Hourglass, Layers, ListChecks, ListTree, MessageSquare, Paperclip, PenLine, Tags, TimerReset, TrendingUp,
  User, Users, Waypoints,
} from 'lucide-react'
import { differenceInCalendarDays, differenceInHours } from 'date-fns'
import { nomeCompleto } from '@/lib/task-nomi'
import { formatStima, totaleStime } from '@/lib/task-stima'
import { isStatoChiuso, type TaskColonnaScelta, type TaskPriorita, type TaskRiga } from '@/services/task-service'

/**
 * Colonne della vista lista, come su ClickUp: ognuno sceglie quali vedere, in che ordine e quanto larghe
 * (salvate nel backend, per tutte le liste o su misura per una). Il titolo resta sempre la prima.
 * Qui c'è il catalogo e i calcoli delle colonne "intelligenti"; le celle stanno in task-colonne-celle.tsx.
 */

export type TaskColonnaId =
  | 'assegnatari' | 'scadenza' | 'stima' | 'priorita' | 'stato' | 'lista'
  | 'inizio' | 'tempoRimasto' | 'durata'
  | 'focus' | 'salute'
  | 'avanzamento' | 'checklist' | 'sottotask' | 'dipendenze'
  | 'etichette' | 'paziente' | 'codice' | 'origine'
  | 'creatoDa'
  | 'commenti' | 'allegati' | 'aggiornato' | 'fermo' | 'creato' | 'eta'

export type TaskColonnaGruppo = 'essenziali' | 'intelligenti' | 'tempi' | 'avanzamento' | 'contesto' | 'persone' | 'attivita'

export const GRUPPI_COLONNE: { id: TaskColonnaGruppo; label: string }[] = [
  { id: 'essenziali', label: 'Essenziali' },
  { id: 'intelligenti', label: 'Intelligenti' },
  { id: 'tempi', label: 'Tempi' },
  { id: 'avanzamento', label: 'Avanzamento' },
  { id: 'contesto', label: 'Contesto' },
  { id: 'persone', label: 'Persone' },
  { id: 'attivita', label: 'Attività' },
]

export interface TaskColonnaDef {
  id: TaskColonnaId
  label: string
  /** Etichetta corta per l'intestazione, se diversa */
  breve?: string
  descrizione: string
  icona: LucideIcon
  gruppo: TaskColonnaGruppo
  /** Larghezza di partenza e minima, in px */
  larghezza: number
  minima: number
  /** Ordinabile: il verso di partenza al primo clic */
  ordina?: 'asc' | 'desc'
  /** Allineamento del contenuto */
  allinea?: 'centro' | 'destra'
  /** Colonna nuova o "intelligente": badge nel pannello */
  smart?: boolean
}

export const COLONNE_TASK: TaskColonnaDef[] = [
  { id: 'assegnatari', label: 'Assegnatari', descrizione: 'Chi ci lavora: si cambia dalla cella', icona: Users, gruppo: 'essenziali', larghezza: 104, minima: 64, ordina: 'asc' },
  { id: 'scadenza', label: 'Scadenza', descrizione: 'Giorno ed eventuale ora: in rosso se passata', icona: CalendarClock, gruppo: 'essenziali', larghezza: 136, minima: 96, ordina: 'asc' },
  { id: 'stima', label: 'Stima', descrizione: 'Quanto tempo richiede, con il totale del gruppo', icona: Hourglass, gruppo: 'essenziali', larghezza: 96, minima: 72, ordina: 'desc' },
  { id: 'priorita', label: 'Priorità', descrizione: 'Urgente, alta, normale, bassa', icona: Flag, gruppo: 'essenziali', larghezza: 108, minima: 72, ordina: 'asc' },
  { id: 'stato', label: 'Stato', descrizione: 'Da fare, in corso, in attesa: si cambia dalla cella', icona: CircleDot, gruppo: 'essenziali', larghezza: 128, minima: 96, ordina: 'asc' },
  { id: 'lista', label: 'Lista', descrizione: 'In che lista sta (nelle viste con più liste)', icona: Layers, gruppo: 'essenziali', larghezza: 140, minima: 88, ordina: 'asc' },

  { id: 'focus', label: 'Focus', descrizione: 'Quanto conviene farlo adesso: unisce priorità, scadenza, stato e blocchi in un punteggio da 0 a 100', icona: Crosshair, gruppo: 'intelligenti', larghezza: 116, minima: 84, ordina: 'desc', smart: true },
  { id: 'salute', label: 'Salute', descrizione: 'In linea, da guardare o a rischio, con il perché: ritardi, blocchi, lavoro fermo', icona: HeartPulse, gruppo: 'intelligenti', larghezza: 132, minima: 96, ordina: 'desc', smart: true },
  { id: 'tempoRimasto', label: 'Tempo rimasto', breve: 'Rimasto', descrizione: 'Quanto manca alla scadenza, o da quanto è passata', icona: AlarmClock, gruppo: 'intelligenti', larghezza: 128, minima: 96, ordina: 'asc', smart: true },
  { id: 'fermo', label: 'Fermo da', descrizione: 'Giorni senza nessuna modifica: scova il lavoro dimenticato', icona: TimerReset, gruppo: 'intelligenti', larghezza: 104, minima: 76, ordina: 'desc', smart: true },

  { id: 'inizio', label: 'Inizio', descrizione: 'Quando si comincia (la stessa del Gantt)', icona: CalendarPlus, gruppo: 'tempi', larghezza: 120, minima: 88, ordina: 'asc' },
  { id: 'durata', label: 'Durata', descrizione: "Giorni dall'inizio alla scadenza", icona: CalendarRange, gruppo: 'tempi', larghezza: 92, minima: 72, ordina: 'desc' },
  { id: 'creato', label: 'Creato il', breve: 'Creato', descrizione: 'Giorno in cui è stato creato', icona: Clock3, gruppo: 'tempi', larghezza: 112, minima: 84, ordina: 'desc' },
  { id: 'eta', label: 'Aperto da', descrizione: 'Da quanti giorni il task esiste senza essere chiuso', icona: Activity, gruppo: 'tempi', larghezza: 100, minima: 76, ordina: 'desc', smart: true },

  { id: 'avanzamento', label: 'Avanzamento', descrizione: 'Percentuale fatta di checklist e sottotask, con il passo atteso se ha inizio e scadenza', icona: TrendingUp, gruppo: 'avanzamento', larghezza: 140, minima: 100, ordina: 'desc', smart: true },
  { id: 'checklist', label: 'Checklist', descrizione: 'Voci fatte sul totale', icona: ListChecks, gruppo: 'avanzamento', larghezza: 100, minima: 76, ordina: 'desc', allinea: 'centro' },
  { id: 'sottotask', label: 'Sottotask', descrizione: 'Sottotask fatti sul totale', icona: ListTree, gruppo: 'avanzamento', larghezza: 100, minima: 76, ordina: 'desc', allinea: 'centro' },
  { id: 'dipendenze', label: 'Bloccato da', descrizione: 'Quanti task deve aspettare prima di partire', icona: Waypoints, gruppo: 'avanzamento', larghezza: 116, minima: 84, ordina: 'desc' },

  { id: 'etichette', label: 'Etichette', descrizione: 'Si aggiungono e si tolgono dalla cella', icona: Tags, gruppo: 'contesto', larghezza: 168, minima: 96, ordina: 'asc' },
  { id: 'paziente', label: 'Paziente', descrizione: 'Paziente collegato: si collega dalla cella', icona: User, gruppo: 'contesto', larghezza: 160, minima: 96, ordina: 'asc' },
  { id: 'codice', label: 'Codice', descrizione: 'Il #numero del task: un clic lo copia', icona: Hash, gruppo: 'contesto', larghezza: 84, minima: 64, ordina: 'asc' },
  { id: 'origine', label: 'Origine', descrizione: 'A mano o creato in automatico (rinnovi, esami, scadenze fiscali)', icona: Bot, gruppo: 'contesto', larghezza: 116, minima: 84, ordina: 'asc' },

  { id: 'creatoDa', label: 'Creato da', descrizione: "Chi l'ha creato (vuoto se è automatico)", icona: PenLine, gruppo: 'persone', larghezza: 140, minima: 64, ordina: 'asc' },

  { id: 'commenti', label: 'Commenti', descrizione: 'Quanti commenti ha', icona: MessageSquare, gruppo: 'attivita', larghezza: 100, minima: 64, ordina: 'desc', allinea: 'centro' },
  { id: 'allegati', label: 'Allegati', descrizione: 'Quanti file ha', icona: Paperclip, gruppo: 'attivita', larghezza: 92, minima: 64, ordina: 'desc', allinea: 'centro' },
  { id: 'aggiornato', label: 'Ultima modifica', breve: 'Modificato', descrizione: "Quando è cambiato l'ultima volta", icona: Clock3, gruppo: 'attivita', larghezza: 128, minima: 88, ordina: 'desc' },
]

export const COLONNA_DI = new Map(COLONNE_TASK.map((c) => [c.id, c]))

export const isColonnaTask = (id: string): id is TaskColonnaId => COLONNA_DI.has(id as TaskColonnaId)

/** Quelle di sempre: chi non ha mai scelto vede la lista come prima. */
export const COLONNE_PREDEFINITE: TaskColonnaId[] = ['assegnatari', 'scadenza', 'stima', 'priorita', 'lista']

/** Disposizioni pronte, per partire in un clic. */
export const PRESET_COLONNE: { id: string; label: string; descrizione: string; icona: LucideIcon; colonne: TaskColonnaId[] }[] = [
  { id: 'classica', label: 'Classica', descrizione: 'Le colonne di sempre', icona: Layers, colonne: COLONNE_PREDEFINITE },
  { id: 'focus', label: 'Cosa faccio ora', descrizione: 'Focus, tempo rimasto e priorità per scegliere il prossimo', icona: Crosshair, colonne: ['focus', 'tempoRimasto', 'priorita', 'stima', 'assegnatari', 'lista'] },
  { id: 'pianificazione', label: 'Pianificazione', descrizione: 'Inizio, scadenza, durata e carico di lavoro', icona: CalendarRange, colonne: ['assegnatari', 'inizio', 'scadenza', 'durata', 'stima', 'dipendenze', 'lista'] },
  { id: 'controllo', label: 'Controllo', descrizione: 'Salute, avanzamento, lavoro fermo', icona: HeartPulse, colonne: ['salute', 'avanzamento', 'assegnatari', 'tempoRimasto', 'fermo', 'stato', 'lista'] },
  { id: 'pazienti', label: 'Pazienti', descrizione: 'Paziente ed etichette in vista', icona: User, colonne: ['paziente', 'etichette', 'scadenza', 'priorita', 'origine', 'lista'] },
]

export const sceltePredefinite = (): TaskColonnaScelta[] => COLONNE_PREDEFINITE.map((id) => ({ id, larghezza: null }))

/** Tiene solo le colonne che il gestionale conosce, senza doppioni. */
export function pulisciScelte(scelte: TaskColonnaScelta[]): TaskColonnaScelta[] {
  const viste = new Set<string>()
  return scelte.filter((c) => isColonnaTask(c.id) && !viste.has(c.id) && (viste.add(c.id), true))
}

/** Variabile CSS con la larghezza di una colonna: il trascinamento la cambia senza ridisegnare la lista. */
export const varLarghezza = (id: string) => `--tkw-${id}`

export const larghezzaColonna = (c: TaskColonnaScelta) => {
  const def = COLONNA_DI.get(c.id as TaskColonnaId)
  return Math.max(def?.minima ?? 48, c.larghezza ?? def?.larghezza ?? 120)
}

// ---------- Calcoli ----------

const oggi = () => new Date()

const dataLocale = (iso: string | null | undefined): Date | null => {
  if (!iso) return null
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return y && m && d ? new Date(y, m - 1, d) : null
}

/** Momento della scadenza: con l'ora se c'è, altrimenti a fine giornata. */
const momentoScadenza = (r: Pick<TaskRiga, 'scadenza' | 'scadenzaOra'>): Date | null => {
  const d = dataLocale(r.scadenza)
  if (!d) return null
  const [h, min] = (r.scadenzaOra ?? '23:59').split(':').map(Number)
  d.setHours(h || 0, min || 0, 0, 0)
  return d
}

/** Giorni da oggi alla scadenza (negativi se passata), null senza scadenza. */
export const giorniAllaScadenza = (r: Pick<TaskRiga, 'scadenza'>): number | null => {
  const d = dataLocale(r.scadenza)
  return d ? differenceInCalendarDays(d, oggi()) : null
}

export const giorniDa = (iso: string | null | undefined): number | null => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : Math.max(0, differenceInCalendarDays(oggi(), d))
}

export type Tono = 'ok' | 'info' | 'attenzione' | 'critico' | 'neutro'

export interface TempoRimasto {
  testo: string
  tono: Tono
  /** Per l'ordinamento: minuti alla scadenza */
  minuti: number
}

export function tempoRimasto(r: TaskRiga): TempoRimasto | null {
  if (isStatoChiuso(r.stato)) return null
  const scade = momentoScadenza(r)
  const giorni = giorniAllaScadenza(r)
  if (!scade || giorni == null) return null
  const minuti = Math.round((scade.getTime() - Date.now()) / 60000)
  if (minuti < 0) {
    if (giorni >= 0) {
      const ore = Math.max(1, -Math.round(minuti / 60))
      return { testo: `Scaduto da ${ore} h`, tono: 'critico', minuti }
    }
    const n = -giorni
    return { testo: n === 1 ? 'In ritardo di 1 g' : `In ritardo di ${n} g`, tono: 'critico', minuti }
  }
  if (giorni === 0) {
    if (r.scadenzaOra) {
      const ore = differenceInHours(scade, oggi())
      return { testo: ore < 1 ? `Fra ${Math.max(1, minuti)} min` : `Fra ${ore} h`, tono: 'attenzione', minuti }
    }
    return { testo: 'Oggi', tono: 'attenzione', minuti }
  }
  if (giorni === 1) return { testo: 'Domani', tono: 'attenzione', minuti }
  if (giorni <= 6) return { testo: `Fra ${giorni} giorni`, tono: giorni <= 2 ? 'attenzione' : 'info', minuti }
  if (giorni <= 27) {
    const s = Math.round(giorni / 7)
    return { testo: s === 1 ? 'Fra 1 settimana' : `Fra ${s} settimane`, tono: 'ok', minuti }
  }
  const mesi = Math.round(giorni / 30)
  return { testo: mesi <= 1 ? 'Fra 1 mese' : `Fra ${mesi} mesi`, tono: 'ok', minuti }
}

/** "Oggi", "Ieri", "5 g", "3 mesi": quanto tempo è passato. */
export function etichettaGiorni(giorni: number | null): string {
  if (giorni == null) return '—'
  if (giorni === 0) return 'Oggi'
  if (giorni === 1) return 'Ieri'
  if (giorni < 60) return `${giorni} g`
  const mesi = Math.round(giorni / 30)
  return mesi < 24 ? `${mesi} mesi` : `${Math.round(giorni / 365)} anni`
}

/** Giorni fermi: dopo una settimana va guardato, dopo due è dimenticato. */
export const tonoFermo = (giorni: number | null, chiuso: boolean): Tono =>
  chiuso || giorni == null ? 'neutro' : giorni >= 14 ? 'critico' : giorni >= 7 ? 'attenzione' : 'ok'

/** Giorni dall'inizio alla scadenza, estremi compresi. */
export function durataGiorni(r: Pick<TaskRiga, 'dataInizio' | 'scadenza'>): number | null {
  const a = dataLocale(r.dataInizio)
  const b = dataLocale(r.scadenza)
  if (!a || !b) return null
  return Math.max(1, differenceInCalendarDays(b, a) + 1)
}

export interface Avanzamento {
  fatto: number
  totale: number
  percentuale: number
  /** Dove dovrebbe essere oggi, in base a inizio e scadenza (null senza entrambe) */
  atteso: number | null
}

export function avanzamento(r: TaskRiga): Avanzamento | null {
  const totale = r.checklistTotale + r.sottotaskTotale
  if (r.stato === 'COMPLETATO') return { fatto: totale, totale, percentuale: 100, atteso: null }
  if (!totale) return null
  const fatto = r.checklistCompletati + r.sottotaskCompletati
  return { fatto, totale, percentuale: Math.round((fatto / totale) * 100), atteso: passoAtteso(r) }
}

/** Percentuale di tempo già trascorsa fra inizio e scadenza. */
function passoAtteso(r: TaskRiga): number | null {
  const a = dataLocale(r.dataInizio)
  const b = momentoScadenza(r)
  if (!a || !b || b <= a) return null
  const ora = Date.now()
  return Math.round(Math.min(1, Math.max(0, (ora - a.getTime()) / (b.getTime() - a.getTime()))) * 100)
}

export interface Salute {
  livello: 'ok' | 'attenzione' | 'critico'
  testo: string
  motivi: string[]
  /** Per l'ordinamento: più alto = più a rischio */
  punteggio: number
}

export function salute(r: TaskRiga): Salute | null {
  if (isStatoChiuso(r.stato)) return null
  const critici: string[] = []
  const attenzioni: string[] = []
  const giorni = giorniAllaScadenza(r)
  const rimasto = tempoRimasto(r)
  if (rimasto && rimasto.minuti < 0) critici.push(rimasto.testo)
  if (r.inAttesaDi > 0) {
    const testo = r.inAttesaDi === 1 ? 'Aspetta un task non ancora chiuso' : `Aspetta ${r.inAttesaDi} task non ancora chiusi`
    if (giorni != null && giorni <= 2) critici.push(`${testo}, e scade a breve`)
    else attenzioni.push(testo)
  }
  if (giorni != null && giorni >= 0 && giorni <= 2 && r.stato === 'DA_FARE' && (r.stimaMinuti ?? 0) >= 240) {
    attenzioni.push('Scade a breve, è lungo e non è ancora iniziato')
  }
  const av = avanzamento(r)
  if (av?.atteso != null && av.atteso - av.percentuale >= 30) {
    attenzioni.push(`Fatto il ${av.percentuale}%, ma il tempo è già al ${av.atteso}%`)
  }
  const fermo = giorniDa(r.aggiornatoIl)
  if (fermo != null && fermo >= 14) attenzioni.push(`Nessuna modifica da ${fermo} giorni`)
  if (r.priorita === 'URGENTE' && !r.scadenza) attenzioni.push('Urgente ma senza scadenza')
  if (r.stato === 'IN_ATTESA' && fermo != null && fermo >= 7) attenzioni.push(`In attesa da più di ${fermo} giorni`)

  const motivi = [...critici, ...attenzioni]
  const punteggio = critici.length * 10 + attenzioni.length
  if (critici.length || attenzioni.length >= 3) return { livello: 'critico', testo: 'A rischio', motivi, punteggio }
  if (attenzioni.length) return { livello: 'attenzione', testo: 'Da guardare', motivi, punteggio }
  return { livello: 'ok', testo: 'In linea', motivi: ['Nessun segnale di rischio'], punteggio: 0 }
}

const PESO_FOCUS_PRIORITA: Record<TaskPriorita, number> = { URGENTE: 40, ALTA: 28, NORMALE: 15, BASSA: 5 }

/**
 * Focus: quanto conviene farlo adesso, da 0 a 100. Priorità e vicinanza della scadenza pesano di più; il lavoro
 * già avviato sale un po' (finire prima di iniziare), quello bloccato da altri task scende.
 */
export function focus(r: TaskRiga): { punteggio: number; motivi: string[] } | null {
  if (isStatoChiuso(r.stato)) return null
  const motivi: string[] = []
  let p = r.priorita ? PESO_FOCUS_PRIORITA[r.priorita] : 10
  if (r.priorita === 'URGENTE' || r.priorita === 'ALTA') motivi.push(`Priorità ${r.priorita === 'URGENTE' ? 'urgente' : 'alta'}`)
  const g = giorniAllaScadenza(r)
  if (g != null) {
    const peso = g < 0 ? 45 : g === 0 ? 38 : g === 1 ? 30 : g <= 3 ? 22 : g <= 7 ? 12 : 4
    p += peso
    if (g < 0) motivi.push('È in ritardo')
    else if (g <= 1) motivi.push(g === 0 ? 'Scade oggi' : 'Scade domani')
    else if (g <= 7) motivi.push('Scade questa settimana')
  }
  if (r.stato === 'IN_CORSO') {
    p += 8
    motivi.push('È già avviato')
  }
  if (r.inAttesaDi > 0) {
    p -= 25
    motivi.push('Bloccato da altri task: prima quelli')
  }
  if (r.stato === 'IN_ATTESA') {
    p -= 10
    motivi.push('In attesa')
  }
  return { punteggio: Math.max(0, Math.min(100, Math.round(p))), motivi }
}

export const etichettaOrigine = (r: Pick<TaskRiga, 'automatico'>) => (r.automatico ? 'Automatico' : 'A mano')

// ---------- Ordinamento ----------

const PESO_STATO: Record<TaskRiga['stato'], number> = { IN_CORSO: 0, DA_FARE: 1, IN_ATTESA: 2, COMPLETATO: 3, ANNULLATO: 4 }

export interface ContestoOrdinamento {
  nomeLista?: (id: number) => string | undefined
}

/** Valore su cui ordina una colonna: null = senza valore, sempre in fondo. */
export function chiaveColonna(id: string, r: TaskRiga, ctx: ContestoOrdinamento = {}): number | string | null {
  switch (id) {
    case 'stato': return PESO_STATO[r.stato]
    case 'lista': return ctx.nomeLista?.(r.listaId) ?? null
    case 'inizio': return r.dataInizio
    case 'tempoRimasto': return tempoRimasto(r)?.minuti ?? null
    case 'durata': return durataGiorni(r)
    case 'focus': return focus(r)?.punteggio ?? null
    case 'salute': return salute(r)?.punteggio ?? null
    case 'avanzamento': return avanzamento(r)?.percentuale ?? null
    case 'checklist': return r.checklistTotale ? r.checklistCompletati / r.checklistTotale : null
    case 'sottotask': return r.sottotaskTotale ? r.sottotaskCompletati / r.sottotaskTotale : null
    case 'dipendenze': return r.inAttesaDi || null
    case 'etichette': return r.etichette.length ? r.etichette.map((e) => e.nome).sort().join(' ') : null
    case 'paziente': return r.paziente ? nomeCompleto(r.paziente) : null
    case 'codice': return r.id
    case 'origine': return etichettaOrigine(r)
    case 'assegnatari': return r.assegnatari.length ? nomeCompleto(r.assegnatari[0]) : null
    case 'creatoDa': return r.creatoDa ? nomeCompleto(r.creatoDa) : null
    case 'commenti': return r.commenti || null
    case 'allegati': return r.allegati || null
    case 'fermo': return giorniDa(r.aggiornatoIl)
    case 'eta': return giorniDa(r.creatoIl)
    default: return null
  }
}

/** Confronto di due valori di colonna, null in fondo in entrambi i versi (`segno` = verso). */
export function confrontaChiavi(a: number | string | null, b: number | string | null, segno: number): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  const c = typeof a === 'number' && typeof b === 'number'
    ? a - b
    : String(a).localeCompare(String(b), 'it', { sensitivity: 'base', numeric: true })
  return c * segno
}

// ---------- Riassunti ----------

/** Riassunto del gruppo nell'intestazione della colonna, come i calcoli di ClickUp. */
export function totaleColonna(id: TaskColonnaId, righe: TaskRiga[]): { testo: string; titolo: string; tono?: string } | null {
  if (!righe.length) return null
  switch (id) {
    case 'stima': {
      const t = totaleStime(righe)
      return t ? { testo: formatStima(t), titolo: `Totale stimato: ${formatStima(t)}` } : null
    }
    case 'avanzamento': {
      const valori = righe.map(avanzamento).filter((a) => a != null)
      if (!valori.length) return null
      const media = Math.round(valori.reduce((s, a) => s + a.percentuale, 0) / valori.length)
      return { testo: `${media}%`, titolo: `Avanzamento medio dei ${valori.length} task con checklist o sottotask` }
    }
    case 'tempoRimasto': {
      const n = righe.filter((r) => (tempoRimasto(r)?.minuti ?? 0) < 0).length
      return n ? { testo: String(n), titolo: `${n} in ritardo: task oltre la scadenza`, tono: 'critico' } : null
    }
    case 'salute': {
      const n = righe.filter((r) => salute(r)?.livello === 'critico').length
      return n ? { testo: String(n), titolo: `${n} task a rischio`, tono: 'critico' } : null
    }
    case 'focus': {
      const n = righe.filter((r) => (focus(r)?.punteggio ?? 0) >= 70).length
      return n ? { testo: String(n), titolo: `${n} da fare ora: focus 70 o più`, tono: 'attenzione' } : null
    }
    case 'fermo': {
      const n = righe.filter((r) => (giorniDa(r.aggiornatoIl) ?? 0) >= 14).length
      return n ? { testo: String(n), titolo: `${n} task fermi: nessuna modifica da due settimane o più`, tono: 'attenzione' } : null
    }
    case 'assegnatari': {
      const n = righe.filter((r) => !r.assegnatari.length).length
      return n ? { testo: String(n), titolo: `${n} task senza assegnatari` } : null
    }
    case 'dipendenze': {
      const n = righe.filter((r) => r.inAttesaDi > 0).length
      return n ? { testo: String(n), titolo: `${n} task bloccati: aspettano altri task`, tono: 'attenzione' } : null
    }
    case 'commenti':
    case 'allegati': {
      const n = righe.reduce((s, r) => s + (id === 'commenti' ? r.commenti : r.allegati), 0)
      return n ? { testo: String(n), titolo: `${n} ${id} in tutto` } : null
    }
    case 'durata': {
      const g = righe.map(durataGiorni).filter((d) => d != null)
      return g.length ? { testo: `${Math.round(g.reduce((s, d) => s + d, 0) / g.length)} g`, titolo: 'Durata media' } : null
    }
    default:
      return null
  }
}
