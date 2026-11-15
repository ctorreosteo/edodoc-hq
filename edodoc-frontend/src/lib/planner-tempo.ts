/*
  Date del Planner social, sempre nel fuso di Roma (lo studio), qualunque sia quello del browser.
  Il backend manda ISO con offset e riceve "yyyy-MM-ddTHH:mm" locale di Roma.
*/

const FMT = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

/** "2026-11-20T12:30" (ora di Roma) da un istante ISO o da un Date. */
export function localeRoma(valore: string | Date): string {
  const d = typeof valore === "string" ? new Date(valore) : valore
  return FMT.format(d).replace(" ", "T").slice(0, 16)
}

export function giornoRoma(valore: string | Date): string {
  return localeRoma(valore).slice(0, 10)
}

export function oraRoma(valore: string | Date): string {
  return localeRoma(valore).slice(11, 16)
}

export function oggiRoma(): string {
  return giornoRoma(new Date())
}

/** "yyyy-MM-dd" ± giorni, senza passare dai fusi. */
export function piuGiorni(giorno: string, n: number): string {
  const [y, m, d] = giorno.split("-").map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return t.toISOString().slice(0, 10)
}

/** 1 = lunedì … 7 = domenica. */
export function giornoSettimana(giorno: string): number {
  const [y, m, d] = giorno.split("-").map(Number)
  const g = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return g === 0 ? 7 : g
}

export function inizioSettimana(giorno: string): string {
  return piuGiorni(giorno, 1 - giornoSettimana(giorno))
}

export function inizioMese(giorno: string): string {
  return `${giorno.slice(0, 7)}-01`
}

export function piuMesi(giorno: string, n: number): string {
  const [y, m] = giorno.split("-").map(Number)
  const t = new Date(Date.UTC(y, m - 1 + n, 1))
  return t.toISOString().slice(0, 10)
}

export function giorniNelMese(giorno: string): number {
  const [y, m] = giorno.split("-").map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

const DATA = new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })
const DATA_LUNGA = new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })
const MESE = new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", month: "long", year: "numeric" })

function utc(giorno: string) {
  const [y, m, d] = giorno.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** "ven 20 nov" */
export function etichettaGiorno(giorno: string): string {
  return DATA.format(utc(giorno))
}

/** "venerdì 20 novembre" */
export function etichettaGiornoLunga(giorno: string): string {
  return DATA_LUNGA.format(utc(giorno))
}

/** "novembre 2026" */
export function etichettaMese(giorno: string): string {
  return MESE.format(utc(giorno))
}

/** "ven 20 nov · 12:30" (oggi/domani per i giorni vicini) da un istante ISO. */
export function quandoBreve(iso: string | null | undefined): string {
  if (!iso) return "Senza data"
  const g = giornoRoma(iso)
  const oggi = oggiRoma()
  const nome = g === oggi ? "Oggi" : g === piuGiorni(oggi, 1) ? "Domani" : g === piuGiorni(oggi, -1) ? "Ieri" : etichettaGiorno(g)
  return `${nome} · ${oraRoma(iso)}`
}

/** "fra 2 ore", "3 giorni fa"… */
export function relativo(iso: string | null | undefined, adesso = Date.now()): string {
  if (!iso) return ""
  const diff = new Date(iso).getTime() - adesso
  const abs = Math.abs(diff)
  const min = Math.round(abs / 60000)
  let testo: string
  if (min < 1) testo = "meno di un minuto"
  else if (min < 60) testo = `${min} min`
  else if (min < 60 * 24) testo = `${Math.round(min / 60)} ${Math.round(min / 60) === 1 ? "ora" : "ore"}`
  else testo = `${Math.round(min / 1440)} ${Math.round(min / 1440) === 1 ? "giorno" : "giorni"}`
  return diff >= 0 ? `fra ${testo}` : `${testo} fa`
}
