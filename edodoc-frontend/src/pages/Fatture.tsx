import { FileText, Landmark, Mail, Plus, Receipt, Search } from "lucide-react"
import { useMemo, useState } from "react"
import { Chip } from "@/components/chip"
import { LuxHero, LuxKpi } from "@/components/lux"
import { MenuFattura } from "@/components/menu-contestuali"
import { Cta, Pagina, Riquadro, Tabella } from "@/components/pagina"
import { Caricamento, Errore, Vuoto } from "@/components/stati"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAzioni } from "@/contexts/azioni-context"
import { useDati } from "@/hooks/use-dati"
import { data, dataOra, euro } from "@/lib/format"
import { toast, toastErrore } from "@/lib/toast"
import { fattureService } from "@/services/gestionale"
import type { Fattura } from "@/types"

function meseScorso() {
  const oggi = new Date()
  oggi.setDate(1)
  oggi.setMonth(oggi.getMonth() - 1)
  return `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, "0")}`
}

/** I quattro campi che cambiano nell'inserimento sul Sistema TS, pronti da copiare. */
function ElencoTessera() {
  const [mese, setMese] = useState(meseScorso)
  const { dati, errore, riprova } = useDati(() => fattureService.tessera(mese), [mese])
  const copia = async () => {
    const righe = (dati ?? []).map((r) => [data(r.data), r.numero, r.codiceFiscale, String(r.importo).replace(".", ",")].join("\t"))
    await navigator.clipboard.writeText(righe.join("\n")).catch(toastErrore)
    toast.success("Elenco copiato")
  }
  return (
    <Riquadro titolo="Tessera Sanitaria" conteggio={dati?.length} descrizione="Trasmissione automatica spenta: l'elenco serve per l'inserimento mensile a mano"
      azioni={
        <div className="flex items-center gap-2">
          <Input aria-label="Mese" type="month" value={mese} onChange={(e) => setMese(e.target.value)} className="w-40 h-8" />
          <Button size="sm" variant="outline" disabled={!dati?.length} onClick={() => void copia()}>Copia</Button>
        </div>
      }>
      {errore ? <Errore messaggio={errore} onRiprova={riprova} /> : !dati ? <Caricamento /> : dati.length === 0 ? <Vuoto titolo="Nessuna fattura da inserire" /> : (
        <Tabella>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Numero</TableHead>
              <TableHead>Codice fiscale</TableHead>
              <TableHead>Importo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dati.map((r) => (
              <TableRow key={r.fatturaId}>
                <TableCell className="tabular-nums">{data(r.data)}</TableCell>
                <TableCell className="tabular-nums">{r.numero}</TableCell>
                <TableCell className="font-mono text-xs">{r.codiceFiscale}</TableCell>
                <TableCell className="tabular-nums">{euro(r.importo)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Tabella>
      )}
    </Riquadro>
  )
}

function statoTessera(f: Fattura) {
  if (f.stato === "ANNULLATA") return "—"
  if (f.tsOpposizione) return <Chip tono="muted">Opposizione</Chip>
  return f.tsStato === "INSERITA" ? <Chip tono="ok">Inserita</Chip> : <Chip tono="warn">Da inserire</Chip>
}

export default function Fatture() {
  const azioni = useAzioni()
  const [anno, setAnno] = useState(new Date().getFullYear())
  const [ricerca, setRicerca] = useState("")
  const { dati, errore, riprova } = useDati(() => fattureService.periodo(`${anno}-01-01`, `${anno}-12-31`), [anno])

  const righe = useMemo(() => {
    const testo = ricerca.trim().toLowerCase()
    return (dati ?? []).filter((f) => !testo || `${f.numero} ${f.intestatario} ${f.codiceFiscale}`.toLowerCase().includes(testo))
  }, [dati, ricerca])

  if (errore) return <Errore messaggio={errore} onRiprova={riprova} />
  if (!dati) return <Caricamento />

  const emesse = dati.filter((f) => f.stato === "EMESSA")
  const totale = emesse.reduce((s, f) => s + f.importoTotale, 0)
  const nonInviate = emesse.filter((f) => !f.emailInviataIl).length
  const tessera = emesse.filter((f) => f.tsStato !== "INSERITA" && !f.tsOpposizione).length

  return (
    <Pagina>
      <LuxHero ariaLabel="Fatture" eyebrow={`Anno ${anno}`} title="Fatture" subtitle="Numerazione progressiva, PDF e invio al paziente"
        actions={<Cta icona={Plus} onClick={() => azioni.nuovaFattura()}>Nuova fattura</Cta>}>
        <div className="vl-kpis">
          <LuxKpi icon={<Receipt className="size-4" />} label="Emesse" value={emesse.length} />
          <LuxKpi icon={<FileText className="size-4" />} label="Totale fatturato" value={euro(totale)} />
          <LuxKpi icon={<Mail className="size-4" />} label="Da inviare" value={nonInviate} />
          <LuxKpi icon={<Landmark className="size-4" />} label="Da inserire in TS" value={tessera} />
        </div>
      </LuxHero>

      <Riquadro titolo="Elenco" conteggio={righe.length} descrizione="Clic per il PDF, tasto destro per invio e annullamento"
        azioni={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 opacity-50" aria-hidden />
              <Input aria-label="Cerca" placeholder="Numero o nome" value={ricerca} onChange={(e) => setRicerca(e.target.value)} className="pl-8 w-44 h-8" />
            </div>
            <Input aria-label="Anno" type="number" value={anno} onChange={(e) => setAnno(Number(e.target.value) || anno)} className="w-20 h-8" />
          </div>
        }>
        {righe.length === 0 ? <Vuoto titolo="Nessuna fattura" descrizione="Le fatture nascono da un pagamento registrato." /> : (
          <Tabella>
            <TableHeader>
              <TableRow>
                <TableHead>N.</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Intestatario</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Imponibile</TableHead>
                <TableHead>Totale</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Tessera San.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {righe.map((f) => (
                <MenuFattura key={f.id} fattura={f}>
                  <TableRow className="cursor-pointer" onClick={() => void fattureService.apriPdf(f.id).catch(toastErrore)}>
                    <TableCell className="tabular-nums font-bold">{f.numero}</TableCell>
                    <TableCell className="tabular-nums">{data(f.dataEmissione)}</TableCell>
                    <TableCell className="font-semibold">{f.intestatario}</TableCell>
                    <TableCell className="max-w-56 truncate">{f.pagamentoDescrizione ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{euro(f.imponibile)}</TableCell>
                    <TableCell className="tabular-nums font-semibold">{euro(f.importoTotale)}</TableCell>
                    <TableCell>{f.stato === "EMESSA" ? <Chip tono="ok">Emessa</Chip> : <Chip tono="muted">Annullata</Chip>}</TableCell>
                    <TableCell>{f.emailInviataIl ? <span title={dataOra(f.emailInviataIl)}><Chip tono="ok">Inviata</Chip></span> : <Chip tono="muted">Non inviata</Chip>}</TableCell>
                    <TableCell>{statoTessera(f)}</TableCell>
                  </TableRow>
                </MenuFattura>
              ))}
            </TableBody>
          </Tabella>
        )}
      </Riquadro>

      <ElencoTessera />
    </Pagina>
  )
}
