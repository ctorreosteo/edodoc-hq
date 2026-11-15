import { addDays, differenceInCalendarDays, endOfMonth, parseISO, startOfISOWeek } from "date-fns"
import type { Conquista, Obiettivo } from "@/types"

/**
 * Lettura dell'obiettivo annuale (clienti unici che comprano un percorso nell'anno).
 * Tutto si calcola qui, dal solo elenco delle conquiste: la pagina e la pillola in alto leggono gli stessi numeri.
 */

export type Fase = "attesa" | "corsa" | "chiuso"

export const TRAGUARDI: { n: number; nome: string }[] = [
  { n: 1, nome: "Il primo" },
  { n: 10, nome: "Doppia cifra" },
  { n: 25, nome: "Un mese di ritmo" },
  { n: 50, nome: "Mezzo centinaio" },
  { n: 75, nome: "Un quarto" },
  { n: 100, nome: "Cento vite" },
  { n: 150, nome: "Metà strada" },
  { n: 200, nome: "Due terzi" },
  { n: 250, nome: "Rettilineo finale" },
  { n: 300, nome: "Obiettivo" },
]

export type PuntoCurva = { settimana: number; etichetta: string; reale: number | null; ideale: number; precedente: number | null }

const giornoDellAnno = (data: Date, anno: number) => differenceInCalendarDays(data, new Date(anno, 0, 1)) + 1

function contaFinoA(conquiste: Conquista[], giorno: number, anno: number) {
  let n = 0
  for (const c of conquiste) if (giornoDellAnno(parseISO(c.data), anno) <= giorno) n++
  return n
}

export function leggiObiettivo(d: Obiettivo, adesso: Date) {
  const { anno, target, conquiste } = d
  const inizio = new Date(anno, 0, 1)
  const fineAnno = new Date(anno + 1, 0, 1)
  const giorniTotali = differenceInCalendarDays(fineAnno, inizio)
  const fase: Fase = adesso < inizio ? "attesa" : adesso >= fineAnno ? "chiuso" : "corsa"
  const giorniTrascorsi = fase === "attesa" ? 0 : fase === "chiuso" ? giorniTotali : giornoDellAnno(adesso, anno)
  const giorniRimasti = giorniTotali - giorniTrascorsi
  const giorniAlVia = fase === "attesa" ? differenceInCalendarDays(inizio, adesso) : 0

  const fatti = conquiste.length
  const mancanti = Math.max(0, target - fatti)
  const percentuale = Math.min(100, (fatti / target) * 100)
  const percentualeTempo = (giorniTrascorsi / giorniTotali) * 100
  const atteso = (target * giorniTrascorsi) / giorniTotali
  const scarto = fatti - Math.round(atteso)

  // Ritmo che serve da qui in avanti (prima del via: su tutto l'anno)
  const giorniUtili = fase === "attesa" ? giorniTotali : Math.max(1, giorniRimasti)
  const ritmoSettimana = mancanti / (giorniUtili / 7)
  const ritmoMese = mancanti / (giorniUtili / (giorniTotali / 12))
  const ritmoGiorno = mancanti / giorniUtili

  const media = giorniTrascorsi > 0 ? fatti / giorniTrascorsi : 0
  const proiezione = fase !== "attesa" && giorniTrascorsi >= 14 ? Math.round(media * giorniTotali) : null
  const arrivo = proiezione != null && media > 0 && fatti < target ? addDays(inizio, Math.ceil(target / media) - 1) : null

  // Settimana in corso
  const lunedi = startOfISOWeek(adesso)
  const nellaSettimana = (c: Conquista, lun: Date) => {
    const diff = differenceInCalendarDays(parseISO(c.data), lun)
    return diff >= 0 && diff < 7
  }
  const dellaSettimana = conquiste.filter((c) => nellaSettimana(c, lunedi)).length
  const obiettivoSettimana = Math.max(1, Math.ceil(fase === "attesa" ? target / 52 : ritmoSettimana))

  // Mese in corso
  const meseCorrente = adesso.getMonth()
  const delMese = fase === "corsa" ? conquiste.filter((c) => parseISO(c.data).getMonth() === meseCorrente && parseISO(c.data).getFullYear() === anno).length : 0
  const giorniFineMese = differenceInCalendarDays(endOfMonth(adesso), adesso) + 1

  // Per mese (record e barre)
  const mesi = Array.from({ length: 12 }, (_, m) => ({
    mese: m,
    clienti: conquiste.filter((c) => parseISO(c.data).getMonth() === m).length,
    precedente: d.annoPrecedente.filter((c) => parseISO(c.data).getMonth() === m).length,
  }))
  const meseRecord = mesi.reduce((a, b) => (b.clienti > a.clienti ? b : a), mesi[0])

  // Settimane sopra il passo base (target/52), consecutive fino all'ultima chiusa (la corrente conta se già fatta)
  const passoBase = Math.ceil(target / 52)
  let serie = 0
  if (fase !== "attesa") {
    const contaSettimana = (lun: Date) => conquiste.filter((c) => nellaSettimana(c, lun)).length
    let lun = dellaSettimana >= passoBase ? lunedi : addDays(lunedi, -7)
    while (lun >= addDays(inizio, -6) && contaSettimana(lun) >= passoBase) {
      serie++
      lun = addDays(lun, -7)
    }
  }

  // Curva cumulata settimana per settimana: reale (fino a oggi), ritmo ideale, anno precedente
  const curva: PuntoCurva[] = []
  for (let s = 0; s <= 52; s++) {
    const giorno = Math.min(giorniTotali, s * 7 + 1)
    const data = addDays(inizio, giorno - 1)
    curva.push({
      settimana: s,
      etichetta: data.toLocaleDateString("it-IT", { day: "numeric", month: "short" }),
      reale: fase === "attesa" || giorno > giorniTrascorsi + 6 ? null : contaFinoA(conquiste, Math.min(giorno, giorniTrascorsi), anno),
      ideale: Math.round((target * giorno) / giorniTotali),
      precedente: fase === "attesa" && giorno > giornoDellAnno(adesso, anno - 1) + 6 ? null : contaFinoA(d.annoPrecedente, giorno, anno - 1),
    })
  }
  // Il punto reale di oggi, sempre presente in corsa
  if (fase === "corsa") {
    const ultimo = [...curva].reverse().find((p) => p.reale != null)
    if (ultimo) ultimo.reale = fatti
  }

  // L'anno prima alla stessa data (in attesa: l'anno in corso finora)
  const precedenteAllaData = fase === "attesa" ? d.annoPrecedente.length : contaFinoA(d.annoPrecedente, giorniTrascorsi, anno - 1)
  const precedenteTotale = d.annoPrecedente.length

  // Riscaldamento (prima del via): a che ritmo va l'anno in corso e quanto va moltiplicato
  const giorniAnnoCorrente = giornoDellAnno(adesso, anno - 1)
  const proiezioneCorrente = Math.round((d.annoPrecedente.length / Math.max(1, giorniAnnoCorrente)) * 365)
  const moltiplicatore = proiezioneCorrente > 0 ? target / proiezioneCorrente : null

  const traguardi = TRAGUARDI.map((t) => ({ ...t, raggiunto: fatti >= t.n, data: conquiste[t.n - 1]?.data ?? null }))
  const prossimo = traguardi.find((t) => !t.raggiunto) ?? null

  const fonti = Object.entries(conquiste.reduce<Record<string, number>>((acc, c) => {
    const k = c.fonte ?? "NON_INDICATA"
    acc[k] = (acc[k] ?? 0) + 1
    return acc
  }, {})).sort((a, b) => b[1] - a[1])

  const ricavo = conquiste.reduce((s, c) => s + Number(c.importo), 0)
  const ultime = [...conquiste].reverse().slice(0, 8)

  return {
    anno, target, fase, fatti, mancanti, percentuale, percentualeTempo, atteso, scarto,
    giorniTotali, giorniTrascorsi, giorniRimasti, giorniAlVia, inizio,
    ritmoSettimana, ritmoMese, ritmoGiorno, proiezione, arrivo,
    dellaSettimana, obiettivoSettimana, delMese, giorniFineMese, mesi, meseRecord, serie, passoBase,
    curva, precedenteAllaData, precedenteTotale, proiezioneCorrente, moltiplicatore,
    traguardi, prossimo, fonti, ricavo, ultime,
  }
}

