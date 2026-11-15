import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Check, ChevronDown, FolderOpen, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SK_FOCUS_RING } from '@/components/ui/sheet-kit'
import { gruppiListe } from '@/lib/task-liste'
import type { TaskConfig, TaskLista } from '@/services/task-service'
import { TASK_LAYER_Z, TaskListaDot } from './task-ui'

const normalizza = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()

/**
 * Scelta di una lista, raggruppata per percorso di cartella, con ricerca. Le archiviate non compaiono.
 */
export function TaskListaPicker({
  config,
  value,
  onChange,
  trigger,
  placeholder = 'Scegli lista',
  className,
  disabled,
  open: openProp,
  onOpenChange,
  align = 'start',
}: {
  config: TaskConfig
  value: number | null
  onChange: (id: number) => void
  trigger?: ReactNode
  placeholder?: string
  className?: string
  disabled?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  align?: 'start' | 'center' | 'end'
}) {
  const [interna, setInterna] = useState(false)
  const open = openProp ?? interna
  const setOpen = (o: boolean) => {
    if (openProp === undefined) setInterna(o)
    onOpenChange?.(o)
  }
  const [q, setQ] = useState('')
  const [attivo, setAttivo] = useState(0)

  const attuale = config.liste.find((l) => l.id === value) ?? null
  const gruppi = useMemo(() => {
    const n = normalizza(q)
    const tutti = gruppiListe(config)
    if (!n) return tutti
    return tutti
      .map((g) => ({
        ...g,
        liste: g.liste.filter((l) => normalizza(l.nome).includes(n) || normalizza(g.titolo).includes(n)),
      }))
      .filter((g) => g.liste.length > 0)
  }, [config, q])
  const piatte = useMemo(() => gruppi.flatMap((g) => g.liste), [gruppi])

  useEffect(() => setAttivo(0), [q, open])

  const scegli = (l: TaskLista) => {
    onChange(l.id)
    setOpen(false)
    setQ('')
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAttivo((i) => Math.min(i + 1, Math.max(piatte.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAttivo((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (piatte[attivo]) scegli(piatte[attivo])
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setQ('')
      }}
    >
      <PopoverTrigger asChild disabled={disabled}>
        {trigger ?? (
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-lg! border-0! bg-transparent px-1.5 py-1 text-left text-[13px]! font-medium transition hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-60 dark:hover:bg-white/10',
              SK_FOCUS_RING,
              className,
            )}
          >
            {attuale ? (
              <>
                <TaskListaDot lista={attuale} />
              </>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <ChevronDown className="size-3.5 shrink-0 opacity-50" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align={align} className={cn('w-72 p-0', TASK_LAYER_Z)} onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Cerca lista o cartella…"
            className="h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-1" role="listbox" aria-label="Liste">
          {piatte.length === 0 ? (
            <p className="px-3 py-4 text-center text-[13px] text-muted-foreground">
              {q ? 'Nessuna lista trovata' : 'Nessuna lista disponibile'}
            </p>
          ) : (
            gruppi.map((g) => (
              <div key={g.titolo || '__radice'} className="py-0.5">
                {g.titolo ? (
                  <p className="flex items-center gap-1.5 px-2 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    <FolderOpen className="size-3" />
                    <span className="truncate">{g.titolo}</span>
                  </p>
                ) : null}
                {g.liste.map((l) => {
                  const i = piatte.indexOf(l)
                  const sel = l.id === value
                  return (
                    <button
                      key={l.id}
                      type="button"
                      role="option"
                      aria-selected={sel}
                      onMouseEnter={() => setAttivo(i)}
                      onClick={() => scegli(l)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md! border-0! bg-transparent px-2 py-1.5 text-left text-[13px]!',
                        i === attivo && 'bg-slate-100 dark:bg-white/10',
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        <TaskListaDot lista={l} />
                      </span>
                      {sel ? <Check className="size-4 shrink-0 text-muted-foreground" /> : <span className="size-4 shrink-0" />}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
