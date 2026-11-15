import type {
  MailingBlocco,
  MailingDocumento,
  MailingImpostazioniDocumento,
  MailingTipoBlocco,
} from '@/services/mailing-service'

/*
  Unico renderer delle email di Email Marketing: documento a blocchi → HTML email-safe.
  Lo stesso HTML va in anteprima, nelle miniature e al backend (che riceve design + html e non ricompila).
  Puro TypeScript, senza React né DOM: gira anche in Node.

  Regole dell'HTML prodotto:
  - tabelle annidate role="presentation", stili inline, larghezza massima = impostazioni.larghezza;
  - media query sotto i 620px: colonne impilate, immagini fluide, margini ridotti;
  - modalità scura: meta color-scheme + @media (prefers-color-scheme: dark) + [data-ogsc] per Outlook.com;
    si scuriscono solo i colori "automatici", mai quelli scelti a mano;
  - pulsanti bulletproof con VML per Outlook desktop;
  - i segnaposto {{...}} non vengono mai escapati; il backend li sostituisce e numera i link
    (ogni href http/https in ordine di apparizione, esclusi i {{...}}: vedi estraiLink).
  Schema dei blocchi: §13 della specifica Email Marketing (portata da Mobilitas HQ, docs/features/email-marketing.md);
  gemello lato server: edodoc-backend MailingDocumentoEmail.
*/

// ───────────────────────── Costanti pubbliche ─────────────────────────

export const IMPOSTAZIONI_DEFAULT: MailingImpostazioniDocumento = {
  larghezza: 600,
  sfondo: '#f4f5f7',
  sfondoContenuto: '#ffffff',
  font: 'Helvetica, Arial, sans-serif',
  // --brand-blue di EdoDoc (style/variables.css): stesso valore di MailingDocumentoEmail nel backend
  colorePrimario: '#1F3A63',
  coloreTesto: '#1d2433',
  raggio: 12,
}

export type MailingSegnaposto = { chiave: string; etichetta: string; esempio: string; gruppo: 'contatto' | 'studio' | 'link' }

/** Segnaposto sostituiti dal backend all'invio (§2). Fallback: {{nome|Ciao}}. */
export const SEGNAPOSTO: MailingSegnaposto[] = [
  { chiave: 'nome', etichetta: 'Nome', esempio: 'Giulia', gruppo: 'contatto' },
  { chiave: 'cognome', etichetta: 'Cognome', esempio: 'Rossi', gruppo: 'contatto' },
  { chiave: 'nome_completo', etichetta: 'Nome e cognome', esempio: 'Giulia Rossi', gruppo: 'contatto' },
  { chiave: 'email', etichetta: 'Email', esempio: 'giulia.rossi@example.com', gruppo: 'contatto' },
  { chiave: 'prossima_visita', etichetta: 'Prossima visita', esempio: 'giovedì 6 novembre alle 17:30', gruppo: 'contatto' },
  { chiave: 'indirizzo_postale', etichetta: 'Indirizzo postale', esempio: 'Dr. Edoardo Bo · Via Roma 12, 10121 Torino', gruppo: 'studio' },
  { chiave: 'anno', etichetta: 'Anno corrente', esempio: String(new Date().getFullYear()), gruppo: 'studio' },
  { chiave: 'link_disiscrizione', etichetta: 'Link disiscrizione', esempio: '#disiscrizione', gruppo: 'link' },
  { chiave: 'link_preferenze', etichetta: 'Link preferenze', esempio: '#preferenze', gruppo: 'link' },
  { chiave: 'link_browser', etichetta: 'Link versione web', esempio: '#versione-web', gruppo: 'link' },
]

export const ETICHETTE_BLOCCO: Record<MailingTipoBlocco, string> = {
  intestazione: 'Intestazione',
  titolo: 'Titolo',
  testo: 'Testo',
  immagine: 'Immagine',
  pulsante: 'Pulsante',
  divisore: 'Divisore',
  spazio: 'Spazio',
  colonne: 'Colonne',
  social: 'Social',
  video: 'Video',
  recensione: 'Recensione',
  html: 'HTML',
  piedipagina: 'Piè di pagina',
}

export const TIPI_BLOCCO = Object.keys(ETICHETTE_BLOCCO) as MailingTipoBlocco[]

export type MailingFont = { valore: string; etichetta: string; google?: string }

/** Font sicuri per le email; quelli con `google` vengono caricati dove il client lo permette (Apple Mail, iOS). */
export const FONT_DISPONIBILI: MailingFont[] = [
  { valore: 'Helvetica, Arial, sans-serif', etichetta: 'Helvetica' },
  { valore: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", etichetta: 'Di sistema' },
  { valore: "Inter, 'Segoe UI', Helvetica, Arial, sans-serif", etichetta: 'Inter', google: 'Inter:wght@400;600;700' },
  { valore: "'DM Sans', Helvetica, Arial, sans-serif", etichetta: 'DM Sans', google: 'DM+Sans:wght@400;600;700' },
  { valore: "Georgia, 'Times New Roman', serif", etichetta: 'Georgia' },
  { valore: "Lora, Georgia, 'Times New Roman', serif", etichetta: 'Lora', google: 'Lora:wght@400;600;700' },
  { valore: "'Trebuchet MS', Helvetica, Arial, sans-serif", etichetta: 'Trebuchet' },
  { valore: 'Verdana, Geneva, sans-serif', etichetta: 'Verdana' },
]

export type MailingReteSocial = 'instagram' | 'facebook' | 'youtube' | 'tiktok' | 'linkedin' | 'sito' | 'whatsapp'

export const RETI_SOCIAL: { rete: MailingReteSocial; etichetta: string; colore: string }[] = [
  { rete: 'instagram', etichetta: 'Instagram', colore: '#e1306c' },
  { rete: 'facebook', etichetta: 'Facebook', colore: '#1877f2' },
  { rete: 'youtube', etichetta: 'YouTube', colore: '#ff0000' },
  { rete: 'tiktok', etichetta: 'TikTok', colore: '#111111' },
  { rete: 'linkedin', etichetta: 'LinkedIn', colore: '#0a66c2' },
  { rete: 'whatsapp', etichetta: 'WhatsApp', colore: '#1faa53' },
  { rete: 'sito', etichetta: 'Sito web', colore: '' },
]

export type MailingRenderOpzioni = {
  preheader?: string | null
  /** Aggiunge data-blocco-id / data-colonna e i segnaposto visivi dei blocchi vuoti (solo anteprima dell'editor). */
  editor?: boolean
  /** auto (default, per l'invio): segue il client · chiaro: niente regole scure · scuro: forza la resa scura (anteprima). */
  schema?: 'auto' | 'chiaro' | 'scuro'
  /** Titolo del documento HTML (di solito l'oggetto). */
  titolo?: string | null
}

// ───────────────────────── Utilità ─────────────────────────

const ID_VALIDO = /^[A-Za-z0-9_-]{1,40}$/

export function nuovoId(): string {
  const caratteri = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  const rnd = typeof crypto !== 'undefined' && 'getRandomValues' in crypto ? crypto.getRandomValues(new Uint8Array(8)) : null
  for (let i = 0; i < 8; i++) s += caratteri[(rnd ? rnd[i] : Math.floor(Math.random() * 256)) % caratteri.length]
  return `b_${s}`
}

const RE_SEGNAPOSTO = /(\{\{[^{}<>]{1,80}\}\})/g

/** Escape HTML del testo, lasciando intatti i segnaposto {{...}}. */
export function escTesto(s: unknown): string {
  const str = s == null ? '' : String(s)
  return str
    .split(RE_SEGNAPOSTO)
    .map((parte, i) => (i % 2 === 1 ? parte : parte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')))
    .join('')
}

/** Escape per un valore di attributo tra doppi apici (i segnaposto restano intatti). */
function escAttr(s: unknown): string {
  return escTesto(s)
}

function decodificaEntita(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
}

/** URL ammessi negli href: http(s), mailto, tel, ancore e segnaposto. Altrimenti stringa vuota. */
export function urlSicuro(url: unknown): string {
  if (typeof url !== 'string') return ''
  const u = url.trim()
  if (!u) return ''
  if (/^\{\{[^{}]+\}\}$/.test(u)) return u
  // eslint-disable-next-line no-control-regex
  const compatto = u.replace(/[\s\u0000-\u001f]/g, '').toLowerCase()
  if (/^(https?:|mailto:|tel:)/.test(compatto)) return u
  if (u.startsWith('#')) return u
  if (/^[a-z][a-z0-9+.-]*:/i.test(compatto)) return ''
  // "www.sito.it" → https://
  if (/^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(u)) return `https://${u}`
  return ''
}

/** Solo immagini remote http(s): mai data URI né javascript:. */
function srcSicuro(url: unknown): string {
  if (typeof url !== 'string') return ''
  const u = url.trim()
  return /^https?:\/\//i.test(u) ? u : ''
}

export function coloreValido(c: unknown): string | null {
  if (typeof c !== 'string') return null
  const v = c.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(v)) return v
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`
  return null
}

function rgb(c: string): [number, number, number] {
  const v = coloreValido(c) ?? '#000000'
  return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)]
}

function hex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')}`
}

/** Miscela a con b: t=0 → a, t=1 → b. */
export function mescola(a: string, b: string, t: number): string {
  const x = rgb(a)
  const y = rgb(b)
  return hex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t])
}

