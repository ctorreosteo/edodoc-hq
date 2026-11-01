import { CalendarDays, Check, Flag, FolderInput, Loader2, Trash2, X } from "lucide-react"
import { useState } from "react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useAzioni } from "@/contexts/azioni-context"
import { listaDaSelezione, opzioniListe } from "@/lib/task-struttura"
import { toast, toastErrore } from "@/lib/toast"
import { taskService } from "@/services/gestionale"
import type { Task } from "@/types"
import { TaskPosticipaMenu } from "./task-posticipa"
import { TaskPrioritaMenu } from "./task-riga-meta"
import { corpoTask, type TaskModifica } from "./task-utils"

/** Barra azioni sulla selezione multipla: stessa modifica a tutti i task selezionati. */
export function TaskBulkBar({ righe, onClear }: { righe: Task[]; onClear: () => void }) {
  const azioni = useAzioni()
  const [lavoro, setLavoro] = useState(false)

  if (!righe.length) return null

  const esegui = async (operazione: (t: Task) => Promise<unknown>, messaggio: string) => {
    setLavoro(true)
    try {
      await Promise.all(righe.map(operazione))
      toast.success(messaggio)
      onClear()
    } catch (e) {
      toastErrore(e)
    } finally {
      setLavoro(false)
      azioni.aggiorna()
    }
  }

  const modifica = (m: TaskModifica) => void esegui((t) => taskService.aggiorna(t.id, corpoTask({ ...t, ...m })), `${righe.length} task aggiornati`)

  return (
    <div className="tk-bulk" role="toolbar" aria-label="Azioni sui task selezionati" data-vl="">
      <span className="tk-bulk-count">
        {lavoro ? <Loader2 className="animate-spin" aria-hidden /> : <b>{righe.length}</b>}
        <span>{righe.length === 1 ? "selezionato" : "selezionati"}</span>
      </span>

      <button type="button" className="tk-bulk-btn" disabled={lavoro}
        onClick={() => void esegui((t) => taskService.cambiaStato(t.id, true), `${righe.length} task completati`)}>
        <Check aria-hidden /><span>Completa</span>
      </button>

      <TaskPrioritaMenu onChange={(p) => modifica({ priorita: p })}
        trigger={<button type="button" className="tk-bulk-btn" disabled={lavoro}><Flag aria-hidden /><span>Priorità</span></button>} />

      <TaskPosticipaMenu titolo="Scadenza" align="center" scadenza={null} onPosticipa={(s) => modifica({ scadenza: s })}
        trigger={<button type="button" className="tk-bulk-btn" disabled={lavoro}><CalendarDays aria-hidden /><span>Scadenza</span></button>} />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="tk-bulk-btn" disabled={lavoro}><FolderInput aria-hidden /><span>Sposta</span></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="max-h-72 overflow-y-auto">
          {Object.entries(opzioniListe(azioni.struttura)).map(([chiave, nome]) => (
            <DropdownMenuItem key={chiave} onSelect={() => {
              const lista = azioni.struttura.liste.find((l) => l.id === listaDaSelezione(chiave))
              if (lista) modifica({ lista })
            }}>{nome}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <button type="button" className="tk-bulk-btn tk-bulk-btn--danger" disabled={lavoro}
        onClick={() => azioni.conferma({
          titolo: `Eliminare ${righe.length} task?`,
          descrizione: "L'operazione non si può annullare.",
          etichetta: "Elimina",
          azione: () => esegui((t) => taskService.elimina(t.id), `${righe.length} task eliminati`),
        })}>
        <Trash2 aria-hidden /><span>Elimina</span>
      </button>

      <button type="button" className="tk-bulk-close" onClick={onClear} aria-label="Annulla selezione"><X /></button>
    </div>
  )
}
