import { addDays, format, isSameDay, isValid, parseISO, startOfDay } from 'date-fns'
import { it } from 'date-fns/locale'
import { Check, ChevronDown, Flag, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SK_FOCUS_RING } from '@/components/ui/sheet-kit'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { nomeCompleto } from '@/lib/task-nomi'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  TASK_PRIORITA,
  TASK_STATI,
  isStatoChiuso,
  type TaskEtichetta,
  type TaskLista,
  type TaskPersona,
  type TaskPriorita,
  type TaskRiga,
  type TaskStato,
} from '@/services/task-service'

/** Tooltip e popover dentro lo sheet (z 10001) devono stare sopra. */
export const TASK_LAYER_Z = 'z-[10070]'

/**
 * Chip di proprietà (stato, scadenza, priorità...): stesso aspetto ovunque.
 * Nota: index.css dà a ogni <button> `font-size: 1em` fuori dai layer, quindi la dimensione va forzata con `!`.
 */
export const TASK_CHIP =
  'inline-flex h-8 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full! border! border-slate-200! bg-white px-3 text-[13px]! font-medium text-slate-700 shadow-[0_1px_2px_rgba(0,37,82,0.05)] transition hover:border-slate-300! hover:bg-slate-50 data-[state=open]:border-[var(--brand-blue)]/40! data-[state=open]:ring-4 data-[state=open]:ring-[var(--brand-blue)]/10 dark:border-white/12! dark:bg-white/[0.05] dark:text-white/85 dark:hover:border-white/25! dark:hover:bg-white/[0.09] dark:data-[state=open]:border-[var(--brand-orange)]/50! dark:data-[state=open]:ring-[var(--brand-orange)]/15 silvia:border-white/15! silvia:bg-white/[0.05] silvia:text-white'

/** Chip "vuota" (campo da impostare): tratteggiata e discreta. */
export const TASK_CHIP_VUOTA =
  'border-dashed! bg-transparent! text-muted-foreground shadow-none hover:text-foreground dark:bg-transparent!'

export const STATO_COLORI: Record<TaskStato, { pill: string; dot: string; label: string }> = {
  DA_FARE: {
    pill: 'bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-white/10 dark:text-white/80 dark:ring-white/15',
    dot: 'bg-slate-400 dark:bg-white/60',
    label: 'Da fare',
  },
  IN_CORSO: {
    pill: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-400/15 dark:text-sky-200 dark:ring-sky-400/30',
    dot: 'bg-sky-500',
    label: 'In corso',
  },
  IN_ATTESA: {
    pill: 'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-400/15 dark:text-amber-200 dark:ring-amber-400/30',
    dot: 'bg-amber-500',
    label: 'In attesa',
  },
  COMPLETATO: {
    pill: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-400/15 dark:text-emerald-200 dark:ring-emerald-400/30',
    dot: 'bg-emerald-500',
    label: 'Completato',
  },
  ANNULLATO: {
    pill: 'bg-slate-50 text-slate-400 line-through ring-slate-400/15 dark:bg-white/5 dark:text-white/40 dark:ring-white/10',
    dot: 'bg-slate-300 dark:bg-white/30',
    label: 'Annullato',
  },
}

export const PRIORITA_COLORI: Record<TaskPriorita, string> = {
  URGENTE: 'text-rose-600 fill-rose-500 dark:text-rose-400 dark:fill-rose-400',
  ALTA: 'text-orange-500 fill-orange-400 dark:text-orange-300 dark:fill-orange-300',
  NORMALE: 'text-sky-600 fill-sky-500 dark:text-sky-300 dark:fill-sky-300',
  BASSA: 'text-slate-400 fill-slate-300 dark:text-white/40 dark:fill-white/30',
}

export { nomeCompleto } from '@/lib/task-nomi'

