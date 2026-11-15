import {
  addDays, endOfDay, endOfMonth, endOfQuarter, endOfYear, format, isWithinInterval, parseISO, startOfDay, startOfMonth,
  startOfQuarter, startOfYear, subDays,
} from "date-fns"
import { it } from "date-fns/locale"
import type { SheetTone } from "@/components/ui/sheet-kit"
import type { EsitoPrenotazione, Prenotazione, RispostaInvito, StatoPrenotazione } from "@/types"

type Etichetta = { testo: string; tono: SheetTone }

export const STATO_PRENOTAZIONE: Record<StatoPrenotazione, Etichetta & { breve: string }> = {
  IN_PROGRAMMA: { testo: "In programma", breve: "In programma", tono: "info" },
  DA_CHIUDERE: { testo: "Da chiudere", breve: "Da chiudere", tono: "warn" },
  SVOLTA: { testo: "Svolta", breve: "Svolte", tono: "ok" },
  NON_PRESENTATO: { testo: "Non presentato", breve: "Non presentati", tono: "danger" },
  DISDETTA: { testo: "Disdetta", breve: "Disdette", tono: "violet" },
  ANNULLATA: { testo: "Annullata", breve: "Annullate", tono: "muted" },
}
export const ORDINE_STATI: StatoPrenotazione[] = ["DA_CHIUDERE", "IN_PROGRAMMA", "SVOLTA", "NON_PRESENTATO", "DISDETTA", "ANNULLATA"]

export const RISPOSTA_INVITO: Record<RispostaInvito, Etichetta> = {
  ACCETTATO: { testo: "Accettato", tono: "ok" },
  IN_ATTESA: { testo: "In attesa", tono: "muted" },
  FORSE: { testo: "Forse", tono: "warn" },
  RIFIUTATO: { testo: "Rifiutato", tono: "danger" },
}

export const ESITO: Record<EsitoPrenotazione, Etichetta> = {
  ACQUISTATO: { testo: "Ha acquistato", tono: "ok" },
  INTERESSATO: { testo: "Interessato", tono: "accent" },
  CI_PENSA: { testo: "Ci pensa", tono: "warn" },
  NON_ADATTO: { testo: "Non adatto", tono: "muted" },
}

// ───────── periodo, come nei filtri di Mobilitas ─────────

export type Periodo = "prossimi_7" | "ultimi_7" | "mese" | "trimestre" | "semestre" | "anno" | "giorno" | "intervallo" | "sempre"
export type CampoData = "chiamata" | "prenotazione"

export const PERIODI: Record<Periodo, string> = {
  prossimi_7: "Prossimi 7 giorni", ultimi_7: "Ultimi 7 giorni", mese: "Mese", trimestre: "Trimestre", semestre: "Semestre",
  anno: "Anno", giorno: "Giorno", intervallo: "Intervallo", sempre: "Sempre",
}

export const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"]

export type Filtri = {
  campo: CampoData
  periodo: Periodo
  mese: number
  trimestre: number
  semestre: number
  anno: number
  giorno: string
  da: string
  a: string
  stati: StatoPrenotazione[]
  esito: "TUTTI" | "NESSUNO" | EsitoPrenotazione
  invito: "TUTTI" | RispostaInvito
  ricerca: string
}

export function filtriIniziali(oggi = new Date()): Filtri {
  const ymd = format(oggi, "yyyy-MM-dd")
  return {
    campo: "chiamata", periodo: "mese", mese: oggi.getMonth(), trimestre: Math.floor(oggi.getMonth() / 3), semestre: oggi.getMonth() < 6 ? 0 : 1,
    anno: oggi.getFullYear(), giorno: ymd, da: format(startOfMonth(oggi), "yyyy-MM-dd"), a: format(endOfMonth(oggi), "yyyy-MM-dd"),
    stati: [], esito: "TUTTI", invito: "TUTTI", ricerca: "",
  }
}

/** Intervallo chiuso del periodo scelto, oppure null per "Sempre". */
export function intervallo(f: Filtri, oggi = new Date()): { start: Date; end: Date } | null {
  switch (f.periodo) {
    case "prossimi_7": return { start: startOfDay(oggi), end: endOfDay(addDays(oggi, 6)) }
    case "ultimi_7": return { start: startOfDay(subDays(oggi, 6)), end: endOfDay(oggi) }
    case "mese": return { start: new Date(f.anno, f.mese, 1), end: endOfMonth(new Date(f.anno, f.mese, 1)) }
    case "trimestre": return { start: startOfQuarter(new Date(f.anno, f.trimestre * 3, 1)), end: endOfQuarter(new Date(f.anno, f.trimestre * 3, 1)) }
    case "semestre": return { start: new Date(f.anno, f.semestre * 6, 1), end: endOfMonth(new Date(f.anno, f.semestre * 6 + 5, 1)) }
    case "anno": return { start: startOfYear(new Date(f.anno, 0, 1)), end: endOfYear(new Date(f.anno, 0, 1)) }
    case "giorno": return f.giorno ? { start: startOfDay(parseISO(f.giorno)), end: endOfDay(parseISO(f.giorno)) } : null
    case "intervallo": {
      if (!f.da || !f.a) return null
      const [x, y] = f.da <= f.a ? [f.da, f.a] : [f.a, f.da]
      return { start: startOfDay(parseISO(x)), end: endOfDay(parseISO(y)) }
    }
    case "sempre": return null
  }
}

export function nelPeriodo(p: Prenotazione, f: Filtri, oggi = new Date()) {
  const r = intervallo(f, oggi)
  if (!r) return true
  return isWithinInterval(parseISO(f.campo === "chiamata" ? p.inizio : p.createdAt), r)
}

export function etichettaPeriodo(f: Filtri) {
  switch (f.periodo) {
    case "mese": return `${MESI[f.mese]} ${f.anno}`
    case "trimestre": return `${f.trimestre + 1}° trimestre ${f.anno}`
    case "semestre": return `${f.semestre + 1}° semestre ${f.anno}`
    case "anno": return String(f.anno)
    case "giorno": return f.giorno ? format(parseISO(f.giorno), "d MMMM yyyy", { locale: it }) : "Giorno"
    case "intervallo": return `${f.da ? format(parseISO(f.da), "d MMM", { locale: it }) : "…"} – ${f.a ? format(parseISO(f.a), "d MMM yyyy", { locale: it }) : "…"}`
    default: return PERIODI[f.periodo]
  }
}

export function corrisponde(p: Prenotazione, testo: string) {
  const t = testo.trim().toLowerCase()
  if (!t) return true
  return `${p.nome} ${p.cognome} ${p.cognome} ${p.nome} ${p.email ?? ""} ${p.cellulare ?? ""} ${p.obiettivo ?? ""} ${p.messaggio ?? ""}`
    .toLowerCase().includes(t)
}

/** Chiamata vicina: oggi, domani, oppure il giorno della settimana. */
export function quandoRelativo(iso: string, oggi = new Date()) {
  const d = parseISO(iso)
  const giorni = Math.round((startOfDay(d).getTime() - startOfDay(oggi).getTime()) / 86_400_000)
  if (giorni === 0) return "Oggi"
  if (giorni === 1) return "Domani"
  if (giorni === -1) return "Ieri"
  if (giorni > 1 && giorni < 7) return `Tra ${giorni} giorni`
  if (giorni < -1 && giorni > -7) return `${-giorni} giorni fa`
  return null
}
