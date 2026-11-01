import { parseISO } from "date-fns"
import { useEffect, useState } from "react"
import { dataBreve, euroTondi } from "@/lib/format"
import { giorniDa } from "@/lib/finance"
import type { Dashboard, Task, Visita } from "@/types"

const MINUTO = 60000
const LIBERO_MINIMO = 30

/** L'ora che scorre: tiene vivo il conto alla rovescia, anche al ritorno da un'altra scheda. */
export function useAdesso(passo = 20000) {
  const [adesso, setAdesso] = useState(() => new Date())
  useEffect(() => {
    const aggiorna = () => setAdesso(new Date())
    const timer = window.setInterval(aggiorna, passo)
    document.addEventListener("visibilitychange", aggiorna)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", aggiorna)
    }
  }, [passo])
  return adesso
}

export const conta = (n: number, uno: string, tanti: string) => `${n} ${n === 1 ? uno : tanti}`

function elenco(voci: string[]) {
  if (voci.length < 2) return voci.join("")
  return `${voci.slice(0, -1).join(", ")} e ${voci[voci.length - 1]}`
}

/** 95 → 1 h e 35 min, spezzati perché numeri e unità hanno pesi diversi. */
export function partiTempo(minuti: number) {
  const ore = Math.floor(minuti / 60)
  const resto = minuti % 60
  const parti: { numero: number; unita: string }[] = []
  if (ore) parti.push({ numero: ore, unita: "h" })
  if (resto || !ore) parti.push({ numero: resto, unita: "min" })
  return parti
}

export const testoTempo = (minuti: number) => partiTempo(minuti).map((p) => `${p.numero} ${p.unita}`).join(" ")

export type Fase = "fatta" | "saltata" | "da-segnare" | "in-corso" | "prossima" | "dopo"
export type Tappa = { visita: Visita; fase: Fase }
export type VoceFilo =
  | { tipo: "tappa"; tappa: Tappa }
  | { tipo: "libero"; minuti: number }
  | { tipo: "adesso"; minuti: number | null }

export type Scena =
  | { tipo: "in-corso"; visita: Visita; minuti: number; poi: Visita | null }
  | { tipo: "prossima"; visita: Visita; minuti: number; poi: Visita | null }
  | { tipo: "finita"; daSegnare: Visita[]; effettuate: number; saltate: number }
  | { tipo: "vuota" }

const istante = (valore: string) => parseISO(valore).getTime()

function faseDi(visita: Visita, ora: number): Fase {
  if (visita.stato === "EFFETTUATA") return "fatta"
  if (visita.stato === "NON_PRESENTATO") return "saltata"
  if (istante(visita.fine) <= ora) return "da-segnare"
  return istante(visita.inizio) <= ora ? "in-corso" : "dopo"
}

/** La giornata letta dall'orologio: cosa è passato, cosa è in corso, cosa viene dopo. */
export function leggiGiornata(visite: Visita[], adesso: Date) {
  const ora = adesso.getTime()
  const ordinate = visite.filter((v) => v.stato !== "ANNULLATA").sort((a, b) => istante(a.inizio) - istante(b.inizio))
  const tappe: Tappa[] = ordinate.map((visita) => ({ visita, fase: faseDi(visita, ora) }))
  const inCorso = tappe.find((t) => t.fase === "in-corso")
  const future = tappe.filter((t) => t.fase === "dopo")
  if (!inCorso && future[0]) future[0].fase = "prossima"

  const voci: VoceFilo[] = []
  let segnato = Boolean(inCorso)
  let fineMassima = 0
  for (const tappa of tappe) {
    const inizio = istante(tappa.visita.inizio)
    if (!segnato && inizio > ora) {
      voci.push({ tipo: "adesso", minuti: Math.ceil((inizio - ora) / MINUTO) })
      segnato = true
    } else if (inizio > ora && fineMassima && inizio - fineMassima >= LIBERO_MINIMO * MINUTO) {
      voci.push({ tipo: "libero", minuti: Math.round((inizio - fineMassima) / MINUTO) })
    }
    voci.push({ tipo: "tappa", tappa })
    fineMassima = Math.max(fineMassima, istante(tappa.visita.fine))
  }
  if (!segnato && tappe.length) voci.push({ tipo: "adesso", minuti: null })

  return { tappe, voci, scena: scegliScena(tappe, inCorso, future, ora) }
}

function scegliScena(tappe: Tappa[], inCorso: Tappa | undefined, future: Tappa[], ora: number): Scena {
  if (inCorso) {
    return { tipo: "in-corso", visita: inCorso.visita, minuti: Math.ceil((istante(inCorso.visita.fine) - ora) / MINUTO), poi: future[0]?.visita ?? null }
  }
  if (future[0]) {
    return { tipo: "prossima", visita: future[0].visita, minuti: Math.ceil((istante(future[0].visita.inizio) - ora) / MINUTO), poi: future[1]?.visita ?? null }
  }
  if (!tappe.length) return { tipo: "vuota" }
  return {
    tipo: "finita",
    daSegnare: tappe.filter((t) => t.fase === "da-segnare").map((t) => t.visita),
    effettuate: tappe.filter((t) => t.fase === "fatta").length,
    saltate: tappe.filter((t) => t.fase === "saltata").length,
  }
}