export function inizialiDi(persona: { nome?: string | null; cognome?: string | null; iniziali?: string | null } | null | undefined) {
  if (!persona) return '?'
  if (persona.iniziali) return persona.iniziali
  const n = (persona.nome ?? '').trim()[0] ?? ''
  const c = (persona.cognome ?? '').trim()[0] ?? ''
  return (n + c).toUpperCase() || '?'
}

/** Tonalità scelte per stare bene insieme (niente gialli illeggibili né verdi uguali al brand). */
const AVATAR_TONALITA = [205, 262, 168, 28, 340, 230, 190, 295, 12, 145]

export function coloreAvatar(id: number | null | undefined) {
  return AVATAR_TONALITA[Math.abs(Number(id ?? 0)) % AVATAR_TONALITA.length]
}

/** Sfondo a gradiente morbido dell'avatar, deterministico per persona. */
export function sfondoAvatar(id: number | null | undefined): string {
  const h = coloreAvatar(id)
  return `linear-gradient(135deg, hsl(${h} 72% 62%), hsl(${(h + 18) % 360} 62% 46%))`
}


/** "2026-10-23" → Date locale (senza fuso). */
export function parseDataLocale(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = parseISO(iso.length > 10 ? iso.slice(0, 10) : iso)
  return isValid(d) ? d : null
}

export function toIsoData(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

const oraBreve = (ora: string | null | undefined) => (ora ? ora.slice(0, 5) : '')

/** "Oggi 15:30", "Domani", "Ieri", "lun 3 nov", "3 nov 2027". */
export function formatScadenza(scadenza: string | null | undefined, ora?: string | null): string {
  const d = parseDataLocale(scadenza)
  if (!d) return ''
  const oggi = startOfDay(new Date())
  let giorno: string
  if (isSameDay(d, oggi)) giorno = 'Oggi'
  else if (isSameDay(d, addDays(oggi, 1))) giorno = 'Domani'
  else if (isSameDay(d, addDays(oggi, -1))) giorno = 'Ieri'
  else if (d.getFullYear() === oggi.getFullYear()) giorno = format(d, 'EEE d MMM', { locale: it })
  else giorno = format(d, 'd MMM yyyy', { locale: it })
  const o = oraBreve(ora)
  return o ? `${giorno} ${o}` : giorno
}

/** Scadenza passata (data, o data di oggi con ora passata) su un task ancora aperto. */
export function isScaduto(riga: Pick<TaskRiga, 'scadenza' | 'scadenzaOra' | 'stato'>): boolean {
  if (isStatoChiuso(riga.stato)) return false
  const d = parseDataLocale(riga.scadenza)
  if (!d) return false
  const oggi = startOfDay(new Date())
  if (d < oggi) return true
  if (isSameDay(d, oggi) && riga.scadenzaOra) {
    const [h, m] = riga.scadenzaOra.split(':').map(Number)
    const limite = new Date(d)
    limite.setHours(h || 0, m || 0, 0, 0)
    return limite < new Date()
  }
  return false
}

export function isInScadenzaOggi(riga: Pick<TaskRiga, 'scadenza' | 'stato'>): boolean {
  const d = parseDataLocale(riga.scadenza)
  return !!d && !isStatoChiuso(riga.stato) && isSameDay(d, new Date())
}

export function TaskStatoBadge({ stato, className }: { stato: TaskStato; className?: string }) {
  const c = STATO_COLORI[stato]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-semibold ring-1 ring-inset',
        c.pill,
        className,
      )}
    >
      {stato === 'COMPLETATO' ? (
        <Check className="size-3" strokeWidth={3} />
      ) : (
        <span className={cn('size-1.5 rounded-full', c.dot, stato === 'IN_CORSO' && 'animate-pulse')} />
      )}
      {c.label}
    </span>
  )
}

