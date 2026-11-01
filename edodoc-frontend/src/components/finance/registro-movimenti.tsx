import { ArrowDownLeft, ArrowUpRight, Search, Trash2, X } from "lucide-react"
import { useMemo, useState } from "react"
import { Riquadro } from "@/components/pagina"
import { Vuoto } from "@/components/stati"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAzioni } from "@/contexts/azioni-context"
import { MESI } from "@/lib/finance"
import { data, euro } from "@/lib/format"
import { CATEGORIA } from "@/lib/etichette"
import { financeService } from "@/services/gestionale"
import type { Movimento } from "@/types"

const FILTRI = [["TUTTI", "Tutti"], ["ENTRATA", "Entrate"], ["USCITA", "Uscite"]] as const
type Filtro = (typeof FILTRI)[number][0]

const firmato = (m: Movimento) => (m.tipo === "USCITA" ? -m.importo : m.importo)

/** I movimenti arrivano dal più recente: i gruppi per mese ne ereditano l'ordine. */
function perMese(movimenti: Movimento[]) {
  const gruppi = new Map<number, Movimento[]>()
  for (const m of movimenti) {
    const mese = Number(m.data.slice(5, 7))
    gruppi.set(mese, [...(gruppi.get(mese) ?? []), m])
  }
  return [...gruppi]
}

export function RegistroMovimenti({ movimenti, mese, onLiberaMese, onModifica }: {
  movimenti: Movimento[]
  mese: number | null
  onLiberaMese: () => void
  onModifica: (movimento: Movimento) => void
}) {
  const azioni = useAzioni()
  const [filtro, setFiltro] = useState<Filtro>("TUTTI")
  const [cerca, setCerca] = useState("")

  const visibili = useMemo(() => {
    const testo = cerca.trim().toLowerCase()
    return movimenti.filter((m) => (filtro === "TUTTI" || m.tipo === filtro)
      && (mese == null || Number(m.data.slice(5, 7)) === mese)
      && (!testo || `${m.descrizione} ${CATEGORIA[m.categoria]}`.toLowerCase().includes(testo)))
  }, [movimenti, filtro, mese, cerca])

  const elimina = (m: Movimento) => azioni.conferma({
    titolo: "Eliminare il movimento?",
    descrizione: m.descrizione,
    etichetta: "Elimina",
    azione: async () => {
      await financeService.eliminaMovimento(m.id)
      azioni.aggiorna()
    },
  })

  return (
    <Riquadro titolo="Movimenti" conteggio={visibili.length} descrizione="Gli incassi dei pazienti arrivano dai pagamenti: qui c'è tutto il resto.">
      <div className="fi-registro-filtri">
        <div className="fi-segmenti" role="group" aria-label="Tipo di movimento">
          {FILTRI.map(([valore, nome]) => <button key={valore} type="button" aria-pressed={filtro === valore} onClick={() => setFiltro(valore)}>{nome}</button>)}
        </div>
        <div className="fi-cerca">
          <Search className="size-4" aria-hidden />
          <Input aria-label="Cerca nei movimenti" placeholder="Cerca" value={cerca} onChange={(e) => setCerca(e.target.value)} />
        </div>
        {mese != null ? (
          <button type="button" className="fi-filtro-mese" onClick={onLiberaMese} aria-label={`Togli il filtro ${MESI[mese - 1]}`}>
            {MESI[mese - 1]}<X className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      {visibili.length === 0 ? <Vuoto titolo={movimenti.length === 0 ? "Nessun movimento" : "Nessun movimento con questi filtri"} /> : (
        <div className="fi-registro">
          {perMese(visibili).map(([numero, righe]) => {
            const totale = righe.reduce((s, m) => s + firmato(m), 0)
            return (
              <section key={numero} aria-label={MESI[numero - 1]}>
                <header>
                  <span>{MESI[numero - 1]}</span>
                  <span>{totale < 0 ? `−${euro(-totale)}` : `+${euro(totale)}`}</span>
                </header>
                <ul>
                  {righe.map((m) => (
                    <li key={m.id}>
                      <button type="button" className="fi-movimento" aria-label={`Modifica ${m.descrizione}, ${data(m.data)}`} onClick={() => onModifica(m)}>
                        <span className="fi-movimento-segno" data-tipo={m.tipo}>{m.tipo === "USCITA" ? <ArrowUpRight className="size-4" aria-hidden /> : <ArrowDownLeft className="size-4" aria-hidden />}</span>
                        <span className="fi-movimento-testo">
                          <strong>{m.descrizione}</strong>
                          <small>{CATEGORIA[m.categoria]} · {data(m.data)}</small>
                        </span>
                        <span className="fi-movimento-importo">{m.tipo === "USCITA" ? "−" : "+"}{euro(m.importo)}</span>
                      </button>
                      <Button size="icon" variant="ghost" aria-label={`Elimina ${m.descrizione}`} onClick={() => elimina(m)}><Trash2 /></Button>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </Riquadro>
  )
}