export type LetturaObiettivo = ReturnType<typeof leggiObiettivo>

/** La frase che dice dove sei, senza giri di parole. */
export function fraseObiettivo(o: LetturaObiettivo): { titolo: string; testo: string; tono: "ok" | "warn" | "info" } {
  const cliente = (n: number) => (n === 1 ? "1 cliente" : `${n} clienti`)
  if (o.fase === "attesa") {
    return {
      titolo: o.fatti > 0 ? `${cliente(o.fatti)} già in cassaforte` : "Si parte da zero. Si parte forte.",
      testo: `Mancano ${o.giorniAlVia} giorni al via. Per arrivare a ${o.target} servono ${Math.ceil(o.target / 52)} clienti a settimana, ${Math.ceil(o.target / 12)} al mese: ogni conversazione di oggi prepara il ${o.anno}.`,
      tono: "info",
    }
  }
  if (o.fatti >= o.target) {
    return { titolo: `${o.target} su ${o.target}. Fatto.`, testo: `Obiettivo ${o.anno} raggiunto${o.fase === "corsa" ? ` con ${o.giorniRimasti} giorni d'anticipo` : ""}. Ogni cliente da qui in poi è record.`, tono: "ok" }
  }
  if (o.fase === "chiuso") {
    return { titolo: `${cliente(o.fatti)} nel ${o.anno}`, testo: `Mancati ${o.mancanti} per il ${o.target}. Il ${o.anno} è la base da battere.`, tono: "warn" }
  }
  const settimana = Math.ceil(o.ritmoSettimana)
  if (o.scarto > 0) {
    return {
      titolo: `Avanti di ${cliente(o.scarto)} sul ritmo`,
      testo: o.proiezione ? `A questo passo chiudi l'anno a ${o.proiezione}${o.arrivo ? ` e tagli il traguardo il ${o.arrivo.toLocaleDateString("it-IT", { day: "numeric", month: "long" })}` : ""}. Non mollare.` : `Partenza sopra il ritmo: tieni ${settimana} a settimana e il ${o.target} è tuo.`,
      tono: "ok",
    }
  }
  if (o.scarto === 0) {
    return { titolo: "Esattamente in linea", testo: `Servono ${settimana} clienti a settimana da qui a dicembre. Una settimana sopra e sei avanti.`, tono: "info" }
  }
  return {
    titolo: `${cliente(-o.scarto)} da recuperare`,
    testo: `Servono ${settimana} clienti a settimana per arrivare a ${o.target}. Si recupera: una conversazione alla volta, a partire da oggi.`,
    tono: "warn",
  }
}
