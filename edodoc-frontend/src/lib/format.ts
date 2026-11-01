import { format, parseISO } from "date-fns"
import { it } from "date-fns/locale"

const EURO = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" })
const EURO_TONDI = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })

export const euro = (valore: number | null | undefined) => EURO.format(valore ?? 0)
export const euroTondi = (valore: number | null | undefined) => EURO_TONDI.format(valore ?? 0)

export const data = (valore?: string | null) => (valore ? format(parseISO(valore), "dd/MM/yyyy") : "—")
export const dataBreve = (valore?: string | null) => (valore ? format(parseISO(valore), "d MMM", { locale: it }) : "—")
export const dataLunga = (valore: string) => format(parseISO(valore), "EEEE d MMMM", { locale: it })
export const ora = (valore: string) => format(parseISO(valore), "HH:mm")
export const dataOra = (valore?: string | null) => (valore ? format(parseISO(valore), "dd/MM/yyyy HH:mm") : "—")

/** 95 → "1:35", 3725 → "1 h 2 min". */
export function durata(secondi?: number | null) {
  const totale = secondi ?? 0
  const minuti = Math.floor(totale / 60)
  if (minuti >= 60) return `${Math.floor(minuti / 60)} h ${minuti % 60} min`
  return `${minuti}:${String(totale % 60).padStart(2, "0")}`
}

/** Numero per wa.me: solo cifre, prefisso italiano se manca. */
export function linkWhatsapp(cellulare?: string | null): string | null {
  const cifre = (cellulare ?? "").replace(/\D/g, "")
  if (!cifre) return null
  const numero = cifre.startsWith("39") || cifre.length > 10 ? cifre : `39${cifre}`
  return `https://wa.me/${numero}`
}
