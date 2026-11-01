import { ArrowRight, ChevronDown, CircleAlert, CircleCheck, TriangleAlert } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"
import { Riquadro } from "@/components/pagina"
import { useAzioni } from "@/contexts/azioni-context"
import { letturaSoglia, quandoFinisce } from "@/lib/dashboard"
import { giorniDa, quandoScade } from "@/lib/finance"
import { data, euroTondi } from "@/lib/format"
import type { Dashboard } from "@/types"

const VISIBILI = 5
const ICONA_SOGLIA = { ok: CircleCheck, warn: TriangleAlert, danger: CircleAlert, info: CircleCheck, muted: CircleCheck }

export function Rinnovi({ rinnovi }: { rinnovi: Dashboard["rinnovi"] }) {
  const azioni = useAzioni()
  const [tutti, setTutti] = useState(false)
  const righe = tutti ? rinnovi : rinnovi.slice(0, VISIBILI)

  return (
    <Riquadro titolo="Rinnovi in arrivo" descrizione="Percorsi che finiscono entro 60 giorni" conteggio={rinnovi.length}>
      {rinnovi.length === 0 ? <p className="db-nulla">Nessun rinnovo in arrivo.</p> : (
        <ul className="db-elenco">
          {righe.map((r) => {
            const quando = quandoFinisce(r.dataFine)
            return (
              <li key={r.percorsoId}>
                <button type="button" className="db-voce" onClick={() => azioni.apriPaziente(r.pazienteId)}>
                  <span className="db-voce-corpo">
                    <span className="db-voce-titolo">{r.pazienteNome}</span>
                    <span className="db-voce-meta">{r.visiteFissate} su {r.visiteTotali} visite · fine {data(r.dataFine)}</span>
                  </span>
                  <span className="db-quando" data-tono={quando.tono}>{quando.testo}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {rinnovi.length > VISIBILI ? (
        <button type="button" className="db-altri" aria-expanded={tutti} onClick={() => setTutti((v) => !v)}>
          {tutti ? "Mostra meno" : `Altri ${rinnovi.length - VISIBILI}`}<ChevronDown className="size-3.5" data-girato={tutti ? "" : undefined} aria-hidden />
        </button>
      ) : null}
    </Riquadro>
  )
}

export function FiscoSoglia({ d }: { d: Dashboard }) {
  const soglia = letturaSoglia(d)
  const Icona = ICONA_SOGLIA[soglia.tono]

  return (
    <Riquadro titolo="Fisco e soglia" azioni={<Link to="/finance" className="db-link">Apri Finance<ArrowRight className="size-3.5" aria-hidden /></Link>}>
      <p className="db-verdetto" data-tono={soglia.tono}>
        <Icona className="size-4" aria-hidden />
        <span><strong>{soglia.titolo}</strong><small>{soglia.testo}</small></span>
      </p>
      <div className="db-soglia" role="img" aria-label={`Incassati ${euroTondi(d.incassatoAnno)} su una soglia di ${euroTondi(soglia.soglia)}`}>
        <span className="db-soglia-barra" data-tono={soglia.tono} style={{ width: `${soglia.riempimento}%` }} />
        <span className="db-soglia-tacca" style={{ left: `${soglia.tacca}%` }} />
      </div>
      <p className="db-soglia-didascalia"><span>{euroTondi(d.incassatoAnno)} incassati</span><span>Soglia {euroTondi(soglia.soglia)}</span></p>

      {d.prossimeScadenze.length === 0 ? <p className="db-nulla">Nessuna scadenza nei prossimi 90 giorni.</p> : (
        <ul className="db-elenco">
          {d.prossimeScadenze.map((s) => {
            const quando = quandoScade(giorniDa(s.dataScadenza))
            return (
              <li key={s.id} className="db-voce">
                <span className="db-voce-corpo">
                  <span className="db-voce-titolo">{s.titolo}</span>
                  <span className="db-voce-meta">{data(s.dataScadenza)} · <span data-tono={quando.tono} className="db-quando">{quando.testo}</span></span>
                </span>
                <span className="db-voce-importo">{s.importoStimato != null ? euroTondi(s.importoStimato) : "—"}</span>
              </li>
            )
          })}
        </ul>
      )}
    </Riquadro>
  )
}
