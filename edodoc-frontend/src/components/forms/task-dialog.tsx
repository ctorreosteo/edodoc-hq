import { useEffect, useMemo, useState } from "react"
import { useAzioni } from "@/contexts/azioni-context"
import { Campo, Griglia, Scelta } from "@/components/forms/campo"
import { Finestra } from "@/components/forms/finestra"
import { PazienteCombobox } from "@/components/forms/paziente-combobox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { listaDaSelezione, listaPredefinita, opzioniListe } from "@/lib/task-struttura"
import { toast, toastErrore } from "@/lib/toast"
import { taskService } from "@/services/gestionale"
import type { Task, TaskForm } from "@/types"

const PRIORITA = { ALTA: "Alta", MEDIA: "Media", BASSA: "Bassa" }

export function TaskDialog({ open, onOpenChange, task, iniziali }: {
  open: boolean
  onOpenChange: (a: boolean) => void
  task?: Task
  iniziali?: Partial<TaskForm>
}) {
  const { aggiorna, struttura } = useAzioni()
  const [lista, setLista] = useState<number | null>(null)
  const [titolo, setTitolo] = useState("")
  const [descrizione, setDescrizione] = useState("")
  const [scadenza, setScadenza] = useState("")
  const [priorita, setPriorita] = useState("MEDIA")
  const [paziente, setPaziente] = useState<number | null>(null)
  const [inCorso, setInCorso] = useState(false)

  useEffect(() => {
    if (!open) return
    if (task) {
      setLista(task.lista.id)
      setTitolo(task.titolo)
      setDescrizione(task.descrizione ?? "")
      setScadenza(task.scadenza ?? "")
      setPriorita(task.priorita)
      setPaziente(task.pazienteId)
    } else {
      setLista(iniziali?.listaId ?? listaPredefinita(struttura)?.id ?? null)
      setTitolo("")
      setScadenza(iniziali?.scadenza ?? "")
      setPriorita("MEDIA")
      setDescrizione("")
      setPaziente(iniziali?.pazienteId ?? null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task, iniziali])

  const salva = async () => {
    if (lista == null) return
    setInCorso(true)
    try {
      const corpo = { listaId: lista, titolo, descrizione: descrizione || null, scadenza: scadenza || null, priorita, pazienteId: paziente }
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

  // Un task già in una lista archiviata deve poter restare dov'è
  const liste = useMemo(() => ({
    ...opzioniListe(struttura),
    ...(task?.lista.archiviata ? { [`lista:${task.lista.id}`]: `${task.lista.nome} (archiviata)` } : {}),
  }), [struttura, task])

  return (
    <Finestra open={open} onOpenChange={onOpenChange} titolo={task ? "Modifica task" : "Nuovo task"} salva={salva} inCorso={inCorso}>
      <Campo etichetta="Titolo" id="task-titolo"><Input id="task-titolo" value={titolo} onChange={(e) => setTitolo(e.target.value)} required /></Campo>
      <Campo etichetta="Lista" id="task-lista">
        <Scelta id="task-lista" valore={lista != null ? `lista:${lista}` : null} onChange={(s) => setLista(listaDaSelezione(s))} opzioni={liste} />
      </Campo>
      <Campo etichetta="Paziente (facoltativo)" id="task-paziente"><PazienteCombobox id="task-paziente" valore={paziente} onChange={setPaziente} /></Campo>
      <Griglia>
        <Campo etichetta="Scadenza" id="task-scadenza"><Input id="task-scadenza" type="date" value={scadenza} onChange={(e) => setScadenza(e.target.value)} /></Campo>
        <Campo etichetta="Priorità" id="task-priorita"><Scelta id="task-priorita" valore={priorita} onChange={setPriorita} opzioni={PRIORITA} /></Campo>
      </Griglia>
      <Campo etichetta="Descrizione" id="task-descrizione"><Textarea id="task-descrizione" value={descrizione} onChange={(e) => setDescrizione(e.target.value)} /></Campo>
    </Finestra>
  )
}
