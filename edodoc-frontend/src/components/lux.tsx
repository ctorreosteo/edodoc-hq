import type { CSSProperties, ReactNode } from "react"
import "@/style/lux.css"

/*
  Mattoni del restyling condiviso tra le pagine (Visite, Richieste, …): hero scuro con KPI in vetro,
  riquadro statistica, avatar con iniziali, tessera icona colorata. Lo stile sta in src/style/lux.css
  e vale sotto un antenato con [data-vl].
*/

export type LuxTone = "oggi" | "ieri" | "domani" | "tutte"

interface LuxHeroProps {
  eyebrow: ReactNode
  title: ReactNode
  subtitle: ReactNode
  /** Pulsanti in alto a destra (CTA, azioni secondarie). */
  actions?: ReactNode
  /** Attributi extra sul contenitore delle azioni (es. data-m-actions per il telefono). */
  actionsProps?: Record<string, string>
  ariaLabel: string
  children?: ReactNode
}

export function LuxHero({ eyebrow, title, subtitle, actions, actionsProps, ariaLabel, children }: LuxHeroProps) {
  return (
    <section className="vl-hero" aria-label={ariaLabel}>
      <div className="vl-hero-aurora" aria-hidden />
      <div className="vl-hero-grid" aria-hidden />

      <div className="vl-hero-top">
        <div className="vl-hero-heading" data-m-page-header="">
          <div className="vl-eyebrow">
            <span className="vl-live-dot" aria-hidden />
            <span className="vl-eyebrow-text">{eyebrow}</span>
          </div>
          <h1 className="vl-title">{title}</h1>
          <p className="vl-subtitle">{subtitle}</p>
        </div>
        {actions ? (
          <div className="vl-hero-actions" {...actionsProps}>
            {actions}
          </div>
        ) : null}
      </div>

      {children}
    </section>
  )
}

interface LuxKpiProps {
  icon: ReactNode
  label: string
  value: ReactNode
  unit?: ReactNode
  foot?: ReactNode
  /** 0–100: mostra la barra di avanzamento al posto del piede. */
  progress?: number
  highlight?: boolean
  title?: string
}

export function LuxKpi({ icon, label, value, unit, foot, progress, highlight, title }: LuxKpiProps) {
  return (
    <div className={`vl-kpi${highlight ? " vl-kpi--next" : ""}`} title={title}>
      <div className="vl-kpi-head">
        <span className="vl-kpi-icon" aria-hidden>{icon}</span>
        <span className="vl-kpi-label">{label}</span>
      </div>
      <div className="vl-kpi-value">
        {value}
        {unit != null ? <span className="vl-kpi-unit">{unit}</span> : null}
      </div>
      {progress != null ? (
        <div className="vl-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
          <span className="vl-progress-fill" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      ) : null}
      {foot != null ? <div className="vl-kpi-foot">{foot}</div> : null}
    </div>
  )
}

function initials(a?: string | null, b?: string | null) {
  return `${(a || "").trim().charAt(0)}${(b || "").trim().charAt(0)}`.toUpperCase() || "?"
}

/** Tinta stabile per nome, così la stessa persona ha sempre lo stesso avatar. */
function hueFor(text: string) {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360
  return h
}

export function LuxAvatar({ first, second, className }: { first?: string | null; second?: string | null; className?: string }) {
  const full = `${first || ""} ${second || ""}`.trim()
  return (
    <span className={`vl-avatar${className ? ` ${className}` : ""}`} style={{ "--vl-hue": hueFor(full) } as CSSProperties} aria-hidden>
      {initials(first, second)}
    </span>
  )
}

export function LuxIconTile({ tone, children, className }: { tone: LuxTone; children: ReactNode; className?: string }) {
  return (
    <span className={`vl-section-icon${className ? ` ${className}` : ""}`} data-vl-tone={tone} aria-hidden>
      {children}
    </span>
  )
}

/** Riquadro statistica su fondo chiaro, per le griglie dentro le card (fuori dall'hero). */
export function LuxStat({ icon, label, value, foot, className }: { icon?: ReactNode; label: ReactNode; value: ReactNode; foot?: ReactNode; className?: string }) {
  return (
    <div className={`vl-stat${className ? ` ${className}` : ""}`}>
      <div className="vl-stat-head">
        {icon}
        <span className="vl-stat-label">{label}</span>
      </div>
      <div className="vl-stat-value">{value}</div>
      {foot != null ? <div className="vl-stat-foot">{foot}</div> : null}
    </div>
  )
}
