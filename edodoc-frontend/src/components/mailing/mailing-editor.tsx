import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { Blocks, Expand, Eye, FileCode2, LayoutList, Loader2, Monitor, Moon, Redo2, Send, SlidersHorizontal, Smartphone, Sparkles, Undo2, UserRound } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/lib/toast'
import {
  mailingService,
  messaggioErroreMailing,
  type MailingBlocco,
  type MailingDocumento,
  type MailingImpostazioniDocumento,
  type MailingTipoBlocco,
  type MailingTono,
} from '@/services/mailing-service'
import {
  documentoDaHtml,
  ETICHETTE_BLOCCO,
  normalizzaDocumento,
  nuovoBlocco,
  pesoKb,
  renderEmail,
  SEGNAPOSTO,
  sostituisciSegnaposto,
  trovaBlocco,
  valoriEsempio,
} from '@/lib/mailing-render'
import {
  aggiornaProps,
  destinazioneClick,
  duplicaBlocco,
  inserisciBlocco,
  ordineLettura,
  riordinaRadice,
  rimuoviBlocco,
  sostituisciBlocco,
  spostaBlocco,
  contaBlocchi,
  type Destinazione,
} from './mailing-editor-operazioni'
import { TelaEmail, type AzioneTela, type TastoTela, type TelaHandle } from './mailing-editor-tela'
import { FantasmaPalette, PaletteBlocchi, StrutturaBlocchi } from './mailing-editor-palette'
import { PannelloBlocco, PannelloDocumento } from './mailing-editor-proprieta'
import { Segmentato } from './mailing-editor-controlli'
import { caricaImmagineEmail, mostraZona, PORTALE, TONI } from './mailing-editor-dati'
import { AnteprimaSchermoIntero, DialogImportaHtml, DialogInvioProva } from './mailing-editor-strumenti'
import '@/style/lux-mailing.css'
import '@/style/lux-mailing-editor.css'

/*
  Editor email a blocchi (campagne, template, email delle automazioni). Tre zone: blocchi/struttura,
  tela con il render VERO (iframe), proprietà. Cronologia con annulla/ripeti, scorciatoie, drag&drop.
  In barra, sempre: «Importa HTML» (si parte da un HTML già pronto), «Anteprima» a tutto schermo e «Invia prova» (il contenuto a schermo, anche non salvato).
  onChange riceve documento e HTML definitivo (renderEmail senza attributi dell'editor) con un leggero ritardo.
*/

export type MailingEditorProps = {
  documento: MailingDocumento
  onChange: (doc: MailingDocumento, html: string) => void
  aiDisponibile: boolean
  contestoAnteprima?: { oggetto?: string | null; preheader?: string | null }
  /** Mittente e categoria per l'invio di prova; senza, il mittente predefinito. */
  contestoProva?: { mittenteId?: number | null; categoriaId?: number | null }
  /** Facoltativo: oggetti e preheader proposti da "Scrivi con AI". */
  onSuggerimentiAi?: (s: { oggetti: string[]; preheader: string | null }) => void
}

// ───────────────────────── Cronologia ─────────────────────────

type Storia = { passato: MailingDocumento[]; presente: MailingDocumento; futuro: MailingDocumento[]; chiave: string | null; quando: number }
type AzioneStoria = { tipo: 'applica'; doc: MailingDocumento; chiave?: string; ora: number } | { tipo: 'annulla' } | { tipo: 'ripeti' } | { tipo: 'reset'; doc: MailingDocumento }

const MAX_STORIA = 120
const FINESTRA_UNIONE = 1200

function storiaReducer(s: Storia, a: AzioneStoria): Storia {
  switch (a.tipo) {
    case 'applica': {
      if (a.doc === s.presente) return s
      // Modifiche ravvicinate allo stesso campo (digitazione, cursori) = un solo passo
      if (a.chiave && a.chiave === s.chiave && a.ora - s.quando < FINESTRA_UNIONE) return { ...s, presente: a.doc, futuro: [], quando: a.ora }
      return { passato: [...s.passato, s.presente].slice(-MAX_STORIA), presente: a.doc, futuro: [], chiave: a.chiave ?? null, quando: a.ora }
    }
    case 'annulla':
      if (!s.passato.length) return s
      return { passato: s.passato.slice(0, -1), presente: s.passato[s.passato.length - 1], futuro: [s.presente, ...s.futuro], chiave: null, quando: 0 }
    case 'ripeti':
      if (!s.futuro.length) return s
      return { passato: [...s.passato, s.presente], presente: s.futuro[0], futuro: s.futuro.slice(1), chiave: null, quando: 0 }
    case 'reset':
      return { passato: [], presente: a.doc, futuro: [], chiave: null, quando: 0 }
  }
}

// ───────────────────────── Utilità ─────────────────────────

function useMedia(query: string): boolean {
  const [v, setV] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false))
  useEffect(() => {
    const m = window.matchMedia(query)
    const f = () => setV(m.matches)
    f()
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [query])
  return v
}

