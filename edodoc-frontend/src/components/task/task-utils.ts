import type React from "react"
import { addDays, differenceInCalendarDays, endOfMonth, endOfWeek, format, isSameDay, parseISO, startOfMonth, startOfWeek } from "date-fns"
import { it } from "date-fns/locale"
import type { Task, TaskForm } from "@/types"

/** Cosa mostra la pagina: "miei", "tutti", "lista:ID" o "cartella:ID". */
export type TaskSelezione = string
export type TaskVista = "lista" | "kanban" | "calendario"
/** Filtro scelto dalla frase riepilogo dell'intestazione. */
export type TaskFiltroRapido = "ritardo" | "oggi" | "settimana" | "senza" | null
export type TaskOrdinamentoCampo = "scadenza" | "priorita" | "titolo"
export type TaskOrdinamento = { campo: TaskOrdinamentoCampo; dir: "asc" | "desc" }
export type TaskCalendarioModo = "mese" | "settimana"
export type TaskFiltri = { priorita: string | null; soloAutomatici: boolean }
export type TaskModifica = Partial<Pick<Task, "scadenza" | "priorita" | "lista">>
export type TaskCreaRapido = (titolo: string, extra?: { scadenza?: string; priorita?: string }) => Promise<boolean>

export const PRIORITA_VALORI = ["ALTA", "MEDIA", "BASSA"]
const PESO_PRIORITA: Record<string, number> = { ALTA: 0, MEDIA: 1, BASSA: 2 }

export const eFatto = (t: Task) => t.stato === "FATTO"
export const isoGiorno = (d: Date) => format(d, "yyyy-MM-dd")
export const giorniDa = (inizio: Date, n: number) => Array.from({ length: n }, (_, i) => addDays(inizio, i))

/** Il task come lo vuole il PUT: il backend riceve sempre tutti i campi. */
export const corpoTask = (t: Task): TaskForm => ({
  listaId: t.lista.id, titolo: t.titolo, descrizione: t.descrizione, scadenza: t.scadenza, priorita: t.priorita, pazienteId: t.pazienteId,
})

export function ordina(righe: Task[], o: TaskOrdinamento): Task[] {
  const segno = o.dir === "asc" ? 1 : -1
  return [...righe].sort((a, b) => {
    let c = 0
    if (o.campo === "scadenza") {
      // Senza scadenza sempre in fondo, in entrambi i versi
      if (!a.scadenza && !b.scadenza) c = 0
      else if (!a.scadenza) return 1
      else if (!b.scadenza) return -1
      else c = a.scadenza.localeCompare(b.scadenza)
    } else if (o.campo === "priorita") {
      c = (PESO_PRIORITA[a.priorita] ?? 9) - (PESO_PRIORITA[b.priorita] ?? 9)
    } else {
      c = a.titolo.localeCompare(b.titolo, "it", { sensitivity: "base" })
    }
    return c * segno || b.id - a.id
  })
}

export type GruppoScadenza = "ritardo" | "oggi" | "domani" | "settimana" | "avanti" | "senza"

export const GRUPPI_SCADENZA: { key: GruppoScadenza; label: string }[] = [
  { key: "ritardo", label: "In ritardo" },
  { key: "oggi", label: "Oggi" },
  { key: "domani", label: "Domani" },
  { key: "settimana", label: "Prossimi 7 giorni" },
  { key: "avanti", label: "Più avanti" },
  { key: "senza", label: "Senza scadenza" },
]

export function gruppoScadenza(t: Task, oggi = new Date()): GruppoScadenza {
  if (!t.scadenza) return "senza"
  const giorni = differenceInCalendarDays(parseISO(t.scadenza), oggi)
  if (giorni < 0) return "ritardo"
  if (giorni === 0) return "oggi"
  if (giorni === 1) return "domani"
  return giorni <= 7 ? "settimana" : "avanti"
}

