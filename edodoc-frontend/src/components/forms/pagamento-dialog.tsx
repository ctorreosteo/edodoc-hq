import { useEffect, useState } from "react"
import { useAzioni } from "@/contexts/azioni-context"
import { Campo, Griglia, Scelta } from "@/components/forms/campo"
import { Finestra } from "@/components/forms/finestra"
import { PazienteCombobox } from "@/components/forms/paziente-combobox"
import { Input } from "@/components/ui/input"
import { TIPO_PAGAMENTO } from "@/lib/etichette"
import { toast, toastErrore } from "@/lib/toast"
import { oggiIso } from "@/lib/utils"
import { pagamentiService, percorsiService } from "@/services/gestionale"
import type { Pagamento } from "@/types"

export function PagamentoDialog({ open, onOpenChange, pagamento, pazienteId }: {
  open: boolean
  onOpenChange: (a: boolean) => void
  pagamento?: Pagamento
  pazienteId?: number
}) {
  const { aggiorna } = useAzioni()
  const [paziente, setPaziente] = useState<number | null>(null)
  const [tipo, setTipo] = useState("ALTRO")
  const [descrizione, setDescrizione] = useState("")
  const [importo, setImporto] = useState("")
  const [scadenza, setScadenza] = useState(oggiIso())
  const [inCorso, setInCorso] = useState(false)

  useEffect(() => {
    if (!open) return
    setPaziente(pagamento?.pazienteId ?? pazienteId ?? null)
    setTipo(pagamento?.tipo ?? "ALTRO")
    setDescrizione(pagamento?.descrizione ?? "")
    setImporto(pagamento ? String(pagamento.importo) : "")
    setScadenza(pagamento?.scadenza ?? oggiIso())
  }, [open, pagamento, pazienteId])

  const cambiaTipo = async (nuovo: string) => {
    setTipo(nuovo)
    if (nuovo === "ACCONTO" && !pagamento) {
      const listino = await percorsiService.listino().catch(() => null)
      if (listino) {
        setImporto(String(listino.acconto))
        setDescrizione("Acconto lista d'attesa")
      }
    }
  }

  const salva = async () => {
    if (!paziente) return toastErrore(new Error("Scegli il paziente"))
    setInCorso(true)
    try {
      const corpo = { pazienteId: paziente, tipo, descrizione, importo: Number(importo), scadenza }
      if (pagamento) await pagamentiService.aggiorna(pagamento.id, corpo)
      else await pagamentiService.crea(corpo)
      toast.success(pagamento ? "Pagamento aggiornato" : "Pagamento creato")
      aggiorna()
      onOpenChange(false)
    } catch (e) {
      toastErrore(e)
    } finally {
      setInCorso(false)
    }
  }

  return (
    <Finestra open={open} onOpenChange={onOpenChange} titolo={pagamento ? "Modifica pagamento" : "Nuovo pagamento"} salva={salva} inCorso={inCorso}
      descrizione="Le rate del percorso si creano da sole: da qui passano acconti e pagamenti fuori percorso.">
      <Campo etichetta="Paziente" id="pagamento-paziente">
        <PazienteCombobox id="pagamento-paziente" valore={paziente} onChange={setPaziente} disabled={!!pagamento || !!pazienteId} />
      </Campo>
      <Griglia>
        <Campo etichetta="Tipo" id="pagamento-tipo"><Scelta id="pagamento-tipo" valore={tipo} onChange={cambiaTipo} opzioni={TIPO_PAGAMENTO} /></Campo>
        <Campo etichetta="Importo (€)" id="pagamento-importo"><Input id="pagamento-importo" type="number" min="0.01" step="0.01" value={importo} onChange={(e) => setImporto(e.target.value)} required /></Campo>
      </Griglia>
      <Campo etichetta="Descrizione" id="pagamento-descrizione"><Input id="pagamento-descrizione" value={descrizione} onChange={(e) => setDescrizione(e.target.value)} required /></Campo>
      <Campo etichetta="Scadenza" id="pagamento-scadenza"><Input id="pagamento-scadenza" type="date" value={scadenza} onChange={(e) => setScadenza(e.target.value)} required /></Campo>
    </Finestra>
  )
}
