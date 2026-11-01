import { CircleAlert } from "lucide-react"
import type { CSSProperties } from "react"
import { euro, euroTondi } from "@/lib/format"
import type { ColonnaCalendario } from "@/lib/incassi"
import { quanti } from "@/lib/incassi"

const quota = (valore: number, massimo: number) => ({ "--pg-q": valore / massimo }) as CSSProperties
const parte = (valore: number) => ({ flexGrow: valore }) as CSSProperties

function descrizione(c: ColonnaCalendario) {
  const parti = [c.incassato > 0 ? `${euro(c.incassato)} incassati` : null, c.atteso > 0 ? `${euro(c.atteso)} attesi, ${quanti(c.conteggio, "pagamento", "pagamenti")}` : null]
  return `${c.titolo}: ${parti.filter(Boolean).join(", ") || "nessun incasso atteso"}`
}

/** Colonne da un'unica base: ogni colonna è un filtro della lista «In arrivo». */
export function CalendarioIncassi({ colonne, scaduto, scelto, onScelto }: {
  colonne: ColonnaCalendario[]
  scaduto: number
  scelto: string | null
  onScelto: (chiave: string | null) => void
}) {
  const massimo = Math.max(scaduto, ...colonne.map((c) => c.atteso + c.incassato), 1)
  const conIncassi = colonne.some((c) => c.incassato > 0)
  return (
    <div className="pg-calendario" aria-label="Calendario degli incassi">
      <div className="pg-calendario-testa">
        <p>Calendario degli incassi</p>
        <ul className="pg-legenda" aria-label="Legenda">
          {scaduto > 0 ? <li><i data-serie="scaduto" aria-hidden />In ritardo</li> : null}
          {conIncassi ? <li><i data-serie="incassato" aria-hidden />Incassato</li> : null}
          <li><i data-serie="atteso" aria-hidden />Atteso</li>
        </ul>
      </div>
      <div className="pg-colonne">
        {scaduto > 0 ? (
          <div className="pg-colonna" data-ritardo="">
            <span className="pg-colonna-area">
              <span className="pg-colonna-valore">{euroTondi(scaduto)}</span>
              <span className="pg-colonna-pila" style={quota(scaduto, massimo)}><i data-serie="scaduto" style={parte(scaduto)} /></span>
            </span>
            <span className="pg-colonna-nome"><CircleAlert className="size-3" aria-hidden />In ritardo</span>
          </div>
        ) : null}
        {colonne.map((c, i) => {
          const totale = c.atteso + c.incassato
          return (
            <button key={c.chiave} type="button" className="pg-colonna" aria-pressed={scelto === c.chiave} aria-label={descrizione(c)}
              style={{ animationDelay: `${i * 40}ms` }} onClick={() => onScelto(scelto === c.chiave ? null : c.chiave)}>
              <span className="pg-colonna-area">
                <span className="pg-colonna-valore">{totale > 0 ? euroTondi(totale) : "—"}</span>
                <span className="pg-colonna-pila" style={quota(totale, massimo)}>
                  {c.atteso > 0 ? <i data-serie="atteso" style={parte(c.atteso)} /> : null}
                  {c.incassato > 0 ? <i data-serie="incassato" style={parte(c.incassato)} /> : null}
                </span>
              </span>
              <span className="pg-colonna-nome">{c.etichetta}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
