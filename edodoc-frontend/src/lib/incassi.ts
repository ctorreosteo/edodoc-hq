import { addMonths, format, parseISO } from "date-fns"
import { giorniDa, MESI, MESI_BREVI } from "@/lib/finance"
import { oggiIso } from "@/lib/utils"
import type { Acquisti, Acquisto, Fattura, Pagamento, Percorso } from "@/types"

/**
 * Scaduti, rate future e incassi da fatturare non dipendono dall'anno guardato: si legge tutto
 * e l'anno filtra solo lo storico, altrimenti una rata del dicembre scorso sparirebbe dai solleciti.
 */
export const TUTTO_IL_PERIODO = { da: "2000-01-01", a: "2099-12-31" }

const centesimi = (valore: number) => Math.round(valore * 100) / 100
const somma = <T>(voci: T[], valore: (voce: T) => number) => centesimi(voci.reduce((s, v) => s + valore(v), 0))

const meseDi = (iso: string) => iso.slice(0, 7)
const annoDi = (iso: string) => Number(iso.slice(0, 4))
const indiceMese = (mese: string) => Number(mese.slice(5, 7)) - 1

export const nomeMese = (mese: string) => MESI[indiceMese(mese)].toLowerCase()
export const nomeMeseConAnno = (mese: string) => `${MESI[indiceMese(mese)]} ${mese.slice(0, 4)}`
export const nomeMeseBreve = (mese: string) => MESI_BREVI[indiceMese(mese)]

const spostaMese = (mese: string, passi: number) => format(addMonths(parseISO(`${mese}-01`), passi), "yyyy-MM")

export const quanti = (numero: number, uno: string, tanti: string) => `${numero} ${numero === 1 ? uno : tanti}`

/** Pagamenti */

/** La data che colloca il pagamento nel tempo: l'incasso se c'è, altrimenti la scadenza. Stesso criterio del backend. */
export const dataDelPagamento = (p: Pagamento) => p.dataPagamento ?? p.scadenza
export const incassato = (p: Pagamento) => p.stato === "PAGATO"
export const aperto = (p: Pagamento) => p.stato === "DA_PAGARE"
export const daFatturare = (p: Pagamento) => incassato(p) && !p.fatturato

export type Moroso = { pazienteId: number; nome: string; totale: number; giorni: number; righe: Pagamento[] }

export function ritardo(giorni: number) {
  return giorni === 1 ? "In ritardo da ieri" : `In ritardo da ${giorni} giorni`
}

/** Chi sollecitare: per paziente, dal ritardo più lungo. */
export function morosi(righe: Pagamento[]): Moroso[] {
  const perPaziente = new Map<number, Pagamento[]>()
  for (const p of righe.filter((r) => aperto(r) && r.scaduto)) perPaziente.set(p.pazienteId, [...(perPaziente.get(p.pazienteId) ?? []), p])
  return [...perPaziente.entries()]
    .map(([pazienteId, voci]) => {
      const ordinate = [...voci].sort((a, b) => a.scadenza.localeCompare(b.scadenza))
      return { pazienteId, nome: voci[0].pazienteNome, totale: somma(voci, (v) => v.importo), giorni: -giorniDa(ordinate[0].scadenza), righe: ordinate }
    })
    .sort((a, b) => b.giorni - a.giorni)
}

export type ColonnaCalendario = { chiave: string; etichetta: string; titolo: string; atteso: number; incassato: number; conteggio: number }

export const DOPO = "DOPO"

/** Questo mese e i cinque successivi. Quello che scade più avanti finisce in «Dopo», così le colonne sommano tutto l'atteso. */
export function calendarioIncassi(righe: Pagamento[], oggi = oggiIso()): ColonnaCalendario[] {
  const questoMese = meseDi(oggi)
  const attesi = righe.filter((p) => aperto(p) && !p.scaduto)
  const ultimo = spostaMese(questoMese, 5)
  const colonne: ColonnaCalendario[] = Array.from({ length: 6 }, (_, i) => {
    const mese = spostaMese(questoMese, i)
    const delMese = attesi.filter((p) => meseDi(p.scadenza) === mese)
    return {
      chiave: mese,
      etichetta: nomeMeseBreve(mese),
      titolo: nomeMeseConAnno(mese),
      atteso: somma(delMese, (p) => p.importo),
      incassato: i === 0 ? somma(righe.filter((p) => incassato(p) && meseDi(dataDelPagamento(p)) === mese), (p) => p.importo) : 0,
      conteggio: delMese.length,
    }
  })
  const dopo = attesi.filter((p) => meseDi(p.scadenza) > ultimo)
  if (dopo.length > 0) {
    colonne.push({ chiave: DOPO, etichetta: "Dopo", titolo: `Dopo ${nomeMeseConAnno(ultimo).toLowerCase()}`, atteso: somma(dopo, (p) => p.importo), incassato: 0, conteggio: dopo.length })
  }
  return colonne
}

