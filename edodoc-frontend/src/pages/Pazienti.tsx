import { useMemo, useState } from "react"
import { Pagina } from "@/components/pagina"
import { ElencoPazienti } from "@/components/pazienti/elenco-pazienti"
import { PazientiHero } from "@/components/pazienti/pazienti-hero"
import { Caricamento, Errore } from "@/components/stati"
import { useDati } from "@/hooks/use-dati"
import { movimentoRidotto } from "@/hooks/use-conteggio"
import { etichettaMotivo, leggiPaziente, ordina, type Motivo, type Ordine } from "@/lib/pazienti"
import { pazientiService } from "@/services/gestionale"
import "@/style/pazienti.css"

const portaAllElenco = () => document.getElementById("pz-elenco")?.scrollIntoView({ behavior: movimentoRidotto() ? "auto" : "smooth", block: "start" })

export default function Pazienti() {
  const { dati, errore, riprova } = useDati(pazientiService.lista, [])
  const [ricerca, setRicerca] = useState("")
  const [stato, setStato] = useState("TUTTI")
  const [ordine, setOrdine] = useState<Ordine>("PRIORITA")
  const [motivo, setMotivo] = useState<Motivo | null>(null)
  const [gradino, setGradino] = useState<number | null>(null)
  const [oggi] = useState(() => new Date())

  const letture = useMemo(() => (dati ?? []).map((p) => leggiPaziente(p, oggi)), [dati, oggi])

  const filtrati = useMemo(() => {
    const testo = ricerca.trim().toLowerCase()
    return ordina(letture.filter(({ p, motivi, checkAssente, rimanenti }) =>
      (stato === "TUTTI" || p.stato === stato) &&
      (!motivo || (motivo === "CHECK" ? checkAssente : motivi.includes(motivo))) &&
      (gradino == null || rimanenti === gradino) &&
      (!testo || `${p.nome} ${p.cognome} ${p.cognome} ${p.nome} ${p.email ?? ""} ${p.cellulare ?? ""}`.toLowerCase().includes(testo))), ordine)
  }, [letture, ricerca, stato, motivo, gradino, ordine])

  if (errore) return <Errore messaggio={errore} onRiprova={riprova} />
  if (!dati) return <Caricamento />

  const scegliMotivo = (nuovo: Motivo | null) => {
    setMotivo(nuovo)
    setGradino(null)
    if (nuovo) portaAllElenco()
  }
  const scegliGradino = (nuovo: number | null) => {
    setGradino(nuovo)
    setMotivo(null)
    if (nuovo != null) portaAllElenco()
  }
  const filtro = motivo ? etichettaMotivo(motivo, 2, oggi)
    : gradino === 0 ? "Tutte le visite fatte"
    : gradino === 1 ? "Manca 1 visita"
    : gradino != null ? `Mancano ${gradino} visite`
    : null

  return (
    <Pagina>
      <div className="pz-pagina">
        <PazientiHero letture={letture} motivo={motivo} gradino={gradino} oggi={oggi} onMotivo={scegliMotivo} onGradino={scegliGradino} />
        <ElencoPazienti letture={filtrati} totale={dati.length} ricerca={ricerca} stato={stato} ordine={ordine} filtro={filtro} oggi={oggi}
          onRicerca={setRicerca} onStato={setStato} onOrdine={setOrdine} onLiberaFiltro={() => scegliMotivo(null)} />
      </div>
    </Pagina>
  )
}
