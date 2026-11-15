import type { TaskEtichetta, TaskLista, TaskOperatore, TaskPriorita } from '@/services/task-service'
import { nomeCompleto } from '@/lib/task-nomi'
import { formatStima, parseStima } from '@/lib/task-stima'

/**
 * Creazione rapida dei task in linguaggio naturale:
 *   "Richiamare Rossi domani 15 @Carlos !alta #Richiamare /Contatti"
 * diventa titolo "Richiamare Rossi" + scadenza domani 15:00 + assegnata a Carlos + priorità alta + etichetta + lista.
 *
 * Regole (deterministiche, senza AI). Nel dubbio il testo resta nel titolo.
 * - Date: oggi, domani, dopodomani; giorni della settimana (lun…dom, con o senza accento, anche "prossimo");
 *   "tra/fra N giorni|settimane|mesi" (N in cifre o lettere); "il 5"; "5/11", "5/11/2026"; "5 nov", "5 novembre 2027".
 *   Un giorno della settimana uguale a oggi vale oggi, con "prossimo" la settimana dopo.
 *   Date senza anno già passate vanno all'anno successivo; "il 5" già passato va al mese successivo.
 *   "entro"/"per" subito prima della data vengono assorbiti ("entro venerdì").
 * - Ore: "alle 9", "ore 9:30", "h15", "15:30" (con i due punti è sempre un orario).
 *   Un numero nudo è un'ora solo subito dopo una data E se è l'ultima parola o è seguito da un altro comando
 *   (@ # / !): "domani 15" sì, "domani 8 pazienti" no. Ore 1–6 senza minuti sono del pomeriggio (alle 3 = 15:00).
 *   Un'ora senza data vale oggi, o domani se l'orario è già passato.
 * - @persona: nome, cognome, NomeCognome o prefisso univoco; "@Nome Cognome" anche con lo spazio; @me / @io.
 * - !priorità: !urgente !alta !normale !bassa (o prefissi: !u !a !n !b); "!" e "!!" = alta, "!!!" = urgente.
 * - #etichetta e /lista: nome senza spazi o prefisso univoco, maiuscole e accenti indifferenti.
 * - ~stima: durata ("~30m", "~1h", "~1h30", "~2,5h").
 * Per data, ora, priorità e lista vale la prima occorrenza (le successive restano testo); persone ed etichette si sommano.
 */

export interface QuickAddContesto {
  operatori: TaskOperatore[]
  etichette: TaskEtichetta[]
  liste: TaskLista[]
  oggi?: Date
  meId?: number
}

export type QuickAddTokenTipo = 'scadenza' | 'ora' | 'assegnatario' | 'priorita' | 'etichetta' | 'lista' | 'stima'

export interface QuickAddToken {
  tipo: QuickAddTokenTipo
  start: number
  end: number
  testo: string
  label: string
}

export interface QuickAddRisultato {
  titolo: string
  scadenza: string | null
  scadenzaOra: string | null
  assegnatariIds: number[]
  priorita: TaskPriorita | null
  /** Stima di durata in minuti ("~1h30") */
  stimaMinuti: number | null
  etichettaIds: number[]
  listaId: number | null
  tokens: QuickAddToken[]
}

// ---------- Normalizzazione (stessa lunghezza del testo originale: gli indici restano validi) ----------

/** Minuscolo senza accenti, carattere per carattere. */
export function normalizzaQuickAdd(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    const base = ch.normalize('NFD')[0] ?? ch
    out += base.length === 1 ? base.toLowerCase() : ch
  }
  return out
}

const chiave = (s: string) => normalizzaQuickAdd(s).replace(/[^a-z0-9]/g, '')

// ---------- Date ----------

const GIORNI: Record<string, number> = {
  dom: 0, domenica: 0,
  lun: 1, lunedi: 1,
  mar: 2, martedi: 2,
  mer: 3, mercoledi: 3,
  gio: 4, giovedi: 4,
  ven: 5, venerdi: 5,
  sab: 6, sabato: 6,
}

const MESI: Record<string, number> = {
  gen: 0, gennaio: 0, feb: 1, febbraio: 1, mar: 2, marzo: 2, apr: 3, aprile: 3, mag: 4, maggio: 4,
  giu: 5, giugno: 5, lug: 6, luglio: 6, ago: 7, agosto: 7, set: 8, sett: 8, settembre: 8,
  ott: 9, ottobre: 9, nov: 10, novembre: 10, dic: 11, dicembre: 11,
}

