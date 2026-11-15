import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CornerDownLeft, Loader2, Search } from 'lucide-react'
import { quandoBreve } from '@/lib/planner-tempo'
import { plannerService, type PlannerPost, type PlannerStato } from '@/services/planner-service'
import { ChipStato, FinestraPlanner } from './planner-ui'

export type VocePalette = { id: string; titolo: string; sotto?: string; icona: ReactNode; azione: () => void; parole?: string }

/**
 * Ricerca rapida del Planner (⌘K / Ctrl+K): azioni (nuovo post, schede, spazi, AI) e i post dello spazio per titolo,
 * testo o note. Frecce per scegliere, Invio per aprire.
 */
export function PlannerPalette({
  aperta,
  onChiudi,
  stato,
  azioni,
  onApriPost,
}: {
  aperta: boolean
  onChiudi: () => void
  stato: PlannerStato
  azioni: VocePalette[]
  onApriPost: (p: PlannerPost) => void
}) {
  const [q, setQ] = useState('')
  const [post, setPost] = useState<PlannerPost[]>([])
  const [cerca, setCerca] = useState(false)
  const [indice, setIndice] = useState(0)
  const lista = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (aperta) {
      setQ('')
      setPost([])
      setIndice(0)
    }
  }, [aperta])

  useEffect(() => {
    const t = q.trim()
    if (t.length < 2) {
      setPost([])
      return
    }
    const ctrl = new AbortController()
    const id = window.setTimeout(() => {
      setCerca(true)
      plannerService
        .cerca(stato.brandId, t, ctrl.signal)
        .then(setPost)
        .catch(() => undefined)
        .finally(() => setCerca(false))
    }, 180)
    return () => {
      window.clearTimeout(id)
      ctrl.abort()
    }
  }, [q, stato.brandId])

  const voci = useMemo(() => {
    const t = q.trim().toLowerCase()
    const az = azioni.filter((a) => !t || `${a.titolo} ${a.parole ?? ''}`.toLowerCase().includes(t))
    const ps: VocePalette[] = post.map((p) => ({
      id: `post-${p.id}`,
      titolo: p.titolo || p.testo?.slice(0, 80) || 'Post senza titolo',
      sotto: `${quandoBreve(p.pubblicatoIl ?? p.programmatoAlle)}${p.testo && p.titolo ? ` · ${p.testo.slice(0, 70)}` : ''}`,
      icona: <ChipStato stato={p.stato} compatto />,
      azione: () => onApriPost(p),
    }))
    return [...az, ...ps]
  }, [q, azioni, post, onApriPost])

  useEffect(() => {
    setIndice(0)
  }, [q])

  useEffect(() => {
    lista.current?.querySelector(`[data-indice="${indice}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [indice])

  const esegui = (v: VocePalette | undefined) => {
    if (!v) return
    onChiudi()
    window.setTimeout(v.azione, 0)
  }

  return (
    <FinestraPlanner aperta={aperta} onChiudi={onChiudi} titolo="Cerca nel Planner" variante="palette">
      <div className="pl-palette">
        <div className="pl-palette-input">
          <Search className="size-5" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setIndice((i) => Math.min(voci.length - 1, i + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setIndice((i) => Math.max(0, i - 1))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                esegui(voci[indice])
              }
            }}
            placeholder="Cerca un post o un'azione…"
            aria-label="Cerca"
          />
          {cerca ? <Loader2 className="size-4 animate-spin" /> : <kbd>esc</kbd>}
        </div>
        <div className="pl-palette-lista" ref={lista} role="listbox">
          {voci.length === 0 ? <div className="pl-palette-vuoto">{q.trim().length >= 2 ? 'Nessun risultato' : 'Scrivi per cercare fra i post dello spazio'}</div> : null}
          {voci.map((v, i) => (
            <button
              key={v.id}
              type="button"
              role="option"
              aria-selected={i === indice}
              data-indice={i}
              data-on={i === indice ? '' : undefined}
              className="pl-palette-voce"
              onMouseEnter={() => setIndice(i)}
              onClick={() => esegui(v)}
            >
              <span className="pl-palette-icona">{v.icona}</span>
              <span className="pl-palette-testi">
                <b>{v.titolo}</b>
                {v.sotto ? <span>{v.sotto}</span> : null}
              </span>
              {i === indice ? <CornerDownLeft className="size-4 pl-palette-invio" /> : null}
            </button>
          ))}
        </div>
      </div>
    </FinestraPlanner>
  )
}

