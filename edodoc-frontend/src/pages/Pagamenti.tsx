import { useState } from "react"
import { DaSollecitare } from "@/components/pagamenti/da-sollecitare"
import { InArrivo } from "@/components/pagamenti/in-arrivo"
import { PagamentiHero } from "@/components/pagamenti/pagamenti-hero"
import { RegistroPagamenti } from "@/components/pagamenti/registro-pagamenti"
import { Pagina } from "@/components/pagina"
import { Caricamento, Errore } from "@/components/stati"
import { useAzioni } from "@/contexts/azioni-context"
import { useDati } from "@/hooks/use-dati"
import { quadroIncassi, TUTTO_IL_PERIODO } from "@/lib/incassi"
import { pagamentiService } from "@/services/gestionale"
import "@/style/pagamenti.css"

export default function Pagamenti() {
  const azioni = useAzioni()
  const [anno, setAnno] = useState(new Date().getFullYear())
  const [mese, setMese] = useState<string | null>(null)
  const { dati, errore, riprova } = useDati(() => pagamentiService.periodo(TUTTO_IL_PERIODO.da, TUTTO_IL_PERIODO.a), [])

  if (errore) return <Errore messaggio={errore} onRiprova={riprova} />
  if (!dati) return <Caricamento />

  const q = quadroIncassi(dati.righe, anno)

  return (
    <Pagina>
      <PagamentiHero q={q} anno={anno} onAnno={setAnno} mese={mese} onMese={setMese} onNuovo={() => azioni.nuovoPagamento()} />
      <div className="pg-azioni-griglia">
        <DaSollecitare morosi={q.morosi} />
        <InArrivo righe={dati.righe} colonne={q.calendario} scelto={mese} onScelto={setMese} />
      </div>
      <RegistroPagamenti righe={dati.righe} anno={anno} />
    </Pagina>
  )
}