export function quadroIncassi(righe: Pagamento[], anno: number, oggi = oggiIso()) {
  const questoMese = meseDi(oggi)
  const attesi = righe.filter((p) => aperto(p) && !p.scaduto)
  const attesiDelMese = attesi.filter((p) => meseDi(p.scadenza) === questoMese)
  const scaduti = righe.filter((p) => aperto(p) && p.scaduto)
  const senzaFattura = righe.filter(daFatturare)
  return {
    questoMese,
    /** Stesso criterio del Livello 1 di Finance, voce pazienti: data dell'incasso dentro l'anno. */
    incassatoAnno: somma(righe.filter((p) => incassato(p) && annoDi(dataDelPagamento(p)) === anno), (p) => p.importo),
    incassatoMese: somma(righe.filter((p) => incassato(p) && meseDi(dataDelPagamento(p)) === questoMese), (p) => p.importo),
    attesoMese: somma(attesiDelMese, (p) => p.importo),
    attesiDelMese: attesiDelMese.length,
    inScadenzaOggi: attesiDelMese.filter((p) => p.scadenza === oggi).length,
    attesoTotale: somma(attesi, (p) => p.importo),
    attesi: attesi.length,
    scaduto: somma(scaduti, (p) => p.importo),
    daFatturare: senzaFattura.length,
    importoDaFatturare: somma(senzaFattura, (p) => p.importo),
    morosi: morosi(righe),
    calendario: calendarioIncassi(righe, oggi),
  }
}

export type Pacchetto = { chiave: string; righe: Pagamento[] }
export type MeseRegistro = { mese: string; incassato: number; atteso: number; pacchetti: Pacchetto[] }

/** Righe gemelle (stesso paziente, giorno, stato e metodo) in un pacchetto solo: dodici quote uguali si leggono come una riga. */
export function registroPerMese(righe: Pagamento[]): MeseRegistro[] {
  const mesi = new Map<string, Pagamento[]>()
  for (const p of righe) {
    const mese = meseDi(dataDelPagamento(p))
    mesi.set(mese, [...(mesi.get(mese) ?? []), p])
  }
  return [...mesi.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([mese, voci]) => {
      const pacchetti = new Map<string, Pagamento[]>()
      for (const p of voci) {
        const chiave = [p.pazienteId, dataDelPagamento(p), p.stato, p.scaduto, p.metodo, p.fatturato].join("|")
        pacchetti.set(chiave, [...(pacchetti.get(chiave) ?? []), p])
      }
      return {
        mese,
        incassato: somma(voci.filter(incassato), (p) => p.importo),
        atteso: somma(voci.filter(aperto), (p) => p.importo),
        pacchetti: [...pacchetti.entries()].map(([chiave, gemelle]) => ({ chiave, righe: gemelle })),
      }
    })
}

export const FILTRI_PAGAMENTI: Record<string, string> = { TUTTI: "Tutti", SCADUTI: "Scaduti", DA_PAGARE: "Da pagare", PAGATI: "Pagati", DA_FATTURARE: "Da fatturare" }

/** Lo storico segue l'anno. Le liste di cose da fare valgono sempre per intero. */
export function passaFiltroPagamento(p: Pagamento, filtro: string, anno: number) {
  if (filtro === "SCADUTI") return aperto(p) && p.scaduto
  if (filtro === "DA_PAGARE") return aperto(p)
  if (filtro === "DA_FATTURARE") return daFatturare(p)
  if (annoDi(dataDelPagamento(p)) !== anno) return false
  return filtro !== "PAGATI" || incassato(p)
}

/** Acquisti */

export type TonoAcquisto = "ok" | "warn" | "danger" | "muted"

/** Parte del prezzo del piano che nessun pagamento collegato copre: né incassata né in attesa, di solito perché le rate sono state annullate. */
export function nonCoperto(a: Acquisto) {
  if (a.percorso.stato === "ANNULLATO") return 0
  return Math.max(0, centesimi(a.percorso.importoTotale - a.pagato - a.daPagare - a.scaduto))
}

export const percorsoAperto = (p: Percorso) => p.stato === "ATTIVO"

/** Ultima visita in vista, oppure meno di 30 giorni alla fine del percorso. */
export function versoRinnovo(a: Acquisto) {
  const p = a.percorso
  return percorsoAperto(p) && (p.visiteEffettuate >= p.visiteTotali - 1 || giorniDa(p.dataFine) < 30)
}

