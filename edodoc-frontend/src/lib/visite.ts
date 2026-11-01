import { differenceInCalendarDays, differenceInMinutes, format, isSameDay, parseISO } from "date-fns"
import { it } from "date-fns/locale"
import { MODALITA_VISITA, STATO_VISITA, SYNC_GOOGLE, TIPO_VISITA } from "@/lib/etichette"
import { formatDateOnlyLocal } from "@/lib/utils"
import type { Visita } from "@/types"

const ORE_DEL_GIORNO = 24
const INIZIO_PREDEFINITO = 8
const FINE_PREDEFINITA = 21
const PRIMO_SLOT = 9 * 60
export const PASSO_SLOT = 15
export const DURATA_SLOT = 30
export const COLONNE_MASSIME = 3

export const attiva = (v: Visita) => v.stato !== "ANNULLATA"
export const minutoDelGiorno = (d: Date) => d.getHours() * 60 + d.getMinutes()
export const durataMinuti = (v: Visita) => differenceInMinutes(parseISO(v.fine), parseISO(v.inizio))

/** Nel giorno in cui comincia: una visita a cavallo della mezzanotte si ferma a fine colonna. */
function estremi(v: Visita) {
  const inizio = minutoDelGiorno(parseISO(v.inizio))
  return { inizio, fine: Math.min(inizio + durataMinuti(v), ORE_DEL_GIORNO * 60) }
}

export const delGiorno = (visite: Visita[], giorno: Date) => visite.filter((v) => isSameDay(parseISO(v.inizio), giorno))

export function tempo(minuti: number) {
  if (minuti < 60) return `${minuti} min`
  const resto = minuti % 60
  return resto ? `${Math.floor(minuti / 60)} h ${resto}` : `${minuti / 60} h`
}

export const orario = (minuti: number) => `${String(Math.floor(minuti / 60)).padStart(2, "0")}:${String(minuti % 60).padStart(2, "0")}`
export const inizioSlot = (giorno: Date, minuti: number) => `${formatDateOnlyLocal(giorno)}T${orario(minuti)}`
export const conta = (n: number, una: string, tante: string) => `${n} ${n === 1 ? una : tante}`

export function nomeGiorno(data: Date, adesso: Date) {
  const giorni = differenceInCalendarDays(data, adesso)
  if (giorni === 0) return "Oggi"
  if (giorni === 1) return "Domani"
  return format(data, "EEEE d MMMM", { locale: it })
}

function traQuanto(inizio: Date, adesso: Date) {
  const minuti = differenceInMinutes(inizio, adesso)
  if (minuti < 1) return "adesso"
  if (minuti < 60 * 24) return `tra ${tempo(minuti)}`
  const giorni = differenceInCalendarDays(inizio, adesso)
  return giorni === 1 ? "domani" : `tra ${giorni} giorni`
}

export type Prossima = { visita: Visita; inCorso: boolean; quando: string }

export function prossimaVisita(visite: Visita[], adesso: Date): Prossima | null {
  const visita = visite
    .filter((v) => v.stato === "PROGRAMMATA" && parseISO(v.fine) > adesso)
    .sort((a, b) => a.inizio.localeCompare(b.inizio))[0]
  if (!visita) return null
  const inizio = parseISO(visita.inizio)
  const inCorso = inizio <= adesso
  return { visita, inCorso, quando: inCorso ? `finisce alle ${format(parseISO(visita.fine), "HH:mm")}` : traQuanto(inizio, adesso) }
}

/** La giornata in una frase, a partire da ciò che resta da fare da adesso in poi. */
export function fraseDiOggi(visite: Visita[], adesso: Date) {
  const future = visite.filter((v) => v.stato === "PROGRAMMATA" && parseISO(v.fine) > adesso).sort((a, b) => a.inizio.localeCompare(b.inizio))
  const oggi = future.filter((v) => isSameDay(parseISO(v.inizio), adesso))
  if (oggi.length > 0) {
    const ultima = format(parseISO(oggi[oggi.length - 1].fine), "HH:mm")
    return oggi.length === 1 ? `Oggi resta una visita: finisci alle ${ultima}.` : `Oggi restano ${oggi.length} visite: finisci alle ${ultima}.`
  }
  if (future.length === 0) return "Nessuna visita in programma nei prossimi due mesi."
  const inizio = parseISO(future[0].inizio)
  const giorno = nomeGiorno(inizio, adesso)
  return `Nessun'altra visita oggi. La prossima è ${giorno === "Domani" ? "domani" : giorno} alle ${format(inizio, "HH:mm")}.`
}

