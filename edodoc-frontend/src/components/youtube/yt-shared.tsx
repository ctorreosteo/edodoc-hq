import { type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { YoutubeVoce } from '@/services/youtube-service'
import { fmt } from '@/lib/youtube'

/*
  Mattoni condivisi della pagina YouTube: contatore a rulli, variazione rispetto
  al periodo precedente, classifiche a barre, pannelli e tooltip dei grafici.
  I colori delle serie sono token CSS (--yt-c1…c5 in lux-youtube.css), validati per chiaro e scuro.
  Formattazione e utilità stanno in lib/youtube.ts.
*/

/** Freccia + percentuale; `inverso` per metriche dove scendere è bene (iscritti persi). */
export function Delta({ valore, inverso, className }: { valore: number | null; inverso?: boolean; className?: string }) {
  if (valore == null) return <em className={cn('yt-delta', className)} data-tono="neutro">nuovo</em>
  const tono = Math.abs(valore) < 0.5 ? 'neutro' : (valore > 0) !== Boolean(inverso) ? 'su' : 'giu'
  const Icona = Math.abs(valore) < 0.5 ? Minus : valore > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <em className={cn('yt-delta', className)} data-tono={tono}>
      <Icona aria-hidden />
      {Math.abs(valore).toLocaleString('it-IT', { maximumFractionDigits: Math.abs(valore) < 10 ? 1 : 0 })}%
    </em>
  )
}

/** Numero che rotola cifra per cifra quando cambia (contatore live). */
export function Odometro({ valore, className }: { valore: number; className?: string }) {
  const testo = fmt.int(Math.max(0, valore))
  return (
    <b className={cn('yt-odo', className)} aria-label={testo}>
      {testo.split('').map((c, i) =>
        /\d/.test(c) ? (
          <i key={`${testo.length - i}`} className="yt-odo-col" aria-hidden>
            <i className="yt-odo-strip" style={{ transform: `translateY(-${Number(c) * 10}%)` }}>
              {'0123456789'.split('').map((d) => (
                <i key={d}>{d}</i>
              ))}
            </i>
          </i>
        ) : (
          <i key={`${testo.length - i}`} className="yt-odo-sep" aria-hidden>
            {c}
          </i>
        ),
      )}
    </b>
  )
}

export function Pannello({
  titolo,
  sottotitolo,
  azioni,
  children,
  className,
  icona,
}: {
  titolo: ReactNode
  sottotitolo?: ReactNode
  azioni?: ReactNode
  children: ReactNode
  className?: string
  icona?: ReactNode
}) {
  return (
    <section className={cn('yt-panel', className)}>
      <header className="yt-panel-head">
        <div className="yt-panel-heading">
          {icona ? <div className="yt-panel-icon" aria-hidden>{icona}</div> : null}
          <div className="min-w-0">
            <h2 className="yt-panel-title">{titolo}</h2>
            {sottotitolo ? <p className="yt-panel-sub">{sottotitolo}</p> : null}
          </div>
        </div>
        {azioni ? <div className="yt-panel-actions">{azioni}</div> : null}
      </header>
      <div className="yt-panel-body">{children}</div>
    </section>
  )
}

export function Vuoto({ children, icona }: { children: ReactNode; icona?: ReactNode }) {
  return (
    <div className="yt-empty">
      {icona}
      <p>{children}</p>
    </div>
  )
}

/** Classifica orizzontale: etichetta, barra proporzionale, valore e quota sul totale. */
export function ListaBarre({
  voci,
  max = 10,
  formato = fmt.compact,
  colore = 'var(--yt-c1)',
  secondario,
}: {
  voci: YoutubeVoce[]
  max?: number
  formato?: (n: number) => string
  colore?: string
  secondario?: (v: YoutubeVoce) => string | null
}) {
  if (!voci.length) return <Vuoto>Nessun dato nel periodo.</Vuoto>
  const righe = voci.slice(0, max)
  const top = Math.max(...righe.map((v) => v.valore), 1)
  const totale = voci.reduce((s, v) => s + v.valore, 0) || 1
  return (
    <ol className="yt-bars">
      {righe.map((v) => (
        <li key={v.chiave} className="yt-bar-row" title={`${v.etichetta}: ${formato(v.valore)}`}>
          <div className="yt-bar-top">
            <p className="yt-bar-label">{v.etichetta}</p>
            <p className="yt-bar-value">
              {formato(v.valore)}
              <small>{fmt.pct((v.valore / totale) * 100, 0)}</small>
            </p>
          </div>
          <div className="yt-bar-track">
            <div className="yt-bar-fill" style={{ width: `${(v.valore / top) * 100}%`, background: colore }} />
          </div>
          {secondario ? <p className="yt-bar-sub">{secondario(v)}</p> : null}
        </li>
      ))}
    </ol>
  )
}

type VoceTooltip = { name?: string | number; value?: number | string; color?: string; dataKey?: string | number }

/** Tooltip dei grafici recharts con lo stile della pagina. */
export function TooltipGrafico({
  active,
  payload,
  label,
  formatoEtichetta,
  formatoValore,
}: {
  active?: boolean
  payload?: VoceTooltip[]
  label?: string | number
  formatoEtichetta?: (l: string | number) => string
  formatoValore?: (v: number, chiave: string) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="yt-tip">
      <p className="yt-tip-label">{formatoEtichetta && label != null ? formatoEtichetta(label) : label}</p>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="yt-tip-row">
          <i style={{ background: p.color }} aria-hidden />
          <p>{p.name}</p>
          <b>{formatoValore ? formatoValore(Number(p.value), String(p.dataKey)) : fmt.int(Number(p.value))}</b>
        </div>
      ))}
    </div>
  )
}

export function Caricamento({ righe = 3 }: { righe?: number }) {
  return (
    <div className="yt-skeleton" aria-busy>
      {Array.from({ length: righe }).map((_, i) => (
        <div key={i} className="yt-skeleton-row" style={{ animationDelay: `${i * 90}ms` }} />
      ))}
    </div>
  )
}

