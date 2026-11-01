import { ClipboardCheck, Search, UserPlus, Users, Wallet } from "lucide-react"
import { useMemo, useState } from "react"
import { Chip } from "@/components/chip"
import { LuxAvatar, LuxHero, LuxKpi } from "@/components/lux"
import { MenuPaziente } from "@/components/menu-contestuali"
import { Cta, Pagina, Riquadro, Tabella } from "@/components/pagina"
import { Caricamento, Errore, Vuoto } from "@/components/stati"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAzioni } from "@/contexts/azioni-context"
import { useDati } from "@/hooks/use-dati"
import { dataOra, euro } from "@/lib/format"
import { SITUAZIONE_PAGAMENTI, STATO_PAZIENTE, TIPO_PERCORSO } from "@/lib/etichette"
import { pazientiService } from "@/services/gestionale"

export default function Pazienti() {
  const azioni = useAzioni()
  const { dati, errore, riprova } = useDati(pazientiService.lista, [])
  const [ricerca, setRicerca] = useState("")
  const [stato, setStato] = useState("TUTTI")

  const filtrati = useMemo(() => {
    const testo = ricerca.trim().toLowerCase()
    return (dati ?? []).filter((p) =>
      (stato === "TUTTI" || p.stato === stato) &&
      (!testo || `${p.nome} ${p.cognome} ${p.email ?? ""} ${p.cellulare ?? ""}`.toLowerCase().includes(testo)))
  }, [dati, ricerca, stato])

  if (errore) return <Errore messaggio={errore} onRiprova={riprova} />
  if (!dati) return <Caricamento />

  const attivi = dati.filter((p) => p.stato === "ATTIVO" || p.stato === "MANTENIMENTO")
  const scaduti = dati.filter((p) => p.situazionePagamenti === "SCADUTO").length

  return (
    <Pagina>
      <LuxHero ariaLabel="Pazienti" eyebrow="Anagrafiche" title="Pazienti" subtitle="Percorso, prossima visita e pagamenti di ogni paziente"
        actions={<Cta icona={UserPlus} onClick={() => azioni.nuovoPaziente()}>Nuovo paziente</Cta>}>
        <div className="vl-kpis vl-kpis--3">
          <LuxKpi icon={<Users className="size-4" />} label="In percorso" value={attivi.length} foot={`${dati.length} in anagrafica`} />
          <LuxKpi icon={<ClipboardCheck className="size-4" />} label="Check di questa settimana" value={attivi.filter((p) => p.checkSettimana).length} unit={`/${attivi.length}`} />
          <LuxKpi icon={<Wallet className="size-4" />} label="Pagamenti scaduti" value={scaduti} foot={scaduti ? "Da sollecitare" : "Tutto in regola"} />
        </div>
      </LuxHero>

      <Riquadro titolo="Elenco" conteggio={filtrati.length} descrizione="Tasto destro su una riga per tutte le azioni"
        azioni={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 opacity-50" aria-hidden />
              <Input aria-label="Cerca paziente" placeholder="Cerca" value={ricerca} onChange={(e) => setRicerca(e.target.value)} className="pl-8 w-52" />
            </div>
            <Select value={stato} onValueChange={setStato}>
              <SelectTrigger aria-label="Filtra per stato" className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TUTTI">Tutti gli stati</SelectItem>
                {Object.entries(STATO_PAZIENTE).map(([k, v]) => <SelectItem key={k} value={k}>{v.testo}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        }>
        {filtrati.length === 0 ? <Vuoto titolo="Nessun paziente" descrizione={dati.length ? "Prova a cambiare i filtri." : "Aggiungi il primo paziente."} /> : (
          <Tabella>
            <TableHeader>
              <TableRow>
                <TableHead>Paziente</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Percorso</TableHead>
                <TableHead>Prossima visita</TableHead>
                <TableHead>Pagamenti</TableHead>
                <TableHead>Check</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrati.map((p) => (
                <MenuPaziente key={p.id} paziente={p}>
                  <TableRow className="cursor-pointer" onClick={() => azioni.apriPaziente(p.id)}>
                    <TableCell>
                      <span className="flex items-center gap-2.5">
                        <LuxAvatar first={p.nome} second={p.cognome} />
                        <span className="min-w-0">
                          <span className="block font-semibold">{p.cognome} {p.nome}</span>
                          <span className="block text-xs text-muted-foreground truncate">{p.email ?? p.cellulare ?? "—"}</span>
                        </span>
                      </span>
                    </TableCell>
                    <TableCell><Chip tono={STATO_PAZIENTE[p.stato].tono}>{STATO_PAZIENTE[p.stato].testo}</Chip></TableCell>
                    <TableCell>{p.percorso ? `${TIPO_PERCORSO[p.percorso.tipo]} · ${p.percorso.visiteFissate}/${p.percorso.visiteTotali}` : "—"}</TableCell>
                    <TableCell className="tabular-nums">{p.prossimaVisita ? dataOra(p.prossimaVisita) : "—"}</TableCell>
                    <TableCell>
                      <Chip tono={SITUAZIONE_PAGAMENTI[p.situazionePagamenti].tono}>
                        {p.residuo > 0 ? `${SITUAZIONE_PAGAMENTI[p.situazionePagamenti].testo}: ${euro(p.residuo)}` : SITUAZIONE_PAGAMENTI[p.situazionePagamenti].testo}
                      </Chip>
                    </TableCell>
                    <TableCell>{p.stato === "ATTIVO" || p.stato === "MANTENIMENTO" ? <Chip tono={p.checkSettimana ? "ok" : "warn"}>{p.checkSettimana ? "Compilato" : "Manca"}</Chip> : "—"}</TableCell>
                  </TableRow>
                </MenuPaziente>
              ))}
            </TableBody>
          </Tabella>
        )}
      </Riquadro>
    </Pagina>
  )
}