/** Nessun job chiude le visite: quelle finite restano programmate finché il dottore non le segna. */
export const daSegnare = (v: Visita, adesso: Date) => v.stato === "PROGRAMMATA" && parseISO(v.fine) <= adesso

export type DensitaGiorno = { giorno: Date; visite: number; minuti: number }

export const densita = (giorni: Date[], visite: Visita[]): DensitaGiorno[] => giorni.map((giorno) => {
  const valide = delGiorno(visite, giorno).filter(attiva)
  return { giorno, visite: valide.length, minuti: valide.reduce((s, v) => s + durataMinuti(v), 0) }
})

/** Sempre mattina e sera; si allarga se serve per una visita o per l'ora attuale. */
export function fasciaOraria(visite: Visita[], adesso: Date | null) {
  let da = INIZIO_PREDEFINITO
  let a = FINE_PREDEFINITA
  for (const v of visite) {
    const { inizio, fine } = estremi(v)
    da = Math.min(da, Math.floor(inizio / 60))
    a = Math.max(a, Math.ceil(fine / 60))
  }
  if (adesso) {
    const ora = adesso.getHours()
    da = Math.min(da, ora)
    a = Math.max(a, ora + 1)
  }
  return { da, a: Math.min(a, ORE_DEL_GIORNO) }
}

export type Disposta = {
  chiave: string
  inizio: number
  fine: number
  colonna: number
  colonne: number
  visite: Visita[]
}

/**
 * Colonne affiancate per le visite che si toccano. Oltre `COLONNE_MASSIME` le ultime confluiscono in un
 * solo riquadro "+n". `minimo` è l'altezza del blocco più basso, in minuti: conta anche se la visita è più corta.
 */
export function disponi(visite: Visita[], minimo: number): Disposta[] {
  const voci = visite
    .map((visita) => {
      const { inizio, fine } = estremi(visita)
      return { visita, inizio, fine, ingombro: Math.max(fine, inizio + minimo) }
    })
    .sort((a, b) => a.inizio - b.inizio || b.fine - a.fine)

  const disposte: Disposta[] = []
  let gruppo: typeof voci = []
  let fineGruppo = -1

  const chiudi = () => {
    const termini: number[] = []
    const inColonna = gruppo.map((voce) => {
      let colonna = termini.findIndex((termine) => termine <= voce.inizio)
      if (colonna < 0) colonna = termini.length
      termini[colonna] = voce.ingombro
      return { voce, colonna }
    })
    const colonne = Math.min(termini.length, COLONNE_MASSIME)
    const tagliate = termini.length > COLONNE_MASSIME
    const ultima = colonne - 1
    const visibili = tagliate ? inColonna.filter((c) => c.colonna < ultima) : inColonna
    const eccedenti = tagliate ? inColonna.filter((c) => c.colonna >= ultima) : []
    for (const { voce, colonna } of visibili) {
      disposte.push({ chiave: String(voce.visita.id), inizio: voce.inizio, fine: voce.fine, colonna, colonne, visite: [voce.visita] })
    }
    if (eccedenti.length > 0) {
      disposte.push({
        chiave: `altre-${eccedenti[0].voce.visita.id}`,
        inizio: Math.min(...eccedenti.map((c) => c.voce.inizio)),
        fine: Math.max(...eccedenti.map((c) => c.voce.fine)),
        colonna: ultima,
        colonne,
        visite: eccedenti.map((c) => c.voce.visita),
      })
    }
  }

  for (const voce of voci) {
    if (gruppo.length > 0 && voce.inizio >= fineGruppo) {
      chiudi()
      gruppo = []
      fineGruppo = -1
    }
    gruppo.push(voce)
    fineGruppo = Math.max(fineGruppo, voce.ingombro)
  }
  if (gruppo.length > 0) chiudi()
  return disposte
}

/** Visite attive che occupano lo stesso tempo di un'altra: due visite consecutive non contano. */
export function sovrapposte(visite: Visita[]) {
  const valide = visite.filter(attiva).sort((a, b) => a.inizio.localeCompare(b.inizio))
  const coinvolte = new Set<number>()
  valide.forEach((v, i) => {
    for (const altra of valide.slice(i + 1)) {
      if (altra.inizio >= v.fine) break
      coinvolte.add(v.id)
      coinvolte.add(altra.id)
    }
  })
  return coinvolte
}