export function statoAcquisto(a: Acquisto): { tono: TonoAcquisto; testo: string } {
  if (a.percorso.stato === "ANNULLATO") return { tono: "muted", testo: "Annullato" }
  if (a.scaduto > 0) return { tono: "danger", testo: "Rate scadute" }
  if (nonCoperto(a) > 0) return { tono: "warn", testo: "Non coperto" }
  if (a.daPagare > 0) return { tono: "warn", testo: "Da incassare" }
  return { tono: "ok", testo: "Saldato" }
}

const gravita = (a: Acquisto) => {
  if (a.percorso.stato === "ANNULLATO") return 5
  if (a.scaduto > 0) return 0
  if (versoRinnovo(a)) return 1
  if (nonCoperto(a) > 0) return 2
  if (a.percorso.stato !== "ATTIVO") return 4
  return 3
}

/** Prima chi chiede un intervento; a parità, il percorso che finisce prima. */
export const perGravita = (a: Acquisto, b: Acquisto) => gravita(a) - gravita(b) || a.percorso.dataFine.localeCompare(b.percorso.dataFine)

export const FILTRI_ACQUISTI: Record<string, string> = { TUTTI: "Tutti", ATTIVI: "Attivi", DA_SALDARE: "Da saldare", SCADUTI: "Con rate scadute", NON_COPERTI: "Non coperti", RINNOVO: "Verso il rinnovo", CHIUSI: "Conclusi" }

export function passaFiltroAcquisto(a: Acquisto, filtro: string) {
  if (filtro === "ATTIVI") return percorsoAperto(a.percorso)
  if (filtro === "DA_SALDARE") return a.percorso.stato !== "ANNULLATO" && a.pagato < a.percorso.importoTotale
  if (filtro === "SCADUTI") return a.scaduto > 0
  if (filtro === "NON_COPERTI") return nonCoperto(a) > 0
  if (filtro === "RINNOVO") return versoRinnovo(a)
  if (filtro === "CHIUSI") return !percorsoAperto(a.percorso)
  return true
}

/** Il perimetro è dichiarato: solo pagamenti collegati a un percorso non annullato, di pazienti non archiviati. */
export function quadroAcquisti({ percorsi, fuoriPercorso }: Acquisti) {
  const validi = percorsi.filter((a) => a.percorso.stato !== "ANNULLATO")
  const attivi = validi.filter((a) => percorsoAperto(a.percorso))
  const conScaduto = validi.filter((a) => a.scaduto > 0)
  const scoperti = validi.filter((a) => nonCoperto(a) > 0)
  const rinnovi = attivi.filter(versoRinnovo)
  return {
    validi: validi.length,
    attivi: attivi.length,
    valore: somma(validi, (a) => a.percorso.importoTotale),
    incassato: somma(validi, (a) => a.pagato),
    daIncassare: somma(validi, (a) => a.daPagare),
    scaduto: somma(validi, (a) => a.scaduto),
    nonCoperto: somma(validi, nonCoperto),
    conScaduto: conScaduto.length,
    scoperti: scoperti.length,
    rinnovi: rinnovi.length,
    fuoriPercorso: somma(fuoriPercorso.filter(incassato), (p) => p.importo),
  }
}

export type StatoVisita = "fatta" | "fissata" | "libera"

/** Una tacca per visita prevista. Le fissate del backend comprendono quelle già fatte. */
export function tacche(p: Percorso): StatoVisita[] {
  return Array.from({ length: Math.max(0, p.visiteTotali) }, (_, i) => (i < p.visiteEffettuate ? "fatta" : i < p.visiteFissate ? "fissata" : "libera"))
}

/** Quanta parte del percorso è già passata, da 0 a 100. */
export function tempoTrascorso(p: Percorso) {
  const trascorsi = -giorniDa(p.dataInizio)
  const durata = giorniDa(p.dataFine) + trascorsi
  if (durata <= 0) return 100
  return Math.min(100, Math.max(0, (trascorsi / durata) * 100))
}

/** Fatture */

export type StatoTessera = "inserita" | "opposizione" | "da-inserire" | "annullata"

export function statoTessera(f: Fattura): StatoTessera {
  if (f.stato === "ANNULLATA") return "annullata"
  if (f.tsOpposizione) return "opposizione"
  return f.tsStato === "INSERITA" ? "inserita" : "da-inserire"
}

export const emessa = (f: Fattura) => f.stato === "EMESSA"
export const daInviare = (f: Fattura) => emessa(f) && !f.emailInviataIl
export const daInserire = (f: Fattura) => statoTessera(f) === "da-inserire"
export const completa = (f: Fattura) => emessa(f) && !daInviare(f) && !daInserire(f)

