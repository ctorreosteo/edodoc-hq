import type React from 'react'
import {
  addDays, differenceInCalendarDays, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek,
} from 'date-fns'
import { toast } from '@/lib/toast'
import { emitTaskChanged } from '@/hooks/use-task-cambi'
import {
  isStatoChiuso,
  taskService,
  type AggiornaTaskValori,
  type CreaTaskRequest,
  type TaskConfig,
  type TaskLista,
  type TaskPersona,
  type TaskPriorita,
  type TaskRiga,
  type TaskStato,
} from '@/services/task-service'
import type { QuickAddRisultato } from '@/lib/task-quick-add'
import { chiediCompletaSottotask } from '@/lib/task-conferma-sottotask'
import { chiaveColonna, confrontaChiavi, type ContestoOrdinamento, type TaskColonnaId } from '@/lib/task-colonne'

/** Cosa mostra la pagina: i miei task (assegnati a me o a nessuno), tutti i task, una lista (id) o una cartella con tutto il suo contenuto. */
export type TaskSelezione = 'miei' | 'tutti' | number | `cartella:${number}`

/** Id della lista selezionata, oppure null. */
export const listaDaSelezione = (s: TaskSelezione): number | null => (typeof s === 'number' ? s : null)

/** Id della cartella selezionata (`cartella:ID`), oppure null. */
export const cartellaDaSelezione = (s: TaskSelezione): number | null => {
  if (typeof s !== 'string' || !s.startsWith('cartella:')) return null
  const n = Number(s.slice('cartella:'.length))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Dal parametro ?lista= (o dalla preferenza salvata) alla selezione; null se non valido. */
export function parseSelezione(v: string | null | undefined): TaskSelezione | null {
  if (!v) return null
  if (v === 'miei' || v === 'tutti') return v
  if (v.startsWith('cartella:')) {
    const n = Number(v.slice('cartella:'.length))
    return Number.isFinite(n) && n > 0 ? `cartella:${n}` : null
  }
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}
export type TaskVistaPagina = 'lista' | 'kanban' | 'calendario' | 'gantt'
/** Filtro rapido di "I miei task" scelto dalla frase riepilogo dell'intestazione. */
export type TaskFiltroKpi = 'ritardo' | 'oggi' | 'settimana' | 'senza' | null
/** I campi di sempre più ogni colonna della lista (task-colonne.ts). */
export type TaskOrdinamentoCampo = 'scadenza' | 'priorita' | 'stima' | 'aggiornato' | 'creato' | 'titolo' | TaskColonnaId

export interface TaskOrdinamento {
  campo: TaskOrdinamentoCampo
  dir: 'asc' | 'desc'
}

export interface TaskFiltriPagina {
  q: string
  assegnatoA: number | null
  priorita: TaskPriorita | null
  etichettaId: number | null
  /** Vuoto = tutti gli stati aperti (più i chiusi se mostraCompletati) */
  stati: TaskStato[]
  mostraCompletati: boolean
}

export const FILTRI_VUOTI: TaskFiltriPagina = {
  q: '',
  assegnatoA: null,
  priorita: null,
  etichettaId: null,
  stati: [],
  mostraCompletati: false,
}

export const contaFiltriAttivi = (f: TaskFiltriPagina) =>
  (f.assegnatoA != null ? 1 : 0) +
  (f.priorita ? 1 : 0) +
  (f.etichettaId != null ? 1 : 0) +
  (f.stati.length ? 1 : 0) +
  (f.mostraCompletati ? 1 : 0)

export const oggiIso = () => format(new Date(), 'yyyy-MM-dd')
export const isoGiorno = (d: Date) => format(d, 'yyyy-MM-dd')

const PESO_PRIORITA: Record<TaskPriorita, number> = { URGENTE: 0, ALTA: 1, NORMALE: 2, BASSA: 3 }

/** Ordine stabile di una colonna kanban / gruppo: `ordine`, poi i più recenti. */
export const confrontaOrdine = (a: TaskRiga, b: TaskRiga) =>
  a.ordine - b.ordine || b.creatoIl.localeCompare(a.creatoIl) || b.id - a.id

const chiaveScadenza = (r: TaskRiga) => (r.scadenza ? `${r.scadenza}T${r.scadenzaOra ?? '23:59:59'}` : null)

/** `ctx` serve alle colonne che ordinano per nome (lista). */
export function ordina(righe: TaskRiga[], o: TaskOrdinamento, ctx?: ContestoOrdinamento): TaskRiga[] {
  const segno = o.dir === 'asc' ? 1 : -1
  return [...righe].sort((a, b) => {
    let c = 0
    switch (o.campo) {
      case 'scadenza': {
        const ka = chiaveScadenza(a)
        const kb = chiaveScadenza(b)
        // Senza scadenza sempre in fondo, in entrambi i versi
        if (!ka && !kb) c = 0
        else if (!ka) return 1
        else if (!kb) return -1
        else c = ka.localeCompare(kb)
        break
      }
      case 'priorita': {
        const pa = a.priorita ? PESO_PRIORITA[a.priorita] : 9
        const pb = b.priorita ? PESO_PRIORITA[b.priorita] : 9
        c = pa - pb
        break
      }
      case 'stima': {
        // Senza stima sempre in fondo, in entrambi i versi
        if (a.stimaMinuti == null && b.stimaMinuti == null) c = 0
        else if (a.stimaMinuti == null) return 1
        else if (b.stimaMinuti == null) return -1
        else c = a.stimaMinuti - b.stimaMinuti
        break
      }
      case 'aggiornato':
        c = a.aggiornatoIl.localeCompare(b.aggiornatoIl)
        break
      case 'creato':
        c = a.creatoIl.localeCompare(b.creatoIl)
        break
      case 'titolo':
        c = a.titolo.localeCompare(b.titolo, 'it', { sensitivity: 'base' })
        break
      default: {
        // Colonne della lista: senza valore sempre in fondo, in entrambi i versi
        const ka = chiaveColonna(o.campo, a, ctx)
        const kb = chiaveColonna(o.campo, b, ctx)
        if (ka == null || kb == null) {
          if (ka == null && kb == null) break
          return ka == null ? 1 : -1
        }
        c = confrontaChiavi(ka, kb, 1)
        break
      }
    }
    return c * segno || confrontaOrdine(a, b)
  })
}

export type GruppoScadenza = 'ritardo' | 'oggi' | 'domani' | 'settimana' | 'avanti' | 'senza'

export const GRUPPI_SCADENZA: { key: GruppoScadenza; label: string }[] = [
  { key: 'ritardo', label: 'In ritardo' },
  { key: 'oggi', label: 'Oggi' },
  { key: 'domani', label: 'Domani' },
  { key: 'settimana', label: 'Prossimi 7 giorni' },
  { key: 'avanti', label: 'Più avanti' },
  { key: 'senza', label: 'Senza scadenza' },
]

/** Il gruppo rientra nel filtro rapido? "settimana" = da domani a +7, come il riepilogo del backend. */
export function inFiltroKpi(f: TaskFiltroKpi, g: GruppoScadenza): boolean {
  if (!f) return true
  if (f === 'settimana') return g === 'domani' || g === 'settimana'
  return g === f
}

export function gruppoScadenza(r: TaskRiga, oggi = new Date()): GruppoScadenza {
  if (!r.scadenza) return 'senza'
  const giorni = differenceInCalendarDays(parseISO(r.scadenza), oggi)
  if (giorni < 0) return 'ritardo'
  if (giorni === 0) {
    if (r.scadenzaOra && !isStatoChiuso(r.stato)) {
      const [h, m] = r.scadenzaOra.split(':').map(Number)
      const limite = new Date(oggi)
      limite.setHours(h, m, 0, 0)
      if (limite.getTime() < oggi.getTime()) return 'ritardo'
    }
    return 'oggi'
  }
  if (giorni === 1) return 'domani'
  if (giorni <= 7) return 'settimana'
  return 'avanti'
}

/** Posizione `ordine` per un elemento inserito tra `prima` e `dopo` (null = estremità). */
export function ordineTra(prima: number | null, dopo: number | null): number | null {
  if (prima == null && dopo == null) return 1000
  if (prima == null) return (dopo as number) - 1000
  if (dopo == null) return prima + 1000
  if (dopo - prima < 1e-6) return null // nessuno spazio: serve rinumerare la colonna
  return (prima + dopo) / 2
}

/**
 * Applica localmente una modifica alla riga (aggiornamento ottimistico, prima della risposta del server).
 * Assegnatari ed etichette si risolvono dalla config.
 */
export function applicaLocale(r: TaskRiga, v: AggiornaTaskValori, config: TaskConfig | null): TaskRiga {
  const next: TaskRiga = { ...r }
  if ('listaId' in v && v.listaId != null) next.listaId = v.listaId
  if ('titolo' in v && v.titolo != null) next.titolo = v.titolo
  if ('stato' in v && v.stato) {
    next.stato = v.stato
    next.completatoIl = v.stato === 'COMPLETATO' ? new Date().toISOString() : null
  }
  if ('priorita' in v) next.priorita = v.priorita ?? null
  if ('scadenza' in v) next.scadenza = v.scadenza ?? null
  if ('scadenzaOra' in v) next.scadenzaOra = v.scadenzaOra ?? null
  if ('stimaMinuti' in v) next.stimaMinuti = v.stimaMinuti ?? null
  if ('ordine' in v && v.ordine != null) next.ordine = v.ordine
  if ('assegnatariIds' in v && v.assegnatariIds) {
    const ops = config?.operatori ?? []
    next.assegnatari = v.assegnatariIds
      .map((id) => ops.find((o) => o.id === id) ?? r.assegnatari.find((p) => p.id === id))
      .filter((p): p is TaskPersona => !!p)
      .map(({ id, nome, cognome, iniziali }) => ({ id, nome, cognome, iniziali }))
  }
  if ('etichettaIds' in v && v.etichettaIds) {
    const all = config?.etichette ?? []
    next.etichette = v.etichettaIds
      .map((id) => all.find((e) => e.id === id) ?? r.etichette.find((e) => e.id === id))
      .filter((e): e is NonNullable<typeof e> => !!e)
  }
  return next
}

export const etichettaStato = (s: TaskStato) =>
  ({ DA_FARE: 'Da fare', IN_CORSO: 'In corso', IN_ATTESA: 'In attesa', COMPLETATO: 'Completato', ANNULLATO: 'Annullato' })[s]

export function quando(iso: string): string {
  const d = new Date(iso)
  const diff = (Date.now() - d.getTime()) / 60000
  if (diff < 1) return 'adesso'
  if (diff < 60) return `${Math.round(diff)} min fa`
  const giorni = differenceInCalendarDays(new Date(), d)
  if (giorni === 0) return `oggi ${format(d, 'HH:mm')}`
  if (giorni === 1) return `ieri ${format(d, 'HH:mm')}`
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}

export const messaggioErrore = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : fallback

/** Il focus è in un campo di testo: le scorciatoie da tastiera non devono scattare. */
export function staScrivendo(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export const giorniDa = (inizio: Date, n: number) => Array.from({ length: n }, (_, i) => addDays(inizio, i))

export type TaskCalendarioModo = 'mese' | 'settimana'

/** Intervallo visibile (inclusivo) del calendario, settimane da lunedì. */
export function intervalloCalendario(riferimento: Date, modo: TaskCalendarioModo): { da: Date; a: Date } {
  if (modo === 'settimana') {
    return { da: startOfWeek(riferimento, { weekStartsOn: 1 }), a: endOfWeek(riferimento, { weekStartsOn: 1 }) }
  }
  return {
    da: startOfWeek(startOfMonth(riferimento), { weekStartsOn: 1 }),
    a: endOfWeek(endOfMonth(riferimento), { weekStartsOn: 1 }),
  }
}

/**
 * Tasti di una riga a fuoco: Invio/spazio apre, X completa, P posticipa, I copia il codice "#123".
 * Completa e posticipa "cliccano" i controlli della riga, così animazioni e menu restano gli stessi.
 */
export function tastiRiga(e: React.KeyboardEvent<HTMLElement>, apri: () => void) {
  if (e.target !== e.currentTarget || e.metaKey || e.ctrlKey || e.altKey) return
  const k = e.key.toLowerCase()
  if (k === 'enter' || k === ' ') {
    e.preventDefault()
    apri()
  } else if (k === 'x') {
    e.preventDefault()
    e.currentTarget.querySelector<HTMLButtonElement>('.tk-riga-check button')?.click()
  } else if (k === 'p') {
    e.preventDefault()
    e.currentTarget.querySelector<HTMLButtonElement>('[data-tk-posticipa]')?.click()
  } else if (k === 'i') {
    e.preventDefault()
    e.currentTarget.querySelector<HTMLButtonElement>('[data-tk-copia-id]')?.click()
  }
}

/** j/k: sposta il fuoco tra le righe visibili della pagina (attributo data-tk-riga). */
export function spostaFuocoRiga(direzione: 1 | -1) {
  const righe = Array.from(document.querySelectorAll<HTMLElement>('[data-tk-riga]'))
  if (!righe.length) return
  const i = righe.findIndex((el) => el === document.activeElement || el.contains(document.activeElement))
  const prossima = righe[i < 0 ? (direzione === 1 ? 0 : righe.length - 1) : Math.min(righe.length - 1, Math.max(0, i + direzione))]
  prossima.focus()
  prossima.scrollIntoView({ block: 'nearest' })
}

/** Liste navigabili: tutte quelle visibili e non archiviate (in config arrivano solo le visibili). */
export const listeNavigabili = (config: TaskConfig): TaskLista[] =>
  config.liste.filter((l) => !l.archiviata)

/**
 * La selezione è ancora valida con questa config? Una lista o cartella non più visibile (o archiviata)
 * non lo è: la pagina torna a "I miei task".
 */
export function selezioneValida(config: TaskConfig, s: TaskSelezione): boolean {
  if (s === 'miei') return true
  if (s === 'tutti') return true
  const lista = listaDaSelezione(s)
  if (lista != null) return config.liste.some((l) => l.id === lista && !l.archiviata)
  const cartella = cartellaDaSelezione(s)
  return cartella != null && config.cartelle.some((c) => c.id === cartella && !c.archiviata)
}

/** Campi riconosciuti nel testo della creazione rapida (scadenza, @persone, !priorità, ~stima, #etichette, /lista). */
export type TaskCreaRapidoExtra = Partial<Omit<CreaTaskRequest, 'titolo' | 'stato'>>
/** Creazione rapida da elenco, kanban o calendario. */
export type TaskCreaRapido = (titolo: string, stato: TaskStato, extra?: TaskCreaRapidoExtra) => Promise<boolean>

/** Sottotask creato dalla riga del task principale, senza aprirlo (il «+» accanto al titolo, come su ClickUp). */
export type TaskCreaSottotask = (principale: TaskRiga, titolo: string, extra?: TaskCreaRapidoExtra) => Promise<boolean>

/** Dal risultato del parser ai soli campi riconosciuti. */
export function extraDaQuickAdd(p: QuickAddRisultato): TaskCreaRapidoExtra | undefined {
  const extra: TaskCreaRapidoExtra = {}
  if (p.scadenza) extra.scadenza = p.scadenza
  if (p.scadenza && p.scadenzaOra) extra.scadenzaOra = p.scadenzaOra
  if (p.assegnatariIds.length) extra.assegnatariIds = p.assegnatariIds
  if (p.priorita) extra.priorita = p.priorita
  if (p.stimaMinuti) extra.stimaMinuti = p.stimaMinuti
  if (p.etichettaIds.length) extra.etichettaIds = p.etichettaIds
  if (p.listaId) extra.listaId = p.listaId
  return Object.keys(extra).length ? extra : undefined
}

/**
 * Stessa modifica (o eliminazione) su più task. Completandoli, se fra le `righe` ci sono task principali con
 * sottotask aperti chiede una volta sola se completare anche quelli; annullando non cambia niente (false).
 */
export async function eseguiBulk(ids: number[], valori: AggiornaTaskValori | null, elimina = false, righe?: TaskRiga[]): Promise<boolean> {
  if (!elimina && valori?.stato === 'COMPLETATO' && righe) {
    const scelti = new Set(ids)
    const principali = righe.filter((r) => scelti.has(r.id) && r.parentId == null && (r.sottotaskAperti ?? 0) > 0)
    const aperti = principali.reduce((n, r) => n + r.sottotaskAperti, 0)
    if (aperti > 0) {
      if (!(await chiediCompletaSottotask(principali[0].titolo, aperti, principali.length))) return false
      valori = { ...valori, completaSottotask: true }
    }
  }
  try {
    const r = await taskService.bulk(ids, valori, elimina)
    const msg = elimina
      ? (ids.length === 1 && r.aggiornati === 1 ? 'Task eliminato' : `${r.aggiornati} task eliminati`)
      : `${r.aggiornati} task aggiornati`
    if (r.saltati) toast.warning(msg, { description: `${r.saltati} ${r.saltati === 1 ? 'è stato saltato' : 'sono stati saltati'}` })
    else toast.success(msg)
    emitTaskChanged()
    return true
  } catch (e) {
    toast.error(messaggioErrore(e, elimina ? 'Eliminazione non riuscita' : 'Modifica multipla non riuscita'))
    return false
  }
}
