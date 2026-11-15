import { useState } from "react"
import { useAzioni } from "@/contexts/azioni-context"
import { FONTE, TIPO_PERCORSO } from "@/lib/etichette"
import { dataBreve } from "@/lib/format"
import { TRAGUARDI } from "@/lib/obiettivo"
import type { Conquista } from "@/types"

const NUMERI_TRAGUARDO = new Set(TRAGUARDI.map((t) => t.n))

/** I 300 pallini: ogni pallino acceso è una persona che ha scelto un percorso. */
export function Griglia({ conquiste, target, atteso }: { conquiste: Conquista[]; target: number; atteso: number }) {
  const azioni = useAzioni()
  const [sopra, setSopra] = useState<number | null>(null)
  const fatti = conquiste.length
  const dovuti = Math.round(atteso)
  const caselle = Math.max(target, fatti)
  const scelta = sopra != null ? conquiste[sopra] : null

  return (
    <div className="ob-griglia-box">
      <div className="ob-griglia" role="list" aria-label={`${fatti} pallini accesi su ${target}`} onMouseLeave={() => setSopra(null)}>
        {Array.from({ length: caselle }, (_, i) => {
          const n = i + 1
          const c = conquiste[i]
          const stato = c ? "fatto" : i === fatti ? "prossimo" : n <= dovuti ? "dovuto" : "vuoto"
          const comune = {
            className: "ob-pallino",
            "data-stato": stato,
            "data-traguardo": NUMERI_TRAGUARDO.has(n) ? "" : undefined,
            style: { "--i": i } as React.CSSProperties,
          }
          return c ? (
            <button key={n} type="button" role="listitem" {...comune} aria-label={`Cliente ${n}: ${c.nome}, ${dataBreve(c.data)}`}
              onMouseEnter={() => setSopra(i)} onFocus={() => setSopra(i)} onBlur={() => setSopra(null)}
              onClick={() => azioni.apriPaziente(c.pazienteId)} />
          ) : (
            <span key={n} role="listitem" {...comune} aria-label={stato === "prossimo" ? `Il prossimo: cliente ${n}` : undefined} />
          )
        })}
      </div>

      <div className="ob-griglia-piede" aria-live="polite">
        {scelta && sopra != null ? (
          <p className="ob-griglia-dettaglio">
            <b>#{sopra + 1}</b>
            <strong>{scelta.nome}</strong>
            <span>{dataBreve(scelta.data)} · {TIPO_PERCORSO[scelta.tipo] ?? scelta.tipo}{scelta.fonte ? ` · da ${FONTE[scelta.fonte] ?? scelta.fonte}` : ""}</span>
          </p>
        ) : (
          <ul className="ob-griglia-legenda">
            <li><i data-stato="fatto" aria-hidden />Cliente acquisito</li>
            <li><i data-stato="prossimo" aria-hidden />Il prossimo: #{Math.min(fatti + 1, caselle)}</li>
            {dovuti > fatti ? <li><i data-stato="dovuto" aria-hidden />Da recuperare sul ritmo ({dovuti - fatti})</li> : null}
          </ul>
        )}
      </div>
    </div>
  )
}
