import { useEffect, useMemo, useState } from "react"
import { useAzioni } from "@/contexts/azioni-context"
import { Campo, Griglia, Scelta } from "@/components/forms/campo"
import { Finestra } from "@/components/forms/finestra"
import { PazienteCombobox } from "@/components/forms/paziente-combobox"
import { Input } from "@/components/ui/input"
import { SheetNotice } from "@/components/ui/sheet-kit"
import { euro } from "@/lib/format"
import { PIANO_PAGAMENTO, TIPO_PERCORSO } from "@/lib/etichette"
import { toast, toastErrore } from "@/lib/toast"
import { oggiIso } from "@/lib/utils"
import { percorsiService } from "@/services/gestionale"
import type { Listino } from "@/types"

export function PercorsoDialog({ open, onOpenChange, pazienteId }: { open: boolean; onOpenChange: (a: boolean) => void; pazienteId?: number }) {
  const { aggiorna } = useAzioni()
  const [listino, setListino] = useState<Listino | null>(null)
  const [paziente, setPaziente] = useState<number | null>(null)
  const [tipo, setTipo] = useState("METODO_BUSSOLA")
  const [piano, setPiano] = useState("UNICO")
  const [inizio, setInizio] = useState(oggiIso())
  const [inCorso, setInCorso] = useState(false)

  useEffect(() => {
    if (!open) return
    setPaziente(pazienteId ?? null)
    setTipo("METODO_BUSSOLA")
    setPiano("UNICO")
    setInizio(oggiIso())
    percorsiService.listino().then(setListino).catch(toastErrore)
  }, [open, pazienteId])

  const riepilogo = useMemo(() => {
    if (!listino) return ""
    const mantenimento = tipo === "MANTENIMENTO"
    if (piano === "UNICO") return `${euro(mantenimento ? listino.mantenimento : listino.unico)} in anticipo. Un acconto già versato si scala dal saldo.`
    if (mantenimento) return `2 rate da ${euro(listino.rataMantenimento)}: oggi e tra 6 mesi. Totale ${euro(listino.rataMantenimento * 2)}.`
    return `3 rate da ${euro(listino.rataPercorso)}: oggi, tra 2 e tra 4 mesi. Totale ${euro(listino.rataPercorso * 3)}. Un acconto già versato si somma.`
  }, [listino, tipo, piano])

  const salva = async () => {
    if (!paziente) return toastErrore(new Error("Scegli il paziente"))
    setInCorso(true)
    try {
      await percorsiService.crea({ pazienteId: paziente, tipo, pianoPagamento: piano, dataInizio: inizio })
      toast.success("Acquisto creato con le sue rate")
      aggiorna()
      onOpenChange(false)
    } catch (e) {
      toastErrore(e)
    } finally {
      setInCorso(false)
    }
  }

  return (
    <Finestra open={open} onOpenChange={onOpenChange} titolo="Nuovo acquisto" salva={salva} inCorso={inCorso}
      descrizione="Registra cosa ha acquistato il paziente: le rate da incassare si creano secondo il listino.">
      <Campo etichetta="Paziente" id="percorso-paziente">
        <PazienteCombobox id="percorso-paziente" valore={paziente} onChange={setPaziente} disabled={!!pazienteId} />
      </Campo>
      <Griglia>
        <Campo etichetta="Servizio" id="percorso-tipo"><Scelta id="percorso-tipo" valore={tipo} onChange={setTipo} opzioni={TIPO_PERCORSO} /></Campo>
        <Campo etichetta="Pagamento" id="percorso-piano"><Scelta id="percorso-piano" valore={piano} onChange={setPiano} opzioni={PIANO_PAGAMENTO} /></Campo>
        <Campo etichetta="Inizio" id="percorso-inizio"><Input id="percorso-inizio" type="date" value={inizio} onChange={(e) => setInizio(e.target.value)} required /></Campo>
      </Griglia>
      {riepilogo ? <SheetNotice tone="info">{riepilogo}</SheetNotice> : null}
    </Finestra>
  )
}