export function luminanza(c: string): number {
  const [r, g, b] = rgb(c).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Testo leggibile (bianco o quasi nero) sopra un fondo. */
export function testoSu(fondo: string): string {
  return luminanza(fondo) > 0.45 ? '#111815' : '#ffffff'
}

function num(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, Math.round(n)))
}

function str(v: unknown, def = ''): string {
  return typeof v === 'string' ? v : def
}

function bool(v: unknown, def: boolean): boolean {
  return typeof v === 'boolean' ? v : def
}

type Allineamento = 'sinistra' | 'centro' | 'destra'

function allin(v: unknown, def: Allineamento = 'sinistra'): Allineamento {
  return v === 'sinistra' || v === 'centro' || v === 'destra' ? v : def
}

const ALIGN: Record<Allineamento, 'left' | 'center' | 'right'> = { sinistra: 'left', centro: 'center', destra: 'right' }

/** ID video YouTube (11 caratteri) da qualsiasi forma di link, o null. */
export function idYoutube(url: unknown): string | null {
  if (typeof url !== 'string') return null
  const u = url.trim()
  if (/^[\w-]{11}$/.test(u)) return u
  const m =
    u.match(/youtu\.be\/([\w-]{11})/i) ??
    u.match(/youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/)([\w-]{11})/i)
  return m ? m[1] : null
}

export function miniaturaYoutube(id: string, qualita: 'maxresdefault' | 'hqdefault' = 'maxresdefault'): string {
  return `https://img.youtube.com/vi/${id}/${qualita}.jpg`
}

// ───────────────────────── Sanificazione ─────────────────────────

const TAG_TESTO: Record<string, string> = {
  p: 'p', br: 'br', strong: 'strong', b: 'strong', em: 'em', i: 'em', u: 'u', a: 'a',
  ul: 'ul', ol: 'ol', li: 'li', h1: 'h2', h2: 'h2', h3: 'h3', h4: 'h3', h5: 'h3', h6: 'h3', div: 'p',
}

const TAG_PERICOLOSI = /<(script|style|iframe|object|embed|noscript|template|svg|math|textarea|select|button|form)\b[\s\S]*?<\/\1\s*>/gi