const NUMERI: Record<string, number> = {
  un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10,
  quindici: 15, venti: 20, trenta: 30,
}

const NOMI_GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']
const NOMI_MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']

const inizioGiorno = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const piuGiorni = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Data valida (es. 31/2 non lo è). */
function dataSicura(anno: number, mese: number, giorno: number): Date | null {
  const d = new Date(anno, mese, giorno)
  return d.getFullYear() === anno && d.getMonth() === mese && d.getDate() === giorno ? d : null
}

function labelData(d: Date, oggi: Date): string {
  const diff = Math.round((inizioGiorno(d).getTime() - inizioGiorno(oggi).getTime()) / 86400000)
  if (diff === 0) return 'Oggi'
  if (diff === 1) return 'Domani'
  if (diff === 2) return 'Dopodomani'
  const g = NOMI_GIORNI[d.getDay()]
  const base = `${g[0].toUpperCase()}${g.slice(1)} ${d.getDate()} ${NOMI_MESI[d.getMonth()]}`
  return d.getFullYear() !== oggi.getFullYear() ? `${base} ${d.getFullYear()}` : base
}

const SEP = String.raw`(?=$|[\s,.;:!?)])`
const INIZIO = String.raw`(?:^|(?<=[\s(]))`
const CONNETTORE = String.raw`(?:(?:entro|per)\s+)?`
const NUM_PAROLA = Object.keys(NUMERI).join('|')
const NOMI_GIORNO_RE = Object.keys(GIORNI).sort((a, b) => b.length - a.length).join('|')
const NOMI_MESE_RE = Object.keys(MESI).sort((a, b) => b.length - a.length).join('|')

interface Candidato {
  tipo: QuickAddTokenTipo
  start: number
  end: number
  /** Per le date: fine della parte "data" (subito dopo può venire un'ora nuda) */
  data?: Date
  ora?: string
  label: string
  valore?: number | string
}

function cercaDate(norm: string, oggi: Date): Candidato[] {
  const out: Candidato[] = []
  const add = (m: RegExpExecArray, d: Date | null) => {
    if (d) out.push({ tipo: 'scadenza', start: m.index, end: m.index + m[0].length, data: d, label: labelData(d, oggi) })
  }
  const anno = oggi.getFullYear()
  const passato = (d: Date) => inizioGiorno(d) < inizioGiorno(oggi)
  let m: RegExpExecArray | null

  // 5 novembre [2027] / 5 nov
  const reMese = new RegExp(`${INIZIO}${CONNETTORE}(?:il\\s+)?(\\d{1,2})\\s+(${NOMI_MESE_RE})(?:\\s+(\\d{4}))?${SEP}`, 'g')
  while ((m = reMese.exec(norm))) {
    let d = dataSicura(m[3] ? Number(m[3]) : anno, MESI[m[2]], Number(m[1]))
    if (d && !m[3] && passato(d)) d = dataSicura(anno + 1, MESI[m[2]], Number(m[1]))
    add(m, d)
  }
  // 5/11[/2026]
  const reSlash = new RegExp(`${INIZIO}${CONNETTORE}(?:il\\s+)?(\\d{1,2})/(\\d{1,2})(?:/(\\d{2}|\\d{4}))?${SEP}`, 'g')
  while ((m = reSlash.exec(norm))) {
    const a = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : anno
    let d = dataSicura(a, Number(m[2]) - 1, Number(m[1]))
    if (d && !m[3] && passato(d)) d = dataSicura(anno + 1, Number(m[2]) - 1, Number(m[1]))
    add(m, d)
  }
  // il 5 (non seguito da mese, ore o altre cifre)
  const reIl = new RegExp(`${INIZIO}${CONNETTORE}il\\s+(\\d{1,2})(?![\\d/:.]|\\s+(?:${NOMI_MESE_RE})${SEP})${SEP}`, 'g')
  while ((m = reIl.exec(norm))) {
    const g = Number(m[1])
    let d = dataSicura(anno, oggi.getMonth(), g)
    if (d && passato(d)) d = dataSicura(oggi.getMonth() === 11 ? anno + 1 : anno, (oggi.getMonth() + 1) % 12, g)
    add(m, d)
  }
  // oggi / domani / dopodomani
  const reRel = new RegExp(`${INIZIO}${CONNETTORE}(oggi|domani|dopodomani)${SEP}`, 'g')
  while ((m = reRel.exec(norm))) add(m, piuGiorni(oggi, m[1] === 'oggi' ? 0 : m[1] === 'domani' ? 1 : 2))
  // tra 3 giorni / fra una settimana / tra 2 mesi
  const reTra = new RegExp(`${INIZIO}(?:tra|fra)\\s+(\\d{1,3}|${NUM_PAROLA})\\s+(giorni|giorno|settimane|settimana|mesi|mese)${SEP}`, 'g')
  while ((m = reTra.exec(norm))) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMERI[m[1]]
    if (!n) continue
    const u = m[2]
    add(m, u.startsWith('giorn') ? piuGiorni(oggi, n) : u.startsWith('settiman') ? piuGiorni(oggi, n * 7)
      : new Date(oggi.getFullYear(), oggi.getMonth() + n, oggi.getDate()))
  }
  // lunedì [prossimo] / prossimo lunedì
  const reGiorno = new RegExp(
    `${INIZIO}${CONNETTORE}(?:(prossim[oa])\\s+)?(${NOMI_GIORNO_RE})(?:\\s+(prossim[oa]))?${SEP}`, 'g')
  while ((m = reGiorno.exec(norm))) {
    const target = GIORNI[m[2]]
    let diff = (target - oggi.getDay() + 7) % 7
    if (diff === 0 && (m[1] || m[3])) diff = 7
    add(m, piuGiorni(oggi, diff))
  }
  return out
}

