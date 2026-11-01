import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'

/*
  Corpo HTML di un'email in un iframe sandbox: niente script (sandbox senza allow-scripts + CSP), niente form,
  link in una nuova scheda. allow-same-origin serve solo al genitore per misurare l'altezza, nascondere le
  citazioni e intercettare i mailto:. Il contenuto passa prima da un DOMParser che toglie ciò che non serve.
*/

const SELETTORI_CITAZIONE = [
  '.gmail_quote',
  'blockquote[type="cite"]',
  '.yahoo_quoted',
  '#appendonsend',
  '#divRplyFwdMsg',
  '.moz-cite-prefix',
  '#mail-editor-reference-message-container',
]

const CSS_BASE = `
  html, body { margin: 0; padding: 0; background: transparent; }
  body {
    font: 14px/1.6 Montserrat, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1d2433; word-wrap: break-word; overflow-wrap: anywhere; overflow-x: auto; overflow-y: hidden;
  }
  img { max-width: 100%; height: auto; }
  table { max-width: 100%; }
  a { color: #0b63ce; }
  pre { white-space: pre-wrap; }
  blockquote.gmail_quote, blockquote[type="cite"] { margin: 0 0 0 .8ex; border-left: 2px solid #d5dbe5; padding-left: 1ex; color: #4b5565; }
  body.hq-senza-citazioni .hq-citazione { display: none !important; }
  body.hq-compatto { font-size: 13px; }
`

function prepara(html: string): { doc: string; haCitazioni: boolean } {
  const parser = new DOMParser()
  const d = parser.parseFromString(html || '', 'text/html')
  d.querySelectorAll('script, iframe, frame, frameset, object, embed, form, base, link[rel="import"], meta').forEach((el) => el.remove())
  d.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name)
      if ((attr.name === 'href' || attr.name === 'src') && /^\s*javascript:/i.test(attr.value)) el.removeAttribute(attr.name)
    }
  })
  // Citazioni: la prima trovata e (per Outlook) tutto ciò che la segue.
  let haCitazioni = false
  for (const sel of SELETTORI_CITAZIONE) {
    const el = d.body.querySelector(sel)
    if (!el || el.closest('.hq-citazione')) continue
    // Una citazione che occupa tutto il corpo non si nasconde (es. un inoltro senza testo).
    if ((el.textContent ?? '').trim().length >= (d.body.textContent ?? '').trim().length - 3) continue
    el.classList.add('hq-citazione')
    if (sel === '#divRplyFwdMsg' || sel === '#appendonsend') {
      let s = el.nextElementSibling
      while (s) {
        s.classList.add('hq-citazione')
        s = s.nextElementSibling
      }
      const hr = el.previousElementSibling
      if (hr?.tagName === 'HR') hr.classList.add('hq-citazione')
    }
    haCitazioni = true
    break
  }
  const stili = Array.from(d.head.querySelectorAll('style')).map((s) => s.outerHTML).join('')
  const doc =
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'; form-action 'none'; frame-src 'none'">` +
    '<base target="_blank">' +
    `<style>${CSS_BASE}</style>${stili}</head><body>${d.body.innerHTML}</body></html>`
  return { doc, haCitazioni }
}

interface EmailCorpoProps {
  html: string
  /** Mostra subito le citazioni (es. messaggi espansi a mano, firma). */
  citazioniVisibili?: boolean
  compatto?: boolean
  onMailto?: (indirizzo: string) => void
  className?: string
  titolo?: string
}

export function EmailCorpo({ html, citazioniVisibili = false, compatto = false, onMailto, className, titolo = 'Contenuto email' }: EmailCorpoProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [altezza, setAltezza] = useState(40)
  const [mostraCitazioni, setMostraCitazioni] = useState(citazioniVisibili)
  const { doc, haCitazioni } = useMemo(() => prepara(html), [html])
  const onMailtoRef = useRef(onMailto)
  onMailtoRef.current = onMailto

  const misura = useCallback(() => {
    const d = iframeRef.current?.contentDocument
    if (!d?.documentElement) return
    const h = Math.max(d.documentElement.scrollHeight, d.body?.scrollHeight ?? 0)
    setAltezza((prec) => (Math.abs(prec - h) > 1 ? h : prec))
  }, [])

  const applicaClassi = useCallback(() => {
    const body = iframeRef.current?.contentDocument?.body
    if (!body) return
    body.classList.toggle('hq-senza-citazioni', !mostraCitazioni)
    body.classList.toggle('hq-compatto', compatto)
    misura()
  }, [mostraCitazioni, compatto, misura])

  useEffect(() => {
    applicaClassi()
  }, [applicaClassi])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    let ro: ResizeObserver | null = null
    const alCaricamento = () => {
      const d = iframe.contentDocument
      if (!d) return
      applicaClassi()
      ro?.disconnect()
      ro = new ResizeObserver(() => misura())
      if (d.body) ro.observe(d.body)
      d.querySelectorAll('img').forEach((img) => img.addEventListener('load', misura, { once: true }))
      d.addEventListener('click', (e) => {
        const a = (e.target as Element | null)?.closest?.('a')
        const href = a?.getAttribute('href') ?? ''
        if (href.toLowerCase().startsWith('mailto:') && onMailtoRef.current) {
          e.preventDefault()
          onMailtoRef.current(decodeURIComponent(href.slice(7).split('?')[0]))
        }
      })
    }
    iframe.addEventListener('load', alCaricamento)
    if (iframe.contentDocument?.readyState === 'complete') alCaricamento()
    return () => {
      iframe.removeEventListener('load', alCaricamento)
      ro?.disconnect()
    }
    // doc cambia → l'iframe si ricarica
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc])

  return (
    <div className={`em-corpo${className ? ` ${className}` : ''}`}>
      <iframe
        ref={iframeRef}
        title={titolo}
        srcDoc={doc}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        style={{ height: altezza }}
      />
      {haCitazioni ? (
        <button
          type="button"
          className="em-corpo-citazioni"
          onClick={() => setMostraCitazioni((v) => !v)}
          aria-expanded={mostraCitazioni}
          title={mostraCitazioni ? 'Nascondi il testo citato' : 'Mostra il testo citato'}
        >
          <MoreHorizontal aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
