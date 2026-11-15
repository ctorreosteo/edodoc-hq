import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Check, ChevronDown, Folder, FolderRoot, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SK_FOCUS_RING } from '@/components/ui/sheet-kit'
import { costruisciAlbero, discendenti, percorsoCartella, type NodoCartella } from '@/lib/task-struttura'
import type { TaskCartella, TaskConfig } from '@/services/task-service'
import { TASK_LAYER_Z } from './task-ui'

const normalizza = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()

interface Voce {
  cartella: TaskCartella
  profondita: number
  percorso: string
  disabilitata: boolean
}

/** Valore speciale della voce "Radice" nell'elenco navigabile da tastiera. */
const RADICE = -1

/**
 * Scelta di una cartella (albero con ricerca). Le archiviate non sono destinazioni valide;
 * con `escludiId` la cartella e tutte le sue sottocartelle non compaiono (per non spostarla dentro sé stessa);
 */
export function TaskCartellaPicker({
  config,
  value,
  onChange,
  escludiId,
  consentiRadice = true,
  trigger,
  placeholder = 'Scegli cartella',
  className,
  disabled,
  open: openProp,
  onOpenChange,
  align = 'start',
}: {
  config: TaskConfig
  value: number | null
  onChange: (id: number | null) => void
  escludiId?: number
  consentiRadice?: boolean
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

  const voci = useMemo(() => {
    const esclusi = escludiId != null ? discendenti(config, escludiId) : new Set<number>()
    const albero = costruisciAlbero(config)
    const out: Voce[] = []
    const visita = (n: NodoCartella, profondita: number, sopra: string[]) => {
      if (esclusi.has(n.cartella.id)) return
      const percorso = [...sopra, n.cartella.nome]
      out.push({
        cartella: n.cartella,
        profondita,
        percorso: percorso.join(' / '),
        disabilitata: false,
      })
      n.figli.forEach((f) => visita(f, profondita + 1, percorso))
    }
    albero.radiceCartelle.forEach((n) => visita(n, 0, []))
    return out
  }, [config, escludiId])

  const filtrate = useMemo(() => {
    const n = normalizza(q)
    return n ? voci.filter((v) => normalizza(v.percorso).includes(n)) : voci
  }, [voci, q])

  // Elementi navigabili da tastiera: radice (se ammessa e senza ricerca) + cartelle selezionabili
  const navigabili = useMemo(
    () => [...(consentiRadice && !q ? [RADICE] : []), ...filtrate.filter((v) => !v.disabilitata).map((v) => v.cartella.id)],
    [consentiRadice, q, filtrate],
  )

  useEffect(() => setAttivo(0), [q, open])

  const scegli = (id: number | null) => {
    onChange(id)
    setOpen(false)
    setQ('')
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAttivo((i) => Math.min(i + 1, Math.max(navigabili.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAttivo((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const id = navigabili[attivo]
      if (id !== undefined) scegli(id === RADICE ? null : id)
    }
  }

  const attuale = value != null ? config.cartelle.find((c) => c.id === value) ?? null : null
  const etichetta = attuale ? percorsoCartella(config, attuale.id).map((c) => c.nome).join(' / ') : null
  const inEvidenza = navigabili[attivo]

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
              'inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-lg! border border-slate-200 bg-transparent px-2 py-1 text-left text-[13px]! font-medium transition hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-60 dark:border-white/15 dark:hover:bg-white/10',
              SK_FOCUS_RING,
              className,
            )}
          >
            {attuale ? (
              <Folder className="size-3.5 shrink-0" style={{ color: attuale.colore }} />
            ) : (
              <FolderRoot className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className={cn('truncate', !attuale && !consentiRadice && 'text-muted-foreground')}>
              {etichetta ?? (consentiRadice ? 'Radice (nessuna cartella)' : placeholder)}
            </span>
            <ChevronDown className="size-3.5 shrink-0 opacity-50" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align={align} className={cn('w-80 p-0', TASK_LAYER_Z)} onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Cerca cartella…"
            aria-label="Cerca cartella"
            className="h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-1" role="listbox" aria-label="Cartelle">
          {consentiRadice && !q ? (
            <button
              type="button"
              role="option"
              aria-selected={value == null}
              onMouseEnter={() => setAttivo(0)}
              onClick={() => scegli(null)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md! border-0! bg-transparent px-2 py-1.5 text-left text-[13px]!',
                inEvidenza === RADICE && 'bg-slate-100 dark:bg-white/10',
              )}
            >
              <FolderRoot className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1">Radice (nessuna cartella)</span>
              {value == null ? <Check className="size-4 shrink-0 text-[var(--brand-blue)] dark:text-[var(--brand-orange)]" /> : null}
            </button>
          ) : null}
          {filtrate.length === 0 ? (
            <p className="px-3 py-4 text-center text-[13px] text-muted-foreground">
              {q ? 'Nessuna cartella trovata' : 'Nessuna cartella'}
            </p>
          ) : (
            filtrate.map((v) => {
              const sel = v.cartella.id === value
              return (
                <button
                  key={v.cartella.id}
                  type="button"
                  role="option"
                  aria-selected={sel}
                  aria-disabled={v.disabilitata}
                  disabled={v.disabilitata}
                  title={v.disabilitata ? 'Non hai il permesso di aggiungere elementi in questa cartella' : v.percorso}
                  onMouseEnter={() => {
                    const i = navigabili.indexOf(v.cartella.id)
                    if (i >= 0) setAttivo(i)
                  }}
                  onClick={() => scegli(v.cartella.id)}
                  style={{ paddingLeft: `${0.5 + (q ? 0 : v.profondita) * 1}rem` }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md! border-0! bg-transparent py-1.5 pr-2 text-left text-[13px]! disabled:cursor-not-allowed disabled:opacity-45',
                    inEvidenza === v.cartella.id && 'bg-slate-100 dark:bg-white/10',
                  )}
                >
                  <Folder className="size-4 shrink-0" style={{ color: v.cartella.colore }} />
                  <span className="min-w-0 flex-1 truncate">{q ? v.percorso : v.cartella.nome}</span>
                  {sel ? <Check className="size-4 shrink-0 text-[var(--brand-blue)] dark:text-[var(--brand-orange)]" /> : null}
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
