import { useState } from "react"
import { AgendaFiscale } from "@/components/finance/agenda-fiscale"
import { FinanceHero } from "@/components/finance/finance-hero"
import { MesePerMese } from "@/components/finance/mese-per-mese"
import { RegistroMovimenti } from "@/components/finance/registro-movimenti"
import { MovimentoDialog, ScadenzaDialog } from "@/components/forms/finance-dialog"
import { Pagina } from "@/components/pagina"
import { Caricamento, Errore } from "@/components/stati"
import { useDati } from "@/hooks/use-dati"
import { financeService } from "@/services/gestionale"
import "@/style/finance.css"
import type { Movimento, ScadenzaFiscale } from "@/types"

export default function Finance() {
  const [anno, setAnno] = useState(new Date().getFullYear())
  const [mese, setMese] = useState<number | null>(null)
  const [movimento, setMovimento] = useState<{ aperto: boolean; voce: Movimento | null }>({ aperto: false, voce: null })
  const [scadenza, setScadenza] = useState<{ aperta: boolean; voce: ScadenzaFiscale | null }>({ aperta: false, voce: null })
  const { dati, errore, riprova } = useDati(async () => {
    const [riepilogo, movimenti, scadenze] = await Promise.all([financeService.riepilogo(anno), financeService.movimenti(anno), financeService.scadenze(anno)])
    return { riepilogo, movimenti, scadenze }
  }, [anno])

  if (errore) return <Errore messaggio={errore} onRiprova={riprova} />
  if (!dati) return <Caricamento />
  const { riepilogo: r, movimenti, scadenze } = dati

  const cambiaAnno = (nuovo: number) => {
    setAnno(nuovo)
    setMese(null)
  }

  return (
    <Pagina>
      <div className="fi-pagina" data-in-attesa={r.anno !== anno ? "" : undefined}>
        <FinanceHero r={r} movimenti={movimenti} scadenze={scadenze} anno={anno} onAnno={cambiaAnno} onNuovoMovimento={() => setMovimento({ aperto: true, voce: null })} />
        <MesePerMese r={r} movimenti={movimenti} scelto={mese} onScelto={setMese} />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5 items-start">
          <AgendaFiscale scadenze={scadenze} onNuova={() => setScadenza({ aperta: true, voce: null })} onModifica={(voce) => setScadenza({ aperta: true, voce })} />
          <RegistroMovimenti movimenti={movimenti} mese={mese} onLiberaMese={() => setMese(null)} onModifica={(voce) => setMovimento({ aperto: true, voce })} />
        </div>
      </div>

      <MovimentoDialog key={`m${movimento.voce?.id ?? ""}`} open={movimento.aperto} movimento={movimento.voce} onOpenChange={(aperto) => setMovimento((m) => ({ ...m, aperto }))} />
      <ScadenzaDialog key={`s${scadenza.voce?.id ?? ""}`} open={scadenza.aperta} scadenza={scadenza.voce} onOpenChange={(aperta) => setScadenza((s) => ({ ...s, aperta }))} />
    </Pagina>
  )
}