function attributo(attrs: string, nome: string): string | null {
  const re = new RegExp(`(?:^|\\s)${nome}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i')
  const m = attrs.match(re)
  if (!m) return null
  return decodificaEntita(m[1] ?? m[2] ?? m[3] ?? '')
}

type StiliTesto = { colorePrimario: string; dimensione: number; font: string; coloreTesto: string; automatico: boolean }

/**
 * Sanifica l'HTML dei blocchi testo (whitelist §13: p, br, strong, em, u, a[href], ul/ol/li, h2, h3) e aggiunge
 * gli stili inline da email. Tutto il resto viene tolto (il contenuto testuale resta). Restituisce HTML ben formato.
 */
export function sanificaTesto(html: unknown, stili?: Partial<StiliTesto>): string {
  const s: StiliTesto = {
    colorePrimario: stili?.colorePrimario ?? IMPOSTAZIONI_DEFAULT.colorePrimario,
    dimensione: stili?.dimensione ?? 16,
    font: stili?.font ?? IMPOSTAZIONI_DEFAULT.font,
    coloreTesto: stili?.coloreTesto ?? IMPOSTAZIONI_DEFAULT.coloreTesto,
    automatico: stili?.automatico ?? true,
  }
  let sorgente = typeof html === 'string' ? html : ''
  sorgente = sorgente.replace(/<!--[\s\S]*?-->/g, '').replace(TAG_PERICOLOSI, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')

  const MB = '\u0001MB\u0001'
  const stileTag = (tag: string): string => {
    const d = s.dimensione
    switch (tag) {
      case 'p':
        return `margin:0 0 ${MB};`
      case 'h2':
        return `margin:0 0 ${MB};font-size:${Math.round(d * 1.35)}px;line-height:1.3;font-weight:700;`
      case 'h3':
        return `margin:0 0 ${MB};font-size:${Math.round(d * 1.15)}px;line-height:1.35;font-weight:700;`
      case 'ul':
      case 'ol':
        return `margin:0 0 ${MB};padding:0 0 0 22px;`
      case 'li':
        return 'margin:0 0 6px;'
      case 'strong':
        return 'font-weight:700;'
      case 'a':
        return `color:${s.colorePrimario};text-decoration:underline;`
      default:
        return ''
    }
  }

  const out: string[] = []
  const pila: string[] = []
  const VUOTI = new Set(['br'])
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g
  let ultimo = 0
  let m: RegExpExecArray | null
  const testo = (t: string) => t.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&(?![a-zA-Z]+;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;')
  while ((m = re.exec(sorgente))) {
    out.push(testo(sorgente.slice(ultimo, m.index)))
    ultimo = re.lastIndex
    const chiusura = m[0].startsWith('</')
    const tag = TAG_TESTO[m[1].toLowerCase()]
    if (!tag) continue
    if (chiusura) {
      const i = pila.lastIndexOf(tag)
      if (i === -1) continue
      while (pila.length > i) out.push(`</${pila.pop()}>`)
      continue
    }
    if (VUOTI.has(tag)) {
      out.push('<br>')
      continue
    }
    // Blocchi non annidabili: chiudono il paragrafo aperto
    if ((tag === 'p' || tag === 'h2' || tag === 'h3' || tag === 'ul' || tag === 'ol') && pila.includes('p')) {
      const i = pila.lastIndexOf('p')
      while (pila.length > i) out.push(`</${pila.pop()}>`)
    }
    if (tag === 'a') {
      const href = urlSicuro(attributo(m[2], 'href'))
      out.push(href ? `<a href="${escAttr(href)}" target="_blank" style="${stileTag('a')}">` : `<a style="${stileTag('a')}">`)
    } else {
      const st = stileTag(tag)
      out.push(st ? `<${tag} style="${st}">` : `<${tag}>`)
    }
    pila.push(tag)
  }
  out.push(testo(sorgente.slice(ultimo)))
  while (pila.length) out.push(`</${pila.pop()}>`)

  let risultato = out.join('')
  // Paragrafi vuoti di tiptap → riga vuota visibile
  risultato = risultato.replace(/(<p style="[^"]*">)\s*(<\/p>)/g, '$1<br>$2')
  // Margine inferiore: niente dopo l'ultimo elemento
  const ultimoMb = risultato.lastIndexOf(MB)
  if (ultimoMb !== -1) risultato = `${risultato.slice(0, ultimoMb)}0${risultato.slice(ultimoMb + MB.length)}`
  risultato = risultato.split(MB).join('14px')
  return risultato
}

const MERGE_MAILCHIMP: [RegExp, string][] = [
  [/\*\|FNAME\|\*/g, '{{nome}}'],
  [/\*\|LNAME\|\*/g, '{{cognome}}'],
  [/\*\|EMAIL\|\*/g, '{{email}}'],
  [/\*\|(UNSUB|UNSUBSCRIBE)\|\*/g, '{{link_disiscrizione}}'],
  [/\*\|UPDATE_PROFILE\|\*/g, '{{link_preferenze}}'],
  [/\*\|ARCHIVE\|\*/g, '{{link_browser}}'],
  [/\*\|CURRENT_YEAR\|\*/g, '{{anno}}'],
  [/\*\|(LIST:ADDRESS|LIST:ADDRESSLINE|HTML:LIST_ADDRESS_HTML|LIST_ADDRESS_HTML)\|\*/g, '{{indirizzo_postale}}'],
  [/\*\|MC_PREVIEW_TEXT\|\*/g, ''],
  [/\*\|(IF|ELSE|END|IFNOT|ELSEIF):?[^|]*\|\*/g, ''],
]

/** HTML grezzo (template importati): via script, gestori on*, javascript:, e i merge tag Mailchimp tradotti. */
export function sanificaHtmlGrezzo(html: unknown): string {
  let s = typeof html === 'string' ? html : ''
  s = s.replace(/<(script|iframe|object|embed|applet)\b[\s\S]*?<\/\1\s*>/gi, '')
  s = s.replace(/<(script|iframe|object|embed|applet|base)\b[^>]*>/gi, '')
  s = s.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh[^>]*>/gi, '')
  s = s.replace(/\s(on[a-z]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  s = s.replace(/\s(href|src|action|formaction|xlink:href|background)\s*=\s*(["']?)\s*(javascript|vbscript|data:text\/html)[^"'\s>]*\2/gi, ' $1="#"')
  s = s.replace(/expression\s*\(/gi, '(')
  for (const [re, sost] of MERGE_MAILCHIMP) s = s.replace(re, sost)
  return s
}

// ───────────────────────── Link ─────────────────────────

/**
 * Link tracciabili nell'ordine in cui il backend li numera: ogni href http/https in ordine di apparizione,
 * esclusi i segnaposto {{...}} e quanto sta nei commenti (compresi i blocchi VML condizionali per Outlook).
 */
export function estraiLink(html: string): string[] {
  const pulito = (html ?? '').replace(/<!--[\s\S]*?-->/g, '')
  const link: string[] = []
  const re = /<a\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(pulito))) {
    const url = decodificaEntita((m[1] ?? m[2] ?? m[3] ?? '').trim())
    if (!/^https?:\/\//i.test(url) || url.includes('{{')) continue
    link.push(url)
  }
  return link
}

/** Sostituisce i segnaposto con valori (anteprima). {{chiave|fallback}} usa il fallback se il valore manca. */
export function sostituisciSegnaposto(html: string, valori: Record<string, string | null | undefined>, escape = true): string {
  return html.replace(/\{\{\s*([a-z_]+)\s*(?:\|([^{}]*))?\}\}/gi, (tutto, chiave: string, fallback?: string) => {
    const v = valori[chiave.toLowerCase()]
    const testo = v != null && v !== '' ? v : fallback != null ? fallback : chiave in valori ? '' : tutto
    if (testo === tutto) return tutto
    return escape ? testo.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : testo
  })
}

export function valoriEsempio(): Record<string, string> {
  return Object.fromEntries(SEGNAPOSTO.map((s) => [s.chiave, s.esempio]))
}

// ───────────────────────── Documento ─────────────────────────

export function documentoVuoto(): MailingDocumento {
  return { versione: 1, impostazioni: { ...IMPOSTAZIONI_DEFAULT }, blocchi: [] }
}

type PropsDefault = Record<string, unknown>

function propsDefault(tipo: MailingTipoBlocco): PropsDefault {
  switch (tipo) {
    case 'intestazione':
      return { logoUrl: '', logoLarghezza: 140, link: '', allineamento: 'centro', sfondo: '', testo: 'Dr. Edoardo Bo' }
    case 'titolo':
      return { testo: 'Un titolo che invoglia a leggere', livello: 1, allineamento: 'sinistra', colore: '' }
    case 'testo':
      return {
        html: '<p>Ciao {{nome|}},</p><p>scrivi qui il tuo messaggio. Frasi brevi, un\'idea per paragrafo: chi legge da telefono ti ringrazierà.</p>',
        allineamento: 'sinistra',
        dimensione: 16,
        colore: '',
      }
    case 'immagine':
      return { url: '', alt: '', larghezza: 100, link: '', allineamento: 'centro', raggio: null }
    case 'pulsante':
      return { testo: 'Prenota la chiamata conoscitiva', url: '', colore: '', coloreTesto: '', allineamento: 'centro', larghezzaPiena: false, raggio: null }
    case 'divisore':
      return { colore: '', spessore: 1, margine: 16 }
    case 'spazio':
      return { altezza: 24 }
    case 'colonne':
      return { proporzioni: [50, 50], spazio: 20, impilaSuMobile: true }
    case 'social':
      return {
        link: [
          { rete: 'instagram', url: 'https://www.instagram.com/' },
          { rete: 'facebook', url: 'https://www.facebook.com/' },
          { rete: 'sito', url: 'https://' },
        ],
        allineamento: 'centro',
        stile: 'colore',
      }
    case 'video':
      return { url: '', miniaturaUrl: '', titolo: '' }
    case 'recensione':
      return {
        testo: 'Finalmente un percorso che si adatta alla mia vita: mi sono sentita seguita a ogni passo, senza diete impossibili.',
        autore: 'Giulia R.',
        stelle: 5,
        fonte: 'Google',
      }
    case 'html':
      return { html: '<p style="margin:0">HTML personalizzato</p>' }
    case 'piedipagina':
      return {
        testo: '<p>Ricevi questa email perché sei in contatto con il Dr. Edoardo Bo. Rispondi pure a questo messaggio: ti legge una persona vera.</p>',
        mostraIndirizzo: true,
        mostraPreferenze: true,
      }
  }
}

/** Props facoltative fuori dallo schema base che il renderer usa se presenti. */
const PROPS_EXTRA: Partial<Record<MailingTipoBlocco, string[]>> = {
  immagine: ['naturaleL', 'naturaleA'],
  intestazione: ['naturaleL', 'naturaleA'],
}

export function nuovoBlocco(tipo: MailingTipoBlocco): MailingBlocco {
  const b: MailingBlocco = { id: nuovoId(), tipo, props: propsDefault(tipo) }
  if (tipo === 'colonne') {
    const testo = nuovoBlocco('testo')
    testo.props.html = '<p>Un paragrafo breve per la colonna.</p>'
    const testo2 = nuovoBlocco('testo')
    testo2.props.html = '<p>E qui il secondo punto.</p>'
    b.colonne = [[testo], [testo2]]
  }
  return b
}

/** Copia profonda con id nuovi (anche dei figli nelle colonne). */
export function clonaBlocco(b: MailingBlocco): MailingBlocco {
  const copia: MailingBlocco = { id: nuovoId(), tipo: b.tipo, props: JSON.parse(JSON.stringify(b.props ?? {})) }
  if (b.colonne) copia.colonne = b.colonne.map((col) => col.map(clonaBlocco))
  return copia
}

function normalizzaProporzioni(v: unknown): number[] {
  if (!Array.isArray(v)) return [50, 50]
  const n = v.map((x) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0)).filter((x) => x > 0).slice(0, 3)
  if (n.length < 2) return [50, 50]
  const tot = n.reduce((a, b) => a + b, 0)
  const scalate = n.map((x) => Math.max(10, Math.round((x / tot) * 100)))
  const diff = 100 - scalate.reduce((a, b) => a + b, 0)
  scalate[scalate.length - 1] += diff
  return scalate
}

function normalizzaProps(tipo: MailingTipoBlocco, grezze: unknown): Record<string, unknown> {
  const def = propsDefault(tipo)
  const src = grezze && typeof grezze === 'object' && !Array.isArray(grezze) ? (grezze as Record<string, unknown>) : {}
  const out: Record<string, unknown> = {}
  for (const [k, d] of Object.entries(def)) {
    const v = src[k]
    if (v === undefined) {
      out[k] = d
      continue
    }
    if (k === 'allineamento') out[k] = allin(v, d as Allineamento)
    else if (k === 'proporzioni') out[k] = normalizzaProporzioni(v)
    else if (k === 'link' && tipo === 'social') {
      out[k] = Array.isArray(v)
        ? v
            .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
            .map((x) => ({ rete: RETI_SOCIAL.some((r) => r.rete === x.rete) ? x.rete : 'sito', url: str(x.url) }))
            .slice(0, 8)
        : d
    } else if (k === 'colore' || k === 'coloreTesto' || k === 'sfondo') out[k] = coloreValido(v) ?? ''
    else if (k === 'raggio') out[k] = v === null || v === '' ? null : num(v, 8, 0, 40)
    else if (k === 'stile') out[k] = v === 'colore' || v === 'scuro' || v === 'chiaro' ? v : d
    else if (typeof d === 'number') out[k] = num(v, d, 0, 2000)
    else if (typeof d === 'boolean') out[k] = bool(v, d)
    else if (typeof d === 'string') out[k] = typeof v === 'string' ? v : typeof v === 'number' ? String(v) : d
    else out[k] = v === null ? null : v
  }
  for (const k of PROPS_EXTRA[tipo] ?? []) {
    if (typeof src[k] === 'number' && Number.isFinite(src[k] as number)) out[k] = src[k]
  }
  // Limiti specifici
  if (tipo === 'titolo') out.livello = num(out.livello, 1, 1, 3)
  if (tipo === 'testo') out.dimensione = num(out.dimensione, 16, 12, 24)
  if (tipo === 'immagine') out.larghezza = num(out.larghezza, 100, 10, 100)
  if (tipo === 'intestazione') out.logoLarghezza = num(out.logoLarghezza, 140, 40, 600)
  if (tipo === 'divisore') {
    out.spessore = num(out.spessore, 1, 1, 8)
    out.margine = num(out.margine, 16, 0, 64)
  }
  if (tipo === 'spazio') out.altezza = num(out.altezza, 24, 4, 160)
  if (tipo === 'colonne') out.spazio = num(out.spazio, 20, 0, 48)
  if (tipo === 'recensione') out.stelle = num(out.stelle, 5, 1, 5)
  return out
}

function normalizzaBlocco(x: unknown, ids: Set<string>, annidato: boolean): MailingBlocco | null {
  if (!x || typeof x !== 'object') return null
  const g = x as Record<string, unknown>
  const tipo = g.tipo
  if (typeof tipo !== 'string' || !(tipo in ETICHETTE_BLOCCO)) return null
  const t = tipo as MailingTipoBlocco
  if (annidato && (t === 'colonne' || t === 'piedipagina' || t === 'intestazione')) return null
  let id = typeof g.id === 'string' && ID_VALIDO.test(g.id) ? g.id : nuovoId()
  while (ids.has(id)) id = nuovoId()
  ids.add(id)
  const b: MailingBlocco = { id, tipo: t, props: normalizzaProps(t, g.props) }
  if (t === 'colonne') {
    const prop = b.props.proporzioni as number[]
    const grezze = Array.isArray(g.colonne) ? g.colonne : []
    b.colonne = prop.map((_, i) => {
      const col = Array.isArray(grezze[i]) ? (grezze[i] as unknown[]) : []
      return col.map((c) => normalizzaBlocco(c, ids, true)).filter((c): c is MailingBlocco => c !== null)
    })
  }
  return b
}

/** Valida un documento arrivato da fuori (API, AI, JSON): riempie i default, rigenera id mancanti/duplicati, scarta blocchi sconosciuti. */
export function normalizzaDocumento(x: unknown): MailingDocumento {
  let sorgente = x
  if (typeof sorgente === 'string') {
    try {
      sorgente = JSON.parse(sorgente)
    } catch {
      sorgente = null
    }
  }
  if (!sorgente || typeof sorgente !== 'object') return documentoVuoto()
  const g = sorgente as Record<string, unknown>
  const imp = (g.impostazioni && typeof g.impostazioni === 'object' ? g.impostazioni : {}) as Record<string, unknown>
  const impostazioni: MailingImpostazioniDocumento = {
    larghezza: num(imp.larghezza, IMPOSTAZIONI_DEFAULT.larghezza, 480, 800),
    sfondo: coloreValido(imp.sfondo) ?? IMPOSTAZIONI_DEFAULT.sfondo,
    sfondoContenuto: coloreValido(imp.sfondoContenuto) ?? IMPOSTAZIONI_DEFAULT.sfondoContenuto,
    font: typeof imp.font === 'string' && imp.font.trim() && !/[<>;{}]/.test(imp.font) ? imp.font.trim().slice(0, 160) : IMPOSTAZIONI_DEFAULT.font,
    colorePrimario: coloreValido(imp.colorePrimario) ?? IMPOSTAZIONI_DEFAULT.colorePrimario,
    coloreTesto: coloreValido(imp.coloreTesto) ?? IMPOSTAZIONI_DEFAULT.coloreTesto,
    raggio: num(imp.raggio, IMPOSTAZIONI_DEFAULT.raggio, 0, 32),
  }
  const ids = new Set<string>()
  const blocchi = (Array.isArray(g.blocchi) ? g.blocchi : [])
    .map((b) => normalizzaBlocco(b, ids, false))
    .filter((b): b is MailingBlocco => b !== null)
    .slice(0, 200)
  return { versione: 1, impostazioni, blocchi }
}

/** Documento per un template importato (HTML grezzo, es. Mailchimp). */
export function documentoDaHtml(html: string, impostazioni?: Partial<MailingImpostazioniDocumento>): MailingDocumento {
  return { versione: 1, impostazioni: { ...IMPOSTAZIONI_DEFAULT, ...impostazioni }, blocchi: [{ id: nuovoId(), tipo: 'html', props: { html } }] }
}

/** Cerca un blocco (anche annidato). */
export function trovaBlocco(blocchi: MailingBlocco[], id: string): { blocco: MailingBlocco; genitore: MailingBlocco | null; colonna: number; indice: number } | null {
  for (let i = 0; i < blocchi.length; i++) {
    const b = blocchi[i]
    if (b.id === id) return { blocco: b, genitore: null, colonna: -1, indice: i }
    if (b.colonne) {
      for (let c = 0; c < b.colonne.length; c++) {
        const j = b.colonne[c].findIndex((f) => f.id === id)
        if (j !== -1) return { blocco: b.colonne[c][j], genitore: b, colonna: c, indice: j }
      }
    }
  }
  return null
}

/** Testo semplice del documento (per l'AI degli oggetti e i controlli). */
export function testoSemplice(doc: MailingDocumento): string {
  const parti: string[] = []
  const visita = (b: MailingBlocco) => {
    const p = b.props
    if (b.tipo === 'titolo' || b.tipo === 'pulsante' || b.tipo === 'recensione') parti.push(str(p.testo))
    if (b.tipo === 'testo' || b.tipo === 'html') parti.push(str(p.html).replace(/<[^>]+>/g, ' '))
    b.colonne?.forEach((c) => c.forEach(visita))
  }
  doc.blocchi.forEach(visita)
  return decodificaEntita(parti.join('\n')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim()
}

// ───────────────────────── Render ─────────────────────────

type Tema = {
  imp: MailingImpostazioniDocumento
  testo2: string
  linea: string
  riquadro: string
  editor: boolean
}

type Contesto = { larghezza: number; annidato: boolean; primo: boolean; ultimo: boolean }

const PAD_X = 32
const SCURO = { sfondo: '#0f1412', carta: '#1a201d', ink: '#e8ece9', ink2: '#a7b1ac', linea: '#33403a', riquadro: '#232b27' }

function tabella(contenuto: string, attr = '', stile = ''): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"${attr}${stile ? ` style="${stile}"` : ''}>${contenuto}</table>`
}

function segnapostoEditor(icona: string, testo: string, altezza = 120): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" valign="middle" height="${altezza}" style="height:${altezza}px;border:2px dashed #c9d3ce;border-radius:12px;background:#f6f8f7;color:#6b7a73;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.4;" data-segnaposto-editor=""><div style="font-size:22px;line-height:1;margin-bottom:6px;">${icona}</div>${escTesto(testo)}</td></tr></table>`
}

