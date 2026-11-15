import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowRight, Check, Hourglass, Link2, Lock, Plus, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useTaskConfig } from '@/hooks/use-task-config'
import {
  taskService,
  type TaskDettaglio,
  type TaskDipendenzaVoce,
  type TaskDipendenze,
  type TaskRiga,
} from '@/services/task-service'
import { STATO_COLORI, TASK_LAYER_Z, TaskListaDot, TaskScadenzaLabel } from './task-ui'

const chiuso = (v: { stato: TaskRiga['stato'] }) => v.stato === 'COMPLETATO' || v.stato === 'ANNULLATO'

/**
 * Dipendenze «fine → inizio» del task: quelli che deve aspettare e quelli che blocca. Si aggiungono cercando un task
 * (qualsiasi lista che vedi) e si tolgono con la X; nel Gantt sono le frecce fra le barre.
 */
export function TaskDipendenzeSezione({ task, dipendenze, onApri, esegui }: {
  task: TaskRiga
  dipendenze: TaskDipendenze
  onApri?: (id: number) => void
  esegui: (fn: () => Promise<TaskDettaglio>, messaggio?: string) => Promise<TaskDettaglio | null>
}) {
  const giaCollegati = useMemo(
    () => new Set([task.id, ...dipendenze.attende.map((d) => d.id), ...dipendenze.blocca.map((d) => d.id)]),
    [task.id, dipendenze],
  )
  const aperte = dipendenze.attende.filter((d) => !chiuso(d)).length

  const gruppo = (tipo: 'attende' | 'blocca', voci: TaskDipendenzaVoce[]) => (
    <div className="space-y-0.5">
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
        {tipo === 'attende' ? <Hourglass className="size-3.5" /> : <ArrowRight className="size-3.5" />}
        {tipo === 'attende' ? 'Aspetta' : 'Blocca'}
      </p>
      {voci.map((v) => (
        <div key={v.id} className="group -mx-2 flex items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-slate-50 dark:hover:bg-white/[0.04]">
          {chiuso(v)
            ? <Check className="size-3.5 shrink-0 text-emerald-500" aria-label="Fatto" />
            : <span className={cn('size-2 shrink-0 rounded-full', STATO_COLORI[v.stato].dot)} title={STATO_COLORI[v.stato].label} />}
          {v.titolo == null ? (
            <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[14px] text-muted-foreground">
              <Lock className="size-3.5" /> Task riservato
            </span>
          ) : (
            <button type="button" disabled={!onApri} onClick={() => onApri?.(v.id)}
              className={cn('min-w-0 flex-1 truncate border-0! bg-transparent p-0 text-left text-[14px] transition',
                onApri && 'hover:text-[var(--brand-blue)] dark:hover:text-white', chiuso(v) && 'text-muted-foreground line-through')}>
              {v.titolo}
            </button>
          )}
          <TaskScadenzaLabel scadenza={v.scadenza} chiuso={chiuso(v)} className="text-[12px]" />
          <button type="button" aria-label="Togli la dipendenza" title="Togli la dipendenza"
              onClick={() => void esegui(() => tipo === 'attende'
                ? taskService.rimuoviDipendenza(task.id, v.id)
                : taskService.rimuoviDipendenza(v.id, task.id), 'Dipendenza non tolta')}
              className="inline-grid size-6 place-items-center rounded-md! border-0! bg-transparent p-0 text-muted-foreground opacity-0 transition hover:bg-rose-100 hover:text-rose-600 group-hover:opacity-100 focus-visible:opacity-100 dark:hover:bg-rose-500/15 [@media(hover:none)]:opacity-100">
              <X className="size-3.5" />
            </button>
        </div>
      ))}
    </div>
  )

  return (
    <div className="space-y-3">
      {aperte > 0 && !chiuso(task) ? (
        <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">
          <Hourglass className="size-4 shrink-0" />
          {aperte === 1 ? 'Si può iniziare quando è finito il task che aspetta.' : `Si può iniziare quando sono finiti i ${aperte} task che aspetta.`}
        </p>
      ) : null}
      {dipendenze.attende.length ? gruppo('attende', dipendenze.attende) : null}
      {dipendenze.blocca.length ? gruppo('blocca', dipendenze.blocca) : null}
      <div className="flex flex-wrap gap-1.5">
          <TaskCercaPicker listaId={task.listaId} escludi={giaCollegati} titolo="Questo task aspetta…"
            onScegli={(r) => void esegui(() => taskService.aggiungiDipendenza(task.id, r.id), 'Dipendenza non aggiunta')}
            trigger={<BottoneAggiungi><Hourglass className="size-3.5" /> Aspetta un task</BottoneAggiungi>} />
          <TaskCercaPicker listaId={task.listaId} escludi={giaCollegati} titolo="Chi aspetta questo task?"
            onScegli={(r) => void esegui(async () => {
              await taskService.aggiungiDipendenza(r.id, task.id)
              return taskService.getDettaglio(task.id)
            }, 'Dipendenza non aggiunta')}
            trigger={<BottoneAggiungi><ArrowRight className="size-3.5" /> Blocca un task</BottoneAggiungi>} />
        </div>
    </div>
  )
}