/** Primo spazio libero del giorno: serve a chi fissa la visita da tastiera. */
export function primoSlotLibero(visite: Visita[]) {
  const occupati = visite.filter(attiva).map(estremi)
  for (let inizio = PRIMO_SLOT; inizio <= ORE_DEL_GIORNO * 60 - DURATA_SLOT; inizio += PASSO_SLOT) {
    if (!occupati.some((o) => o.inizio < inizio + DURATA_SLOT && o.fine > inizio)) return inizio
  }
  return PRIMO_SLOT
}

export type VoceGiorno =
  | { tipo: "visita"; visita: Visita }
  | { tipo: "libero"; da: number; a: number }

/** La giornata in lista: gli spazi di almeno mezz'ora fra una visita e l'altra diventano posti da fissare. */
export function vociDelGiorno(visite: Visita[]): VoceGiorno[] {
  const ordinate = [...visite].sort((a, b) => a.inizio.localeCompare(b.inizio))
  const voci: VoceGiorno[] = []
  let occupatoFino: number | null = null
  for (const visita of ordinate) {
    const { inizio, fine } = estremi(visita)
    if (occupatoFino != null && attiva(visita) && inizio - occupatoFino >= DURATA_SLOT) voci.push({ tipo: "libero", da: occupatoFino, a: inizio })
    voci.push({ tipo: "visita", visita })
    if (attiva(visita)) occupatoFino = Math.max(occupatoFino ?? 0, fine)
  }
  return voci
}

export type StatoBlocco = "annullata" | "assente" | "fatta" | "da-segnare" | "in-corso" | "futura"

export function statoBlocco(v: Visita, adesso: Date): StatoBlocco {
  if (v.stato === "ANNULLATA") return "annullata"
  if (v.stato === "NON_PRESENTATO") return "assente"
  if (v.stato === "EFFETTUATA") return "fatta"
  if (daSegnare(v, adesso)) return "da-segnare"
  return parseISO(v.inizio) <= adesso ? "in-corso" : "futura"
}

export const rigaVisita = (v: Visita) => [v.numeroVisita ? `${v.numeroVisita} su ${v.visiteTotali}` : TIPO_VISITA[v.tipo], MODALITA_VISITA[v.modalita]].join(" · ")

export function descriviVisita(v: Visita, adesso: Date) {
  const stato = statoBlocco(v, adesso) === "da-segnare" ? "Finita, da segnare" : STATO_VISITA[v.stato].testo
  return [
    `${format(parseISO(v.inizio), "HH:mm")}–${format(parseISO(v.fine), "HH:mm")}`,
    v.pazienteNome,
    TIPO_VISITA[v.tipo],
    v.numeroVisita ? `visita ${v.numeroVisita} su ${v.visiteTotali}` : null,
    MODALITA_VISITA[v.modalita],
    stato,
    SYNC_GOOGLE[v.googleSyncStato].testo,
  ].filter(Boolean).join(", ")
}

export type FiltroAgenda = "tutte" | "da-segnare" | "DA_SINCRONIZZARE" | "SINCRONIZZATA" | "ERRORE"

export function rispettaFiltro(v: Visita, filtro: FiltroAgenda, adesso: Date) {
  if (filtro === "tutte") return true
  if (filtro === "da-segnare") return daSegnare(v, adesso)
  return v.googleSyncStato === filtro
}

/** Una voce serve solo se distingue qualcosa: con Google spento "in attesa" sarebbe sempre uguale a "tutte". */
export function filtriUtili(visite: Visita[], adesso: Date) {
  const valide = visite.filter(attiva)
  const voci: { valore: FiltroAgenda; testo: string; quante: number }[] = [
    { valore: "da-segnare", testo: "Da segnare", quante: valide.filter((v) => daSegnare(v, adesso)).length },
    { valore: "ERRORE", testo: "Errore Google", quante: valide.filter((v) => v.googleSyncStato === "ERRORE").length },
    { valore: "SINCRONIZZATA", testo: "Su Google", quante: valide.filter((v) => v.googleSyncStato === "SINCRONIZZATA").length },
    { valore: "DA_SINCRONIZZARE", testo: "In attesa di Google", quante: valide.filter((v) => v.googleSyncStato === "DA_SINCRONIZZARE").length },
  ]
  return voci.filter((f) => f.quante > 0 && (f.quante < valide.length || f.valore === "da-segnare" || f.valore === "ERRORE"))
}