/** Il riassunto sotto il saluto: solo ciò che chiede attenzione. */
export function fraseGiornata(d: Dashboard, visite: number) {
  const urgenze = [
    d.taskInRitardo ? conta(d.taskInRitardo, "task in ritardo", "task in ritardo") : null,
    d.checkConSegnali ? conta(d.checkConSegnali, "messaggio dedicato", "messaggi dedicati") : null,
    d.scaduto > 0 ? `${euroTondi(d.scaduto)} scaduti` : null,
  ].filter((v): v is string => v !== null)
  const giornata = visite ? `${conta(visite, "visita", "visite")} oggi` : "Nessuna visita oggi"
  return urgenze.length ? `${giornata}, poi ${elenco(urgenze)}.` : `${giornata}, nessuna urgenza.`
}

export type Tono = "danger" | "warn" | "info" | "ok" | "muted"
export type Segnale = { chiave: string; tono: Tono; valore: string; titolo: string; dettaglio: string; a: string }

/** Cosa chiede attenzione fuori dai task. Il giro dei contatti è di lunedì, o di mercoledì nel suo giorno: stessa regola del backend. */
export function segnali(d: Dashboard, adesso: Date) {
  const voci: Segnale[] = []
  if (d.checkConSegnali > 0) {
    voci.push({
      chiave: "dedicati", tono: "danger", valore: String(d.checkConSegnali), a: "/check",
      titolo: d.checkConSegnali === 1 ? "Messaggio dedicato" : "Messaggi dedicati",
      dettaglio: "Check con peso fermo, percezione negativa o energia bassa",
    })
  }
  if (d.scaduto > 0) {
    voci.push({
      chiave: "scaduti", tono: "danger", valore: euroTondi(d.scaduto), a: "/pagamenti",
      titolo: "Pagamenti scaduti", dettaglio: `${euroTondi(d.daIncassare)} da incassare in tutto`,
    })
  }
  if (d.daContattareOggi > 0) {
    voci.push({
      chiave: "contatti", tono: "info", valore: String(d.daContattareOggi), a: "/check",
      titolo: d.daContattareOggi === 1 ? "Paziente da contattare" : "Pazienti da contattare",
      dettaglio: adesso.getDay() === 3 ? "Giro del mercoledì" : "Giro del lunedì",
    })
  }
  return voci
}

export function quandoTask(task: Task): { testo: string; tono: Tono } {
  if (!task.scadenza) return { testo: "Senza scadenza", tono: "muted" }
  const giorni = giorniDa(task.scadenza)
  if (giorni < 0) return { testo: giorni === -1 ? "Da ieri" : `Da ${-giorni} giorni`, tono: "danger" }
  if (giorni === 0) return { testo: "Oggi", tono: "warn" }
  if (giorni === 1) return { testo: "Domani", tono: "muted" }
  return { testo: `Entro il ${dataBreve(task.scadenza)}`, tono: "muted" }
}

export function gruppiTask(task: Task[]) {
  const oggi = task.filter((t) => !t.inRitardo && t.scadenza !== null && giorniDa(t.scadenza) === 0)
  return [
    { chiave: "ritardo", titolo: "In ritardo", righe: task.filter((t) => t.inRitardo) },
    { chiave: "oggi", titolo: "Oggi", righe: oggi },
    { chiave: "poi", titolo: "Prossimi", righe: task.filter((t) => !t.inRitardo && !oggi.includes(t)) },
  ].filter((g) => g.righe.length > 0)
}

/** Il backend prende i percorsi attivi finiti da non più di 30 giorni o in chiusura entro 60. */
export function quandoFinisce(dataFine: string): { testo: string; tono: Tono } {
  const giorni = giorniDa(dataFine)
  if (giorni < 0) return { testo: giorni === -1 ? "Finito ieri" : `Finito da ${-giorni} giorni`, tono: "danger" }
  if (giorni === 0) return { testo: "Finisce oggi", tono: "danger" }
  if (giorni === 1) return { testo: "Finisce domani", tono: "warn" }
  return { testo: `Tra ${giorni} giorni`, tono: giorni <= 14 ? "warn" : "muted" }
}

/** La soglia non arriva dal backend, ma il margine è soglia meno incassato dell'anno: si ricava da lì. */
export function letturaSoglia(d: Dashboard) {
  const soglia = d.incassatoAnno + d.margineSoglia
  const scala = Math.max(soglia, d.incassatoAnno, 1)
  const superata = d.margineSoglia < 0
  return {
    soglia,
    tono: (superata ? "danger" : d.candidatureAperte ? "ok" : "warn") as Tono,
    titolo: superata ? `Soglia superata di ${euroTondi(-d.margineSoglia)}` : `${euroTondi(d.margineSoglia)} alla soglia`,
    testo: d.candidatureAperte ? "Candidature aperte" : "Candidature da chiudere",
    riempimento: (d.incassatoAnno / scala) * 100,
    tacca: (soglia / scala) * 100,
  }
}