function staScrivendo(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

const ETICHETTA_SEGNAPOSTO = Object.fromEntries(SEGNAPOSTO.map((s) => [s.chiave, s.etichetta]))

/** Nel testo visibile dell'anteprima i segnaposto diventano pastiglie leggibili ("Nome"), negli attributi restano intatti. */
function evidenziaSegnaposto(html: string): string {
  const corpo = html.indexOf('<body')
  if (corpo === -1) return html
  const testa = html.slice(0, corpo)
  const resto = html
    .slice(corpo)
    .split(/(<[^>]+>)/)
    .map((parte) =>
      parte.startsWith('<')
        ? parte
        : parte.replace(/\{\{\s*([a-z_]+)\s*(?:\|([^{}]*))?\}\}/gi, (_t, k: string, f?: string) => {
            const nome = ETICHETTA_SEGNAPOSTO[k.toLowerCase()] ?? k
            return `<span style="display:inline-block;padding:0 6px;margin:0 1px;border-radius:6px;background:rgba(59,108,246,.12);color:#2f5be0;font-weight:600;font-size:.88em;line-height:1.45;font-style:normal;" title="Segnaposto {{${k}}}${f ? ` · se manca: ${f}` : ''}">${nome}</span>`
          }),
    )
    .join('')
  return testa + resto
}

function leggiAccento(el: HTMLElement | null): string {
  if (!el) return '#3b6cf6'
  const v = getComputedStyle(el).getPropertyValue('--ml-ed-selezione').trim()
  return /^#[0-9a-f]{6}$/i.test(v) ? v : '#3b6cf6'
}

// ───────────────────────── Dialog AI ─────────────────────────

const OBIETTIVI = ['Far prenotare una visita', 'Informare su una novità', 'Dare un consiglio utile', 'Riattivare chi non viene da tempo', 'Presentare un pacchetto']

function DialogScriviAi({
  aperto,
  onChiudi,
  impostazioni,
  haContenuto,
  onRisultato,
}: {
  aperto: boolean
  onChiudi: () => void
  impostazioni: MailingImpostazioniDocumento
  haContenuto: boolean
  onRisultato: (doc: MailingDocumento, modo: 'sostituisci' | 'aggiungi', oggetti: string[], preheader: string | null) => void
}) {
  const [brief, setBrief] = useState('')
  const [tono, setTono] = useState<MailingTono>('CALDO')
  const [obiettivo, setObiettivo] = useState(OBIETTIVI[0])
  const [modo, setModo] = useState<'sostituisci' | 'aggiungi'>(haContenuto ? 'aggiungi' : 'sostituisci')
  const [lavoro, setLavoro] = useState(false)
  useEffect(() => {
    if (aperto) setModo(haContenuto ? 'aggiungi' : 'sostituisci')
  }, [aperto, haContenuto])
  const genera = async () => {
    if (brief.trim().length < 10) {
      toast.info('Racconta in qualche parola di cosa deve parlare l\'email')
      return
    }
    setLavoro(true)
    try {
      const r = await mailingService.aiEmail({ brief: brief.trim(), tono, obiettivo, impostazioni })
      const doc = normalizzaDocumento(r.design)
      if (!doc.blocchi.length) throw new Error('L\'AI non ha prodotto contenuti: riprova con più dettagli')
      onRisultato(doc, modo, r.oggetti ?? [], r.preheader ?? null)
      onChiudi()
    } catch (err) {
      toast.error(messaggioErroreMailing(err, 'Generazione non riuscita'))
    } finally {
      setLavoro(false)
    }
  }
  return (
    <Dialog open={aperto} onOpenChange={(o) => !o && !lavoro && onChiudi()}>
      <DialogContent className="ml-dialog ml-ed-ai-dialog sm:max-w-xl" {...PORTALE}>
        <DialogHeader>
          <DialogTitle className="ml-ed-dialog-titolo">
            <Sparkles /> Scrivi l'email con l'AI
          </DialogTitle>
          <DialogDescription>Descrivi cosa vuoi dire: l'AI prepara titolo, testi e pulsante nello stile della tua email. Poi modifichi tutto come vuoi.</DialogDescription>
        </DialogHeader>
        <div className="ml-ed-ai-corpo">
          <label className="ml-ed-campo">
            <span className="ml-ed-etichetta">Di cosa parla</span>
            <textarea
              className="ml-textarea ml-ed-input ml-ed-area"
              rows={5}
              autoFocus
              value={brief}
              placeholder="Es. A novembre apriamo il martedì sera fino alle 21. Vogliamo invitare chi lavora fino a tardi a prenotare, ricordando che la prima visita dura un'ora."
              onChange={(e) => setBrief(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void genera()
              }}
            />
          </label>
          <div className="ml-ed-campo">
            <span className="ml-ed-etichetta">Obiettivo</span>
            <div className="ml-ed-chips">
              {OBIETTIVI.map((o) => (
                <button key={o} type="button" className={`ml-chip${o === obiettivo ? " ml-chip--attivo" : ""}`} aria-pressed={o === obiettivo} onClick={() => setObiettivo(o)}>
                  {o}
                </button>
              ))}
            </div>
          </div>
          <div className="ml-ed-campo">
            <span className="ml-ed-etichetta">Tono</span>
            <Segmentato ariaLabel="Tono" valore={tono} onChange={setTono} opzioni={TONI.map((t) => { const e = t.etichetta.replace('Più ', ''); return { valore: t.valore, etichetta: e.charAt(0).toUpperCase() + e.slice(1) } })} />
          </div>
          {haContenuto ? (
            <div className="ml-ed-campo">
              <span className="ml-ed-etichetta">Cosa fare con quello che c'è già</span>
              <Segmentato
                ariaLabel="Modalità"
                valore={modo}
                onChange={setModo}
                opzioni={[
                  { valore: 'aggiungi', etichetta: 'Aggiungi in fondo' },
                  { valore: 'sostituisci', etichetta: 'Sostituisci tutto' },
                ]}
              />
            </div>
          ) : null}
          <div className="ml-ed-nota">L'AI riceve solo il testo che scrivi qui: nessun dato dei pazienti. Evita promesse di guarigione: rileggi sempre prima di inviare.</div>
        </div>
        <div className="ml-ed-dialog-azioni">
          <button type="button" className="ml-btn ml-btn--ghost" onClick={onChiudi} disabled={lavoro}>
            Annulla
          </button>
          <button type="button" className="ml-btn ml-btn--ai" onClick={() => void genera()} disabled={lavoro}>
            {lavoro ? <Loader2 className="ml-ed-gira" /> : <Sparkles />}
            {lavoro ? 'Sto scrivendo…' : 'Scrivi l\'email'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ───────────────────────── Editor ─────────────────────────

type Vista = 'desktop' | 'mobile' | 'scuro'
type SchedaMobile = 'blocchi' | 'anteprima' | 'proprieta'

export function MailingEditor({ documento, onChange, aiDisponibile, contestoAnteprima, contestoProva, onSuggerimentiAi }: MailingEditorProps) {
  const [storia, dispatch] = useReducer(storiaReducer, documento, (d) => ({ passato: [], presente: normalizzaDocumento(d), futuro: [], chiave: null, quando: 0 }))
  const doc = storia.presente
  const docRef = useRef(doc)
  docRef.current = doc

  const [selezione, setSelezione] = useState<string | null>(null)
  const [evidenzia, setEvidenzia] = useState<string | null>(null)
  const [vista, setVista] = useState<Vista>('desktop')
  const [conContatto, setConContatto] = useState(false)
  const [schedaSx, setSchedaSx] = useState<'blocchi' | 'struttura'>('blocchi')
  const [schedaMobile, setSchedaMobile] = useState<SchedaMobile>('anteprima')
  const [focusTesto, setFocusTesto] = useState(false)
  const [aiAperto, setAiAperto] = useState(false)
  const [importaAperto, setImportaAperto] = useState(false)
  const [provaAperta, setProvaAperta] = useState(false)
  const [anteprimaPiena, setAnteprimaPiena] = useState<string | null>(null)
  const [trascina, setTrascina] = useState<MailingTipoBlocco | null>(null)
  const [peso, setPeso] = useState(0)
  const [disponibile, setDisponibile] = useState(800)
  const [accento, setAccento] = useState('#3b6cf6')

  const mobile = useMedia('(max-width: 899px)')
  const radice = useRef<HTMLDivElement>(null)
  const telaBox = useRef<HTMLDivElement>(null)
  const tela = useRef<TelaHandle>(null)
  const destinazione = useRef<Destinazione | null>(null)
  const puntatore = useRef<{ x: number; y: number } | null>(null)

  // ── Documento esterno cambiato (es. template caricato): si riparte da capo
  const ricevuto = useRef(documento)
  const emesso = useRef<MailingDocumento | null>(null)
  useEffect(() => {
    if (documento === ricevuto.current) return
    ricevuto.current = documento
    if (documento === emesso.current) return
    dispatch({ tipo: 'reset', doc: normalizzaDocumento(documento) })
    setSelezione(null)
  }, [documento])

  // ── Emissione verso il genitore (con ritardo, e sempre allo smontaggio)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const preheaderRef = useRef(contestoAnteprima?.preheader ?? null)
  preheaderRef.current = contestoAnteprima?.preheader ?? null
  const inSospeso = useRef<MailingDocumento | null>(null)
  const iniziale = useRef(doc)
  const emetti = useCallback((d: MailingDocumento) => {
    inSospeso.current = null
    emesso.current = d
    const html = renderEmail(d, { preheader: preheaderRef.current })
    setPeso(pesoKb(html))
    onChangeRef.current(d, html)
  }, [])
  useEffect(() => {
    if (doc === iniziale.current) {
      setPeso(pesoKb(renderEmail(doc)))
      return
    }
    inSospeso.current = doc
    const t = window.setTimeout(() => emetti(doc), 220)
    return () => window.clearTimeout(t)
  }, [doc, emetti])
  useEffect(
    () => () => {
      if (inSospeso.current) emetti(inSospeso.current)
    },
    [emetti],
  )

  // ── Modifiche
  const applica = useCallback((nuovo: MailingDocumento, chiave?: string) => {
    docRef.current = nuovo
    dispatch({ tipo: 'applica', doc: nuovo, chiave, ora: Date.now() })
  }, [])

  const mobileRef = useRef(mobile)
  mobileRef.current = mobile
  const seleziona = useCallback((id: string | null, focus = false) => {
    setSelezione(id)
    setFocusTesto(focus)
    if (id && mobileRef.current) setSchedaMobile('proprieta')
  }, [])

  const aggiungi = useCallback(
    (tipo: MailingTipoBlocco, dest?: Destinazione) => {
      const d = docRef.current
      if (tipo === 'piedipagina' && d.blocchi.some((b) => b.tipo === 'piedipagina')) {
        toast.info('C\'è già un piè di pagina', { description: 'Ne basta uno, in fondo all\'email.' })
        return
      }
      const annidabile = !['colonne', 'piedipagina', 'intestazione'].includes(tipo)
      const b = nuovoBlocco(tipo)
      const destinazioneFinale = tipo === 'piedipagina' ? { indice: d.blocchi.length } : tipo === 'intestazione' && !dest ? { indice: 0 } : dest ?? destinazioneClick(d, selezione, annidabile)
      applica(inserisciBlocco(d, b, destinazioneFinale))
      setSelezione(b.id)
      setFocusTesto(false)
      if (mobileRef.current) setSchedaMobile('anteprima')
    },
    [applica, selezione],
  )

  const elimina = useCallback(
    (id: string) => {
      const d = docRef.current
      const ordine = ordineLettura(d)
      const i = ordine.indexOf(id)
      const t = trovaBlocco(d.blocchi, id)
      if (!t) return
      const nuovo = rimuoviBlocco(d, id)
      applica(nuovo)
      const resto = ordineLettura(nuovo)
      const prossimo = t.genitore ? (t.genitore.colonne?.[t.colonna]?.[t.indice + 1]?.id ?? t.genitore.id) : (resto[Math.min(i, resto.length - 1)] ?? null)
      setSelezione(resto.includes(prossimo ?? '') ? prossimo : null)
      toast(`${ETICHETTE_BLOCCO[t.blocco.tipo]} eliminato`, { action: { label: 'Annulla', onClick: () => dispatch({ tipo: 'annulla' }) }, duration: 4000 })
    },
    [applica],
  )

  const duplica = useCallback(
    (id: string) => {
      const r = duplicaBlocco(docRef.current, id)
      if (!r.id) return
      applica(r.doc)
      setSelezione(r.id)
    },
    [applica],
  )

  const sposta = useCallback((id: string, delta: number) => applica(spostaBlocco(docRef.current, id, delta)), [applica])

  const aggiornaBlocco = useCallback((id: string, patch: Record<string, unknown>, chiave?: string) => applica(aggiornaProps(docRef.current, id, patch), chiave), [applica])

  const aggiornaImpostazioni = useCallback(
    (patch: Partial<MailingImpostazioniDocumento>, chiave?: string) => {
      const d = docRef.current
      applica({ ...d, impostazioni: { ...d.impostazioni, ...patch } }, chiave ? `imp:${chiave}` : undefined)
    },
    [applica],
  )

  const cambiaColonne = useCallback(
    (id: string, proporzioni: number[]) => {
      const t = trovaBlocco(docRef.current.blocchi, id)
      if (!t) return
      const vecchie = t.blocco.colonne ?? []
      let colonne: MailingBlocco[][]
      if (proporzioni.length >= vecchie.length) colonne = [...vecchie, ...Array.from({ length: proporzioni.length - vecchie.length }, () => [] as MailingBlocco[])]
      else colonne = [...vecchie.slice(0, proporzioni.length - 1), vecchie.slice(proporzioni.length - 1).flat()]
      applica(sostituisciBlocco(docRef.current, id, { ...t.blocco, props: { ...t.blocco.props, proporzioni }, colonne }))
    },
    [applica],
  )

  const azioneTela = useCallback(
    (azione: AzioneTela, id: string) => {
      if (azione === 'elimina') elimina(id)
      else if (azione === 'duplica') duplica(id)
      else if (azione === 'su') sposta(id, -1)
      else if (azione === 'giu') sposta(id, 1)
      else if (azione === 'genitore') {
        const t = trovaBlocco(docRef.current.blocchi, id)
        if (t?.genitore) setSelezione(t.genitore.id)
      }
    },
    [duplica, elimina, sposta],
  )

  // ── Tastiera (dalla pagina e dall'iframe)
  const selezioneRef = useRef(selezione)
  selezioneRef.current = selezione
  const tasto = useCallback(
    (t: TastoTela): boolean => {
      const mod = t.meta || t.ctrl
      const sel = selezioneRef.current
      const k = t.key.length === 1 ? t.key.toLowerCase() : t.key
      if (mod && k === 'z') {
        dispatch({ tipo: t.shift ? 'ripeti' : 'annulla' })
        return true
      }
      if (mod && k === 'y') {
        dispatch({ tipo: 'ripeti' })
        return true
      }
      if (mod && k === 'd' && sel) {
        duplica(sel)
        return true
      }
      if ((k === 'Delete' || k === 'Backspace') && sel && !mod) {
        elimina(sel)
        return true
      }
      if (k === 'Escape') {
        setSelezione(null)
        return true
      }
      if (k === 'ArrowUp' || k === 'ArrowDown') {
        const delta = k === 'ArrowUp' ? -1 : 1
        if (t.alt && sel) {
          sposta(sel, delta)
          return true
        }
        const ordine = ordineLettura(docRef.current)
        if (!ordine.length) return false
        const i = sel ? ordine.indexOf(sel) : -1
        const j = i === -1 ? (delta > 0 ? 0 : ordine.length - 1) : Math.max(0, Math.min(ordine.length - 1, i + delta))
        setSelezione(ordine[j])
        return true
      }
      return false
    },
    [duplica, elimina, sposta],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (staScrivendo(e.target)) return
      const att = document.activeElement
      const dentro = !att || att === document.body || radice.current?.contains(att)
      if (!dentro) return
      // Con un dialog aperto la tastiera è sua
      if (document.querySelector('[role="dialog"][data-state="open"]')) return
      if (tasto({ key: e.key, meta: e.metaKey, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey })) e.preventDefault()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [tasto])

  // ── Immagini: file trascinati nella tela o incollati con un blocco immagine selezionato
  const caricaFile = useCallback(
    async (file: File[], idVicino: string | null) => {
      const f = file.find((x) => x.type.startsWith('image/'))
      if (!f) {
        toast.info('Si possono trascinare solo immagini')
        return
      }
      const id = toast.loading('Carico l\'immagine…')
      const img = await caricaImmagineEmail(f)
      toast.dismiss(id)
      if (!img) return
      const d = docRef.current
      const vicino = idVicino ? trovaBlocco(d.blocchi, idVicino) : null
      const patch = { url: img.url, naturaleL: img.larghezza ?? undefined, naturaleA: img.altezza ?? undefined }
      if (vicino && vicino.blocco.tipo === 'immagine') {
        applica(aggiornaProps(d, vicino.blocco.id, patch))
        setSelezione(vicino.blocco.id)
        return
      }
      const b = nuovoBlocco('immagine')
      b.props = { ...b.props, ...patch, alt: f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ') }
      const dest: Destinazione = vicino
        ? vicino.genitore
          ? { colonnaDi: vicino.genitore.id, colonna: vicino.colonna, indice: vicino.indice + 1 }
          : { indice: vicino.indice + (vicino.blocco.tipo === 'piedipagina' ? 0 : 1) }
        : destinazioneClick(d, null, true)
      applica(inserisciBlocco(d, b, dest))
      setSelezione(b.id)
    },
    [applica],
  )

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (staScrivendo(e.target)) return
      const sel = selezioneRef.current
      const file = Array.from(e.clipboardData?.files ?? [])
      if (!file.length || !radice.current?.contains(document.activeElement ?? null)) return
      e.preventDefault()
      void caricaFile(file, sel)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [caricaFile])

  // ── Larghezza disponibile per la tela e colore di selezione dal tema
  useEffect(() => {
    const el = telaBox.current
    if (!el) return
    const ro = new ResizeObserver(() => setDisponibile(el.clientWidth - 40))
    ro.observe(el)
    setAccento(leggiAccento(radice.current))
    return () => ro.disconnect()
  }, [mobile, schedaMobile])

  // ── HTML dell'anteprima
  const tipi = useMemo(() => {
    const m: Record<string, string> = {}
    for (const b of doc.blocchi) {
      m[b.id] = b.tipo
      b.colonne?.forEach((c) => c.forEach((f) => (m[f.id] = f.tipo)))
    }
    return m
  }, [doc])
  const htmlTela = useMemo(() => {
    const h = renderEmail(doc, { editor: true, schema: vista === 'scuro' ? 'scuro' : 'chiaro', preheader: contestoAnteprima?.preheader })
    return conContatto ? sostituisciSegnaposto(h, valoriEsempio()) : evidenziaSegnaposto(h)
  }, [doc, vista, conContatto, contestoAnteprima?.preheader])

  const larghezzaTela = vista === 'mobile' ? 375 : Math.max(doc.impostazioni.larghezza + 64, 560)

  // ── Drag & drop
  const sensori = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  const calcolaDestinazione = useCallback((x: number, y: number, tipo: MailingTipoBlocco): { dest: Destinazione; zona: { top: number; left: number; width: number; height: number } } | null => {
    const fr = tela.current?.elemento()?.getBoundingClientRect()
    const r = tela.current?.rettangoli()
    if (!fr || !r) return null
    const sc = tela.current?.scala() ?? 1
    if (x < fr.left - 40 || x > fr.right + 40 || y < fr.top - 60 || y > fr.bottom + 60) return null
    const ix = (x - fr.left) / sc
    const iy = (y - fr.top) / sc
    const d = docRef.current
    const annidabile = !['colonne', 'piedipagina', 'intestazione'].includes(tipo)
    if (annidabile) {
      for (const c of r.colonne) {
        if (ix >= c.left && ix <= c.right && iy >= c.top && iy <= c.bottom) {
          const [idCol, n] = c.chiave.split(':')
          const genitore = d.blocchi.find((b) => b.id === idCol)
          const figli = genitore?.colonne?.[Number(n)] ?? []
          const rettFigli = figli.map((f) => r.blocchi.find((x2) => x2.id === f.id)).filter((x2): x2 is NonNullable<typeof x2> => !!x2)
          let indice = rettFigli.findIndex((q) => iy < (q.top + q.bottom) / 2)
          if (indice === -1) indice = figli.length
          return { dest: { colonnaDi: idCol, colonna: Number(n), indice }, zona: { top: c.top - 4, left: c.left - 4, width: c.right - c.left + 8, height: c.bottom - c.top + 8 } }
        }
      }
    }
    const radiceR = d.blocchi.map((b) => r.blocchi.find((q) => q.id === b.id)).filter((q): q is NonNullable<typeof q> => !!q)
    let indice = radiceR.findIndex((q) => iy < (q.top + q.bottom) / 2)
    if (indice === -1) indice = d.blocchi.length
    const piede = d.blocchi.length > 0 && d.blocchi[d.blocchi.length - 1].tipo === 'piedipagina'
    if (piede && tipo !== 'piedipagina' && indice >= d.blocchi.length) indice = d.blocchi.length - 1
    const prima = radiceR[indice - 1]
    const dopo = radiceR[indice]
    const linea = prima && dopo ? (prima.bottom + dopo.top) / 2 : prima ? prima.bottom + 6 : dopo ? dopo.top - 6 : 60
    const left = (dopo ?? prima)?.left ?? 24
    const width = ((dopo ?? prima)?.right ?? larghezzaTela - 24) - left
    return { dest: { indice }, zona: { top: linea - 3, left, width, height: 6 } }
  }, [larghezzaTela])

  const onDragStart = (e: DragStartEvent) => {
    const dati = e.active.data.current as { origine?: string; tipo?: MailingTipoBlocco } | undefined
    if (dati?.origine === 'palette' && dati.tipo) {
      setTrascina(dati.tipo)
      const ev = e.activatorEvent as PointerEvent
      puntatore.current = { x: ev.clientX, y: ev.clientY }
    }
  }
  const onDragMove = (e: DragMoveEvent) => {
    if (!trascina || !puntatore.current) return
    const x = puntatore.current.x + e.delta.x
    const y = puntatore.current.y + e.delta.y
    const r = calcolaDestinazione(x, y, trascina)
    destinazione.current = r?.dest ?? null
    mostraZona(tela.current?.elemento() ?? null, r?.zona ?? null)
  }
  const fineTrascina = () => {
    setTrascina(null)
    destinazione.current = null
    puntatore.current = null
    mostraZona(tela.current?.elemento() ?? null, null)
  }
  const onDragEnd = (e: DragEndEvent) => {
    const dati = e.active.data.current as { origine?: string; tipo?: MailingTipoBlocco } | undefined
    if (dati?.origine === 'palette' && dati.tipo) {
      if (destinazione.current) aggiungi(dati.tipo, destinazione.current)
      fineTrascina()
      return
    }
    if (e.over && e.active.id !== e.over.id) {
      const d = docRef.current
      const da = d.blocchi.findIndex((b) => b.id === e.active.id)
      const a = d.blocchi.findIndex((b) => b.id === e.over!.id)
      if (da !== -1 && a !== -1) applica(riordinaRadice(d, da, a))
    }
  }

  // ── Selezione da fuori (struttura, frecce): porta il blocco in vista
  useEffect(() => {
    if (!selezione) return
    const q = tela.current?.rettangoli().blocchi.find((x) => x.id === selezione)
    const box = telaBox.current
    const fr = tela.current?.elemento()
    if (!q || !box || !fr) return
    const sc = tela.current?.scala() ?? 1
    const offset = fr.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop
    const top = offset + q.top * sc
    const bottom = offset + q.bottom * sc
    if (top < box.scrollTop + 40 || bottom > box.scrollTop + box.clientHeight - 40) box.scrollTo({ top: Math.max(0, top - 120), behavior: 'smooth' })
  }, [selezione])

  const trovato = selezione ? trovaBlocco(doc.blocchi, selezione) : null
  useEffect(() => {
    if (selezione && !trovato) setSelezione(null)
  }, [selezione, trovato])

  const risultatoAi = (nuovo: MailingDocumento, modo: 'sostituisci' | 'aggiungi', oggetti: string[], preheader: string | null) => {
    const d = docRef.current
    if (modo === 'sostituisci') applica({ ...d, blocchi: nuovo.blocchi })
    else {
      const piede = d.blocchi.findIndex((b) => b.tipo === 'piedipagina')
      const nuovi = nuovo.blocchi.filter((b) => b.tipo !== 'piedipagina' || piede === -1)
      const i = piede === -1 ? d.blocchi.length : piede
      applica({ ...d, blocchi: [...d.blocchi.slice(0, i), ...nuovi, ...d.blocchi.slice(i)] })
    }
    setSelezione(null)
    onSuggerimentiAi?.({ oggetti, preheader })
    toast.success('Bozza pronta', { description: 'Rileggila e personalizzala: puoi annullare con ⌘Z.' })
  }

  // ── Zone
  const zonaSx = (
    <aside className="ml-ed-sx" aria-label="Blocchi e struttura">
      <div className="ml-ed-sx-schede" role="tablist">
        <button type="button" role="tab" aria-selected={schedaSx === 'blocchi'} data-attivo={schedaSx === 'blocchi' ? '' : undefined} onClick={() => setSchedaSx('blocchi')}>
          <Blocks /> Blocchi
        </button>
        <button type="button" role="tab" aria-selected={schedaSx === 'struttura'} data-attivo={schedaSx === 'struttura' ? '' : undefined} onClick={() => setSchedaSx('struttura')}>
          <LayoutList /> Struttura <span className="ml-ed-conta">{contaBlocchi(doc)}</span>
        </button>
      </div>
      <div className="ml-ed-sx-corpo">
        {schedaSx === 'blocchi' ? (
          <PaletteBlocchi onAggiungi={(t) => aggiungi(t)} />
        ) : (
          <StrutturaBlocchi documento={doc} selezione={selezione} onSeleziona={(id) => seleziona(id)} onEvidenzia={setEvidenzia} onDuplica={duplica} onElimina={elimina} />
        )}
      </div>
    </aside>
  )

  const zonaTela = (
    <div className="ml-ed-tela" ref={telaBox} data-vista={vista} data-trascina={trascina ? '' : undefined} onClick={(e) => e.target === e.currentTarget && setSelezione(null)}>
      {contestoAnteprima?.oggetto || contestoAnteprima?.preheader ? (
        <div className="ml-ed-busta" style={{ width: Math.min(larghezzaTela, Math.max(320, disponibile)) }}>
          <span className="ml-ed-busta-oggetto">{contestoAnteprima.oggetto || 'Senza oggetto'}</span>
          {contestoAnteprima.preheader ? <span className="ml-ed-busta-pre">{contestoAnteprima.preheader}</span> : null}
        </div>
      ) : null}
      <div className={vista === 'mobile' ? 'ml-ed-telefono' : 'ml-ed-foglio'}>
        {vista === 'mobile' ? <div className="ml-ed-telefono-notch" aria-hidden /> : null}
        <TelaEmail
          ref={tela}
          html={htmlTela}
          tipi={tipi}
          selezione={selezione}
          evidenzia={evidenzia}
          larghezza={larghezzaTela}
          disponibile={vista === 'mobile' ? 375 : disponibile}
          accento={accento}
          titolo="Anteprima modificabile dell'email"
          onSeleziona={(id) => seleziona(id)}
          onDoppioClick={(id) => seleziona(id, true)}
          onAzione={azioneTela}
          onTasto={(t) => void tasto(t)}
          onFile={(f, id) => void caricaFile(f, id)}
        />
      </div>
    </div>
  )

  const zonaDx = (
    <aside className="ml-ed-dx" aria-label="Proprietà">
      {trovato ? (
        <PannelloBlocco
          blocco={trovato.blocco}
          genitore={trovato.genitore}
          documento={doc}
          aiDisponibile={aiDisponibile}
          focusTesto={focusTesto}
          onAggiorna={(patch, chiave) => aggiornaBlocco(trovato.blocco.id, patch, chiave)}
          onCambiaColonne={(p) => cambiaColonne(trovato.blocco.id, p)}
          onSeleziona={(id) => seleziona(id)}
          onAggiungiFiglio={(c, t) => {
            const len = trovato.blocco.colonne?.[c]?.length ?? 0
            aggiungi(t, { colonnaDi: trovato.blocco.id, colonna: c, indice: len })
          }}
          onDuplica={() => duplica(trovato.blocco.id)}
          onElimina={() => elimina(trovato.blocco.id)}
          onChiudi={() => setSelezione(null)}
        />
      ) : (
        <PannelloDocumento imp={doc.impostazioni} onAggiorna={aggiornaImpostazioni} />
      )}
    </aside>
  )

  return (
    <div className="ml-ed" ref={radice} data-mobile={mobile ? '' : undefined}>
      <div className="ml-ed-barra" role="toolbar" aria-label="Strumenti dell'editor">
        <div className="ml-ed-barra-gruppo">
          <button type="button" className="ml-ed-icona-btn" onClick={() => dispatch({ tipo: 'annulla' })} disabled={!storia.passato.length} title="Annulla (⌘Z)" aria-label="Annulla">
            <Undo2 />
          </button>
          <button type="button" className="ml-ed-icona-btn" onClick={() => dispatch({ tipo: 'ripeti' })} disabled={!storia.futuro.length} title="Ripeti (⇧⌘Z)" aria-label="Ripeti">
            <Redo2 />
          </button>
          <span className="ml-ed-barra-sep" aria-hidden />
          <Segmentato
            ariaLabel="Anteprima"
            soloIcone={mobile}
            valore={vista}
            onChange={setVista}
            opzioni={[
              { valore: 'desktop', etichetta: 'Computer', icona: <Monitor /> },
              { valore: 'mobile', etichetta: 'Telefono', icona: <Smartphone /> },
              { valore: 'scuro', etichetta: 'Scuro', icona: <Moon /> },
            ]}
          />
          <button
            type="button"
            className="ml-ed-interr"
            data-attivo={conContatto ? '' : undefined}
            aria-pressed={conContatto}
            onClick={() => setConContatto((v) => !v)}
            title="Mostra i segnaposto con i dati di un contatto d'esempio"
          >
            <UserRound />
            <span>{mobile ? 'Esempio' : 'Anteprima con contatto'}</span>
          </button>
        </div>
        <div className="ml-ed-barra-gruppo">
          <span
            className="ml-ed-peso"
            data-tono={peso > 95 ? 'errore' : peso > 75 ? 'avviso' : undefined}
            title={peso > 95 ? 'Gmail taglia le email oltre ~102 KB: accorcia o togli l\'HTML incollato' : 'Peso dell\'email. Gmail taglia oltre ~102 KB.'}
          >
            {peso.toLocaleString('it-IT')} KB
          </span>
          <button type="button" className="ml-btn ml-btn--sm" onClick={() => setImportaAperto(true)} title="Parti da un'email in HTML già pronta" aria-label="Importa HTML">
            <FileCode2 />
            {mobile ? null : <span>Importa HTML</span>}
          </button>
          <button type="button" className="ml-btn ml-btn--sm" onClick={() => setAnteprimaPiena(renderEmail(docRef.current, { preheader: preheaderRef.current }))} title="Guarda l'email a tutto schermo, come la riceve il paziente" aria-label="Anteprima a tutto schermo">
            <Expand />
            {mobile ? null : <span>Anteprima</span>}
          </button>
          <button type="button" className="ml-btn ml-btn--sm" onClick={() => setProvaAperta(true)} title="Manda l'email com'è adesso a un indirizzo a scelta" aria-label="Invia prova">
            <Send />
            {mobile ? null : <span>Invia prova</span>}
          </button>
          {aiDisponibile ? (
            <button type="button" className="ml-btn ml-btn--ai ml-btn--sm" onClick={() => setAiAperto(true)}>
              <Sparkles />
              <span>Scrivi con AI</span>
            </button>
          ) : null}
        </div>
      </div>

      <DndContext sensors={sensori} collisionDetection={closestCenter} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={fineTrascina}>
        {mobile ? (
          <>
            <div className="ml-ed-mobile-schede" role="tablist" aria-label="Sezioni dell'editor">
              {(
                [
                  ['blocchi', 'Blocchi', <Blocks key="b" />],
                  ['anteprima', 'Anteprima', <Eye key="e" />],
                  ['proprieta', trovato ? ETICHETTE_BLOCCO[trovato.blocco.tipo] : 'Stile', <SlidersHorizontal key="s" />],
                ] as [SchedaMobile, string, React.ReactNode][]
              ).map(([k, l, i]) => (
                <button key={k} type="button" role="tab" aria-selected={schedaMobile === k} data-attivo={schedaMobile === k ? '' : undefined} onClick={() => setSchedaMobile(k)}>
                  {i}
                  {l}
                </button>
              ))}
            </div>
            <div className="ml-ed-corpo" data-scheda={schedaMobile}>
              {schedaMobile === 'blocchi' ? zonaSx : schedaMobile === 'anteprima' ? zonaTela : zonaDx}
            </div>
          </>
        ) : (
          <div className="ml-ed-corpo">
            {zonaSx}
            {zonaTela}
            {zonaDx}
          </div>
        )}
        <DragOverlay dropAnimation={null}>{trascina ? <FantasmaPalette tipo={trascina} /> : null}</DragOverlay>
      </DndContext>

      <DialogImportaHtml
        aperto={importaAperto}
        onChiudi={() => setImportaAperto(false)}
        haContenuto={doc.blocchi.some((b) => b.tipo !== 'piedipagina')}
        onImporta={(html) => {
          applica(documentoDaHtml(html, docRef.current.impostazioni))
          setSelezione(null)
          toast.success('HTML importato', { description: 'Controlla l\'anteprima su computer e telefono: puoi annullare con ⌘Z.' })
        }}
      />
      {anteprimaPiena != null ? (
        <AnteprimaSchermoIntero
          html={anteprimaPiena}
          contesto={{ oggetto: contestoAnteprima?.oggetto, preheader: contestoAnteprima?.preheader, ...contestoProva }}
          onChiudi={() => setAnteprimaPiena(null)}
        />
      ) : null}
      <DialogInvioProva
        aperto={provaAperta}
        onChiudi={() => setProvaAperta(false)}
        contesto={{ oggetto: contestoAnteprima?.oggetto, preheader: contestoAnteprima?.preheader, ...contestoProva }}
        html={() => renderEmail(docRef.current, { preheader: preheaderRef.current })}
      />
      {aiDisponibile ? (
        <DialogScriviAi aperto={aiAperto} onChiudi={() => setAiAperto(false)} impostazioni={doc.impostazioni} haContenuto={doc.blocchi.some((b) => b.tipo !== 'piedipagina')} onRisultato={risultatoAi} />
      ) : null}
    </div>
  )
}
