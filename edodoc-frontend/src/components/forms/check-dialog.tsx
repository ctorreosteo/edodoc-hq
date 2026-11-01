import { useEffect, useState } from "react"
import { useAzioni } from "@/contexts/azioni-context"
import { Campo, Griglia, Scelta } from "@/components/forms/campo"
import { Finestra } from "@/components/forms/finestra"
import { PazienteCombobox } from "@/components/forms/paziente-combobox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { toast, toastErrore } from "@/lib/toast"
import { checkService } from "@/services/gestionale"
import type { RisposteCheck } from "@/types"

const SCALA = { "1": "1", "2": "2", "3": "3", "4": "4", "5": "5" }
const PERCEZIONE = { SI: "Sì, noto miglioramenti", NO: "No, nessun miglioramento" }
const VUOTO: RisposteCheck = {
  pastiOttimali: 0, pastiLiberi: null, energia: 3, allenamento: null, pesoKg: null, andamentoPeso: null,
  percezione: null, percezioneMigliorata: null, impegno: 3,
}

/** Per i check ricevuti a voce o per messaggio: i pazienti compileranno dall'app mobile. */
export function CheckDialog({ open, onOpenChange, pazienteId }: { open: boolean; onOpenChange: (a: boolean) => void; pazienteId?: number }) {
  const { aggiorna } = useAzioni()
  const [paziente, setPaziente] = useState<number | null>(null)
  const [form, setForm] = useState<RisposteCheck>(VUOTO)
  const [inCorso, setInCorso] = useState(false)

  useEffect(() => {
    if (open) {
      setPaziente(pazienteId ?? null)
      setForm(VUOTO)
    }
  }, [open, pazienteId])

  const testo = (campo: "pastiLiberi" | "allenamento" | "andamentoPeso" | "percezione") => ({
    id: `check-${campo}`,
    value: form[campo] ?? "",
    onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [campo]: e.target.value || null })),
  })

  const salva = async () => {
    if (!paziente) return toastErrore(new Error("Scegli il paziente"))
    setInCorso(true)
    try {
      await checkService.inserisci(paziente, form)
      toast.success("Check salvato")
      aggiorna()
      onOpenChange(false)
    } catch (e) {
      toastErrore(e)
    } finally {
      setInCorso(false)
    }
  }

  return (
    <Finestra open={open} onOpenChange={onOpenChange} titolo="Inserisci check" salva={salva} inCorso={inCorso} larga
      descrizione="Vale per la settimana in corso. Se esiste già, viene sostituito.">
      <Campo etichetta="Paziente" id="check-paziente"><PazienteCombobox id="check-paziente" valore={paziente} onChange={setPaziente} disabled={!!pazienteId} /></Campo>
      <Griglia>
        <Campo etichetta="Pasti eseguiti in modo ottimale" id="check-pasti">
          <Input id="check-pasti" type="number" min={0} max={21} value={form.pastiOttimali} onChange={(e) => setForm((f) => ({ ...f, pastiOttimali: Number(e.target.value) }))} required />
        </Campo>
        <Campo etichetta="Peso (kg)" id="check-peso">
          <Input id="check-peso" type="number" step="0.1" value={form.pesoKg ?? ""} onChange={(e) => setForm((f) => ({ ...f, pesoKg: e.target.value ? Number(e.target.value) : null }))} />
        </Campo>
        <Campo etichetta="Energia (1-5)" id="check-energia"><Scelta id="check-energia" valore={String(form.energia)} onChange={(v) => setForm((f) => ({ ...f, energia: Number(v) }))} opzioni={SCALA} /></Campo>
        <Campo etichetta="Impegno (1-5)" id="check-impegno"><Scelta id="check-impegno" valore={String(form.impegno)} onChange={(v) => setForm((f) => ({ ...f, impegno: Number(v) }))} opzioni={SCALA} /></Campo>
      </Griglia>
      <Campo etichetta="Pasti liberi" id="check-pastiLiberi"><Input {...testo("pastiLiberi")} /></Campo>
      <Campo etichetta="Allenamenti o passeggiate" id="check-allenamento"><Input {...testo("allenamento")} /></Campo>
      <Campo etichetta="Dati del peso della settimana" id="check-andamentoPeso"><Input {...testo("andamentoPeso")} /></Campo>
      <Campo etichetta="Come ti vede lo specchio?" id="check-percezione-scelta">
        <Scelta id="check-percezione-scelta" valore={form.percezioneMigliorata === null ? null : form.percezioneMigliorata ? "SI" : "NO"}
          onChange={(v) => setForm((f) => ({ ...f, percezioneMigliorata: v === "SI" }))} opzioni={PERCEZIONE} />
      </Campo>
      <Campo etichetta="Percezione, a parole sue" id="check-percezione"><Textarea {...testo("percezione")} /></Campo>
    </Finestra>
  )
}