function BottoneAggiungi({ children, ...props }: { children: ReactNode }) {
  return (
    <button type="button" {...props}
      className="inline-flex h-7 items-center gap-1.5 rounded-full! border! border-dashed! border-slate-200! bg-transparent px-2.5 text-[12px]! font-medium text-muted-foreground transition hover:border-slate-300! hover:text-foreground data-[state=open]:border-[var(--brand-blue)]/40! dark:border-white/12! dark:hover:border-white/25!">
      <Plus className="size-3" />{children}
    </button>
  )
}

/** Cerca un task da collegare: senza testo propone gli aperti della stessa lista, scrivendo cerca in tutte. */
export function TaskCercaPicker({ listaId, escludi, titolo, onScegli, trigger }: {
  listaId: number
  escludi: Set<number>
  titolo: string
  onScegli: (r: TaskRiga) => void
  trigger: ReactNode
}) {
  const { config } = useTaskConfig()
  const [aperto, setAperto] = useState(false)
  const [q, setQ] = useState('')
  const [righe, setRighe] = useState<TaskRiga[]>([])
  const [caricando, setCaricando] = useState(false)
  const [indice, setIndice] = useState(0)

  useEffect(() => {
    if (!aperto) return
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      setCaricando(true)
      const testo = q.trim()
      taskService.getTask(testo ? { q: testo } : { listaId, includiChiusi: false })
        .then((r) => {
          if (!ctrl.signal.aborted) setRighe(r)
        })
        .catch(() => undefined)
        .finally(() => setCaricando(false))
    }, q ? 220 : 0)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [aperto, q, listaId])

  const proposte = useMemo(() => righe.filter((r) => !escludi.has(r.id)).slice(0, 8), [righe, escludi])
  useEffect(() => setIndice(0), [proposte])

  const scegli = (r: TaskRiga) => {
    onScegli(r)
    setAperto(false)
    setQ('')
  }

  return (
    <Popover open={aperto} onOpenChange={(v) => { setAperto(v); if (!v) setQ('') }}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className={cn('w-80 overflow-hidden rounded-xl p-0', TASK_LAYER_Z)}
        onWheel={(e) => e.stopPropagation()} onTouchMove={(e) => e.stopPropagation()}>
        <p className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{titolo}</p>
        <label className="mx-2 mb-1 flex items-center gap-2 rounded-lg border px-2">
          <Search className="size-4 text-muted-foreground" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca un task…"
            className="h-8 min-w-0 flex-1 bg-transparent text-[13px] outline-none"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                if (proposte.length) setIndice((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + proposte.length) % proposte.length)
              } else if (e.key === 'Enter' && proposte[indice]) {
                e.preventDefault()
                scegli(proposte[indice])
              }
            }} />
        </label>
        <div className="max-h-72 overflow-y-auto p-1" role="listbox">
          {proposte.map((r, i) => {
            const lista = config?.liste.find((l) => l.id === r.listaId)
            return (
              <button key={r.id} type="button" role="option" aria-selected={i === indice}
                onMouseEnter={() => setIndice(i)} onClick={() => scegli(r)}
                className={cn('flex w-full items-center gap-2 rounded-lg! border-0! px-2 py-1.5 text-left text-[13px]! transition',
                  i === indice ? 'bg-accent text-accent-foreground' : 'bg-transparent')}>
                <span className={cn('size-2 shrink-0 rounded-full', STATO_COLORI[r.stato].dot)} />
                <span className="min-w-0 flex-1 truncate font-medium">{r.titolo}</span>
                {lista && lista.id !== listaId ? <TaskListaDot lista={lista} hideName /> : null}
                <TaskScadenzaLabel scadenza={r.scadenza} className="text-[11px]" />
              </button>
            )
          })}
          {!proposte.length ? (
            <p className="flex items-center gap-2 px-2 py-3 text-[13px] text-muted-foreground">
              <Link2 className="size-4" />{caricando ? 'Cerco…' : q.trim() ? 'Nessun task trovato' : 'Scrivi per cercare in tutte le liste'}
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
