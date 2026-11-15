import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, Paperclip, Star } from 'lucide-react'
import { iniziali, tintaPer } from './mailing-utils'
import { sostituisciSegnaposto, valoriEsempio } from '@/lib/mailing-render'
import '@/style/lux-mailing.css'
import '@/style/lux-mailing-editor.css'

/* Anteprime condivise da template e campagne: miniatura reale dell'email, casella di posta, vista a schermo pieno. */

/**
 * Miniatura VERA dell'email: iframe senza script, montato solo quando entra nello schermo,
 * scalato sulla larghezza del contenitore. Niente interazione (aria-hidden, pointer-events none).
 */
export function MailingMiniatura({ html, larghezzaEmail = 680, altezza = 300, titolo }: { html: string | null; larghezzaEmail?: number; altezza?: number; titolo: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [visibile, setVisibile] = useState(false)
  const [scala, setScala] = useState(0.4)
  const [caricata, setCaricata] = useState(false)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const io = new IntersectionObserver(
      (voci) => {
        if (voci.some((v) => v.isIntersecting)) {
          setVisibile(true)
          io.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    io.observe(el)
    const ro = new ResizeObserver(() => setScala(el.clientWidth / larghezzaEmail))
    ro.observe(el)
    return () => {
      io.disconnect()
      ro.disconnect()
    }
  }, [larghezzaEmail])
  useEffect(() => setCaricata(false), [html])
  // Nelle miniature i segnaposto mostrano un valore d'esempio, non {{nome|Ciao}}.
  const htmlEsempio = useMemo(() => (html ? sostituisciSegnaposto(html, valoriEsempio()) : null), [html])
  return (
    <div ref={box} className="ml-mini" style={{ height: altezza }} data-caricata={caricata ? '' : undefined}>
      {visibile && htmlEsempio ? (
        <iframe
          title={`Anteprima di ${titolo}`}
          className="ml-mini-iframe"
          sandbox=""
          srcDoc={htmlEsempio}
          tabIndex={-1}
          aria-hidden
          loading="lazy"
          onLoad={() => setCaricata(true)}
          style={{ width: larghezzaEmail, height: altezza / scala, transform: `scale(${scala})` }}
        />
      ) : null}
      {!caricata ? <span className="ml-mini-attesa ml-skeleton" aria-hidden /> : null}
    </div>
  )
}

/** Come appare il messaggio nella casella di Gmail (telefono o computer). */
export function AnteprimaInbox({ mittente, oggetto, preheader, modo }: { mittente: string; oggetto: string; preheader: string; modo: 'mobile' | 'desktop' }) {
  const ora = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  const ogg = oggetto.trim() || '(nessun oggetto)'
  const pre = preheader.trim()
  const avatar = (
    <span className="ml-inbox-avatar" style={{ '--ml-hue': tintaPer(mittente) } as React.CSSProperties} aria-hidden>
      {iniziali(mittente)}
    </span>
  )
  if (modo === 'mobile') {
    return (
      <div className="ml-inbox ml-inbox--mobile" aria-label="Anteprima nella casella del telefono">
        <div className="ml-inbox-barra">
          <span>Principale</span>
        </div>
        <div className="ml-inbox-riga ml-inbox-riga--nuova">
          {avatar}
          <div className="ml-inbox-testi">
            <div className="ml-inbox-mittente">
              <span>{mittente || 'Mittente'}</span>
              <span className="ml-inbox-ora">{ora}</span>
            </div>
            <div className="ml-inbox-oggetto">{ogg}</div>
            <div className="ml-inbox-pre">{pre || 'Il testo all\'inizio dell\'email apparirà qui…'}</div>
          </div>
          <Star className="ml-inbox-stella" aria-hidden />
        </div>
        <div className="ml-inbox-riga ml-inbox-riga--finta" aria-hidden>
          <span className="ml-inbox-avatar ml-inbox-avatar--finto" />
          <div className="ml-inbox-testi">
            <span className="ml-inbox-finto" style={{ width: '40%' }} />
            <span className="ml-inbox-finto" style={{ width: '75%' }} />
            <span className="ml-inbox-finto" style={{ width: '60%' }} />
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="ml-inbox ml-inbox--desktop" aria-label="Anteprima nella casella del computer">
      <div className="ml-inbox-riga ml-inbox-riga--nuova">
        <Star className="ml-inbox-stella" aria-hidden />
        <span className="ml-inbox-mittente-d">{mittente || 'Mittente'}</span>
        <span className="ml-inbox-linea">
          <strong>{ogg}</strong>
          {pre ? <span className="ml-inbox-pre-d"> – {pre}</span> : null}
        </span>
        <Paperclip className="ml-inbox-clip" aria-hidden />
        <span className="ml-inbox-ora">{ora}</span>
      </div>
      <div className="ml-inbox-riga ml-inbox-riga--finta" aria-hidden>
        <span className="ml-inbox-finto" style={{ width: 16 }} />
        <span className="ml-inbox-finto" style={{ width: 110 }} />
        <span className="ml-inbox-finto" style={{ flex: 1 }} />
      </div>
    </div>
  )
}

/** Vista a tutto schermo nel portale (con i token della pagina). Blocca lo scroll sotto. */
export function SchermoIntero({ children, etichetta, onEsc }: { children: ReactNode; etichetta: string; onEsc?: () => void }) {
  useEffect(() => {
    const prima = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prima
    }
  }, [])
  const escRef = useRef(onEsc)
  escRef.current = onEsc
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !escRef.current) return
      if (document.querySelector('[role="dialog"][data-state="open"], [data-radix-popper-content-wrapper]')) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return
      escRef.current()
    }
    // In cattura: si vede il dialog ancora aperto prima che Radix lo chiuda con lo stesso Esc
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [])
  return createPortal(
    <div data-vl="" data-vl-page="mailing" className="ml-schermo" role="dialog" aria-modal="true" aria-label={etichetta}>
      {children}
    </div>,
    document.body,
  )
}

export function TornaIndietro({ onClick, etichetta = 'Indietro' }: { onClick: () => void; etichetta?: string }) {
  return (
    <button type="button" className="ml-btn ml-btn--ghost ml-btn--sm ml-indietro" onClick={onClick}>
      <ChevronLeft />
      {etichetta}
    </button>
  )
}