function colTesto(colore: unknown, t: Tema): { colore: string; classe: string } {
  const c = coloreValido(colore)
  return c ? { colore: c, classe: '' } : { colore: t.imp.coloreTesto, classe: 'mx-ink' }
}

function renderIntestazione(b: MailingBlocco, t: Tema, ctx: Contesto): string {
  const p = b.props
  const al = ALIGN[allin(p.allineamento, 'centro')]
  const logo = srcSicuro(p.logoUrl)
  const larg = Math.min(num(p.logoLarghezza, 140, 40, 600), ctx.larghezza)
  const link = urlSicuro(p.link)
  const testo = str(p.testo).trim()
  const sfondo = coloreValido(p.sfondo)
  const inkSu = sfondo ? testoSu(sfondo) : t.imp.colorePrimario
  let html = ''
  if (logo) {
    const nl = typeof p.naturaleL === 'number' ? p.naturaleL : 0
    const na = typeof p.naturaleA === 'number' ? p.naturaleA : 0
    const alt = nl > 0 && na > 0 ? ` height="${Math.round((larg * na) / nl)}"` : ''
    let img = `<img src="${escAttr(logo)}" width="${larg}"${alt} alt="${escAttr(testo || 'Logo')}" style="display:inline-block;width:${larg}px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;">`
    if (link) img = `<a href="${escAttr(link)}" target="_blank" style="text-decoration:none;">${img}</a>`
    html += img
    if (testo) html += `<div class="${sfondo ? '' : 'mx-ink2'}" style="margin-top:10px;font-family:${escAttr(t.imp.font)};font-size:13px;line-height:1.4;letter-spacing:0.04em;color:${sfondo ? inkSu : t.testo2};">${escTesto(testo)}</div>`
  } else if (testo) {
    let nome = `<span${sfondo ? '' : ' class="mx-primario"'} style="font-family:${escAttr(t.imp.font)};font-size:22px;line-height:1.2;font-weight:700;letter-spacing:-0.01em;color:${inkSu};">${escTesto(testo)}</span>`
    if (link) nome = `<a href="${escAttr(link)}" target="_blank" style="text-decoration:none;color:${inkSu};">${nome}</a>`
    html += nome
  } else if (t.editor) {
    html += segnapostoEditor('◎', 'Aggiungi il logo o il tuo nome', 72)
  }
  return `<div style="text-align:${al};">${html}</div>`
}

