import { useEffect, useMemo, useState } from "react"
import { Chip } from "@/components/chip"
import { useAzioni } from "@/contexts/azioni-context"
import { Campo, Griglia } from "@/components/forms/campo"
import { Finestra } from "@/components/forms/finestra"
import { PazienteCombobox } from "@/components/forms/paziente-combobox"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SheetNotice } from "@/components/ui/sheet-kit"
import { data as formattaData, euro } from "@/lib/format"
import { toast, toastErrore } from "@/lib/toast"
import { cn, oggiIso } from "@/lib/utils"
import { fattureService, pazientiService } from "@/services/gestionale"
import type { AnteprimaFattura, Pagamento } from "@/types"

const LIBERA = "LIBERA"

function Riga({ nome, valore, forte }: { nome: string; valore: string; forte?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 text-sm tabular-nums ${forte ? "font-bold" : ""}`}>
      <span>{nome}</span>
      <span>{valore}</span>
    </div>
  )
}

function Opzione({ scelta, onSelect, titolo, dettaglio, importo }: {
  scelta: boolean
  onSelect: () => void
  titolo: string
  dettaglio: string
  importo?: string
}) {
  return (
    <button type="button" role="radio" aria-checked={scelta} onClick={onSelect}
      className={cn("flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left", scelta && "border-[var(--grafico-blu)] ring-1 ring-[var(--grafico-blu)]")}>
      <span className={cn("size-3.5 shrink-0 rounded-full border", scelta && "border-4 border-[var(--grafico-blu)]")} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{titolo}</span>
        <span className="block truncate text-xs text-muted-foreground">{dettaglio}</span>
      </span>
      {importo ? <span className="text-sm font-semibold tabular-nums">{importo}</span> : null}
    </button>
  )
}

/** Il numero si assegna solo all'emissione: finché la finestra è aperta si può chiudere senza conseguenze. */
export function FatturaDialog({ open, onOpenChange, pagamento, pazienteId }: {
  open: boolean
  onOpenChange: (a: boolean) => void
  pagamento?: Pagamento
  pazienteId?: number
}) {
  const { aggiorna, registraPagamento } = useAzioni()
  const [paziente, setPaziente] = useState<number | null>(null)
  const [pagamenti, setPagamenti] = useState<Pagamento[] | null>(null)
  const [scelta, setScelta] = useState<number | typeof LIBERA | null>(null)
  const [importo, setImporto] = useState("")
  const [data, setData] = useState(oggiIso())
  const [descrizione, setDescrizione] = useState("")
  const [opposizione, setOpposizione] = useState(false)
  const [anteprima, setAnteprima] = useState<AnteprimaFattura | null>(null)
  const [problema, setProblema] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)

  useEffect(() => {
    if (!open) return
    setPaziente(pagamento?.pazienteId ?? pazienteId ?? null)
    setImporto("")
    setData(oggiIso())
    setDescrizione("")
    setOpposizione(false)
    setAnteprima(null)
    setProblema(null)
  }, [open, pagamento, pazienteId])

  useEffect(() => {
    setPagamenti(null)
    setScelta(null)
    if (!open || !paziente) return
    let annullato = false
    pazientiService.pagamenti(paziente)
      .then((lista) => {
        if (annullato) return
        setPagamenti(lista.righe)
        const fatturabili = lista.righe.filter((p) => p.stato === "PAGATO" && !p.fatturato)
        const preselezionato = fatturabili.find((p) => p.id === pagamento?.id)
        setScelta(preselezionato?.id ?? (fatturabili.length === 1 ? fatturabili[0].id : fatturabili.length ? null : LIBERA))
      })
      .catch((e: Error) => {
        if (!annullato) setProblema(e.message)
      })
    return () => {
      annullato = true
    }
  }, [open, paziente, pagamento])

  const fatturabili = useMemo(() => (pagamenti ?? []).filter((p) => p.stato === "PAGATO" && !p.fatturato), [pagamenti])
  const daIncassare = useMemo(() => (pagamenti ?? []).filter((p) => p.stato === "DA_PAGARE"), [pagamenti])
  const libera = scelta === LIBERA

  const corpo = {
    pagamentoId: typeof scelta === "number" ? scelta : null,
    pazienteId: libera ? paziente : null,
    importo: libera && importo ? Number(importo) : null,
    data,
    descrizione: descrizione || null,
    tsOpposizione: opposizione,
  }

  useEffect(() => {
    setAnteprima(null)
    if (!open || scelta === null || (libera && !importo)) return
    let annullato = false
    const attesa = setTimeout(() => {
      fattureService.anteprima(corpo)
        .then((a) => {
          if (annullato) return
          setAnteprima(a)
          setProblema(null)
          if (!descrizione) setDescrizione(a.descrizione)
        })
        .catch((e: Error) => {
          if (annullato) return
          setProblema(e.message)
        })
    }, 200)
    return () => {
      annullato = true
      clearTimeout(attesa)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scelta, importo, data])

  const datiMancanti = anteprima && (!anteprima.codiceFiscale || !anteprima.indirizzo)

  const salva = async () => {
    setInCorso(true)
    try {
      const fattura = await fattureService.emetti(corpo)
      toast.success(`Fattura n. ${fattura.numero} emessa`, {
        action: { label: "Apri PDF", onClick: () => void fattureService.apriPdf(fattura.id).catch(toastErrore) },
        duration: 8000,
      })
      aggiorna()
      onOpenChange(false)
    } catch (e) {
      toastErrore(e)
    } finally {
      setInCorso(false)
    }
  }

  const registra = (p: Pagamento) => {
    onOpenChange(false)
    registraPagamento(p)
  }

  return (
    <Finestra open={open} onOpenChange={onOpenChange} titolo={anteprima ? `Fattura n. ${anteprima.numero}` : "Nuova fattura"} salva={salva} inCorso={inCorso}
      etichettaSalva="Emetti fattura" disabilitaSalva={!anteprima || !!datiMancanti}
      descrizione="Scegli il pagamento di riferimento. Una fattura emessa non si modifica né si cancella: si può solo annullare.">
      <Campo etichetta="Paziente" id="fattura-paziente">
        <PazienteCombobox id="fattura-paziente" valore={paziente} onChange={setPaziente} disabled={!!pagamento || !!pazienteId} />
      </Campo>

      {paziente && pagamenti ? (
        <div className="grid gap-1.5 min-w-0">
          <Label id="fattura-pagamento">Pagamento di riferimento</Label>
          <div role="radiogroup" aria-labelledby="fattura-pagamento" className="grid grid-cols-1 gap-1.5">
            {fatturabili.map((p) => (
              <Opzione key={p.id} scelta={scelta === p.id} onSelect={() => setScelta(p.id)} titolo={p.descrizione}
                dettaglio={`Pagato il ${formattaData(p.dataPagamento)}`} importo={euro(p.importo)} />
            ))}
            <Opzione scelta={libera} onSelect={() => setScelta(LIBERA)} titolo="Nessun pagamento collegato"
              dettaglio="Registra l'incasso insieme alla fattura" />
          </div>
          {daIncassare.length > 0 ? (
            <div className="mt-1 grid gap-1">
              <p className="text-xs text-muted-foreground">Non ancora incassati: si fattura a pagamento ricevuto.</p>
              {daIncassare.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-3 py-1.5">
                  <span className="min-w-32 flex-1 truncate text-xs font-semibold">{p.descrizione}</span>
                  <span className="text-xs tabular-nums">{euro(p.importo)}</span>
                  <Chip tono={p.scaduto ? "danger" : "warn"}>{p.scaduto ? "Scaduto" : "Da pagare"}</Chip>
                  <Button type="button" size="sm" variant="ghost" onClick={() => registra(p)}>Registra</Button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {scelta !== null ? (
        <>
          <Griglia>
            {libera ? (
              <Campo etichetta="Importo incassato (€)" id="fattura-importo">
                <Input id="fattura-importo" type="number" min="0.01" step="0.01" value={importo} onChange={(e) => setImporto(e.target.value)} required />
              </Campo>
            ) : null}
            <Campo etichetta="Data" id="fattura-data"><Input id="fattura-data" type="date" value={data} onChange={(e) => setData(e.target.value)} required /></Campo>
          </Griglia>
          <Campo etichetta="Descrizione" id="fattura-descrizione"><Input id="fattura-descrizione" value={descrizione} onChange={(e) => setDescrizione(e.target.value)} /></Campo>
          <div className="flex items-center gap-2">
            <Checkbox id="fattura-opposizione" checked={opposizione} onCheckedChange={(v) => setOpposizione(v === true)} />
            <Label htmlFor="fattura-opposizione">Il paziente si oppone all'invio alla Tessera Sanitaria</Label>
          </div>
        </>
      ) : null}

      {problema ? <SheetNotice tone="danger">{problema}</SheetNotice> : null}
      {datiMancanti ? <SheetNotice tone="warn">Mancano codice fiscale o indirizzo di residenza: completa l'anagrafica del paziente.</SheetNotice> : null}
      {anteprima ? (
        <div className="grid gap-1 rounded-xl border p-3">
          <Riga nome="Imponibile" valore={euro(anteprima.imponibile)} />
          <Riga nome="Contributo ENPAB" valore={euro(anteprima.contributo)} />
          <Riga nome="Marca da bollo" valore={euro(anteprima.bollo)} />
          <Riga nome="Importo totale" valore={euro(anteprima.importoTotale)} forte />
        </div>
      ) : null}
    </Finestra>
  )
}
