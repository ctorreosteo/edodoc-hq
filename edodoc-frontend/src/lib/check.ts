import { addDays, format, getDay, startOfWeek } from "date-fns"
import type { RigaCheck } from "@/types"

export type Giro = "LUNEDI" | "MERCOLEDI"
export type Filtro = "TUTTI" | "SOLLECITO" | "MESSAGGIO_DEDICATO"

export const GIRI: { giro: Giro; nome: string; breve: string; del: string }[] = [
  { giro: "LUNEDI", nome: "Lunedì", breve: "Lun", del: "del lunedì" },
  { giro: "MERCOLEDI", nome: "Mercoledì", breve: "Mer", del: "del mercoledì" },
]

export const nomeGiro = (giro: Giro) => GIRI.find((g) => g.giro === giro)!

/** Prima chi ha bisogno di attenzione: l'ordine è la lista di lavoro. */
export const CORSIE = [
  { azione: "MESSAGGIO_DEDICATO", titolo: "Messaggi dedicati", spiega: "Un segnale o più: serve un messaggio scritto per loro" },
  { azione: "SOLLECITO", titolo: "Solleciti", spiega: "Check non arrivato: manda il vocale" },
  { azione: "MESSAGGIO_STANDARD", titolo: "Motivazionali", spiega: "Nessun segnale: basta il messaggio motivazionale" },
] as const

/** Come `settimanaDi` del backend: chi compila sabato o domenica risponde già al lunedì in arrivo. */
export function settimanaDi(giorno: Date) {
  const g = getDay(giorno)
  const lunedi = g === 6 ? addDays(giorno, 2) : g === 0 ? addDays(giorno, 1) : startOfWeek(giorno, { weekStartsOn: 1 })
  return format(lunedi, "yyyy-MM-dd")
}

export type Momento = "passata" | "in-arrivo" | "in-corso" | "futura"

export function momentoSettimana(settimana: string, oggi: Date): Momento {
  const corrente = settimanaDi(oggi)
  if (settimana < corrente) return "passata"
  if (settimana > corrente) return "futura"
  return format(oggi, "yyyy-MM-dd") < settimana ? "in-arrivo" : "in-corso"
}

/** Da mercoledì in poi il giro che conta è il secondo; le altre settimane si aprono sul lunedì. */
export function giroPredefinito(settimana: string, oggi: Date): Giro {
  const giorno = getDay(oggi)
  return settimana === settimanaDi(oggi) && giorno >= 3 && giorno <= 5 ? "MERCOLEDI" : "LUNEDI"
}

export const fattoIl = (r: RigaCheck, giro: Giro) => (giro === "LUNEDI" ? r.lunediFattoIl : r.mercolediFattoIl)

export const quantiSegnali = (r: RigaCheck) => (r.check ? [r.check.pesoFermo, r.check.percezioneNegativa, r.check.energiaBassa].filter(Boolean).length : 0)

const posizione = (r: RigaCheck) => CORSIE.findIndex((c) => c.azione === r.azione)

/** La coda: per tipo di messaggio e, tra i dedicati, prima chi ha più segnali. A parità resta l'ordine per cognome. */
export const ordinaCoda = (righe: RigaCheck[]) => [...righe].sort((a, b) => posizione(a) - posizione(b) || quantiSegnali(b) - quantiSegnali(a))

export function corsie(righe: RigaCheck[], giro: Giro) {
  return CORSIE.map((corsia) => {
    const voci = righe.filter((r) => r.azione === corsia.azione)
    return { ...corsia, voci, fatti: voci.filter((r) => fattoIl(r, giro)).length }
  })
}

export const contati = (righe: RigaCheck[], giro: Giro) => righe.filter((r) => fattoIl(r, giro)).length

/** Il prossimo ancora da contattare dopo `id`, ripartendo dall'inizio della coda. */
export function prossimoDa(coda: RigaCheck[], id: number | null, giro: Giro) {
  const da = coda.findIndex((r) => r.pazienteId === id)
  return [...coda.slice(da + 1), ...coda.slice(0, Math.max(da, 0))].find((r) => !fattoIl(r, giro)) ?? null
}

const conta = (n: number, uno: string, tanti: string) => (n === 1 ? `1 ${uno}` : `${n} ${tanti}`)

/** La lettura in una frase: cosa resta del giro e da dove si parte. */
export function fraseGiro(righe: RigaCheck[], giro: Giro, momento: Momento) {
  const { del } = nomeGiro(giro)
  if (righe.length === 0) return "Nessun paziente in percorso per questa settimana."
  if (momento === "futura") return "Questa settimana non è ancora iniziata."

  const [dedicati, solleciti, motivazionali] = corsie(righe, giro).map((c) => c.voci.length - c.fatti)
  const resta = dedicati + solleciti + motivazionali
  if (resta === 0) return `Giro ${del} completato: tutti contattati.`
  if (momento === "passata") return `Settimana chiusa: ${conta(resta, "paziente non contattato", "pazienti non contattati")} nel giro ${del}.`
  const parti = [
    dedicati ? conta(dedicati, "messaggio dedicato", "messaggi dedicati") : null,
    solleciti ? conta(solleciti, "sollecito", "solleciti") : null,
    motivazionali ? conta(motivazionali, "motivazionale", "motivazionali") : null,
  ].filter(Boolean)
  return `Restano ${parti.join(", ").replace(/, ([^,]*)$/, " e $1")}.`
}

export function dividiNome(nome: string) {
  const [primo, ...resto] = nome.trim().split(/\s+/)
  return { primo: primo ?? "", resto: resto.join(" ") }
}

export function inizialiDi(nome: string) {
  const { primo, resto } = dividiNome(nome)
  return `${primo.charAt(0)}${resto.charAt(0)}`.toUpperCase() || "?"
}
