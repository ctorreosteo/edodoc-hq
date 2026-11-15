import { useState } from 'react'
import { ArrowRightLeft, CalendarDays, CircleDot, Flag, Loader2, Trash2, UserPlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TaskOperatoriPicker, TaskScadenzaPicker } from '@/components/task/task-pickers'
import { TaskPrioritaIcon, TaskStatoBadge, TASK_LAYER_Z } from '@/components/task/task-ui'
import { TaskListaPicker } from '@/components/task/task-lista-picker'
import {
  TASK_PRIORITA, TASK_STATI, type AggiornaTaskValori, type TaskConfig, type TaskRiga,
} from '@/services/task-service'
import { eseguiBulk } from './task-pagina-utils'

interface Props {
  config: TaskConfig
  ids: number[]
  /** Righe caricate: servono a sapere se ci sono sottotask da completare */
  righe?: TaskRiga[]
  onClear: () => void
  onDone: () => void
}

/** Barra azioni sulla selezione multipla: stessa modifica a tutti i task selezionati, che restano selezionati finché non si preme «Deseleziona». */
export function TaskBulkBar({ config, ids, righe, onClear, onDone }: Props) {
  const [lavoro, setLavoro] = useState(false)
  const [conferma, setConferma] = useState(false)
  const [assegnatari, setAssegnatari] = useState<number[]>([])

  if (!ids.length) return null

  const esegui = async (valori: AggiornaTaskValori | null, elimina = false) => {
    setLavoro(true)
    const ok = await eseguiBulk(ids, valori, elimina, righe)
    setLavoro(false)
    setConferma(false)
    if (ok) onDone()
  }


  return (
    <>
      <div className="tk-bulk" role="toolbar" aria-label="Azioni sui task selezionati" data-vl="">
        <span className="tk-bulk-count">
          {lavoro ? <Loader2 className="animate-spin" aria-hidden /> : <b>{ids.length}</b>}
          <span>{ids.length === 1 ? 'selezionato' : 'selezionati'}</span>
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="tk-bulk-btn" disabled={lavoro}><CircleDot aria-hidden /><span>Stato</span></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className={TASK_LAYER_Z} side="top">
            {TASK_STATI.map((s) => (
              <DropdownMenuItem key={s.value} onSelect={() => void esegui({ stato: s.value })}><TaskStatoBadge stato={s.value} /></DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="tk-bulk-btn" disabled={lavoro}><Flag aria-hidden /><span>Priorità</span></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className={TASK_LAYER_Z} side="top">
            {TASK_PRIORITA.map((p) => (
              <DropdownMenuItem key={p.value} onSelect={() => void esegui({ priorita: p.value })}>
                <TaskPrioritaIcon priorita={p.value} showLabel />
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onSelect={() => void esegui({ priorita: null })}><TaskPrioritaIcon priorita={null} showLabel /></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="tk-bulk-picker">
          <CalendarDays aria-hidden className="tk-bulk-picker-icon" />
          <TaskScadenzaPicker scadenza={null} scadenzaOra={null} placeholder="Scadenza"
            onChange={(v) => void esegui({ scadenza: v.scadenza, scadenzaOra: v.scadenzaOra })} />
        </span>

        {/* Liste raggruppate per cartella */}
        <TaskListaPicker config={config} value={null} onChange={(id) => void esegui({ listaId: id })} align="center"
          trigger={
            <button type="button" className="tk-bulk-btn" disabled={lavoro}>
              <ArrowRightLeft aria-hidden /><span>Sposta</span>
            </button>
          } />

        <TaskOperatoriPicker operatori={config.operatori} value={assegnatari} onChange={setAssegnatari}
          trigger={
            <button type="button" className="tk-bulk-btn" disabled={lavoro}><UserPlus aria-hidden /><span>Assegna</span></button>
          } />
        {assegnatari.length ? (
          <button type="button" className="tk-bulk-btn tk-bulk-btn--apply" disabled={lavoro}
            onClick={() => {
              void esegui({ assegnatariIds: assegnatari })
              setAssegnatari([])
            }}>
            Assegna a {assegnatari.length === 1 ? config.operatori.find((o) => o.id === assegnatari[0])?.nome ?? '1 persona' : `${assegnatari.length} persone`}
          </button>
        ) : null}

        <button type="button" className="tk-bulk-btn tk-bulk-btn--danger" disabled={lavoro} onClick={() => setConferma(true)}>
          <Trash2 aria-hidden /><span>Elimina</span>
        </button>

        <button type="button" className="tk-bulk-close" onClick={onClear} disabled={lavoro}>
          <X aria-hidden /><span>Deseleziona</span>
        </button>
      </div>

      <Dialog open={conferma} onOpenChange={setConferma}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminare {ids.length} {ids.length === 1 ? 'task' : 'task'}?</DialogTitle>
            <DialogDescription>
              Verranno eliminati anche commenti, allegati e checklist. L'operazione non si può annullare.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConferma(false)} disabled={lavoro}>Annulla</Button>
            <Button variant="destructive" onClick={() => void esegui(null, true)} disabled={lavoro}>
              {lavoro ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Elimina
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
