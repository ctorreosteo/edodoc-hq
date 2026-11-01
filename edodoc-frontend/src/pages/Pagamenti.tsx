import { AlertTriangle, Banknote, CheckCircle2, Clock, Plus, Search } from "lucide-react"
import { useMemo, useState } from "react"
import { Chip } from "@/components/chip"
import { LuxHero, LuxKpi } from "@/components/lux"
import { MenuPagamento } from "@/components/menu-contestuali"
import { Cta, Pagina, Riquadro, Tabella } from "@/components/pagina"
import { Caricamento, Errore, Vuoto } from "@/components/stati"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAzioni } from "@/contexts/azioni-context"
import { useDati } from "@/hooks/use-dati"
import { data, euro } from "@/lib/format"
import { METODO_PAGAMENTO, TIPO_PERCORSO } from "@/lib/etichette"
import { pagamentiService } from "@/services/gestionale"
import type { Pagamento } from "@/types"

const FILTRI: Record<string, string> = { TUTTI: "Tutti", SCADUTI: "Scaduti", DA_PAGARE: "Da pagare", PAGATI: "Pagati", DA_FATTURARE: "Da fatturare" }

function passa(p: Pagamento, filtro: string) {
  if (filtro === "SCADUTI") return p.scaduto
  if (filtro === "DA_PAGARE") return p.stato === "DA_PAGARE"
  if (filtro === "PAGATI") return p.stato === "PAGATO"
  if (filtro === "DA_FATTURARE") return p.stato === "PAGATO" && !p.fatturato
  return true
}

export default function Pagamenti() {
  const azioni = useAzioni()
  const [anno, setAnno] = useState(new Date().getFullYear())
  const [filtro, setFiltro] = useState("TUTTI")
  const [ricerca, setRicerca] = useState("")
  const { dati, errore, riprova } = useDati(() => pagamentiService.periodo(`${anno}-01-01`, `${anno + 1}-12-31`), [anno])

  const righe = useMemo(() => {
    const testo = ricerca.trim().toLowerCase()
    return (dati?.righe ?? []).filter((p) => passa(p, filtro) && (!testo || `${p.pazienteNome} ${p.descrizione}`.toLowerCase().includes(testo)))
  }, [dati, filtro, ricerca])

  if (errore) return <Errore messaggio={errore} onRiprova={riprova} />
  if (!dati) return <Caricamento />

  const daFatturare = dati.righe.filter((p) => p.stato === "PAGATO" && !p.fatturato).length

  return (
    <Pagina>
      <LuxHero ariaLabel="Pagamenti" eyebrow={`Da gennaio ${anno}`} title="Pagamenti" subtitle="Chi ha pagato, quando, e cosa resta da incassare"
        actions={<Cta icona={Plus} onClick={() => azioni.nuovoPagamento()}>Nuovo pagamento</Cta>}>
        <div className="vl-kpis">
          <LuxKpi icon={<CheckCircle2 className="size-4" />} label="Incassato" value={euro(dati.riepilogo.pagato)} />
          <LuxKpi icon={<Clock className="size-4" />} label="Da incassare" value={euro(dati.riepilogo.daPagare)} />
          <LuxKpi icon={<AlertTriangle className="size-4" />} label="Scaduto" value={euro(dati.riepilogo.scaduto)} />
          <LuxKpi icon={<Banknote className="size-4" />} label="Da fatturare" value={daFatturare} foot="Pagamenti senza fattura" />
        </div>
      </LuxHero>

      <Riquadro titolo="Movimenti" conteggio={righe.length} descrizione="Tasto destro per registrare il pagamento o emettere la fattura"
        azioni={
          <div className="flex flex-wrap items-center gap-1">
            {Object.entries(FILTRI).map(([k, v]) => (
              <Button key={k} size="sm" variant={filtro === k ? "default" : "outline"} aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{v}</Button>
            ))}
            <div className="relative ml-1">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 opacity-50" aria-hidden />
              <Input aria-label="Cerca" placeholder="Cerca" value={ricerca} onChange={(e) => setRicerca(e.target.value)} className="pl-8 w-40 h-8" />
            </div>
            <Input aria-label="Anno" type="number" value={anno} onChange={(e) => setAnno(Number(e.target.value) || anno)} className="w-20 h-8" />
          </div>
        }>
        {righe.length === 0 ? <Vuoto titolo="Nessun pagamento" /> : (
          <Tabella>
            <TableHeader>
              <TableRow>
                <TableHead>Paziente</TableHead>
                <TableHead>Acquisto</TableHead>
                <TableHead>Descrizione</TableHead>
                <TableHead>Importo</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Scadenza</TableHead>
                <TableHead>Pagato il</TableHead>
                <TableHead>Metodo</TableHead>
                <TableHead>Fattura</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {righe.map((p) => (
                <MenuPagamento key={p.id} pagamento={p}>
                  <TableRow className="cursor-pointer" onClick={() => p.stato === "DA_PAGARE" ? azioni.registraPagamento(p) : azioni.apriPaziente(p.pazienteId)}>
                    <TableCell className="font-semibold">{p.pazienteNome}</TableCell>
                    <TableCell>{p.percorsoTipo ? TIPO_PERCORSO[p.percorsoTipo] : "Fuori percorso"}</TableCell>
                    <TableCell className="max-w-64 truncate">{p.descrizione}</TableCell>
                    <TableCell className="tabular-nums font-semibold">{euro(p.importo)}</TableCell>
                    <TableCell>{p.stato === "PAGATO" ? <Chip tono="ok">Pagato</Chip> : p.scaduto ? <Chip tono="danger">Scaduto</Chip> : <Chip tono="warn">Da pagare</Chip>}</TableCell>
                    <TableCell className="tabular-nums">{data(p.scadenza)}</TableCell>
                    <TableCell className="tabular-nums">{data(p.dataPagamento)}</TableCell>
                    <TableCell>{p.metodo ? METODO_PAGAMENTO[p.metodo] : "—"}</TableCell>
                    <TableCell>{p.fatturato ? <Chip tono="ok">Emessa</Chip> : p.stato === "PAGATO" ? <Chip tono="warn">Da emettere</Chip> : "—"}</TableCell>
                  </TableRow>
                </MenuPagamento>
              ))}
            </TableBody>
          </Tabella>
        )}
      </Riquadro>
    </Pagina>
  )
}
