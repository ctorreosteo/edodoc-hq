import { ChevronDown } from "lucide-react"
import { useMemo, useState } from "react"
import { AcquistiHero } from "@/components/acquisti/acquisti-hero"
import { RigaPagamento } from "@/components/acquisti/riga-pagamento"
import { SchedaAcquisto } from "@/components/acquisti/scheda-acquisto"
import { Cerca, Segmenti } from "@/components/pagamenti/comuni"
import { Pagina, Riquadro } from "@/components/pagina"
import { Caricamento, Errore, Vuoto } from "@/components/stati"
import { useAzioni } from "@/contexts/azioni-context"
import { useDati } from "@/hooks/use-dati"
import { euro } from "@/lib/format"
import { FILTRI_ACQUISTI, incassato, passaFiltroAcquisto, perGravita, quadroAcquisti } from "@/lib/incassi"
import { percorsiService } from "@/services/gestionale"
import "@/style/pagamenti.css"
import "@/style/acquisti.css"
import type { Pagamento } from "@/types"

function Legenda() {
  return (
    <ul className="pg-legenda aq-legenda" aria-label="Legenda">
      <li><i data-visita="fatta" aria-hidden />Visita fatta</li>
      <li><i data-visita="fissata" aria-hidden />Fissata</li>
      <li><i data-visita="libera" aria-hidden />Da fissare</li>
      <li><i data-oggi="" aria-hidden />Oggi</li>
      <li><i data-serie="incassato" aria-hidden />Incassato</li>
      <li><i data-serie="atteso" aria-hidden />Da incassare</li>
      <li><i data-serie="scaduto" aria-hidden />Scaduto</li>
      <li><i data-serie="buco" aria-hidden />Non coperto</li>
    </ul>
  )
}

function FuoriPercorso({ righe, cercando }: { righe: Pagamento[]; cercando: boolean }) {
  const [aperto, setAperto] = useState(false)
  const totale = righe.filter(incassato).reduce((s, p) => s + p.importo, 0)
  const mostra = aperto || cercando
  return (
    <Riquadro titolo="Pagamenti fuori percorso" conteggio={righe.length} descrizione={`Acconti e incassi non collegati a un acquisto: ${euro(totale)} incassati`}
      azioni={cercando ? undefined : (
        <button type="button" className="aq-apri" aria-expanded={aperto} onClick={() => setAperto((a) => !a)}>
          {aperto ? "Nascondi" : "Mostra"}<ChevronDown className="pg-freccia size-4" data-aperta={aperto ? "" : undefined} aria-hidden />
        </button>
      )}>
      {mostra ? <ul className="aq-rate">{righe.map((p) => <RigaPagamento key={p.id} pagamento={p} conPaziente />)}</ul> : <p className="aq-nessuno">Apri l'elenco per vederli e gestirli uno per uno.</p>}
    </Riquadro>
  )
}

export default function Acquisti() {
  const azioni = useAzioni()
  const { dati, errore, riprova } = useDati(percorsiService.acquisti, [])
  const [filtro, setFiltro] = useState("ATTIVI")
  const [ricerca, setRicerca] = useState("")
  const testo = ricerca.trim().toLowerCase()

  const righe = useMemo(() => (dati?.percorsi ?? [])
    .filter((a) => passaFiltroAcquisto(a, filtro) && (!testo || a.pazienteNome.toLowerCase().includes(testo)))
    .sort(perGravita), [dati, filtro, testo])

  /** Quanto ogni paziente ha incassato fuori percorso: serve a spiegare gli importi non coperti. */
  const fuoriPerPaziente = useMemo(() => {
    const somme = new Map<number, number>()
    for (const p of (dati?.fuoriPercorso ?? []).filter(incassato)) somme.set(p.pazienteId, (somme.get(p.pazienteId) ?? 0) + p.importo)
    return somme
  }, [dati])

  if (errore) return <Errore messaggio={errore} onRiprova={riprova} />
  if (!dati) return <Caricamento />

  const q = quadroAcquisti(dati)
  const fuoriPercorso = dati.fuoriPercorso.filter((p) => !testo || p.pazienteNome.toLowerCase().includes(testo))
  const conteggi = Object.fromEntries(Object.keys(FILTRI_ACQUISTI).map((k) => [k, dati.percorsi.filter((a) => passaFiltroAcquisto(a, k)).length]))

  return (
    <Pagina>
      <AcquistiHero q={q} filtro={filtro} onFiltro={setFiltro} onNuovo={() => azioni.nuovoPercorso()} />

      <Riquadro titolo="Elenco" conteggio={righe.length} descrizione="Prima chi chiede un intervento. Tasto destro per le azioni, la freccia apre i pagamenti"
        azioni={<Cerca valore={ricerca} onValore={setRicerca} etichetta="Cerca paziente" segnaposto="Cerca paziente" />}>
        <div className="pg-filtri">
          <Segmenti voci={FILTRI_ACQUISTI} conteggi={conteggi} scelto={filtro} onScelto={setFiltro} etichetta="Filtra gli acquisti" />
        </div>
        {righe.length === 0 ? <Vuoto titolo="Nessun acquisto" descrizione={dati.percorsi.length ? "Prova a cambiare i filtri." : "Registra il primo acquisto."} /> : (
          <>
            <div className="aq-testa-elenco"><Legenda /></div>
            <ul className="aq-elenco">
              {righe.map((a) => <SchedaAcquisto key={a.percorso.id} acquisto={a} fuoriPercorso={fuoriPerPaziente.get(a.percorso.pazienteId) ?? 0} />)}
            </ul>
          </>
        )}
      </Riquadro>

      {fuoriPercorso.length > 0 ? <FuoriPercorso righe={fuoriPercorso} cercando={!!testo} /> : null}
    </Pagina>
  )
}
