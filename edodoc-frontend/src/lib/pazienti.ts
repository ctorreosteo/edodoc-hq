import { addDays, format, getDay, isSameDay, parseISO } from "date-fns"
import { it } from "date-fns/locale"
import { giorniDa } from "@/lib/finance"
import type { Paziente } from "@/types"

export type Motivo = "PAGAMENTO" | "FINE_PERCORSO" | "CHECK" | "VISITA"
export type Tono = "danger" | "warn" | "info"
export type Ordine = "PRIORITA" | "VISITA" | "COGNOME"

/** Stessa finestra della Dashboard, "Rinnovi in arrivo". */
const GIORNI_RINNOVI = 60

export const MOTIVI: Motivo[] = ["PAGAMENTO", "FINE_PERCORSO", "CHECK", "VISITA"]

export const TONO_MOTIVO: Record<Motivo, Tono> = { PAGAMENTO: "danger", FINE_PERCORSO: "warn", CHECK: "warn", VISITA: "info" }

const PESO: Record<Motivo, number> = { PAGAMENTO: 8, FINE_PERCORSO: 4, CHECK: 2, VISITA: 1 }

export const inPercorso = (p: Paziente) => p.stato === "ATTIVO" || p.stato === "MANTENIMENTO"

/** Sabato e domenica il check è quello del lunedì in arrivo: chi non l'ha ancora inviato è nei tempi. */
export const checkInRaccolta = (oggi: Date) => [0, 6].includes(getDay(oggi))

export type Lettura = { p: Paziente; motivi: Motivo[]; checkAssente: boolean; rimanenti: number | null; punteggio: number }

export function leggiPaziente(p: Paziente, oggi: Date): Lettura {
  const percorso = p.percorso
  const checkAssente = inPercorso(p) && !p.checkSettimana
  const motivi: Motivo[] = []
  if (p.situazionePagamenti === "SCADUTO") motivi.push("PAGAMENTO")
  if (percorso && giorniDa(percorso.dataFine) <= GIORNI_RINNOVI) motivi.push("FINE_PERCORSO")
  if (checkAssente && !checkInRaccolta(oggi)) motivi.push("CHECK")
  if (percorso && inPercorso(p) && !p.prossimaVisita && percorso.visiteFissate < percorso.visiteTotali) motivi.push("VISITA")
  return {
    p,
    motivi,
    checkAssente,
    rimanenti: percorso ? Math.max(0, percorso.visiteTotali - percorso.visiteEffettuate) : null,
    punteggio: motivi.reduce((s, m) => s + PESO[m], 0),
  }
}

export const tonoDi = (motivi: Motivo[]): Tono | undefined => (motivi.length ? TONO_MOTIVO[motivi[0]] : undefined)

const perCognome = (a: Lettura, b: Lettura) => `${a.p.cognome} ${a.p.nome}`.localeCompare(`${b.p.cognome} ${b.p.nome}`, "it")
const perVisita = (a: Lettura, b: Lettura) => {
  if (a.p.prossimaVisita && b.p.prossimaVisita) return a.p.prossimaVisita.localeCompare(b.p.prossimaVisita)
  return a.p.prossimaVisita ? -1 : b.p.prossimaVisita ? 1 : 0
}

export function ordina(letture: Lettura[], ordine: Ordine) {
  const confronto = ordine === "VISITA" ? (a: Lettura, b: Lettura) => perVisita(a, b) || perCognome(a, b)
    : ordine === "COGNOME" ? perCognome
    : (a: Lettura, b: Lettura) => b.punteggio - a.punteggio || perVisita(a, b) || perCognome(a, b)
  return [...letture].sort(confronto)
}

/** Divide l'elenco in tre: serve qualcosa, tutto a posto, fuori percorso. */
export function gruppi(letture: Lettura[]) {
  return [
    { titolo: "Da seguire", voci: letture.filter((l) => l.motivi.length > 0) },
    { titolo: "In regola", voci: letture.filter((l) => l.motivi.length === 0 && inPercorso(l.p)) },
    { titolo: "Fuori percorso", voci: letture.filter((l) => l.motivi.length === 0 && !inPercorso(l.p)) },
  ].filter((g) => g.voci.length > 0)
}

export function etichettaMotivo(motivo: Motivo, conteggio: number, oggi: Date) {
  const uno = conteggio === 1
  if (motivo === "PAGAMENTO") return uno ? "Pagamento scaduto" : "Pagamenti scaduti"
  if (motivo === "FINE_PERCORSO") return uno ? "Percorso in fine" : "Percorsi in fine"
  if (motivo === "VISITA") return uno ? "Visita da fissare" : "Visite da fissare"
  if (checkInRaccolta(oggi)) return uno ? "Check in arrivo" : "Check in arrivo"
  return uno ? "Check mancante" : "Check mancanti"
}

export function fineDelPercorso(dataFine: string) {
  const giorni = giorniDa(dataFine)
  if (giorni < 0) return giorni === -1 ? "Finito ieri" : `Finito da ${-giorni} giorni`
  if (giorni === 0) return "Finisce oggi"
  if (giorni === 1) return "Finisce domani"
  return `Finisce tra ${giorni} giorni`
}

/** Oggi e domani a parole, il resto con il giorno: la data intera non serve a colpo d'occhio. */
export function quandoVisita(iso: string, oggi: Date) {
  const giorno = parseISO(iso)
  const ora = format(giorno, "HH:mm")
  if (isSameDay(giorno, oggi)) return { testo: `Oggi, ${ora}`, vicina: true }
  if (isSameDay(giorno, addDays(oggi, 1))) return { testo: `Domani, ${ora}`, vicina: true }
  const data = format(giorno, "EEE d MMM", { locale: it })
  return { testo: `${data.charAt(0).toUpperCase()}${data.slice(1)}, ${ora}`, vicina: false }
}

export const entroSetteGiorni = (iso: string | null) => iso != null && giorniDa(iso.slice(0, 10)) <= 7