function renderTitolo(b: MailingBlocco, t: Tema): string {
  const p = b.props
  const liv = num(p.livello, 1, 1, 3)
  const dim = liv === 1 ? 30 : liv === 2 ? 24 : 19
  const c = colTesto(p.colore, t)
  const testo = str(p.testo).trim()
  if (!testo && !t.editor) return ''
  return `<h${liv}${c.classe ? ` class="${c.classe}"` : ''} style="margin:0;font-family:${escAttr(t.imp.font)};font-size:${dim}px;line-height:1.25;font-weight:700;letter-spacing:-0.01em;color:${c.colore};text-align:${ALIGN[allin(p.allineamento)]};mso-line-height-rule:exactly;">${testo ? escTesto(testo) : '<span style="opacity:.45">Titolo</span>'}</h${liv}>`
}

function renderTesto(b: MailingBlocco, t: Tema): string {
  const p = b.props
  const dim = num(p.dimensione, 16, 12, 24)
  const c = colTesto(p.colore, t)
  let corpo = sanificaTesto(p.html, { colorePrimario: t.imp.colorePrimario, dimensione: dim, font: t.imp.font, coloreTesto: c.colore })
  const vuoto = !corpo.replace(/<[^>]+>/g, '').replace(/&nbsp;|\s/g, '')
  if (vuoto) {
    if (!t.editor) return ''
    corpo = '<p style="margin:0;opacity:.45">Scrivi qui il testo…</p>'
  }
  return `<div${c.classe ? ` class="${c.classe}"` : ''} style="font-family:${escAttr(t.imp.font)};font-size:${dim}px;line-height:1.65;color:${c.colore};text-align:${ALIGN[allin(p.allineamento)]};mso-line-height-rule:exactly;">${corpo}</div>`
}

function renderImmagine(b: MailingBlocco, t: Tema, ctx: Contesto): string {
  const p = b.props
  const url = srcSicuro(p.url)
  if (!url) return t.editor ? segnapostoEditor('▣', 'Trascina un\'immagine o caricala dal pannello', ctx.annidato ? 110 : 180) : ''
  const pct = num(p.larghezza, 100, 10, 100)
  const w = Math.max(20, Math.round((ctx.larghezza * pct) / 100))
  const nl = typeof p.naturaleL === 'number' ? p.naturaleL : 0
  const na = typeof p.naturaleA === 'number' ? p.naturaleA : 0
  const h = nl > 0 && na > 0 ? Math.round((w * na) / nl) : 0
  const raggio = p.raggio == null ? Math.min(t.imp.raggio, 16) : num(p.raggio, 8, 0, 40)
  const al = ALIGN[allin(p.allineamento, 'centro')]
  const link = urlSicuro(p.link)
  let img = `<img class="mx-img" src="${escAttr(url)}" width="${w}"${h ? ` height="${h}"` : ''} alt="${escAttr(str(p.alt))}" style="display:block;width:100%;max-width:${w}px;height:auto;border:0;outline:none;text-decoration:none;border-radius:${raggio}px;${al === 'center' ? 'margin:0 auto;' : al === 'right' ? 'margin:0 0 0 auto;' : ''}">`
  if (link) img = `<a href="${escAttr(link)}" target="_blank" style="text-decoration:none;display:block;">${img}</a>`
  return `<div style="text-align:${al};">${img}</div>`
}

function renderPulsante(b: MailingBlocco, t: Tema, ctx: Contesto): string {
  const p = b.props
  const testo = str(p.testo).trim() || 'Scopri di più'
  const url = urlSicuro(p.url) || '#'
  const fondo = coloreValido(p.colore) ?? t.imp.colorePrimario
  const ink = coloreValido(p.coloreTesto) ?? testoSu(fondo)
  const raggio = p.raggio == null ? Math.min(t.imp.raggio, 999) : num(p.raggio, 8, 0, 40)
  const pieno = bool(p.larghezzaPiena, false)
  const al = ALIGN[allin(p.allineamento, 'centro')]
  const altezza = 50
  const larghezza = pieno ? ctx.larghezza : Math.max(140, Math.min(ctx.larghezza, Math.round(testo.length * 9.2 + 64)))
  const arc = Math.min(50, Math.round((raggio / altezza) * 100))
  const font = escAttr(t.imp.font)
  const vml = `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escAttr(url)}" style="height:${altezza}px;v-text-anchor:middle;width:${larghezza}px;" arcsize="${arc}%" stroke="f" fillcolor="${fondo}"><w:anchorlock/><center style="color:${ink};font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${escTesto(testo)}</center></v:roundrect><![endif]-->`
  const a = `<!--[if !mso]><!--><a href="${escAttr(url)}" target="_blank" class="mx-btn" style="display:${pieno ? 'block' : 'inline-block'};padding:15px 30px;font-family:${font};font-size:16px;font-weight:700;line-height:20px;color:${ink};text-decoration:none;text-align:center;border-radius:${raggio}px;background-color:${fondo};-webkit-text-size-adjust:none;mso-hide:all;">${escTesto(testo)}</a><!--<![endif]-->`
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${al}"${pieno ? ' width="100%"' : ''} style="${al === 'center' ? 'margin:0 auto;' : ''}${pieno ? 'width:100%;' : ''}"><tr><td align="center" bgcolor="${fondo}" style="border-radius:${raggio}px;background-color:${fondo};">${vml}${a}</td></tr></table>`
}

function renderDivisore(b: MailingBlocco, t: Tema): string {
  const p = b.props
  const c = coloreValido(p.colore)
  const sp = num(p.spessore, 1, 1, 8)
  return tabella(`<tr><td class="${c ? '' : 'mx-linea'}" style="border-top:${sp}px solid ${c ?? t.linea};font-size:0;line-height:0;height:0;mso-line-height-rule:exactly;">&nbsp;</td></tr>`)
}

function renderSpazio(b: MailingBlocco): string {
  const h = num(b.props.altezza, 24, 4, 160)
  return tabella(`<tr><td height="${h}" style="height:${h}px;font-size:0;line-height:${h}px;mso-line-height-rule:exactly;">&nbsp;</td></tr>`)
}

function renderSocial(b: MailingBlocco, t: Tema): string {
  const p = b.props
  const link = Array.isArray(p.link) ? (p.link as { rete?: string; url?: string }[]) : []
  const stile = p.stile === 'scuro' || p.stile === 'chiaro' ? p.stile : 'colore'
  const al = ALIGN[allin(p.allineamento, 'centro')]
  const pillole = link
    .map((l) => {
      const rete = RETI_SOCIAL.find((r) => r.rete === l.rete) ?? RETI_SOCIAL[RETI_SOCIAL.length - 1]
      const url = urlSicuro(l.url)
      if (!url || url === 'https://') return ''
      const brand = rete.colore || t.imp.colorePrimario
      const fondo = stile === 'colore' ? brand : stile === 'scuro' ? '#1d2421' : 'transparent'
      const ink = stile === 'chiaro' ? t.imp.coloreTesto : '#ffffff'
      const bordo = stile === 'chiaro' ? `border:1px solid ${t.linea};` : `border:1px solid ${fondo};`
      return `<a href="${escAttr(url)}" target="_blank"${stile === 'chiaro' ? ' class="mx-ink mx-bordo"' : ''} style="display:inline-block;margin:4px;padding:8px 15px;border-radius:999px;${bordo}background-color:${fondo};color:${ink};font-family:${escAttr(t.imp.font)};font-size:13px;line-height:16px;font-weight:700;text-decoration:none;">${escTesto(rete.etichetta)}</a>`
    })
    .filter(Boolean)
    .join('')
  if (!pillole) return t.editor ? segnapostoEditor('◌', 'Aggiungi i link ai profili social', 64) : ''
  return `<div style="text-align:${al};font-size:0;">${pillole}</div>`
}

