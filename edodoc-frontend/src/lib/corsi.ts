import type { ModuloConLezioni, RigaCorso, RigaLezione, StrutturaCorso } from "@/types"

export type FaseCorso = "vuoto" | "contenuti" | "lezioni" | "pronto" | "online" | "online-vuoto"
export type GruppoCorso = "preparare" | "pronti" | "online"

const conta = (n: number, una: string, tante: string) => `${n} ${n === 1 ? una : tante}`

/** Stesse regole del backend: Lezione.isCompleta, CorsoService.pubblicaLezione e pubblicaCorso. */
export const videoMancante = (l: RigaLezione) => l.tipo === "VIDEO" && (l.videoStato == null || l.videoStato === "CARICAMENTO")
export const visibile = (l: RigaLezione) => l.pubblicata && l.completa

export function contiLezioni(lezioni: RigaLezione[]) {
  return {
    totali: lezioni.length,
    complete: lezioni.filter((l) => l.completa).length,
    pubblicate: lezioni.filter(visibile).length,
    daPubblicare: lezioni.filter((l) => l.completa && !l.pubblicata).length,
    senzaVideo: lezioni.filter(videoMancante).length,
    inElaborazione: lezioni.filter((l) => l.videoStato === "ELABORAZIONE").length,
    conErrore: lezioni.filter((l) => l.videoStato === "ERRORE").length,
    senzaTesto: lezioni.filter((l) => l.tipo === "TESTO" && !l.completa).length,
  }
}

export function faseCorso(corso: RigaCorso, conti: { totali: number; complete: number; pubblicate: number }): FaseCorso {
  if (corso.pubblicato) return conti.pubblicate > 0 ? "online" : "online-vuoto"
  if (conti.totali === 0) return "vuoto"
  if (conti.pubblicate > 0) return "pronto"
  return conti.complete > 0 ? "lezioni" : "contenuti"
}

export const GRUPPO_DI: Record<FaseCorso, GruppoCorso> = {
  vuoto: "preparare", contenuti: "preparare", lezioni: "preparare", "online-vuoto": "preparare", pronto: "pronti", online: "online",
}

/** Il motivo del blocco o il passo dopo, in una frase sola. */
export function prossimoPasso(fase: FaseCorso, corso: RigaCorso, pubblicate: number) {
  switch (fase) {
    case "vuoto": return corso.moduli === 0 ? "Crea il primo modulo" : "Aggiungi la prima lezione"
    case "contenuti": return "Completa almeno una lezione"
    case "lezioni": return "Pubblica almeno una lezione"
    case "pronto": return "Pronto da pubblicare"
    case "online": return `${conta(pubblicate, "lezione visibile", "lezioni visibili")} nell'app`
    case "online-vuoto": return "Nell'app non compare: nessuna lezione pubblicata"
  }
}

export function cosaManca(c: ReturnType<typeof contiLezioni>) {
  return [
    c.conErrore > 0 ? conta(c.conErrore, "video con errore", "video con errore") : null,
    c.senzaVideo > 0 ? conta(c.senzaVideo, "lezione senza video", "lezioni senza video") : null,
    c.senzaTesto > 0 ? conta(c.senzaTesto, "lezione senza testo", "lezioni senza testo") : null,
    c.inElaborazione > 0 ? conta(c.inElaborazione, "video in elaborazione", "video in elaborazione") : null,
    c.daPubblicare > 0 ? conta(c.daPubblicare, "lezione da pubblicare", "lezioni da pubblicare") : null,
  ].filter((voce): voce is string => voce != null)
}

export type SchedaCorso = {
  corso: RigaCorso
  fase: FaseCorso
  gruppo: GruppoCorso
  pubblicate: number
  passo: string
  manca: string[]
  /** Secondi di video che il paziente può guardare davvero. */
  secondiVisibili: number
}

const lezioniDi = (moduli: ModuloConLezioni[]) => moduli.flatMap((m) => m.lezioni)

/** Senza struttura (richiesta fallita) restano i conteggi del catalogo: si perde solo il dettaglio di cosa manca. */
export function schedaCorso(corso: RigaCorso, struttura: StrutturaCorso | null): SchedaCorso {
  const lezioni = struttura ? lezioniDi(struttura.moduli) : null
  const conti = lezioni ? contiLezioni(lezioni) : null
  const riassunto = conti ?? { totali: corso.lezioni, complete: corso.lezioniPubblicate, pubblicate: corso.lezioniPubblicate }
  const fase = faseCorso(corso, riassunto)
  return {
    corso,
    fase,
    gruppo: GRUPPO_DI[fase],
    pubblicate: riassunto.pubblicate,
    passo: prossimoPasso(fase, corso, riassunto.pubblicate),
    manca: conti ? cosaManca(conti) : [],
    secondiVisibili: corso.pubblicato ? (lezioni ?? []).filter(visibile).reduce((s, l) => s + (l.durataSecondi ?? 0), 0) : 0,
  }
}

export type VoceMancante = { lezione: RigaLezione; modulo: string; motivo: string; urgente: boolean }

const ORDINE_URGENZA = (v: VoceMancante) => (v.urgente ? 0 : 1)

export function vociMancanti(moduli: ModuloConLezioni[]): VoceMancante[] {
  const voci = moduli.flatMap(({ modulo, lezioni }) => lezioni.flatMap((lezione): VoceMancante[] => {
    const base = { lezione, modulo: modulo.titolo }
    if (lezione.videoStato === "ERRORE") return [{ ...base, motivo: "Il video non è andato a buon fine", urgente: true }]
    if (videoMancante(lezione)) return [{ ...base, motivo: "Carica il video", urgente: true }]
    if (lezione.tipo === "TESTO" && !lezione.completa) return [{ ...base, motivo: "Scrivi il testo", urgente: true }]
    if (lezione.videoStato === "ELABORAZIONE") return [{ ...base, motivo: "Il video è in elaborazione", urgente: false }]
    return lezione.completa && !lezione.pubblicata ? [{ ...base, motivo: "Pronta: manca la pubblicazione", urgente: false }] : []
  }))
  return voci.sort((a, b) => ORDINE_URGENZA(a) - ORDINE_URGENZA(b))
}

export function fraseCatalogo(schede: SchedaCorso[]) {
  const nellApp = schede.filter((s) => s.gruppo === "online").length
  const altri = schede.length - nellApp
  if (schede.length === 0) return "Crea il primo corso: titolo e copertina, poi moduli e lezioni."
  if (nellApp === 0) return `Nessun corso nell'app: ${conta(altri, "è ancora in preparazione", "sono ancora in preparazione")}.`
  if (altri === 0) return `${conta(nellApp, "corso visibile", "corsi visibili")} nell'app, nulla in sospeso.`
  return `${conta(nellApp, "corso visibile", "corsi visibili")} nell'app, ${conta(altri, "altro in preparazione", "altri in preparazione")}.`
}

/** Tinta stabile per titolo: lo stesso corso senza copertina ha sempre lo stesso motivo. */
export function semeTitolo(titolo: string) {
  let seme = 0
  for (const lettera of titolo) seme = (seme * 31 + lettera.charCodeAt(0)) % 9973
  return seme
}
