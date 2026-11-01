import { useEffect, useState } from "react"
import { useAzioni } from "@/contexts/azioni-context"
import { Campo, Griglia, Scelta } from "@/components/forms/campo"
import { Finestra } from "@/components/forms/finestra"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { euro } from "@/lib/format"
import { METODO_PAGAMENTO } from "@/lib/etichette"
import { toast, toastErrore } from "@/lib/toast"
import { oggiIso } from "@/lib/utils"
import { pagamentiService } from "@/services/gestionale"
import type { Pagamento } from "@/types"

export function RegistraPagamentoDialog({ open, onOpenChange, pagamento }: { open: boolean; onOpenChange: (a: boolean) => void; pagamento: Pagamento | null }) {
  const { aggiorna, nuovaFattura } = useAzioni()
  const [data, setData] = useState(oggiIso())
  const [metodo, setMetodo] = useState("BONIFICO")
  const [contabile, setContabile] = useState(true)
  const [inCorso, setInCorso] = useState(false)

  useEffect(() => {
    if (open) {
      setData(oggiIso())
      setMetodo("BONIFICO")
      setContabile(true)
    }
  }, [open])

  if (!pagamento) return null

  const salva = async () => {
    setInCorso(true)
    try {
      const registrato = await pagamentiService.registra(pagamento.id, { dataPagamento: data, metodo, contabile })
      toast.success("Pagamento registrato", {
        action: { label: "Emetti fattura", onClick: () => nuovaFattura({ pagamento: registrato }) },
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

  return (
    <Finestra open={open} onOpenChange={onOpenChange} titolo="Registra pagamento" salva={salva} inCorso={inCorso} etichettaSalva="Registra"
      descrizione={`${pagamento.pazienteNome} · ${pagamento.descrizione} · ${euro(pagamento.importo)}`}>
      <Griglia>
        <Campo etichetta="Data del pagamento" id="registra-data"><Input id="registra-data" type="date" value={data} onChange={(e) => setData(e.target.value)} required /></Campo>
        <Campo etichetta="Metodo" id="registra-metodo"><Scelta id="registra-metodo" valore={metodo} onChange={setMetodo} opzioni={METODO_PAGAMENTO} /></Campo>
      </Griglia>
      <div className="flex items-center gap-2">
        <Checkbox id="registra-contabile" checked={contabile} onCheckedChange={(v) => setContabile(v === true)} />
        <Label htmlFor="registra-contabile">Contabile ricevuta</Label>
      </div>
    </Finestra>
  )
}
