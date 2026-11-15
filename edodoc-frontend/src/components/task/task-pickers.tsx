import { useEffect, useMemo, useRef, useState, type ReactNode, type SyntheticEvent } from 'react'
import { addDays, addWeeks, format, nextMonday } from 'date-fns'
import { it } from 'date-fns/locale'
import { CalendarDays, Check, Clock, Loader2, Plus, Search, Tag, User, UserPlus, Users, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { nomeCompleto } from '@/lib/task-nomi'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { SK_FOCUS_RING } from '@/components/ui/sheet-kit'
import { useAuth } from '@/contexts/auth-context'
import { pazientiService } from '@/services/gestionale'
import type { TaskEtichetta, TaskLista, TaskOperatore, TaskPaziente } from '@/services/task-service'
import { useTaskConfig } from '@/hooks/use-task-config'
import { TaskListaPicker } from './task-lista-picker'
import {
  TASK_LAYER_Z,
  TaskAvatar,
  TaskEtichettaChip,
  coloreTenue,
  formatScadenza,
  parseDataLocale,
  toIsoData,
} from './task-ui'

const TRIGGER_BASE =
  'inline-flex min-h-8 items-center gap-1.5 rounded-lg! border-0! bg-transparent px-1.5 py-1 text-left text-[13px]! font-medium transition hover:bg-slate-100 dark:hover:bg-white/10'

/** Apertura controllata (scorciatoie da tastiera) o interna. */
function useApertura(open?: boolean, onOpenChange?: (open: boolean) => void) {
  const [interna, setInterna] = useState(false)
  const aperto = open ?? interna
  const setAperto = (o: boolean) => {
    if (open === undefined) setInterna(o)
    onOpenChange?.(o)
  }
  return [aperto, setAperto] as const
}

const normalizza = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

/** Tasti freccia/invio su una lista filtrata. */
function useListaTastiera(count: number, onEnter: (index: number) => void) {
  const [attivo, setAttivo] = useState(0)
  useEffect(() => setAttivo(0), [count])
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAttivo((i) => Math.min(i + 1, Math.max(count - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAttivo((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (count > 0) onEnter(attivo)
    }
  }
  return { attivo, setAttivo, onKeyDown }
}

function CercaInput({
  value,
  onChange,
  placeholder,
  onKeyDown,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  onKeyDown?: (e: React.KeyboardEvent) => void
}) {
  return (
    <div className="flex items-center gap-2 border-b px-3 py-2">
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}

/**
 * Le tendine si aprono in un portale: dentro un pannello o una finestra modali il blocco dello scroll
 * le considera "fuori" e annulla la rotella. Fermando l'evento qui, la lista scorre.
 */
const fermaScroll = (e: SyntheticEvent) => e.stopPropagation()
const SCORRE_NEI_MODALI = { onWheel: fermaScroll, onTouchMove: fermaScroll }

// ———————————————————————————————— Operatori ————————————————————————————————

export function TaskOperatoriPicker({
  operatori,
  value,
  onChange,
  trigger,
  placeholder = 'Nessun assegnatario',
  className,
  open: openProp,
  onOpenChange,
}: {
  operatori: TaskOperatore[]
  value: number[]
  onChange: (ids: number[]) => void
  trigger?: ReactNode
  placeholder?: string
  className?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const { utente } = useAuth()
  const meId = utente?.id ?? null
  const [open, setOpen] = useApertura(openProp, onOpenChange)
  const [q, setQ] = useState('')

  const selezionati = useMemo(() => {
    const byId = new Map(operatori.map((o) => [o.id, o]))
    return value.map((id) => byId.get(id)).filter(Boolean) as TaskOperatore[]
  }, [operatori, value])

  const filtrati = useMemo(() => {
    const n = normalizza(q.trim())
    const list = n
      ? operatori.filter((o) => normalizza(`${nomeCompleto(o)} ${o.cognome} ${o.nome}`).includes(n))
      : operatori
    // selezionati in cima, poi io, poi per cognome
    return [...list].sort((a, b) => {
      const sa = value.includes(a.id) ? 0 : 1
      const sb = value.includes(b.id) ? 0 : 1
      if (sa !== sb) return sa - sb
      if (a.id === meId) return -1
      if (b.id === meId) return 1
      return nomeCompleto(a).localeCompare(nomeCompleto(b), 'it')
    })
  }, [operatori, q, value, meId])

  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
  const nav = useListaTastiera(filtrati.length, (i) => toggle(filtrati[i].id))

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setQ('')
      }}
    >
      <PopoverTrigger asChild>
        {trigger ?? (
          <button type="button" className={cn(TRIGGER_BASE, SK_FOCUS_RING, 'max-w-full', className)}>
            {selezionati.length === 0 ? (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <UserPlus className="size-4" />
                {placeholder}
              </span>
            ) : selezionati.length === 1 ? (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <TaskAvatar persona={selezionati[0]} size="xs" noTooltip />
                <span className="truncate">{nomeCompleto(selezionati[0])}</span>
              </span>
            ) : (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <span className="inline-flex -space-x-1.5">
                  {selezionati.slice(0, 4).map((p) => (
                    <TaskAvatar key={p.id} persona={p} size="xs" noTooltip />
                  ))}
                </span>
                <span className="truncate">
                  {selezionati.length} persone
                </span>
              </span>
            )}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className={cn('w-72 p-0', TASK_LAYER_Z)} onOpenAutoFocus={(e) => e.preventDefault()} {...SCORRE_NEI_MODALI}>
        <CercaInput value={q} onChange={setQ} placeholder="Cerca persona…" onKeyDown={nav.onKeyDown} />
        {meId != null && !value.includes(meId) && operatori.some((o) => o.id === meId) && !q && (
          <button
            type="button"
            onClick={() => onChange([...value, meId])}
            className="flex w-full items-center gap-2 rounded-none! border-0! border-b! border-border! bg-transparent px-3 py-2 text-left text-sm! font-semibold text-[var(--brand-blue)] hover:bg-slate-50 dark:text-[var(--brand-orange)] dark:hover:bg-white/5"
          >
            <User className="size-4" />
            Assegna a me
          </button>
        )}
        <div className="max-h-72 overflow-y-auto p-1">
          {filtrati.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nessuno trovato</p>}
          {filtrati.map((o, i) => {
            const sel = value.includes(o.id)
            return (
              <button
                key={o.id}
                type="button"
                onMouseEnter={() => nav.setAttivo(i)}
                onClick={() => toggle(o.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md! border-0! bg-transparent px-2 py-1.5 text-left text-sm!',
                  i === nav.attivo && 'bg-slate-100 dark:bg-white/10',
                )}
              >
                <TaskAvatar persona={o} size="sm" noTooltip />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {nomeCompleto(o)}
                    {o.id === meId && <span className="ml-1 text-xs text-muted-foreground">(tu)</span>}
                  </span>
                </span>
                <span
                  className={cn(
                    'flex size-4 shrink-0 items-center justify-center rounded border transition',
                    sel
                      ? 'border-[var(--brand-blue)] bg-[var(--brand-blue)] text-white dark:border-[var(--brand-orange)] dark:bg-[var(--brand-orange)] dark:text-[var(--brand-blue)]'
                      : 'border-slate-300 dark:border-white/25',
                  )}
                >
                  {sel && <Check className="size-3" strokeWidth={3} />}
                </span>
              </button>
            )
          })}
        </div>
        {value.length > 0 && (
          <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5" />
              {value.length} selezionat{value.length === 1 ? 'o' : 'i'}
            </span>
            <button
              type="button"
              onClick={() => onChange([])}
              className="rounded! border-0! bg-transparent p-0 text-xs! font-semibold hover:text-foreground"
            >
              Rimuovi tutti
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// ———————————————————————————————— Etichette ————————————————————————————————

export function TaskEtichettePicker({
  etichette,
  value,
  onChange,
  onCreate,
  className,
  trigger,
  open: openProp,
  onOpenChange,
}: {
  etichette: TaskEtichetta[]
  value: number[]
  onChange: (ids: number[]) => void
  onCreate?: (nome: string) => Promise<TaskEtichetta>
  className?: string
  trigger?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = useApertura(openProp, onOpenChange)
  const [q, setQ] = useState('')
  const [creando, setCreando] = useState(false)

  const selezionate = useMemo(
    () => value.map((id) => etichette.find((e) => e.id === id)).filter(Boolean) as TaskEtichetta[],
    [etichette, value],
  )
  const filtrate = useMemo(() => {
    const n = normalizza(q.trim())
    return n ? etichette.filter((e) => normalizza(e.nome).includes(n)) : etichette
  }, [etichette, q])
  const esisteEsatta = etichette.some((e) => normalizza(e.nome) === normalizza(q.trim()))
  const puoCreare = !!onCreate && q.trim().length > 0 && !esisteEsatta

  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])

  const crea = async () => {
    if (!onCreate || !q.trim()) return
    setCreando(true)
    try {
      const nuova = await onCreate(q.trim())
      onChange([...value, nuova.id])
      setQ('')
    } finally {
      setCreando(false)
    }
  }

  const nav = useListaTastiera(filtrate.length + (puoCreare ? 1 : 0), (i) => {
    if (i < filtrate.length) toggle(filtrate[i].id)
    else void crea()
  })

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setQ('')
      }}
    >
      <PopoverTrigger asChild>
        {trigger ?? (
          <button type="button" className={cn(TRIGGER_BASE, SK_FOCUS_RING, 'flex-wrap', className)}>
            {selezionate.length === 0 ? (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Tag className="size-4" />
                Aggiungi etichetta
              </span>
            ) : (
              selezionate.map((e) => <TaskEtichettaChip key={e.id} etichetta={e} />)
            )}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className={cn('w-64 p-0', TASK_LAYER_Z)} onOpenAutoFocus={(e) => e.preventDefault()} {...SCORRE_NEI_MODALI}>
        <CercaInput
          value={q}
          onChange={setQ}
          placeholder={onCreate ? 'Cerca o crea etichetta…' : 'Cerca etichetta…'}
          onKeyDown={nav.onKeyDown}
        />
        <div className="max-h-64 overflow-y-auto p-1">
          {filtrate.map((e, i) => {
            const sel = value.includes(e.id)
            return (
              <button
                key={e.id}
                type="button"
                onMouseEnter={() => nav.setAttivo(i)}
                onClick={() => toggle(e.id)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-md! border-0! bg-transparent px-2 py-1.5 text-left',
                  i === nav.attivo && 'bg-slate-100 dark:bg-white/10',
                )}
              >
                <TaskEtichettaChip etichetta={e} />
                {sel && <Check className="size-4 text-muted-foreground" />}
              </button>
            )
          })}
          {puoCreare && (
            <button
              type="button"
              onMouseEnter={() => nav.setAttivo(filtrate.length)}
              onClick={() => void crea()}
              disabled={creando}
              className={cn(
                'flex w-full items-center gap-2 rounded-md! border-0! bg-transparent px-2 py-1.5 text-left text-sm!',
                nav.attivo === filtrate.length && 'bg-slate-100 dark:bg-white/10',
              )}
            >
              {creando ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Crea «<span className="font-semibold">{q.trim()}</span>»
            </button>
          )}
          {filtrate.length === 0 && !puoCreare && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nessuna etichetta</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ———————————————————————————————— Scadenza ————————————————————————————————

const ORARI: string[] = (() => {
  const out: string[] = []
  for (let h = 7; h <= 21; h++) {
    for (const m of [0, 15, 30, 45]) {
      if (h === 21 && m > 0) break
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return out
})()

/** X accanto alla scadenza: la toglie in un clic, senza aprire il calendario. */
export function TaskTogliScadenza({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label="Togli la scadenza"
      title="Togli la scadenza"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className={cn(
        'inline-grid size-5 shrink-0 place-items-center rounded-full! border-0! bg-transparent p-0 text-muted-foreground transition hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-500/15 dark:hover:text-rose-300',
        SK_FOCUS_RING,
        className,
      )}
    >
      <X className="size-3.5" />
    </button>
  )
}

export function TaskScadenzaPicker({
  scadenza,
  scadenzaOra,
  onChange,
  className,
  placeholder = 'Nessuna scadenza',
  trigger,
  open: openProp,
  onOpenChange,
  senzaOra,
}: {
  scadenza: string | null
  scadenzaOra: string | null
  onChange: (v: { scadenza: string | null; scadenzaOra: string | null }) => void
  className?: string
  placeholder?: string
  trigger?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Solo il giorno (es. la data d'inizio): niente scelta dell'ora */
  senzaOra?: boolean
}) {
  const [open, setOpen] = useApertura(openProp, onOpenChange)
  const selected = parseDataLocale(scadenza) ?? undefined
  const oggi = new Date()
  const rapide: { label: string; hint: string; data: Date | null }[] = [
    { label: 'Oggi', hint: format(oggi, 'EEE', { locale: it }), data: oggi },
    { label: 'Domani', hint: format(addDays(oggi, 1), 'EEE', { locale: it }), data: addDays(oggi, 1) },
    { label: 'Lunedì prossimo', hint: format(nextMonday(oggi), 'd MMM', { locale: it }), data: nextMonday(oggi) },
    { label: 'Tra 1 settimana', hint: format(addWeeks(oggi, 1), 'd MMM', { locale: it }), data: addWeeks(oggi, 1) },
  ]
  const ora = scadenzaOra ? scadenzaOra.slice(0, 5) : ''

  const scegli = (d: Date | null) => {
    onChange({ scadenza: d ? toIsoData(d) : null, scadenzaOra: d ? scadenzaOra : null })
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {trigger ? (
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      ) : (
        // Con una scadenza, la X accanto la toglie (compare al passaggio; sempre sugli schermi touch)
        <span className="group/scad inline-flex min-w-0 items-center gap-0.5">
          <PopoverTrigger asChild>
            <button type="button" className={cn(TRIGGER_BASE, SK_FOCUS_RING, className)}>
              <CalendarDays className={cn('size-4', scadenza ? 'text-violet-500' : 'text-muted-foreground')} />
              {scadenza ? (
                <span>{formatScadenza(scadenza, scadenzaOra)}</span>
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
            </button>
          </PopoverTrigger>
          {scadenza ? (
            <TaskTogliScadenza onClick={() => onChange({ scadenza: null, scadenzaOra: null })}
              className="opacity-0 group-hover/scad:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100" />
          ) : null}
        </span>
      )}
      <PopoverContent align="start" className={cn('w-auto p-0', TASK_LAYER_Z)}>
        <div className="flex flex-col sm:flex-row">
          <div className="flex flex-col gap-0.5 border-b p-2 sm:w-44 sm:border-r sm:border-b-0">
            {rapide.map((r) => (
              <button
                key={r.label}
                type="button"
                onClick={() => scegli(r.data)}
                className="flex items-center justify-between rounded-md! border-0! bg-transparent px-2 py-1.5 text-left text-sm! hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <span className="font-medium">{r.label}</span>
                <span className="text-xs capitalize text-muted-foreground">{r.hint}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => scegli(null)}
              className="flex items-center gap-1.5 rounded-md! border-0! bg-transparent px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-slate-100 dark:hover:bg-white/10"
            >
              <X className="size-3.5" />
              Nessuna
            </button>
          </div>
          <div>
            <Calendar
              mode="single"
              weekStartsOn={1}
              locale={it}
              selected={selected}
              defaultMonth={selected}
              // Un clic sul giorno salva e chiude; con la data già scelta, l'ora qui sotto si salva al cambio
              onSelect={(d) => d && scegli(d)}
            />
            <div className={cn('flex items-center gap-2 border-t px-3 py-2', senzaOra && 'hidden')}>
              <Clock className="size-4 text-muted-foreground" />
              <select
                value={ora}
                disabled={!scadenza}
                onChange={(e) =>
                  onChange({ scadenza, scadenzaOra: e.target.value ? `${e.target.value}:00` : null })
                }
                className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
                aria-label="Ora di scadenza"
              >
                <option value="">Senza orario</option>
                {ORARI.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ———————————————————————————————— Paziente ————————————————————————————————

/** Pazienti per la ricerca: si caricano una volta e si filtrano nel browser (sono poche centinaia). */
let cachePazienti: Promise<TaskPaziente[]> | null = null
const pazientiAttivi = () => {
  cachePazienti ??= pazientiService.lista().then(
    (elenco) => elenco.map((p) => ({ id: p.id, nome: p.nome, cognome: p.cognome })).sort((a, b) => nomeCompleto(a).localeCompare(nomeCompleto(b), 'it')),
    (e) => {
      cachePazienti = null
      throw e
    },
  )
  return cachePazienti
}

export function TaskPazientePicker({
  value,
  onChange,
  className,
  trigger,
  open: openProp,
  onOpenChange,
  senzaRimuovi,
}: {
  value: TaskPaziente | null
  onChange: (p: TaskPaziente | null) => void
  className?: string
  trigger?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Nasconde la X di scollegamento accanto al trigger */
  senzaRimuovi?: boolean
}) {
  const [open, setOpen] = useApertura(openProp, onOpenChange)
  const [q, setQ] = useState('')
  const [risultati, setRisultati] = useState<TaskPaziente[]>([])
  const [loading, setLoading] = useState(false)
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const richiesta = useRef(0)

  useEffect(() => {
    if (timeout.current) clearTimeout(timeout.current)
    const query = q.trim()
    if (query.length < 2) {
      setRisultati([])
      setLoading(false)
      return
    }
    setLoading(true)
    const n = ++richiesta.current
    timeout.current = setTimeout(async () => {
      try {
        const n2 = normalizza(query)
        const tutti = await pazientiAttivi()
        if (n !== richiesta.current) return
        setRisultati(tutti.filter((p) => normalizza(`${p.nome} ${p.cognome} ${p.cognome} ${p.nome}`).includes(n2)).slice(0, 12))
      } catch {
        if (n === richiesta.current) setRisultati([])
      } finally {
        if (n === richiesta.current) setLoading(false)
      }
    }, 150)
    return () => {
      if (timeout.current) clearTimeout(timeout.current)
    }
  }, [q])

  const scegli = (p: TaskPaziente) => {
    onChange(p)
    setOpen(false)
    setQ('')
  }
  const nav = useListaTastiera(risultati.length, (i) => scegli(risultati[i]))

  return (
    <div className={cn('inline-flex max-w-full items-center gap-0.5', className)}>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) setQ('')
        }}
      >
        <PopoverTrigger asChild>
          {trigger ?? (
            <button type="button" className={cn(TRIGGER_BASE, SK_FOCUS_RING, 'min-w-0')}>
              <User className={cn('size-4 shrink-0', value ? 'text-sky-500' : 'text-muted-foreground')} />
              {value ? (
                <span className="truncate">{nomeCompleto(value)}</span>
              ) : (
                <span className="text-muted-foreground">Collega un paziente</span>
              )}
            </button>
          )}
        </PopoverTrigger>
        <PopoverContent align="start" className={cn('w-80 p-0', TASK_LAYER_Z)} onOpenAutoFocus={(e) => e.preventDefault()} {...SCORRE_NEI_MODALI}>
          <CercaInput value={q} onChange={setQ} placeholder="Nome o cognome…" onKeyDown={nav.onKeyDown} />
          <div className="max-h-72 overflow-y-auto p-1">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Ricerca…
              </div>
            )}
            {!loading && q.trim().length < 2 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Scrivi almeno 2 caratteri</p>
            )}
            {!loading && q.trim().length >= 2 && risultati.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nessun paziente trovato</p>
            )}
            {!loading &&
              risultati.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onMouseEnter={() => nav.setAttivo(i)}
                  onClick={() => scegli(p)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md! border-0! bg-transparent px-2 py-1.5 text-left text-sm!',
                    i === nav.attivo && 'bg-slate-100 dark:bg-white/10',
                  )}
                >
                  <span
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-sky-700 dark:text-sky-200"
                    style={{ backgroundColor: coloreTenue('#0EA5E9', 0.16) }}
                  >
                    {(p.nome[0] ?? '') + (p.cognome[0] ?? '')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{nomeCompleto(p)}</span>
                  </span>
                </button>
              ))}
          </div>
        </PopoverContent>
      </Popover>
      {value && !senzaRimuovi && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md! border-0! bg-transparent p-0 text-muted-foreground hover:bg-slate-100 hover:text-foreground dark:hover:bg-white/10"
          aria-label="Scollega paziente"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}

// ———————————————————————————————— Lista ————————————————————————————————

/**
 * Compatibilità: delega a {@link TaskListaPicker} (liste raggruppate per cartella, con ricerca).
 * Mostra le liste passate in `liste`.
 */
export function TaskListaSelect({
  liste,
  value,
  onChange,
  className,
  trigger,
  open,
  onOpenChange,
}: {
  liste: TaskLista[]
  value: number | null
  onChange: (id: number) => void
  className?: string
  trigger?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const { config } = useTaskConfig()
  const cfg = useMemo(() => (config ? { ...config, liste } : null), [config, liste])
  if (!cfg) return null
  return (
    <TaskListaPicker config={cfg} value={value} onChange={onChange} trigger={trigger}
      className={className} open={open} onOpenChange={onOpenChange} />
  )
}
