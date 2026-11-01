import { differenceInCalendarDays, format, formatDistanceToNowStrict, isSameYear, startOfWeek } from 'date-fns'
import { it } from 'date-fns/locale'
import type { EmailAllegatoRif, EmailIndirizzo, EmailMessaggio, EmailThread } from '@/services/casella-service'

/* Formattazione e logica pura della pagina Email: niente React qui. */

export const CARTELLE_SISTEMA: Record<string, string> = {
  INBOX: 'Posta in arrivo',
  STARRED: 'Speciali',
  SENT: 'Inviate',
  DRAFT: 'Bozze',
  SPAM: 'Spam',
  TRASH: 'Cestino',
}

/** Etichette di sistema che non si mostrano come chip sulle righe. */
export const ETICHETTE_NASCOSTE = new Set([
  'INBOX', 'UNREAD', 'STARRED', 'IMPORTANT', 'SENT', 'DRAFT', 'SPAM', 'TRASH', 'CHAT',
  'CATEGORY_PERSONAL', 'CATEGORY_SOCIAL', 'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS',
])

export const normEmail = (e: string | null | undefined) => (e ?? '').trim().toLowerCase()

export function nomeIndirizzo(i: EmailIndirizzo | null | undefined, mia?: string): string {
  if (!i) return 'Sconosciuto'
  if (mia && normEmail(i.email) === normEmail(mia)) return 'io'
  const nome = i.nome?.replace(/^["']|["']$/g, '').trim()
  return nome || i.email.split('@')[0]
}

/** "Mario" da "Mario Rossi", "mario" da "mario.rossi@x.it". */
export function nomeBreve(i: EmailIndirizzo | null | undefined, mia?: string): string {
  const n = nomeIndirizzo(i, mia)
  if (n === 'io' || n.includes('@')) return n
  const parti = n.includes(',') ? n.split(',').reverse() : n.split(/\s+/)
  return parti[0]?.trim() || n
}

export function inizialiIndirizzo(i: EmailIndirizzo | null | undefined): [string, string] {
  const n = nomeIndirizzo(i)
  const parti = n.replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  if (parti.length >= 2) return [parti[0], parti[parti.length - 1]]
  return [parti[0] ?? i?.email ?? '?', '']
}

/** Data compatta per la riga: ora oggi, "ieri", giorno e mese quest'anno, data completa prima. */
export function dataRiga(ms: number, ora = new Date()): string {
  const d = new Date(ms)
  const giorni = differenceInCalendarDays(ora, d)
  if (giorni <= 0) return format(d, 'HH:mm')
  if (giorni === 1) return 'Ieri'
  if (giorni < 7) return format(d, 'EEE', { locale: it })
  if (isSameYear(d, ora)) return format(d, 'd MMM', { locale: it })
  return format(d, 'dd/MM/yy')
}

export function dataCompleta(ms: number): string {
  const d = new Date(ms)
  return format(d, "EEE d MMM yyyy, HH:mm", { locale: it })
}

export function dataRelativa(ms: number): string {
  return formatDistanceToNowStrict(new Date(ms), { locale: it, addSuffix: true })
}

export type GruppoData = 'Oggi' | 'Ieri' | 'Questa settimana' | 'Questo mese' | string

export function gruppoData(ms: number, ora = new Date()): GruppoData {
  const d = new Date(ms)
  const giorni = differenceInCalendarDays(ora, d)
  if (giorni <= 0) return 'Oggi'
  if (giorni === 1) return 'Ieri'
  if (d >= startOfWeek(ora, { weekStartsOn: 1 })) return 'Questa settimana'
  if (d.getMonth() === ora.getMonth() && d.getFullYear() === ora.getFullYear()) return 'Questo mese'
  const mese = format(d, 'LLLL', { locale: it })
  const etichetta = mese.charAt(0).toUpperCase() + mese.slice(1)
  return isSameYear(d, ora) ? etichetta : `${etichetta} ${d.getFullYear()}`
}

export function dimensioneFile(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

// ───────────────────────── Rispondi e inoltra ─────────────────────────

export type ModoComposer = 'nuova' | 'rispondi' | 'rispondiTutti' | 'inoltra' | 'bozza'

export interface BozzaComposer {
  chiave: string
  modo: ModoComposer
  a: string[]
  cc: string[]
  ccn: string[]
  oggetto: string
  /** Contenuto iniziale dell'editor. */
  html: string
  /** Messaggio citato (risposta/inoltro), aggiunto in coda all'invio e non modificabile. */
  citazione: string | null
  threadId: string | null
  inReplyTo: string | null
  references: string | null
  allegatiEsistenti: (EmailAllegatoRif & { dimensione?: number })[]
  bozzaId: string | null
}

export const nuovaChiave = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

export function formatIndirizzo(i: EmailIndirizzo): string {
  const nome = i.nome?.trim()
  if (!nome) return i.email
  return /[",;<>@]/.test(nome) ? `"${nome.replace(/"/g, '')}" <${i.email}>` : `${nome} <${i.email}>`
}

/** Indirizzo nudo da "Nome <email>". */
export function soloEmail(s: string): string {
  const m = s.match(/<([^>]+)>/)
  return (m ? m[1] : s).trim()
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function prefissa(oggetto: string | null | undefined, prefisso: 'Re' | 'Fwd'): string {
  const base = (oggetto ?? '').trim()
  const regex = prefisso === 'Re' ? /^(re|r|ris)\s*:/i : /^(fwd?|i|inoltro)\s*:/i
  return regex.test(base) ? base : `${prefisso}: ${base}`.trim()
}

/** Ultimo messaggio non bozza del thread: quello a cui si risponde di default. */
export function ultimoMessaggio(thread: EmailThread): EmailMessaggio | null {
  const veri = thread.messaggi.filter((m) => !m.bozza)
  return veri[veri.length - 1] ?? null
}

export function costruisciComposer(
  modo: Exclude<ModoComposer, 'nuova' | 'bozza'>,
  thread: EmailThread,
  m: EmailMessaggio,
  mia: string,
): BozzaComposer {
  const io = normEmail(mia)
  const mittente = m.da
  const daMe = mittente && normEmail(mittente.email) === io
  const rispondiA = m.rispondiA.length > 0 ? m.rispondiA : mittente ? [mittente] : []

  let a: string[] = []
  let cc: string[] = []
  if (modo === 'rispondi' || modo === 'rispondiTutti') {
    // Rispondendo a un mio messaggio si scrive di nuovo ai destinatari originali.
    a = (daMe ? m.a : rispondiA).map(formatIndirizzo)
    if (modo === 'rispondiTutti') {
      const gia = new Set([io, ...a.map((x) => normEmail(soloEmail(x)))])
      cc = [...m.a, ...m.cc]
        .filter((i) => {
          const k = normEmail(i.email)
          if (gia.has(k)) return false
          gia.add(k)
          return true
        })
        .map(formatIndirizzo)
    }
  }

  const quando = format(new Date(m.data), "EEE d MMM yyyy 'alle ore' HH:mm", { locale: it })
  const chi = mittente ? `${escapeHtml(nomeIndirizzo(mittente))} &lt;${escapeHtml(mittente.email)}&gt;` : ''
  const corpo = m.html ?? ''
  let citazione: string
  if (modo === 'inoltra') {
    const righe = [
      '---------- Messaggio inoltrato ---------',
      `Da: ${chi}`,
      `Data: ${escapeHtml(quando)}`,
      `Oggetto: ${escapeHtml(m.oggetto ?? '')}`,
      `A: ${escapeHtml(m.a.map(formatIndirizzo).join(', '))}`,
      ...(m.cc.length ? [`Cc: ${escapeHtml(m.cc.map(formatIndirizzo).join(', '))}`] : []),
    ]
    citazione = `<div class="gmail_quote">${righe.join('<br>')}<br><br>${corpo}</div>`
  } else {
    citazione =
      `<div class="gmail_quote"><div dir="ltr" class="gmail_attr">Il giorno ${escapeHtml(quando)} ${chi} ha scritto:<br></div>` +
      `<blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">${corpo}</blockquote></div>`
  }

  return {
    chiave: nuovaChiave(),
    modo,
    a,
    cc,
    ccn: [],
    oggetto: prefissa(thread.oggetto ?? m.oggetto, modo === 'inoltra' ? 'Fwd' : 'Re'),
    html: '',
    citazione,
    threadId: thread.id,
    inReplyTo: m.messageIdHeader,
    // Il backend aggiunge in coda In-Reply-To.
    references: m.references ?? null,
    allegatiEsistenti:
      modo === 'inoltra'
        ? m.allegati
            .filter((x) => !x.inline)
            .map((x) => ({ messaggioId: x.messaggioId, allegatoId: x.allegatoId, nome: x.nome, mimeType: x.mimeType, dimensione: x.dimensione }))
        : [],
    bozzaId: null,
  }
}

export function composerVuoto(a: string[] = [], oggetto = ''): BozzaComposer {
  return {
    chiave: nuovaChiave(),
    modo: 'nuova',
    a,
    cc: [],
    ccn: [],
    oggetto,
    html: '',
    citazione: null,
    threadId: null,
    inReplyTo: null,
    references: null,
    allegatiEsistenti: [],
    bozzaId: null,
  }
}

// ───────────────────────── Ricerca ─────────────────────────

export interface FiltriRicerca {
  nonLette: boolean
  conAllegati: boolean
  speciali: boolean
}

export const FILTRI_VUOTI: FiltriRicerca = { nonLette: false, conAllegati: false, speciali: false }

/** Testo libero + filtri → query Gmail. */
export function queryGmail(testo: string, filtri: FiltriRicerca): string {
  const parti = [testo.trim()]
  if (filtri.nonLette) parti.push('is:unread')
  if (filtri.conAllegati) parti.push('has:attachment')
  if (filtri.speciali) parti.push('is:starred')
  return parti.filter(Boolean).join(' ')
}

// ───────────────────────── Destinatari recenti ─────────────────────────

const CHIAVE_RECENTI = 'email-destinatari-recenti'

export function leggiRecenti(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHIAVE_RECENTI) || '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 40) : []
  } catch {
    return []
  }
}

export function ricordaRecenti(indirizzi: string[]) {
  try {
    const attuali = leggiRecenti()
    const nuovi = [...indirizzi, ...attuali.filter((x) => !indirizzi.some((i) => normEmail(soloEmail(i)) === normEmail(soloEmail(x))))]
    localStorage.setItem(CHIAVE_RECENTI, JSON.stringify(nuovi.slice(0, 40)))
  } catch {
    /* storage non disponibile */
  }
}

export const EMAIL_VALIDA = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/

export function indirizzoValido(s: string): boolean {
  return EMAIL_VALIDA.test(soloEmail(s))
}