function renderVideo(b: MailingBlocco, t: Tema, ctx: Contesto): string {
  const p = b.props
  const id = idYoutube(p.url)
  if (!id) return t.editor ? segnapostoEditor('▶', 'Incolla il link di un video YouTube', ctx.annidato ? 110 : 200) : ''
  const url = urlSicuro(p.url) || `https://www.youtube.com/watch?v=${id}`
  const mini = srcSicuro(p.miniaturaUrl) || miniaturaYoutube(id)
  const w = ctx.larghezza
  const h = Math.round((w * 9) / 16)
  const r = Math.min(t.imp.raggio, 16)
  const titolo = str(p.titolo).trim()
  const font = escAttr(t.imp.font)
  const img = `<a href="${escAttr(url)}" target="_blank" style="display:block;text-decoration:none;"><img class="mx-img" src="${escAttr(mini)}" width="${w}" height="${h}" alt="${escAttr(titolo ? `Video: ${titolo}` : 'Guarda il video')}" style="display:block;width:100%;max-width:${w}px;height:auto;border:0;border-radius:${r}px ${r}px 0 0;"></a>`
  const barra = `<a href="${escAttr(url)}" target="_blank" style="display:block;text-decoration:none;">${tabella(
    `<tr><td width="44" valign="middle" style="padding:12px 0 12px 14px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="34" height="34" align="center" valign="middle" bgcolor="#ff0033" style="width:34px;height:34px;border-radius:17px;background-color:#ff0033;color:#ffffff;font-family:Arial,sans-serif;font-size:13px;line-height:34px;">&#9658;</td></tr></table></td><td valign="middle" style="padding:12px 14px 12px 10px;font-family:${font};font-size:15px;line-height:1.35;font-weight:700;color:#ffffff;">${titolo ? escTesto(titolo) : 'Guarda il video'}<div style="font-size:12px;font-weight:400;color:#c4ccc8;margin-top:2px;">Guarda su YouTube</div></td></tr>`,
    ' bgcolor="#151a18"',
    `background-color:#151a18;border-radius:0 0 ${r}px ${r}px;`,
  )}</a>`
  return `${img}${barra}`
}

function renderRecensione(b: MailingBlocco, t: Tema): string {
  const p = b.props
  const stelle = num(p.stelle, 5, 1, 5)
  const autore = str(p.autore).trim()
  const fonte = str(p.fonte).trim()
  const font = escAttr(t.imp.font)
  const r = Math.min(t.imp.raggio, 18)
  const firma = [autore, fonte ? `recensione su ${fonte}` : ''].filter(Boolean).join(' · ')
  return tabella(
    `<tr><td class="mx-riquadro" style="padding:22px 24px;border-radius:${r}px;background-color:${t.riquadro};">` +
      `<div style="font-family:Arial,sans-serif;font-size:18px;line-height:1;letter-spacing:2px;color:#f2a516;">${'&#9733;'.repeat(stelle)}<span style="color:#d5d9d7;">${'&#9733;'.repeat(5 - stelle)}</span></div>` +
      `<div class="mx-ink" style="margin-top:12px;font-family:${font};font-size:17px;line-height:1.55;font-style:italic;color:${t.imp.coloreTesto};">&ldquo;${escTesto(str(p.testo))}&rdquo;</div>` +
      (firma ? `<div class="mx-ink2" style="margin-top:12px;font-family:${font};font-size:13px;line-height:1.4;font-weight:700;color:${t.testo2};">${escTesto(firma)}</div>` : '') +
      `</td></tr>`,
    ` bgcolor="${t.riquadro}"`,
    `border-radius:${r}px;`,
  )
}

function renderHtml(b: MailingBlocco, t: Tema): string {
  let h = sanificaHtmlGrezzo(b.props.html)
  const corpo = h.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)
  if (corpo) h = corpo[1]
  if (!h.trim() && t.editor) return segnapostoEditor('</>', 'Incolla il tuo HTML nel pannello', 80)
  return h
}

function renderPiedipagina(b: MailingBlocco, t: Tema): string {
  const p = b.props
  const font = escAttr(t.imp.font)
  const corpo = sanificaTesto(p.testo, { colorePrimario: t.testo2, dimensione: 12, font: t.imp.font, coloreTesto: t.testo2 })
  const link = `color:${t.testo2};text-decoration:underline;`
  const voci = [`<a href="{{link_disiscrizione}}" target="_blank" class="mx-ink2" style="${link}">Annulla l'iscrizione</a>`]
  if (bool(p.mostraPreferenze, true)) voci.push(`<a href="{{link_preferenze}}" target="_blank" class="mx-ink2" style="${link}">Gestisci le preferenze</a>`)
  voci.push(`<a href="{{link_browser}}" target="_blank" class="mx-ink2" style="${link}">Apri nel browser</a>`)
  return (
    `<div class="mx-ink2" style="font-family:${font};font-size:12px;line-height:1.6;color:${t.testo2};text-align:center;">` +
    (corpo.replace(/<[^>]+>/g, '').trim() ? `<div style="margin-bottom:10px;">${corpo}</div>` : '') +
    (bool(p.mostraIndirizzo, true) ? `<div style="margin-bottom:10px;">{{indirizzo_postale}}</div>` : '') +
    `<div>${voci.join(' &nbsp;·&nbsp; ')}</div>` +
    `</div>`
  )
}

function renderColonne(b: MailingBlocco, t: Tema, ctx: Contesto): string {
  const prop = normalizzaProporzioni(b.props.proporzioni)
  const gap = num(b.props.spazio, 20, 0, 48)
  const impila = bool(b.props.impilaSuMobile, true)
  const tot = ctx.larghezza
  const larghezze = prop.map((x) => Math.floor((tot * x) / 100))
  const colonne = b.colonne ?? []
  const celle = larghezze.map((w, i) => {
    const pl = i === 0 ? 0 : Math.floor(gap / 2)
    const pr = i === larghezze.length - 1 ? 0 : Math.ceil(gap / 2)
    const interna = w - pl - pr
    const figli = (colonne[i] ?? []).map((f, j, arr) => renderAnnidato(f, t, { larghezza: interna, annidato: true, primo: j === 0, ultimo: j === arr.length - 1 })).join('')
    const vuota = !figli && t.editor ? segnapostoEditor('+', 'Trascina qui un blocco', 90) : figli
    const attrCol = t.editor ? ` data-colonna="${escAttr(b.id)}:${i}"` : ''
    return { w, pl, pr, html: vuota, attrCol }
  })
  if (!impila) {
    return tabella(
      `<tr>${celle.map((c) => `<td width="${c.w}" valign="top" style="width:${c.w}px;padding:0 ${c.pr}px 0 ${c.pl}px;"${c.attrCol}>${c.html}</td>`).join('')}</tr>`,
      '',
      'table-layout:fixed;',
    )
  }
  const msoApri = `<!--[if mso]><table role="presentation" width="${tot}" cellpadding="0" cellspacing="0" border="0"><tr><![endif]-->`
  const msoChiudi = `<!--[if mso]></tr></table><![endif]-->`
  const div = celle
    .map(
      (c) =>
        `<!--[if mso]><td width="${c.w}" valign="top"><![endif]--><div class="mx-col" style="display:inline-block;vertical-align:top;width:100%;max-width:${c.w}px;">${tabella(`<tr><td class="mx-col-pad" valign="top" style="padding:0 ${c.pr}px 0 ${c.pl}px;"${c.attrCol}>${c.html}</td></tr>`)}</div><!--[if mso]></td><![endif]-->`,
    )
    .join('')
  return tabella(`<tr><td style="font-size:0;line-height:0;text-align:left;">${msoApri}${div}${msoChiudi}</td></tr>`)
}

function contenutoBlocco(b: MailingBlocco, t: Tema, ctx: Contesto): string {
  switch (b.tipo) {
    case 'intestazione':
      return renderIntestazione(b, t, ctx)
    case 'titolo':
      return renderTitolo(b, t)
    case 'testo':
      return renderTesto(b, t)
    case 'immagine':
      return renderImmagine(b, t, ctx)
    case 'pulsante':
      return renderPulsante(b, t, ctx)
    case 'divisore':
      return renderDivisore(b, t)
    case 'spazio':
      return renderSpazio(b)
    case 'colonne':
      return ctx.annidato ? '' : renderColonne(b, t, ctx)
    case 'social':
      return renderSocial(b, t)
    case 'video':
      return renderVideo(b, t, ctx)
    case 'recensione':
      return renderRecensione(b, t)
    case 'html':
      return renderHtml(b, t)
    case 'piedipagina':
      return renderPiedipagina(b, t)
    default:
      return ''
  }
}

/** Spaziatura verticale [sopra, sotto] di ogni tipo di blocco. */
function spaziatura(b: MailingBlocco): [number, number] {
  switch (b.tipo) {
    case 'intestazione':
      return coloreValido(b.props.sfondo) ? [28, 28] : [28, 12]
    case 'titolo':
      return [14, 6]
    case 'testo':
      return [8, 8]
    case 'immagine':
    case 'video':
      return [12, 12]
    case 'pulsante':
      return [16, 16]
    case 'divisore': {
      const m = num(b.props.margine, 16, 0, 64)
      return [m, m]
    }
    case 'spazio':
      return [0, 0]
    case 'html':
      return [8, 8]
    case 'colonne':
      return [12, 12]
    case 'social':
      return [14, 14]
    case 'recensione':
      return [14, 14]
    case 'piedipagina':
      return [8, 8]
  }
}

