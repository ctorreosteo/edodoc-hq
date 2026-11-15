import type { MailingCatalogoCampo, MailingCondizione, MailingGruppoRegole } from '@/services/mailing-service'

/*
  Logica del costruttore regole (mailing-regole.tsx): descrizione in italiano, validazione, valori iniziali.
  Costruttore visuale delle regole di segmento (segmenti, pubblico campagna, condizioni delle automazioni).
  Si legge come una frase: "Contatti che soddisfano tutte / almeno una di queste condizioni: … e … ".
  Il catalogo (campi, operatori, opzioni) arriva da GET /mailing/segmenti/catalogo: qui non si duplica nulla.
  Stile in style/lux-mailing.css (classi .ml-regole-*). Profondità massima: due livelli di gruppi.
*/

export const PROFONDITA_MASSIMA = 2

export const OP_ETICHETTA: Record<string, string> = {
  UGUALE: 'è',
  DIVERSO: 'non è',
  HA: 'ha',
  NON_HA: 'non ha',
  IN: 'è tra',
  NON_IN: 'non è tra',
  CONTIENE: 'contiene',
  MAGGIORE: 'più di',
  MINORE: 'meno di',
  TRA: 'tra',
  VERO: 'sì',
  FALSO: 'no',
}

const OP_FRASE: Record<string, string> = {
  UGUALE: 'è',
  DIVERSO: 'non è',
  HA: 'include',
  NON_HA: 'non include',
  IN: 'è',
  NON_IN: 'non è',
  CONTIENE: 'contiene',
  MAGGIORE: 'oltre',
  MINORE: 'sotto',
  TRA: 'tra',
  VERO: 'sì',
  FALSO: 'no',
}

export const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

export function regoleVuote(): MailingGruppoRegole {
  return { operatore: 'E', condizioni: [] }
}

export function isGruppo(x: MailingCondizione | MailingGruppoRegole): x is MailingGruppoRegole {
  return !!x && Array.isArray((x as MailingGruppoRegole).condizioni)
}

/** Opzioni del catalogo con id numerici: si salvano come numeri (es. tag, campagne), il resto come stringhe. */
export function normalizzaValoreOpzione(v: string): string | number {
  return /^\d+$/.test(v) ? Number(v) : v
}

export function valoreIniziale(campo: MailingCatalogoCampo | undefined): unknown {
  if (!campo) return undefined
  switch (campo.tipoValore) {
    case 'MULTI_SELECT':
      return []
    case 'INTERVALLO':
      return [null, null]
    case 'MESE':
      return 'CORRENTE'
    case 'SELECT':
      return campo.opzioni?.[0] ? normalizzaValoreOpzione(campo.opzioni[0].valore) : undefined
    default:
      return undefined
  }
}

/** La condizione ha tutto ciò che serve per essere valutata. */
export function condizioneCompleta(c: MailingCondizione, catalogo: MailingCatalogoCampo[]): boolean {
  const campo = catalogo.find((x) => x.campo === c.campo)
  if (!campo || !c.op) return false
  if (campo.tipoValore === 'NESSUNO' || c.op === 'VERO' || c.op === 'FALSO') return true
  const v = c.valore
  if (campo.tipoValore === 'MULTI_SELECT') return Array.isArray(v) && v.length > 0
  if (campo.tipoValore === 'INTERVALLO') return Array.isArray(v) && v.length === 2 && (v[0] != null || v[1] != null)
  if (campo.tipoValore === 'NUMERO') return typeof v === 'number' && Number.isFinite(v)
  return v != null && String(v).trim() !== ''
}

/** Tutte le condizioni (anche annidate) sono complete. Un gruppo vuoto è valido (= tutti). */
export function regoleValide(r: MailingGruppoRegole, catalogo: MailingCatalogoCampo[]): boolean {
  return r.condizioni.every((c) => (isGruppo(c) ? regoleValide(c, catalogo) : condizioneCompleta(c, catalogo)))
}

/** Numero di condizioni foglia. */
export function contaCondizioni(r: MailingGruppoRegole): number {
  return r.condizioni.reduce((n, c) => n + (isGruppo(c) ? contaCondizioni(c) : 1), 0)
}

export function etichettaOpzione(campo: MailingCatalogoCampo | undefined, v: unknown): string {
  if (v == null) return '…'
  const o = campo?.opzioni?.find((x) => String(x.valore) === String(v))
  if (o) return o.etichetta
  if (campo?.tipoValore === 'MESE') {
    if (v === 'CORRENTE') return 'il mese corrente'
    const n = Number(v)
    return n >= 1 && n <= 12 ? MESI[n - 1] : String(v)
  }
  return String(v)
}

function descriviValore(campo: MailingCatalogoCampo | undefined, c: MailingCondizione): string {
  if (!campo || campo.tipoValore === 'NESSUNO' || c.op === 'VERO' || c.op === 'FALSO') return ''
  const v = c.valore
  if (Array.isArray(v) && campo.tipoValore === 'INTERVALLO') {
    const [min, max] = v as (number | null)[]
    if (min != null && max != null) return `${min} e ${max}`
    if (min != null) return `almeno ${min}`
    if (max != null) return `al massimo ${max}`
    return '…'
  }
  if (Array.isArray(v)) {
    if (!v.length) return '…'
    const etichette = v.map((x) => etichettaOpzione(campo, x))
    return etichette.length === 1 ? `«${etichette[0]}»` : `${etichette.slice(0, -1).map((e) => `«${e}»`).join(', ')} o «${etichette[etichette.length - 1]}»`
  }
  if (v == null || v === '') return '…'
  if (campo.tipoValore === 'NUMERO') return String(v)
  return campo.tipoValore === 'MESE' ? etichettaOpzione(campo, v) : `«${etichettaOpzione(campo, v)}»`
}

function primaMinuscola(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s
}

function descriviCondizione(c: MailingCondizione, catalogo: MailingCatalogoCampo[]): string {
  const campo = catalogo.find((x) => x.campo === c.campo)
  const nome = primaMinuscola(campo?.etichetta ?? c.campo)
  const op = OP_FRASE[c.op] ?? primaMinuscola(c.op)
  if (c.op === 'VERO' || c.op === 'FALSO') return `${nome}: ${op}`
  const valore = descriviValore(campo, c)
  return [nome, op, valore].filter(Boolean).join(' ')
}

function descriviGruppo(r: MailingGruppoRegole, catalogo: MailingCatalogoCampo[], annidato: boolean): string {
  const parti = r.condizioni.map((c) => (isGruppo(c) ? descriviGruppo(c, catalogo, true) : descriviCondizione(c, catalogo))).filter(Boolean)
  if (!parti.length) return ''
  const testo = parti.join(r.operatore === 'E' ? ' e ' : ' oppure ')
  return annidato && parti.length > 1 ? `(${testo})` : testo
}

/** Frase leggibile in italiano: "Contatti con tag include «VIP» e (fonte è «YouTube» oppure …)". */
export function descriviRegole(r: MailingGruppoRegole | null | undefined, catalogo: MailingCatalogoCampo[]): string {
  if (!r) return 'Tutti i contatti iscritti'
  const testo = descriviGruppo(r, catalogo, false)
  return testo ? `Contatti con ${testo}` : 'Tutti i contatti iscritti'
}

