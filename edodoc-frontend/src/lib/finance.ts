import { differenceInCalendarDays, parseISO } from "date-fns"
import { euroTondi } from "@/lib/format"
import { oggiIso } from "@/lib/utils"
import type { MeseFinance, Movimento, RiepilogoFinance } from "@/types"

export const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"]
export const MESI_BREVI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"]

/** Queste uscite pagano ciò che il foglio Cassa ha già maturato: sommarle alle spese conterebbe due volte. */
const USCITE_FISCALI = new Set(["IMPOSTE", "CASSA_PREVIDENZA"])

const meseDi = (m: Movimento) => Number(m.data.slice(5, 7))

export function accantonamenti(r: RiepilogoFinance, movimenti: Movimento[]) {
  const { impostaSostitutiva, cassaPrevidenziale, contributoInFattura } = r.totali
  const maturato = impostaSostitutiva + cassaPrevidenziale + contributoInFattura
  const versato = movimenti.filter((m) => m.tipo === "USCITA" && USCITE_FISCALI.has(m.categoria)).reduce((s, m) => s + m.importo, 0)
  const daAccantonare = Math.max(0, maturato - versato)
  return { maturato, versato, daAccantonare, cassaLibera: r.saldoCassa - daAccantonare }
}

/** Dal lordo a ciò che resta, per un mese o per l'anno (`mese` 0, come la riga dei totali). */
export function contoDelPeriodo(m: MeseFinance, movimenti: Movimento[]) {
  const fisco = m.impostaSostitutiva + m.cassaPrevidenziale + m.contributoInFattura
  const spese = movimenti
    .filter((v) => v.tipo === "USCITA" && !USCITE_FISCALI.has(v.categoria) && (m.mese === 0 || meseDi(v) === m.mese))
    .reduce((s, v) => s + v.importo, 0)
  return { fisco, spese, resta: m.lordo - fisco - spese }
}

export type Verdetto = { tono: "ok" | "warn" | "danger"; titolo: string; testo: string }

/** La lettura in una frase: stessa regola del backend, candidature chiuse sotto il valore di un cliente. */
export function verdetto(r: RiepilogoFinance): Verdetto {
  const margine = r.livelli[0].margineSoglia
  const marginePrevisto = r.livelli[r.livelli.length - 1].margineSoglia
  const annoCorrente = new Date().getFullYear()

  if (r.totali.lordo === 0 && r.anno !== annoCorrente) {
    return { tono: "ok", titolo: "Nessun incasso", testo: `Nessun incasso registrato per il ${r.anno}.` }
  }
  if (r.anno < annoCorrente) {
    return margine < 0
      ? { tono: "danger", titolo: `Soglia superata di ${euroTondi(-margine)}`, testo: "L'anno si è chiuso oltre il limite del forfettario." }
      : { tono: "ok", titolo: `${euroTondi(margine)} sotto la soglia`, testo: "L'anno si è chiuso dentro il limite del forfettario." }
  }
  if (margine < 0) {
    return { tono: "danger", titolo: `Soglia superata di ${euroTondi(-margine)}`, testo: "Candidature da chiudere: l'incassato è già oltre il limite del forfettario." }
  }
  if (!r.candidatureAperte) {
    return { tono: "warn", titolo: `${euroTondi(margine)} alla soglia`, testo: `Candidature da chiudere: il margine è sotto il valore di un cliente (${euroTondi(r.valoreNuovoCliente)}).` }
  }
  if (marginePrevisto < 0) {
    return { tono: "warn", titolo: `Previsione oltre la soglia di ${euroTondi(-marginePrevisto)}`, testo: "Candidature aperte, ma con rate e rinnovi attesi l'anno chiude sopra il limite." }
  }
  const clienti = Math.floor(marginePrevisto / r.valoreNuovoCliente)
  const spazio = clienti === 0 ? "la previsione resta appena sotto la soglia" : `c'è spazio per ${clienti === 1 ? "un altro cliente" : `circa ${clienti} clienti`}`
  return { tono: "ok", titolo: `${euroTondi(margine)} alla soglia`, testo: `Candidature aperte: ${spazio}.` }
}

export type PuntoCurva = { etichetta: string; incassato: number | null; conRate: number | null; previsione: number | null }

/** Fino a oggi l'incassato cumulato; da oggi a dicembre il ventaglio verso i totali dei livelli 2 e 3. */
export function curvaAnnuale(r: RiepilogoFinance) {
  const oggi = new Date()
  const ultimo = r.anno < oggi.getFullYear() ? 12 : r.anno > oggi.getFullYear() ? 0 : oggi.getMonth() + 1
  const [certo, conRate, previsione] = r.livelli
  const verso = (traguardo: number, mese: number) => certo.totale + ((traguardo - certo.totale) * (mese - ultimo)) / (12 - ultimo)

  let cumulato = 0
  const punti: PuntoCurva[] = []
  for (let mese = 0; mese <= 12; mese++) {
    if (mese > 0) cumulato += r.mesi[mese - 1].lordo
    const ventaglio = ultimo < 12 && mese >= ultimo
    punti.push({
      etichetta: mese === 0 ? "" : MESI_BREVI[mese - 1],
      incassato: mese <= ultimo ? Math.min(cumulato, certo.totale) : null,
      conRate: ventaglio ? verso(conRate.totale, mese) : null,
      previsione: ventaglio ? verso(previsione.totale, mese) : null,
    })
  }
  return { punti, ultimo }
}

/** Giorni da oggi: negativi se la data è passata. */
export const giorniDa = (dataIso: string) => differenceInCalendarDays(parseISO(dataIso), parseISO(oggiIso()))

export function quandoScade(giorni: number): { testo: string; tono: "danger" | "warn" | "muted" } {
  if (giorni < 0) return { testo: giorni === -1 ? "Scaduta ieri" : `Scaduta da ${-giorni} giorni`, tono: "danger" }
  if (giorni === 0) return { testo: "Scade oggi", tono: "danger" }
  if (giorni === 1) return { testo: "Scade domani", tono: "warn" }
  return { testo: `Tra ${giorni} giorni`, tono: giorni <= 14 ? "warn" : "muted" }
}