function renderAnnidato(b: MailingBlocco, t: Tema, ctx: Contesto): string {
  const html = contenutoBlocco(b, t, ctx)
  if (!html) return ''
  const [su, giu] = spaziatura(b)
  const attr = t.editor ? ` data-blocco-id="${escAttr(b.id)}"` : ''
  return tabella(`<tr><td style="padding:${ctx.primo ? 0 : Math.round(su / 2)}px 0 ${ctx.ultimo ? 0 : Math.round(giu / 2)}px;"${attr}>${html}</td></tr>`)
}

function cssEmail(imp: MailingImpostazioniDocumento, schema: 'auto' | 'chiaro' | 'scuro'): string {
  const primarioScuro = luminanza(imp.colorePrimario) < 0.25 ? mescola(imp.colorePrimario, '#ffffff', 0.45) : imp.colorePrimario
  const scure = `
  .mx-primario,.mx-ink a{color:${primarioScuro} !important;}
  .mx-sfondo{background-color:${SCURO.sfondo} !important;}
  .mx-carta{background-color:${SCURO.carta} !important;}
  .mx-ink,.mx-ink p,.mx-ink li,.mx-ink h1,.mx-ink h2,.mx-ink h3{color:${SCURO.ink} !important;}
  .mx-ink2,.mx-ink2 a,.mx-ink2 p{color:${SCURO.ink2} !important;}
  .mx-linea{border-color:${SCURO.linea} !important;}
  .mx-bordo{border-color:${SCURO.linea} !important;}
  .mx-riquadro{background-color:${SCURO.riquadro} !important;}`
  const ogsc = scure
    .split('\n')
    .filter((r) => r.trim())
    .map((r) => r.trim().replace(/(^|,)\.mx-/g, '$1[data-ogsc] .mx-'))
    .join('\n  ')
  const dark = schema === 'scuro' ? scure : schema === 'auto' ? `@media (prefers-color-scheme: dark){${scure}\n}\n  ${ogsc}` : ''
  return `
  :root{color-scheme:${schema === 'chiaro' ? 'light' : 'light dark'};supported-color-schemes:${schema === 'chiaro' ? 'light' : 'light dark'};}
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
  table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;}
  img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none;}
  a[x-apple-data-detectors]{color:inherit !important;text-decoration:none !important;font-size:inherit !important;font-family:inherit !important;font-weight:inherit !important;line-height:inherit !important;}
  u + #body a{color:inherit;text-decoration:none;font-size:inherit;font-family:inherit;font-weight:inherit;line-height:inherit;}
  #MessageViewBody a{color:inherit;text-decoration:none;font-size:inherit;font-family:inherit;font-weight:inherit;line-height:inherit;}
  .mx-ink a{color:${imp.colorePrimario};}
  @media only screen and (max-width:${imp.larghezza + 20}px){
    .mx-esterno{padding:0 !important;}
    .mx-contenitore{width:100% !important;max-width:100% !important;border-radius:0 !important;}
    .mx-testa{border-radius:0 !important;}
    .mx-pad{padding-left:20px !important;padding-right:20px !important;}
    .mx-col{display:block !important;width:100% !important;max-width:100% !important;}
    .mx-col-pad{padding:0 0 18px 0 !important;}
    .mx-img{width:100% !important;height:auto !important;}
    .mx-btn{display:block !important;}
    h1{font-size:26px !important;}
  }
  ${dark}`
}

function linkFont(font: string): string {
  const f = FONT_DISPONIBILI.find((x) => x.valore === font && x.google)
  if (!f?.google) return ''
  return `<!--[if !mso]><!--><link href="https://fonts.googleapis.com/css2?family=${f.google}&display=swap" rel="stylesheet"><!--<![endif]-->`
}

function preheaderHtml(testo: string | null | undefined): string {
  const t = (testo ?? '').trim()
  if (!t) return ''
  const riempi = '&#847;&zwnj;&nbsp;'.repeat(Math.max(0, 90 - t.length))
  // I commenti delimitano il preheader: il backend può sostituirlo per le varianti A/B
  return `<!--mx-preheader--><div data-mailing-preheader="1" style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;font-family:sans-serif;">${escTesto(t)}${riempi}</div><!--/mx-preheader-->`
}

/**
 * Documento → HTML email completo. Con un solo blocco `html` che contiene già un documento intero
 * (template importati) restituisce quel documento sanificato, con il preheader inserito.
 */
export function renderEmail(doc: MailingDocumento, opzioni?: MailingRenderOpzioni): string {
  const d = doc && Array.isArray(doc.blocchi) && doc.impostazioni ? doc : normalizzaDocumento(doc)
  const imp = { ...IMPOSTAZIONI_DEFAULT, ...d.impostazioni }
  const editor = !!opzioni?.editor
  const schema = opzioni?.schema ?? 'auto'

  if (d.blocchi.length === 1 && d.blocchi[0].tipo === 'html' && /<(html|body)\b/i.test(str(d.blocchi[0].props.html))) {
    let grezzo = sanificaHtmlGrezzo(d.blocchi[0].props.html)
    const pre = preheaderHtml(opzioni?.preheader)
    if (pre) grezzo = grezzo.replace(/<body\b[^>]*>/i, (m) => `${m}${pre}`)
    if (editor) grezzo = grezzo.replace(/<body\b([^>]*)>/i, `<body$1><div data-blocco-id="${escAttr(d.blocchi[0].id)}">`).replace(/<\/body>/i, '</div></body>')
    return /^\s*<!doctype/i.test(grezzo) ? grezzo : `<!DOCTYPE html>${grezzo}`
  }

  const tema: Tema = {
    imp,
    testo2: mescola(imp.coloreTesto, imp.sfondoContenuto, 0.42),
    linea: mescola(imp.coloreTesto, imp.sfondoContenuto, 0.86),
    riquadro: mescola(imp.colorePrimario, imp.sfondoContenuto, 0.93),
    editor,
  }
  const W = imp.larghezza
  const interna = W - PAD_X * 2

  // Il piè di pagina finale sta fuori dalla carta, sul fondo
  const blocchi = d.blocchi
  const fuori = blocchi.length > 0 && blocchi[blocchi.length - 1].tipo === 'piedipagina' ? blocchi[blocchi.length - 1] : null
  const dentro = fuori ? blocchi.slice(0, -1) : blocchi
  const footerFondo = { ...tema, testo2: mescola(imp.coloreTesto, imp.sfondo, 0.45) }

  const righe = dentro
    .map((b, i) => {
      const larghezza = interna
      const html = contenutoBlocco(b, tema, { larghezza, annidato: false, primo: i === 0, ultimo: i === dentro.length - 1 })
      if (!html) return ''
      let [su, giu] = spaziatura(b)
      if (i === 0 && b.tipo !== 'intestazione') su += 20
      if (i === dentro.length - 1) giu += 24
      const px = PAD_X
      const sfondo = b.tipo === 'intestazione' ? coloreValido(b.props.sfondo) : null
      const raggioTop = i === 0 && sfondo ? `border-radius:${imp.raggio}px ${imp.raggio}px 0 0;` : ''
      const attr = editor ? ` data-blocco-id="${escAttr(b.id)}"` : ''
      return `<tr><td class="${px ? 'mx-pad' : ''}${raggioTop ? ' mx-testa' : ''}"${sfondo ? ` bgcolor="${sfondo}"` : ''} style="padding:${su}px ${px}px ${giu}px;${sfondo ? `background-color:${sfondo};` : ''}${raggioTop}"${attr}>${html}</td></tr>`
    })
    .join('')

  const vuotoEditor =
    editor && dentro.length === 0
      ? `<tr><td class="mx-pad" style="padding:32px;" data-vuoto-editor="">${segnapostoEditor('✦', 'Trascina qui il primo blocco, oppure parti da un template', 220)}</td></tr>`
      : ''

  const piede = fuori
    ? `<tr><td class="mx-pad" style="padding:20px ${PAD_X}px 8px;"${editor ? ` data-blocco-id="${escAttr(fuori.id)}"` : ''}>${renderPiedipagina(fuori, footerFondo)}</td></tr>`
    : ''

  const font = escAttr(imp.font)
  const titolo = escTesto(opzioni?.titolo ?? '')
  return `<!DOCTYPE html>
<html lang="it" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
<meta name="color-scheme" content="${schema === 'chiaro' ? 'light' : 'light dark'}">
<meta name="supported-color-schemes" content="${schema === 'chiaro' ? 'light' : 'light dark'}">
<title>${titolo}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<!--[if mso]><style>body,table,td,h1,h2,h3,p,a,li{font-family:Arial,Helvetica,sans-serif !important;}</style><![endif]-->
${linkFont(imp.font)}
<style>${cssEmail(imp, schema)}
</style>
</head>
<body id="body" class="mx-sfondo" style="margin:0;padding:0;width:100%;background-color:${imp.sfondo};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
${preheaderHtml(opzioni?.preheader)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="mx-sfondo" bgcolor="${imp.sfondo}" style="background-color:${imp.sfondo};">
<tr><td align="center" class="mx-esterno" style="padding:28px 12px;">
<!--[if mso]><table role="presentation" width="${W}" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" class="mx-contenitore mx-carta" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${imp.sfondoContenuto}" style="width:100%;max-width:${W}px;margin:0 auto;background-color:${imp.sfondoContenuto};border-radius:${imp.raggio}px;border-collapse:separate;font-family:${font};">
${righe}${vuotoEditor}
</table>
<table role="presentation" class="mx-contenitore" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${W}px;margin:0 auto;">
${piede}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`
}

