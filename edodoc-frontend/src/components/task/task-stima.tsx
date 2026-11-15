import { useState, type ReactNode } from 'react'
import { Hourglass, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SK_FOCUS_RING } from '@/components/ui/sheet-kit'
import { formatStima, parseStima, STIME_RAPIDE } from '@/lib/task-stima'
import { TASK_CHIP, TASK_CHIP_VUOTA } from './task-ui'

/** La stima in sola lettura: clessidra e durata, discreta. */
export function TaskStimaLabel({ minuti, className }: { minuti: number | null | undefined; className?: string }) {
  if (!minuti) return null
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap text-[13px] tabular-nums text-muted-foreground', className)}
      title={`Stima: ${formatStima(minuti)}`}>
      <Hourglass className="size-3.5 text-indigo-500 dark:text-indigo-300" aria-hidden />
      {formatStima(minuti)}
    </span>
  )
}

/**
 * Stima di durata: scelte rapide (15 min … 8 h) o testo libero («1h30», «45m», «2,5 ore»).
 * `trigger` personalizza il pulsante; senza, è la chip del dettaglio.
 */
export function TaskStimaPicker({ value, onChange, trigger, placeholder = 'Stima', className, title = 'Stima di durata' }: {
  value: number | null | undefined
  onChange: (minuti: number | null) => void
  trigger?: ReactNode
  placeholder?: string
  className?: string
  title?: string
}) {
  const [aperto, setAperto] = useState(false)
  const [testo, setTesto] = useState('')
  const letto = parseStima(testo)

  const scegli = (minuti: number | null) => {
    onChange(minuti)
    setAperto(false)
    setTesto('')
  }

  return (
    <Popover open={aperto} onOpenChange={(v) => { setAperto(v); if (!v) setTesto('') }}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <button type="button" title={title} className={cn(TASK_CHIP, SK_FOCUS_RING, !value && TASK_CHIP_VUOTA, className)}>
            <Hourglass className="size-4 text-indigo-500 dark:text-indigo-300" />
            <span className="tabular-nums">{value ? formatStima(value) : placeholder}</span>
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3" onClick={(e) => e.stopPropagation()}>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Quanto ci vuole?</p>
        <div className="grid grid-cols-3 gap-1.5">
          {STIME_RAPIDE.map((m) => (
            <button key={m} type="button" onClick={() => scegli(m)}
              className={cn('rounded-lg border px-2 py-1.5 text-sm tabular-nums transition hover:bg-accent',
                value === m && 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-400/50 dark:bg-indigo-400/10 dark:text-indigo-200')}>
              {formatStima(m)}
            </button>
          ))}
        </div>
        <form className="mt-2.5" onSubmit={(e) => { e.preventDefault(); if (letto) scegli(letto) }}>
          <input value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Altro: 1h30, 45m, 2,5 ore"
            aria-label="Stima a mano"
            className="h-8 w-full rounded-md border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40" />
          {testo.trim() ? (
            <p className={cn('mt-1 text-xs', letto ? 'text-muted-foreground' : 'text-destructive')}>
              {letto ? <>Invio per <b>{formatStima(letto)}</b></> : 'Scrivi ad esempio 1h30, 45m o 2,5 ore'}
            </p>
          ) : null}
        </form>
        {value ? (
          <button type="button" onClick={() => scegli(null)}
            className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <X className="size-3.5" aria-hidden /> Togli la stima
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