export function TaskStatoSelect({
  value,
  onChange,
  disabled,
  chip,
  open,
  onOpenChange,
  title,
}: {
  value: TaskStato
  onChange: (stato: TaskStato) => void
  disabled?: boolean
  /** Aspetto a chip (barra delle proprietà) invece del solo badge */
  chip?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  title?: string
}) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        {chip ? (
          <button type="button" className={cn(TASK_CHIP, SK_FOCUS_RING, 'pl-2')} title={title}>
            <span className={cn('size-2 rounded-full', STATO_COLORI[value].dot)} />
            {STATO_COLORI[value].label}
            <ChevronDown className="size-3.5 opacity-50" />
          </button>
        ) : (
          <button
            type="button"
            title={title}
            className={cn(
              'group inline-flex items-center gap-1 rounded-full! border-0! bg-transparent p-0.5 transition hover:bg-slate-100 disabled:opacity-60 dark:hover:bg-white/10',
              SK_FOCUS_RING,
            )}
          >
            <TaskStatoBadge stato={value} />
            <ChevronDown className="size-3.5 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className={cn('w-48', TASK_LAYER_Z)}>
        {TASK_STATI.map((s) => (
          <DropdownMenuItem key={s.value} onSelect={() => onChange(s.value)} className="justify-between">
            <TaskStatoBadge stato={s.value} />
            {s.value === value && <Check className="size-4 text-muted-foreground" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TaskPrioritaIcon({
  priorita,
  showLabel,
  className,
}: {
  priorita: TaskPriorita | null | undefined
  showLabel?: boolean
  className?: string
}) {
  const label = priorita ? TASK_PRIORITA.find((p) => p.value === priorita)?.label : 'Nessuna'
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[13px]', className)} title={`Priorità: ${label}`}>
      <Flag
        className={cn(
          'size-3.5 shrink-0',
          priorita ? PRIORITA_COLORI[priorita] : 'fill-transparent text-slate-300 dark:text-white/25',
        )}
      />
      {showLabel && <span className={cn(!priorita && 'text-muted-foreground')}>{label}</span>}
    </span>
  )
}

export function TaskPrioritaSelect({
  value,
  onChange,
  disabled,
  chip,
  open,
  onOpenChange,
  title,
}: {
  value: TaskPriorita | null
  onChange: (priorita: TaskPriorita | null) => void
  disabled?: boolean
  chip?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  title?: string
}) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        {chip ? (
          <button type="button" className={cn(TASK_CHIP, SK_FOCUS_RING, !value && TASK_CHIP_VUOTA)} title={title}>
            <TaskPrioritaIcon priorita={value} />
            {value ? TASK_PRIORITA.find((p) => p.value === value)?.label : 'Priorità'}
          </button>
        ) : (
          <button
            type="button"
            title={title}
            className={cn(
              'inline-flex items-center gap-1 rounded-lg! border-0! bg-transparent px-1.5 py-1 text-[13px]! font-medium transition hover:bg-slate-100 dark:hover:bg-white/10',
              SK_FOCUS_RING,
            )}
          >
            <TaskPrioritaIcon priorita={value} showLabel />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className={cn('w-44', TASK_LAYER_Z)}>
        {TASK_PRIORITA.map((p) => (
          <DropdownMenuItem key={p.value} onSelect={() => onChange(p.value)} className="justify-between">
            <TaskPrioritaIcon priorita={p.value} showLabel />
            {p.value === value && <Check className="size-4 text-muted-foreground" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={() => onChange(null)} className="justify-between">
          <TaskPrioritaIcon priorita={null} showLabel />
          {value == null && <Check className="size-4 text-muted-foreground" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const AVATAR_SIZE = {
  xs: 'size-5 text-[9px]',
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-xs',
} as const

export function TaskAvatar({
  persona,
  size = 'sm',
  className,
  noTooltip,
}: {
  persona: TaskPersona | null | undefined
  size?: keyof typeof AVATAR_SIZE
  className?: string
  noTooltip?: boolean
}) {
  const avatar = (
    <span
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold tracking-tight text-white ring-2 ring-background',
        !persona && 'bg-slate-300 dark:bg-white/20',
        AVATAR_SIZE[size],
        className,
      )}
      style={persona ? { backgroundImage: sfondoAvatar(persona.id) } : undefined}
    >
      {inizialiDi(persona)}
    </span>
  )
  if (noTooltip || !persona) return avatar
  return (
    <Tooltip>
      <TooltipTrigger asChild>{avatar}</TooltipTrigger>
      <TooltipContent className={TASK_LAYER_Z}>{nomeCompleto(persona)}</TooltipContent>
    </Tooltip>
  )
}

export function TaskAvatarStack({
  persone,
  max = 3,
  size = 'sm',
  className,
}: {
  persone: TaskPersona[]
  max?: number
  size?: keyof typeof AVATAR_SIZE
  className?: string
}) {
  if (!persone?.length) return null
  const visibili = persone.slice(0, max)
  const altri = persone.slice(max)
  return (
    <span className={cn('inline-flex items-center -space-x-1.5', className)}>
      {visibili.map((p) => (
        <TaskAvatar key={p.id} persona={p} size={size} />
      ))}
      {altri.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                'inline-flex shrink-0 items-center justify-center rounded-full bg-slate-200 font-bold text-slate-600 ring-2 ring-background dark:bg-white/15 dark:text-white/80',
                AVATAR_SIZE[size],
              )}
            >
              +{altri.length}
            </span>
          </TooltipTrigger>
          <TooltipContent className={TASK_LAYER_Z}>{altri.map(nomeCompleto).join(', ')}</TooltipContent>
        </Tooltip>
      )}
    </span>
  )
}

export function TaskScadenzaLabel({
  scadenza,
  scadenzaOra,
  chiuso,
  className,
}: {
  scadenza: string | null | undefined
  scadenzaOra?: string | null
  chiuso?: boolean
  className?: string
}) {
  if (!scadenza) return null
  const scaduto = !chiuso && isScaduto({ scadenza, scadenzaOra: scadenzaOra ?? null, stato: 'DA_FARE' })
  const oggi = !chiuso && !scaduto && isInScadenzaOggi({ scadenza, stato: 'DA_FARE' })
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap text-[13px] tabular-nums',
        scaduto && 'font-semibold text-rose-600 dark:text-rose-400',
        oggi && 'font-semibold text-amber-600 dark:text-amber-300',
        !scaduto && !oggi && 'text-muted-foreground',
        chiuso && 'line-through opacity-70',
        className,
      )}
    >
      {formatScadenza(scadenza, scadenzaOra)}
    </span>
  )
}

/** Sfondo tenue + testo pieno dal colore esadecimale dell'etichetta. */
export function coloreTenue(hex: string | null | undefined, alpha = 0.14): string {
  const h = (hex || '#64748B').replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  if (Number.isNaN(n)) return `rgba(100,116,139,${alpha})`
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

export function TaskEtichettaChip({
  etichetta,
  onRemove,
  className,
}: {
  etichetta: TaskEtichetta
  onRemove?: () => void
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-[12rem] items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-semibold',
        className,
      )}
      style={{ backgroundColor: coloreTenue(etichetta.colore), color: etichetta.colore }}
    >
      <span className="truncate">{etichetta.nome}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="-mr-0.5 inline-flex rounded! border-0! bg-transparent p-0 opacity-60 hover:opacity-100"
          aria-label={`Rimuovi ${etichetta.nome}`}
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  )
}

export function TaskListaDot({
  lista,
  className,
  hideName,
}: {
  lista: Pick<TaskLista, 'nome' | 'colore'> | null | undefined
  className?: string
  hideName?: boolean
}) {
  if (!lista) return null
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 text-[13px]', className)}>
      <span
        className="size-2.5 shrink-0 rounded-[4px]"
        style={{ backgroundColor: lista.colore, boxShadow: `0 0 0 3px ${coloreTenue(lista.colore, 0.18)}` }}
      />
      {!hideName && <span className="truncate">{lista.nome}</span>}
    </span>
  )
}