// ───────────────────────── Template di partenza ─────────────────────────

function b(tipo: MailingTipoBlocco, props: Record<string, unknown> = {}, colonne?: MailingBlocco[][]): MailingBlocco {
  const base = nuovoBlocco(tipo)
  const blocco: MailingBlocco = { id: base.id, tipo, props: { ...base.props, ...props } }
  if (tipo === 'colonne') blocco.colonne = colonne ?? base.colonne
  return blocco
}

function doc(imp: Partial<MailingImpostazioniDocumento>, blocchi: MailingBlocco[]): MailingDocumento {
  return { versione: 1, impostazioni: { ...IMPOSTAZIONI_DEFAULT, ...imp }, blocchi }
}

const SITO = 'https://www.edodoc.it'

export type MailingTemplatePartenza = { chiave: string; nome: string; descrizione: string; categoria: string; documento: MailingDocumento }

/** Template pronti, generati ogni volta con id nuovi. */
export function templatePartenza(): MailingTemplatePartenza[] {
  return [
    {
      chiave: 'newsletter',
      nome: 'Newsletter mensile',
      categoria: 'Newsletter',
      descrizione: 'Le novità, un consiglio pratico e una testimonianza: il formato da mandare una volta al mese.',
      documento: doc({}, [
        b('intestazione', { testo: 'Dr. Edoardo Bo', allineamento: 'centro' }),
        b('titolo', { testo: '{{nome|Ciao}}, ecco le novità di novembre', livello: 1, allineamento: 'centro' }),
        b('testo', {
          allineamento: 'centro',
          html: '<p>Con le giornate più corte cambiano anche le abitudini: si cucina di fretta, ci si muove meno. Ecco cosa ho preparato per te questo mese.</p>',
        }),
        b('divisore', { margine: 18 }),
        b('colonne', { proporzioni: [50, 50], spazio: 24 }, [
          [
            b('titolo', { testo: 'Nuovo video sul canale', livello: 3 }),
            b('testo', { dimensione: 15, html: '<p>Come organizzare la spesa della settimana in venti minuti, senza rinunciare al gusto.</p>' }),
          ],
          [
            b('titolo', { testo: 'Un consiglio in 2 minuti', livello: 3 }),
            b('testo', { dimensione: 15, html: '<p>Inizia il pranzo con una porzione di verdure: sazia di più e aiuta a non arrivare affamato a cena.</p>' }),
          ],
        ]),
        b('recensione', {
          testo: 'Il dottore mi ha spiegato con calma cosa stavamo facendo e perché. Mi sono sentita ascoltata dal primo minuto.',
          autore: 'Francesca M.',
          fonte: 'Google',
          stelle: 5,
        }),
        b('pulsante', { testo: 'Prenota la chiamata conoscitiva', url: `${SITO}/prenota` }),
        b('social', {}),
        b('piedipagina', {}),
      ]),
    },
    {
      chiave: 'consiglio',
      nome: 'Consiglio di alimentazione',
      categoria: 'Contenuti',
      descrizione: 'Un tema solo, spiegato bene, con tre punti pratici e un invito a scriverci.',
      documento: doc({ sfondo: '#eef2f8', colorePrimario: '#1F3A63', font: "Georgia, 'Times New Roman', serif" }, [
        b('intestazione', { testo: 'Dr. Edoardo Bo · Il consiglio del mese', allineamento: 'sinistra' }),
        b('titolo', { testo: 'Fame nervosa la sera dopo il lavoro?', livello: 1 }),
        b('testo', {
          html:
            '<p>Ciao {{nome|}},</p><p>capita a molti: si arriva a casa stanchi e si apre il frigo prima ancora di togliersi la giacca. Spesso non serve stravolgere le abitudini, bastano piccoli accorgimenti.</p><h3>Tre gesti semplici</h3><ul><li><strong>Uno spuntino a metà pomeriggio</strong>: yogurt o frutta secca, per non arrivare a cena affamato.</li><li><strong>Acqua a portata di mano</strong>: spesso la sete si traveste da fame.</li><li><strong>Una pausa prima di mangiare</strong>: dieci minuti per staccare dalla giornata cambiano il modo in cui mangi.</li></ul><p>Se ti capita spesso, scrivimi: capiremo insieme da dove nasce e come gestirla.</p>',
        }),
        b('pulsante', { testo: 'Scrivimi per un consiglio', url: SITO, allineamento: 'sinistra' }),
        b('divisore', {}),
        b('testo', { dimensione: 14, html: '<p><em>Questi consigli non sostituiscono una valutazione personale. Ogni persona è diversa: per questo ogni percorso parte da una visita.</em></p>' }),
        b('piedipagina', {}),
      ]),
    },
    {
      chiave: 'promozione',
      nome: 'Promozione o pacchetto',
      categoria: 'Promozioni',
      descrizione: 'Presenta un pacchetto o un\'iniziativa a tempo con un invito chiaro all\'azione.',
      documento: doc({ sfondo: '#fbf1e8', colorePrimario: '#E27A2C', coloreTesto: '#1d2433', raggio: 16 }, [
        b('intestazione', { testo: 'Dr. Edoardo Bo', sfondo: '#1F3A63', allineamento: 'centro' }),
        b('titolo', { testo: 'Il Metodo Bussola, pensato per te', livello: 1, allineamento: 'centro' }),
        b('testo', {
          allineamento: 'centro',
          html: '<p>{{nome|Ciao}}, fino al 30 novembre puoi iniziare il <strong>Metodo Bussola</strong>: un percorso su misura per cambiare alimentazione senza rinunce impossibili.</p>',
        }),
        b('colonne', { proporzioni: [33, 33, 34], spazio: 12 }, [
          [b('titolo', { testo: '1', livello: 2, allineamento: 'centro', colore: '#E27A2C' }), b('testo', { allineamento: 'centro', dimensione: 14, html: '<p>Chiamata conoscitiva</p>' })],
          [b('titolo', { testo: '2', livello: 2, allineamento: 'centro', colore: '#E27A2C' }), b('testo', { allineamento: 'centro', dimensione: 14, html: '<p>Prima visita e piano su misura</p>' })],
          [b('titolo', { testo: '3', livello: 2, allineamento: 'centro', colore: '#E27A2C' }), b('testo', { allineamento: 'centro', dimensione: 14, html: '<p>Check settimanali</p>' })],
        ]),
        b('pulsante', { testo: 'Prenota la chiamata conoscitiva', url: `${SITO}/prenota`, larghezzaPiena: true }),
        b('testo', { allineamento: 'centro', dimensione: 13, html: '<p>Posti limitati ogni mese. Hai dubbi? Rispondi a questa email.</p>' }),
        b('piedipagina', {}),
      ]),
    },
    {
      chiave: 'semplice',
      nome: 'Comunicazione semplice',
      categoria: 'Comunicazioni',
      descrizione: 'Sembra una email scritta a mano: perfetta per avvisi, orari e comunicazioni di servizio.',
      documento: doc({ sfondo: '#ffffff', sfondoContenuto: '#ffffff', raggio: 0, larghezza: 560 }, [
        b('testo', {
          html:
            '<p>Ciao {{nome|}},</p><p>ti scrivo per avvisarti che <strong>lunedì 1° dicembre non sarò disponibile</strong> per visite e chiamate.</p><p>Gli appuntamenti di quel giorno sono già stati spostati: se il tuo era tra questi, ti contatterò io per trovare insieme un nuovo orario.</p><p>Per qualsiasi cosa rispondi pure a questa email.</p><p>A presto,<br>Edoardo</p>',
        }),
        b('piedipagina', { testo: '' }),
      ]),
    },
  ]
}

export const TEMPLATE_PARTENZA: MailingTemplatePartenza[] = templatePartenza()

/** Dimensione in KB dell'HTML: Gmail taglia i messaggi oltre ~102 KB. */
export function pesoKb(html: string): number {
  return Math.round((new TextEncoder().encode(html).length / 1024) * 10) / 10
}