// ---------- Ore ----------

function oraValida(h: number, min: number, pomeriggio: boolean): string | null {
  let ore = h
  if (pomeriggio && ore >= 1 && ore <= 6) ore += 12
  if (ore < 0 || ore > 23 || min < 0 || min > 59) return null
  return `${String(ore).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`
}

function cercaOre(norm: string, finiDate: number[]): Candidato[] {
  const out: Candidato[] = []
  let m: RegExpExecArray | null
  const add = (m: RegExpExecArray, ora: string | null, start = m.index) => {
    if (ora) out.push({ tipo: 'ora', start, end: m.index + m[0].length, ora, label: ora.slice(0, 5) })
  }
  // alle 9 / ore 9:30 / h15 / h 15.30
  const reAlle = new RegExp(`${INIZIO}(?:alle|ore|h)\\s*(\\d{1,2})(?:[:.](\\d{2}))?${SEP}`, 'g')
  while ((m = reAlle.exec(norm))) add(m, oraValida(Number(m[1]), m[2] ? Number(m[2]) : 0, !m[2]))
  // 15:30 (i due punti bastano a renderlo un orario)
  const reColon = new RegExp(`${INIZIO}(\\d{1,2}):(\\d{2})${SEP}`, 'g')
  while ((m = reColon.exec(norm))) add(m, oraValida(Number(m[1]), Number(m[2]), false))
  // numero nudo subito dopo una data: solo se ultima parola o seguito da un comando
  const reNudo = /\s(\d{1,2})(?:[.](\d{2}))?(?=$|\s+[@#/!]|\s*$)/g
  while ((m = reNudo.exec(norm))) {
    if (!finiDate.includes(m.index)) continue
    add(m, oraValida(Number(m[1]), m[2] ? Number(m[2]) : 0, !m[2]), m.index + 1)
  }
  return out
}

// ---------- Persone, etichette, liste, priorità ----------

function univoco<T>(elementi: T[], chiavi: (e: T) => string[], parola: string): T | null {
  const k = chiave(parola)
  if (!k) return null
  const esatti = elementi.filter((e) => chiavi(e).some((c) => c === k))
  if (esatti.length === 1) return esatti[0]
  if (esatti.length > 1) return null
  const prefisso = elementi.filter((e) => chiavi(e).some((c) => c.startsWith(k)))
  return prefisso.length === 1 ? prefisso[0] : null
}

const chiaviOperatore = (o: TaskOperatore) => [chiave(o.nome), chiave(o.cognome), chiave(`${o.nome}${o.cognome}`)]
const nomeOperatore = (o: TaskOperatore) => nomeCompleto(o)

function cercaPersone(norm: string, ctx: QuickAddContesto): Candidato[] {
  const out: Candidato[] = []
  const re = /(?:^|(?<=[\s(]))@([^\s@#/!,.;:]+)(?:\s+([^\s@#/!,.;:]+))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(norm))) {
    const primo = m[1]
    const start = m.index
    const fineUno = start + 1 + primo.length
    if ((primo === 'me' || primo === 'io') && ctx.meId != null) {
      const me = ctx.operatori.find((o) => o.id === ctx.meId)
      out.push({ tipo: 'assegnatario', start, end: fineUno, valore: ctx.meId, label: me ? nomeOperatore(me) : 'Io' })
      re.lastIndex = fineUno
      continue
    }
    // "@Carlos Torre": nome esatto + cognome (esatto o prefisso) di una sola persona
    if (m[2]) {
      const coppia = ctx.operatori.filter(
        (o) => chiave(o.nome) === chiave(primo) && chiave(m![2]).length >= 2 && chiave(o.cognome).startsWith(chiave(m![2])),
      )
      if (coppia.length === 1) {
        out.push({ tipo: 'assegnatario', start, end: start + m[0].length, valore: coppia[0].id, label: nomeOperatore(coppia[0]) })
        continue
      }
    }
    const o = univoco(ctx.operatori, chiaviOperatore, primo)
    if (o) out.push({ tipo: 'assegnatario', start, end: fineUno, valore: o.id, label: nomeOperatore(o) })
    re.lastIndex = fineUno
  }
  return out
}

function cercaPrefissati(
  norm: string,
  simbolo: '#' | '/',
  trova: (parola: string) => { id: number; nome: string } | null,
  tipo: 'etichetta' | 'lista',
): Candidato[] {
  const out: Candidato[] = []
  const re = new RegExp(`(?:^|(?<=[\\s(]))\\${simbolo}([^\\s@#/!,.;:]+)`, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(norm))) {
    const e = trova(m[1])
    if (e) out.push({ tipo, start: m.index, end: m.index + m[0].length, valore: e.id, label: e.nome })
  }
  return out
}

const PRIORITA: { valore: TaskPriorita; parola: string; label: string }[] = [
  { valore: 'URGENTE', parola: 'urgente', label: 'Urgente' },
  { valore: 'ALTA', parola: 'alta', label: 'Alta' },
  { valore: 'NORMALE', parola: 'normale', label: 'Normale' },
  { valore: 'BASSA', parola: 'bassa', label: 'Bassa' },
]

function cercaPriorita(norm: string): Candidato[] {
  const out: Candidato[] = []
  const re = new RegExp(`${INIZIO}(!{1,3})([a-z]*)${SEP}`, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(norm))) {
    const [, esclamativi, parola] = m
    let p: (typeof PRIORITA)[number] | undefined
    if (parola) {
      if (esclamativi.length !== 1) continue
      p = PRIORITA.find((x) => x.parola.startsWith(parola))
    } else {
      p = PRIORITA.find((x) => x.valore === (esclamativi.length === 3 ? 'URGENTE' : 'ALTA'))
    }
    if (p) out.push({ tipo: 'priorita', start: m.index, end: m.index + m[0].length, valore: p.valore, label: p.label })
  }
  return out
}

function cercaStime(testo: string): Candidato[] {
  const out: Candidato[] = []
  const re = new RegExp(`${INIZIO}~([0-9][0-9.,]*\\s?(?:h|ore|ora|m|min|minuti)?[0-9]{0,2}(?:m|min)?)${SEP}`, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(testo))) {
    const minuti = parseStima(m[1])
    if (minuti) out.push({ tipo: 'stima', start: m.index, end: m.index + m[0].length, valore: minuti, label: formatStima(minuti) })
  }
  return out
}

// ---------- Parser ----------

export interface QuickAddOpzioni {
  /**
   * Parte iniziale del testo da non interpretare (es. il titolo proposto "Domenica Rossi — Riprenotazione":
   * "Domenica" è un nome, non una data). Vale finché il testo inizia ancora così.
   */
  protetto?: string
}

export function parseQuickAdd(testo: string, ctx: QuickAddContesto, opzioni: QuickAddOpzioni = {}): QuickAddRisultato {
  const oggi = ctx.oggi ?? new Date()
  const { protetto } = opzioni
  let norm = normalizzaQuickAdd(testo)
  if (protetto && testo.startsWith(protetto)) norm = ' '.repeat(protetto.length) + norm.slice(protetto.length)

  const date = cercaDate(norm, oggi)
  const persone = cercaPersone(norm, ctx)
  const etichette = cercaPrefissati(norm, '#', (p) => univoco(ctx.etichette, (e) => [chiave(e.nome)], p), 'etichetta')
  const listeAttive = ctx.liste.filter((l) => !l.archiviata)
  const liste = cercaPrefissati(
    norm, '/', (p) => univoco(listeAttive, (l) => [chiave(l.nome), chiave(l.codice ?? '')].filter(Boolean), p), 'lista')
  const priorita = cercaPriorita(norm)
  const stime = cercaStime(norm)

  // Selezione: i comandi espliciti (@ # / !) hanno la precedenza, poi le date (più lunghe prima), poi le ore.
  const scelti: Candidato[] = []
  const libero = (c: Candidato) => scelti.every((s) => c.end <= s.start || c.start >= s.end)
  const prendi = (lista: Candidato[], unico: boolean) => {
    const ordinati = [...lista].sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))
    for (const c of ordinati) {
      if (!libero(c)) continue
      if (unico && scelti.some((s) => s.tipo === c.tipo)) continue
      scelti.push(c)
    }
  }
  prendi(persone, false)
  prendi(etichette, false)
  prendi(liste, true)
  prendi(priorita, true)
  prendi(stime, true)
  // Date: la prima nel testo; a parità di inizio la più lunga ("entro venerdì", "il 5 nov")
  prendi(date, true)
  const primaData = scelti.find((c) => c.tipo === 'scadenza')
  const ore = cercaOre(norm, primaData ? [primaData.end] : [])
  prendi(ore, true)

  const tokens = scelti
    .sort((a, b) => a.start - b.start)
    .map((c) => ({ tipo: c.tipo, start: c.start, end: c.end, testo: testo.slice(c.start, c.end), label: c.label }))

  let titolo = ''
  let cursore = 0
  for (const t of tokens) {
    titolo += testo.slice(cursore, t.start) + ' '
    cursore = t.end
  }
  titolo += testo.slice(cursore)
  titolo = titolo.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim().replace(/^[,;:\-–—]\s*|\s*[,;:\-–—]$/g, '').trim()

  const ora = scelti.find((c) => c.tipo === 'ora')?.ora ?? null
  let data = primaData?.data ?? null
  if (!data && ora) {
    const [h, mi] = ora.split(':').map(Number)
    const passata = oggi.getHours() * 60 + oggi.getMinutes() >= h * 60 + mi
    data = passata ? piuGiorni(oggi, 1) : inizioGiorno(oggi)
  }

  return {
    titolo,
    scadenza: data ? iso(data) : null,
    scadenzaOra: ora,
    assegnatariIds: [...new Set(scelti.filter((c) => c.tipo === 'assegnatario').map((c) => c.valore as number))],
    priorita: (scelti.find((c) => c.tipo === 'priorita')?.valore as TaskPriorita | undefined) ?? null,
    stimaMinuti: (scelti.find((c) => c.tipo === 'stima')?.valore as number | undefined) ?? null,
    etichettaIds: [...new Set(scelti.filter((c) => c.tipo === 'etichetta').map((c) => c.valore as number))],
    listaId: (scelti.find((c) => c.tipo === 'lista')?.valore as number | undefined) ?? null,
    tokens,
  }
}

/** Toglie un token dal testo (chip rimosso), sistemando gli spazi. */
export function rimuoviToken(testo: string, token: Pick<QuickAddToken, 'start' | 'end'>): string {
  const prima = testo.slice(0, token.start).replace(/\s+$/, '')
  const dopo = testo.slice(token.end).replace(/^\s+/, '')
  return prima && dopo ? `${prima} ${dopo}` : prima || dopo
}

/** Parola in composizione con @ # / prima del cursore, per l'autocompletamento. */
export function comandoInCorso(testo: string, cursore: number): { simbolo: '@' | '#' | '/'; query: string; start: number } | null {
  const prima = testo.slice(0, cursore)
  const m = /(?:^|\s)([@#/])([^\s@#/!]*)$/.exec(prima)
  if (!m) return null
  return { simbolo: m[1] as '@' | '#' | '/', query: m[2], start: cursore - m[2].length - 1 }
}

/** Testo da inserire per un elemento scelto dall'autocompletamento (senza spazi: deve restare un token unico). */
export function testoComando(simbolo: '@' | '#' | '/', nome: string): string {
  const compatto = nome
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((p, i) => (i === 0 ? p : p[0].toUpperCase() + p.slice(1)))
    .join('')
  return `${simbolo}${compatto}`
}