/** "settimana" = da domani a +7: comprende i gruppi Domani e Prossimi 7 giorni. */
export function inFiltroRapido(f: TaskFiltroRapido, g: GruppoScadenza): boolean {
  if (!f) return true
  return f === "settimana" ? g === "domani" || g === "settimana" : g === f
}

/** "Oggi", "Domani", "Ieri", "lun 3 nov", "3 nov 2027". */
export function formatScadenza(scadenza: string | null | undefined): string {
  if (!scadenza) return ""
  const d = parseISO(scadenza)
  const oggi = new Date()
  if (isSameDay(d, oggi)) return "Oggi"
  if (isSameDay(d, addDays(oggi, 1))) return "Domani"
  if (isSameDay(d, addDays(oggi, -1))) return "Ieri"
  return format(d, d.getFullYear() === oggi.getFullYear() ? "EEE d MMM" : "d MMM yyyy", { locale: it })
}

/** Intervallo visibile (inclusivo) del calendario, settimane da lunedì. */
export function intervalloCalendario(riferimento: Date, modo: TaskCalendarioModo): { da: Date; a: Date } {
  if (modo === "settimana") {
    return { da: startOfWeek(riferimento, { weekStartsOn: 1 }), a: endOfWeek(riferimento, { weekStartsOn: 1 }) }
  }
  return { da: startOfWeek(startOfMonth(riferimento), { weekStartsOn: 1 }), a: endOfWeek(endOfMonth(riferimento), { weekStartsOn: 1 }) }
}

/** Aggiunta rapida: "oggi", "domani", "dopodomani" e "!alta" in fondo al testo diventano scadenza e priorità. */
export function parseRapido(testo: string, oggi = new Date()) {
  const extra: { scadenza?: string; priorita?: string } = {}
  const parole = testo.trim().split(/\s+/)
  while (parole.length > 1) {
    const ultima = parole[parole.length - 1].toLowerCase()
    const priorita = ultima.startsWith("!") ? ultima.slice(1).toUpperCase() : null
    const giorni = { oggi: 0, domani: 1, dopodomani: 2 }[ultima]
    if (priorita && PRIORITA_VALORI.includes(priorita) && !extra.priorita) extra.priorita = priorita
    else if (giorni !== undefined && !extra.scadenza) extra.scadenza = isoGiorno(addDays(oggi, giorni))
    else break
    parole.pop()
  }
  return { titolo: parole.join(" "), extra }
}

/** Il focus è in un campo di testo: le scorciatoie da tastiera non devono scattare. */
export function staScrivendo(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable
}

/** Tasti di una riga a fuoco: Invio/spazio apre, X completa, P posticipa (cliccano i controlli della riga). */
export function tastiRiga(e: React.KeyboardEvent<HTMLElement>, apri: () => void) {
  if (e.target !== e.currentTarget || e.metaKey || e.ctrlKey || e.altKey) return
  const k = e.key.toLowerCase()
  if (k === "enter" || k === " ") {
    e.preventDefault()
    apri()
  } else if (k === "x") {
    e.preventDefault()
    e.currentTarget.querySelector<HTMLButtonElement>(".tk-riga-check button")?.click()
  } else if (k === "p") {
    e.preventDefault()
    e.currentTarget.querySelector<HTMLButtonElement>("[data-tk-posticipa]")?.click()
  }
}

/** j/k: sposta il fuoco tra le righe visibili della pagina (attributo data-tk-riga). */
export function spostaFuocoRiga(direzione: 1 | -1) {
  const righe = Array.from(document.querySelectorAll<HTMLElement>("[data-tk-riga]"))
  if (!righe.length) return
  const i = righe.findIndex((el) => el === document.activeElement || el.contains(document.activeElement))
  const prossima = righe[i < 0 ? (direzione === 1 ? 0 : righe.length - 1) : Math.min(righe.length - 1, Math.max(0, i + direzione))]
  prossima.focus()
  prossima.scrollIntoView({ block: "nearest" })
}
