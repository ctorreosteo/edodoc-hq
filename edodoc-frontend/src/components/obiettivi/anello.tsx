import { useId } from "react"
import { useConteggio } from "@/hooks/use-conteggio"
import { TRAGUARDI } from "@/lib/obiettivo"

const R = 104
const GIRO = 2 * Math.PI * R

/** Posizione sull'anello (0 = ore 12, senso orario) per una frazione 0–1. */
function punto(frazione: number, raggio = R) {
  const a = frazione * 2 * Math.PI - Math.PI / 2
  return { x: 120 + Math.cos(a) * raggio, y: 120 + Math.sin(a) * raggio }
}

/** Il grande anello dell'obiettivo: arco che cresce col conteggio, tacche dei traguardi, segnaposto del ritmo ideale. */
export function Anello({ fatti, target, atteso, anno, sottotitolo }: { fatti: number; target: number; atteso: number | null; anno: number; sottotitolo?: string }) {
  const id = useId().replace(/:/g, "")
  const mostrato = useConteggio(fatti, 1600)
  const frazione = Math.min(1, mostrato / target)
  const ideale = atteso != null ? Math.min(1, atteso / target) : null
  const punta = punto(frazione)

  return (
    <div className="ob-anello" role="img" aria-label={`${fatti} clienti su ${target} nel ${anno}`}>
      <svg viewBox="0 0 240 240" aria-hidden>
        <defs>
          <linearGradient id={`${id}-arco`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFD08A" />
            <stop offset="55%" stopColor="#F0944E" />
            <stop offset="100%" stopColor="#E2622C" />
          </linearGradient>
          <filter id={`${id}-alone`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        <circle cx="120" cy="120" r={R} className="ob-anello-pista" />
        {TRAGUARDI.filter((t) => t.n > 1 && t.n < target).map((t) => {
          const a = punto(t.n / target, R - 13)
          const b = punto(t.n / target, R - 19)
          return <line key={t.n} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="ob-anello-tacca" data-fatta={fatti >= t.n ? "" : undefined} />
        })}

        {frazione > 0 ? (
          <>
            <circle cx="120" cy="120" r={R} className="ob-anello-alone" stroke={`url(#${id}-arco)`} filter={`url(#${id}-alone)`}
              strokeDasharray={`${GIRO * frazione} ${GIRO}`} transform="rotate(-90 120 120)" />
            <circle cx="120" cy="120" r={R} className="ob-anello-arco" stroke={`url(#${id}-arco)`}
              strokeDasharray={`${GIRO * frazione} ${GIRO}`} transform="rotate(-90 120 120)" />
            <circle cx={punta.x} cy={punta.y} r="9" className="ob-anello-punta" />
          </>
        ) : null}

        {ideale != null && ideale > 0 ? (() => {
          const p = punto(ideale)
          return <circle cx={p.x} cy={p.y} r="5" className="ob-anello-ideale" />
        })() : null}
      </svg>

      <div className="ob-anello-centro">
        <p className="ob-anello-numero">{Math.round(mostrato)}</p>
        <p className="ob-anello-su">su {target}</p>
        <p className="ob-anello-anno">{sottotitolo ?? `clienti ${anno}`}</p>
      </div>
    </div>
  )
}

/** Versione mini per la barra in alto. */
export function AnelloMini({ frazione, ideale }: { frazione: number; ideale: number | null }) {
  const r = 9
  const giro = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 24 24" className="ob-mini-anello" aria-hidden>
      <circle cx="12" cy="12" r={r} className="ob-mini-pista" />
      {frazione > 0 ? <circle cx="12" cy="12" r={r} className="ob-mini-arco" strokeDasharray={`${giro * Math.min(1, frazione)} ${giro}`} transform="rotate(-90 12 12)" /> : null}
      {ideale != null && ideale > 0 ? (() => {
        const a = ideale * 2 * Math.PI - Math.PI / 2
        return <circle cx={12 + Math.cos(a) * r} cy={12 + Math.sin(a) * r} r="1.6" className="ob-mini-ideale" />
      })() : null}
    </svg>
  )
}
