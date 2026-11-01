import { ChevronLeft, ChevronRight, CircleAlert, CircleCheck, Search, TriangleAlert, X, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Input } from "@/components/ui/input"
import { useConteggio } from "@/hooks/use-conteggio"
import { euro } from "@/lib/format"

/** Mattoni della famiglia Acquisti, Pagamenti e Fatture. Lo stile sta in src/style/pagamenti.css. */

const ICONA_TONO = { ok: CircleCheck, warn: TriangleAlert, danger: CircleAlert }

export function Verdetto({ tono, children }: { tono: "ok" | "warn" | "danger"; children: ReactNode }) {
  const Icona = ICONA_TONO[tono]
  return <p className="pg-verdetto" data-tono={tono}><Icona className="size-4" aria-hidden />{children}</p>
}

export function CifraGrande({ valore }: { valore: number }) {
  const mostrato = useConteggio(valore)
  return <p className="pg-valore">{euro(mostrato)}</p>
}

export function SelettoreAnno({ anno, onAnno }: { anno: number; onAnno: (anno: number) => void }) {
  const massimo = new Date().getFullYear() + 1
  return (
    <div className="pg-anno" role="group" aria-label="Anno">
      <button type="button" aria-label="Anno precedente" onClick={() => onAnno(anno - 1)}><ChevronLeft className="size-4" aria-hidden /></button>
      <span aria-live="polite">{anno}</span>
      <button type="button" aria-label="Anno successivo" disabled={anno >= massimo} onClick={() => onAnno(anno + 1)}><ChevronRight className="size-4" aria-hidden /></button>
    </div>
  )
}

export function Segmenti({ voci, conteggi, scelto, onScelto, etichetta }: {
  voci: Record<string, string>
  conteggi?: Record<string, number>
  scelto: string
  onScelto: (chiave: string) => void
  etichetta: string
}) {
  return (
    <div className="pg-segmenti" role="group" aria-label={etichetta}>
      {Object.entries(voci).map(([chiave, testo]) => (
        <button key={chiave} type="button" aria-pressed={scelto === chiave} onClick={() => onScelto(chiave)}>
          {testo}
          {conteggi?.[chiave] != null ? <span>{conteggi[chiave]}</span> : null}
        </button>
      ))}
    </div>
  )
}

export function Cerca({ valore, onValore, etichetta, segnaposto }: { valore: string; onValore: (valore: string) => void; etichetta: string; segnaposto: string }) {
  return (
    <div className="pg-cerca">
      <Search className="size-4" aria-hidden />
      <Input aria-label={etichetta} placeholder={segnaposto} value={valore} onChange={(e) => onValore(e.target.value)} className="h-8" />
    </div>
  )
}

export function FiltroAttivo({ testo, etichetta, onTogli }: { testo: string; etichetta: string; onTogli: () => void }) {
  return (
    <button type="button" className="pg-filtro-attivo" aria-label={etichetta} onClick={onTogli}>
      {testo}<X className="size-3.5" aria-hidden />
    </button>
  )
}

export function Azione({ icona: Icona, forte, children, onClick, etichetta, disabled }: {
  icona?: LucideIcon
  forte?: boolean
  children: ReactNode
  onClick: () => void
  etichetta?: string
  disabled?: boolean
}) {
  return (
    <button type="button" className="pg-azione" data-forte={forte ? "" : undefined} aria-label={etichetta} disabled={disabled} onClick={onClick}>
      {Icona ? <Icona className="size-3.5" aria-hidden /> : null}{children}
    </button>
  )
}

/** Separa nome e cognome per l'avatar. */
export function partiNome(nome: string) {
  const [primo = "", ...resto] = nome.trim().split(/\s+/)
  return { primo, secondo: resto.join(" ") }
}
