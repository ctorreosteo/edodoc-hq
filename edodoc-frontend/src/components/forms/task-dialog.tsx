import { useEffect, useState } from "react"
import { useAzioni } from "@/contexts/azioni-context"
import { Campo, Griglia, Scelta } from "@/components/forms/campo"
import { Finestra } from "@/components/forms/finestra"
import { PazienteCombobox } from "@/components/forms/paziente-combobox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { toast, toastErrore } from "@/lib/toast"
import { formatDateOnlyLocal } from "@/lib/utils"
import { taskService } from "@/services/gestionale"
import type { Task, TaskForm } from "@/types"

const PRIORITA = { ALTA: "Alta", MEDIA: "Media", BASSA: "Bassa" }

export function TaskDialog({ open, onOpenChange, task, iniziali }: {
  open: boolean
  onOpenChange: (a: boolean) => void
  task?: Task
  iniziali?: Partial<TaskForm>
}) {
  const { aggiorna, tipiTask } = useAzioni()
  const [tipo, setTipo] = useState("ALTRO")
  const [titolo, setTitolo] = useState("")
  const [descrizione, setDescrizione] = useState("")
  const [scadenza, setScadenza] = useState("")
  const [priorita, setPriorita] = useState("MEDIA")
  const [paziente, setPaziente] = useState<number | null>(null)
  const [inCorso, setInCorso] = useState(false)

  const applicaPreset = (codice: string) => {
    setTipo(codice)
    const preset = tipiTask.find((t) => t.codice === codice)
    if (!preset) return
    setTitolo(preset.titoloDefault)
    setPriorita(preset.priorita)
    const giorno = new Date()
    giorno.setDate(giorno.getDate() + preset.giorniDefault)
    setScadenza(formatDateOnlyLocal(giorno))
  }

  useEffect(() => {
    if (!open) return
    if (task) {
      setTipo(task.tipo.codice)
      setTitolo(task.titolo)
      setDescrizione(task.descrizione ?? "")
      setScadenza(task.scadenza ?? "")
      setPriorita(task.priorita)
      setPaziente(task.pazienteId)
    } else {
      applicaPreset(iniziali?.tipoCodice ?? "ALTRO")
      setDescrizione("")
      setPaziente(iniziali?.pazienteId ?? null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task, iniziali])

  const salva = async () => {
    setInCorso(true)
    try {
      const corpo = { tipoCodice: tipo, titolo, descrizione: descrizione || null, scadenza: scadenza || null, priorita, pazienteId: paziente }
      if (task) await taskService.aggiorna(task.id, corpo)
      else await taskService.crea(corpo)
      toast.success(task ? "Task aggiornato" : "Task creato")
      aggiorna()
      onOpenChange(false)
    } catch (e) {
      toastErrore(e)
    } finally {
      setInCorso(false)
    }
  }

  const tipi = Object.fromEntries(tipiTask.map((t) => [t.codice, t.etichetta]))

  return (
    <Finestra open={open} onOpenChange={onOpenChange} titolo={task ? "Modifica task" : "Nuovo task"} salva={salva} inCorso={inCorso}>
      <Campo etichetta="Tipo" id="task-tipo"><Scelta id="task-tipo" valore={tipo} onChange={task ? setTipo : applicaPreset} opzioni={tipi} /></Campo>
      <Campo etichetta="Titolo" id="task-titolo"><Input id="task-titolo" value={titolo} onChange={(e) => setTitolo(e.target.value)} required /></Campo>
      <Campo etichetta="Paziente (facoltativo)" id="task-paziente"><PazienteCombobox id="task-paziente" valore={paziente} onChange={setPaziente} /></Campo>
      <Griglia>
        <Campo etichetta="Scadenza" id="task-scadenza"><Input id="task-scadenza" type="date" value={scadenza} onChange={(e) => setScadenza(e.target.value)} /></Campo>
        <Campo etichetta="Priorità" id="task-priorita"><Scelta id="task-priorita" valore={priorita} onChange={setPriorita} opzioni={PRIORITA} /></Campo>
      </Griglia>
      <Campo etichetta="Descrizione" id="task-descrizione"><Textarea id="task-descrizione" value={descrizione} onChange={(e) => setDescrizione(e.target.value)} /></Campo>
    </Finestra>
  )
}
