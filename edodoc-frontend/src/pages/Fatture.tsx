import { useRef, useState } from "react"
import { FattureHero } from "@/components/fatture/fatture-hero"
import { RegistroFatture } from "@/components/fatture/registro-fatture"
import { TesseraSanitaria } from "@/components/fatture/tessera-sanitaria"
import { Pagina } from "@/components/pagina"
import { Caricamento, Errore } from "@/components/stati"
import { useAzioni } from "@/contexts/azioni-context"
import { movimentoRidotto } from "@/hooks/use-conteggio"
import { useDati } from "@/hooks/use-dati"
import { appuntamentoTessera, daFatturare, fattureDellAnno, quadroFatture, TUTTO_IL_PERIODO } from "@/lib/incassi"
import { fattureService, pagamentiService } from "@/services/gestionale"
import "@/style/pagamenti.css"
import "@/style/fatture.css"

export default function Fatture() {
  const azioni = useAzioni()
  const [anno, setAnno] = useState(new Date().getFullYear())
  const [filtro, setFiltro] = useState("TUTTE")
  const [ricerca, setRicerca] = useState("")
  const [meseScelto, setMeseScelto] = useState<string | null>(null)
  const elenco = useRef<HTMLDivElement>(null)
  const tessera = useRef<HTMLDivElement>(null)
  const { dati, errore, riprova } = useDati(async () => {
    const [fatture, pagamenti] = await Promise.all([fattureService.periodo(TUTTO_IL_PERIODO.da, TUTTO_IL_PERIODO.a), pagamentiService.periodo(TUTTO_IL_PERIODO.da, TUTTO_IL_PERIODO.a)])
    return { fatture, daEmettere: pagamenti.righe.filter(daFatturare) }
  }, [])

  if (errore) return <Errore messaggio={errore} onRiprova={riprova} />
  if (!dati) return <Caricamento />

  const delAnno = fattureDellAnno(dati.fatture, anno)
  const appuntamento = appuntamentoTessera(dati.fatture)
  const vaiA = (bersaglio: HTMLDivElement | null) => bersaglio?.scrollIntoView({ behavior: movimentoRidotto() ? "auto" : "smooth", block: "start" })

  return (
    <Pagina>
      <FattureHero q={quadroFatture(delAnno)} anno={anno} onAnno={setAnno}
        daEmettere={dati.daEmettere.length} importoDaEmettere={dati.daEmettere.reduce((s, p) => s + p.importo, 0)}
        filtro={filtro} onStazione={(scelto) => {
          setFiltro(scelto)
          vaiA(elenco.current)
        }}
        appuntamento={appuntamento} onApriTessera={() => {
          setMeseScelto(appuntamento.mese)
          vaiA(tessera.current)
        }}
        onNuova={() => azioni.nuovaFattura()} />
      <div ref={elenco} className="ft-ancora">
        <RegistroFatture fatture={delAnno} daEmettere={dati.daEmettere} anno={anno} filtro={filtro} onFiltro={setFiltro} ricerca={ricerca} onRicerca={setRicerca} />
      </div>
      <TesseraSanitaria ref={tessera} fatture={dati.fatture} mese={meseScelto ?? appuntamento.mese} onMese={setMeseScelto} />
    </Pagina>
  )
}