export const FILTRI_FATTURE: Record<string, string> = { TUTTE: "Tutte", DA_EMETTERE: "Da emettere", DA_INVIARE: "Da inviare", DA_INSERIRE: "Da inserire", COMPLETE: "Complete", ANNULLATE: "Annullate" }

export function passaFiltroFattura(f: Fattura, filtro: string) {
  if (filtro === "DA_INVIARE") return daInviare(f)
  if (filtro === "DA_INSERIRE") return daInserire(f)
  if (filtro === "COMPLETE") return completa(f)
  if (filtro === "ANNULLATE") return f.stato === "ANNULLATA"
  return true
}

export const fattureDellAnno = (fatture: Fattura[], anno: number) => fatture.filter((f) => annoDi(f.dataEmissione) === anno)

export function quadroFatture(fatture: Fattura[]) {
  const valide = fatture.filter(emessa)
  const numeri = [...new Set(fatture.map((f) => f.numero))].sort((a, b) => a - b)
  const primo = numeri[0] ?? null
  const ultimo = numeri[numeri.length - 1] ?? null
  const opposizioni = valide.filter((f) => f.tsOpposizione).length
  return {
    emesse: valide.length,
    totale: somma(valide, (f) => f.importoTotale),
    daInviare: valide.filter(daInviare).length,
    inviate: valide.filter((f) => f.emailInviataIl).length,
    daInserire: valide.filter(daInserire).length,
    inserite: valide.filter((f) => statoTessera(f) === "inserita").length,
    opposizioni,
    perTessera: valide.length - opposizioni,
    annullate: fatture.length - valide.length,
    primo,
    ultimo,
    numerazioneContinua: primo == null || ultimo == null || numeri.length === ultimo - primo + 1,
  }
}

export const meseFattura = (f: Fattura) => meseDi(f.dataEmissione)

export type GruppoFatture = { mese: string; totale: number; fatture: Fattura[] }

export function fatturePerMese(fatture: Fattura[]): GruppoFatture[] {
  const mesi = new Map<string, Fattura[]>()
  for (const f of fatture) mesi.set(meseFattura(f), [...(mesi.get(meseFattura(f)) ?? []), f])
  return [...mesi.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([mese, voci]) => ({ mese, totale: somma(voci.filter(emessa), (f) => f.importoTotale), fatture: voci }))
}

export type MeseTessera = { mese: string; daInserire: number; inserite: number; opposizioni: number }

export function mesiTessera(fatture: Fattura[], anno: number): MeseTessera[] {
  return MESI.map((_, i) => {
    const mese = `${anno}-${String(i + 1).padStart(2, "0")}`
    const delMese = fatture.filter((f) => emessa(f) && meseFattura(f) === mese)
    return {
      mese,
      daInserire: delMese.filter(daInserire).length,
      inserite: delMese.filter((f) => statoTessera(f) === "inserita").length,
      opposizioni: delMese.filter((f) => f.tsOpposizione).length,
    }
  })
}

export const meseScorso = (oggi = oggiIso()) => spostaMese(meseDi(oggi), -1)

/** Stessa data del task mensile creato da PromemoriaJob: il 10 del mese dopo quello delle fatture. */
const entroIl = (mese: string) => `${spostaMese(mese, 1)}-10`

export type Appuntamento = { mese: string; entro: string; giorni: number; quante: number; arretrate: number; tono: "ok" | "warn" | "danger"; precedenteChiuso: string | null }

/** L'appuntamento del mese scorso finché resta qualcosa da inserire, poi quello successivo. */
export function appuntamentoTessera(fatture: Fattura[], oggi = oggiIso()): Appuntamento {
  const scorso = meseScorso(oggi)
  const inSospeso = fatture.filter(daInserire)
  const delMese = (mese: string) => inSospeso.filter((f) => meseFattura(f) === mese).length
  const arretrate = inSospeso.filter((f) => meseFattura(f) < scorso).length
  const quanteScorso = delMese(scorso)
  if (quanteScorso > 0) {
    const entro = entroIl(scorso)
    const giorni = giorniDa(entro)
    return { mese: scorso, entro, giorni, quante: quanteScorso, arretrate, tono: giorni < 0 ? "danger" : "warn", precedenteChiuso: null }
  }
  const mese = meseDi(oggi)
  const entro = entroIl(mese)
  return { mese, entro, giorni: giorniDa(entro), quante: delMese(mese), arretrate, tono: arretrate > 0 ? "danger" : "ok", precedenteChiuso: scorso }
}
