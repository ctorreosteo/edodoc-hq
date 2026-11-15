import {
  AtSign,
  Code2,
  Columns2,
  Heading,
  Image as ImageIcon,
  Minus,
  MousePointerClick,
  MoveVertical,
  PanelBottom,
  PanelTop,
  PlayCircle,
  Quote,
  Type,
  type LucideIcon,
} from 'lucide-react'
import { toast } from '@/lib/toast'
import {
  mailingService,
  messaggioErroreMailing,
  type MailingBlocco,
  type MailingImmagine,
  type MailingImpostazioniDocumento,
  type MailingTipoBlocco,
  type MailingTono,
} from '@/services/mailing-service'

/* Costanti e funzioni dell'editor email condivise tra i componenti (separate per il fast refresh). */

export const PORTALE = { 'data-vl': '', 'data-vl-page': 'mailing' } as const



export const TIPI_IMMAGINE = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
const MAX_MB = 8

/** Carica un'immagine sul backend (mai data URI). Restituisce null se rifiutata. */
export async function caricaImmagineEmail(file: File): Promise<MailingImmagine | null> {
  if (!TIPI_IMMAGINE.includes(file.type)) {
    toast.error('Formato non supportato: usa JPG, PNG, GIF o WebP')
    return null
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    toast.error(`L'immagine supera ${MAX_MB} MB: riducila prima di caricarla`)
    return null
  }
  try {
    return await mailingService.caricaImmagine(file)
  } catch (err) {
    toast.error(messaggioErroreMailing(err, 'Immagine non caricata'))
    return null
  }
}



/** Inserisce testo nella posizione del cursore di un input/textarea controllato. */
export function inserisciAlCursore(el: HTMLInputElement | HTMLTextAreaElement | null, attuale: string, testo: string): { valore: string; cursore: number } {
  const inizio = el?.selectionStart ?? attuale.length
  const fine = el?.selectionEnd ?? attuale.length
  const valore = attuale.slice(0, inizio) + testo + attuale.slice(fine)
  return { valore, cursore: inizio + testo.length }
}



export const ICONE_BLOCCO: Record<MailingTipoBlocco, LucideIcon> = {
  intestazione: PanelTop,
  titolo: Heading,
  testo: Type,
  immagine: ImageIcon,
  pulsante: MousePointerClick,
  divisore: Minus,
  spazio: MoveVertical,
  colonne: Columns2,
  social: AtSign,
  video: PlayCircle,
  recensione: Quote,
  html: Code2,
  piedipagina: PanelBottom,
}



export const GRUPPI_PALETTE: { titolo: string; tipi: MailingTipoBlocco[] }[] = [
  { titolo: 'Contenuto', tipi: ['titolo', 'testo', 'immagine', 'pulsante'] },
  { titolo: 'Struttura', tipi: ['intestazione', 'colonne', 'divisore', 'spazio', 'piedipagina'] },
  { titolo: 'Speciali', tipi: ['recensione', 'video', 'social', 'html'] },
]



/** Riassunto leggibile del blocco per la struttura. */
export function riassunto(b: MailingBlocco): string {
  const p = b.props
  const testo = (v: unknown) =>
    typeof v === 'string'
      ? v
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/\s+/g, ' ')
          .trim()
      : ''
  switch (b.tipo) {
    case 'titolo':
    case 'pulsante':
      return testo(p.testo)
    case 'testo':
      return testo(p.html)
    case 'recensione':
      return testo(p.autore) || testo(p.testo)
    case 'immagine':
      return testo(p.alt) || (p.url ? 'Immagine caricata' : 'Da caricare')
    case 'intestazione':
      return testo(p.testo) || (p.logoUrl ? 'Logo' : '')
    case 'colonne':
      return `${(b.colonne ?? []).length} colonne · ${(b.colonne ?? []).flat().length} blocchi`
    case 'video':
      return testo(p.titolo) || (p.url ? 'YouTube' : 'Link da inserire')
    case 'spazio':
      return `${p.altezza ?? 24} px`
    case 'social':
      return `${Array.isArray(p.link) ? p.link.length : 0} profili`
    case 'html':
      return 'HTML personalizzato'
    case 'piedipagina':
      return 'Disiscrizione, preferenze, indirizzo'
    default:
      return ''
  }
}



export const TEMI_RAPIDI: { nome: string; imp: Partial<MailingImpostazioniDocumento> }[] = [
  { nome: 'EdoDoc', imp: { sfondo: '#f4f5f7', sfondoContenuto: '#ffffff', colorePrimario: '#1F3A63', coloreTesto: '#1d2433' } },
  { nome: 'Arancio', imp: { sfondo: '#fbf1e8', sfondoContenuto: '#ffffff', colorePrimario: '#E27A2C', coloreTesto: '#1d2433' } },
  { nome: 'Mare', imp: { sfondo: '#eaf1f8', sfondoContenuto: '#ffffff', colorePrimario: '#0f4c81', coloreTesto: '#14212e' } },
  { nome: 'Terracotta', imp: { sfondo: '#f6efe7', sfondoContenuto: '#ffffff', colorePrimario: '#b4532a', coloreTesto: '#2a1f1a' } },
  { nome: 'Lavanda', imp: { sfondo: '#f1effa', sfondoContenuto: '#ffffff', colorePrimario: '#5b45c2', coloreTesto: '#1e1a2e' } },
  { nome: 'Carta', imp: { sfondo: '#ffffff', sfondoContenuto: '#ffffff', colorePrimario: '#1d2421', coloreTesto: '#1d2421' } },
  { nome: 'Notte', imp: { sfondo: '#11161a', sfondoContenuto: '#1b2228', colorePrimario: '#5fd0a8', coloreTesto: '#e8eef0' } },
]



/** Mostra/nasconde la zona di rilascio dentro l'iframe (coordinate del documento interno). */
export function mostraZona(iframe: HTMLIFrameElement | null, zona: { top: number; left: number; width: number; height: number } | null) {
  iframe?.contentWindow?.postMessage({ __ml: 1, tipo: 'zona', ...(zona ?? { top: null }) }, '*')
}



export const TONI: { valore: MailingTono; etichetta: string; descrizione: string }[] = [
  { valore: 'CALDO', etichetta: 'Più caldo', descrizione: 'Vicino, personale, accogliente' },
  { valore: 'PROFESSIONALE', etichetta: 'Più professionale', descrizione: 'Chiaro, autorevole, misurato' },
  { valore: 'BREVE', etichetta: 'Più breve', descrizione: 'Stesso messaggio, metà delle parole' },
  { valore: 'URGENTE', etichetta: 'Più diretto', descrizione: 'Invita ad agire adesso, senza pressioni' },
]
