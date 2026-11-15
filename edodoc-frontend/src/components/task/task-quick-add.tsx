import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react'
import { AtSign, CalendarDays, Clock, Flag, Hash, Hourglass, Slash, Tag, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import {
  comandoInCorso,
  parseQuickAdd,
  rimuoviToken,
  testoComando,
  type QuickAddContesto,
  type QuickAddRisultato,
  type QuickAddToken,
  type QuickAddTokenTipo,
} from '@/lib/task-quick-add'
import { TASK_LAYER_Z, TaskAvatar, TaskListaDot, coloreTenue } from './task-ui'
import { nomeCompleto } from '@/lib/task-nomi'

/** Colore del token evidenziato nel testo e del chip corrispondente. */
const COLORE_TOKEN: Record<QuickAddTokenTipo, string> = {
  scadenza: '#8B5CF6',
  ora: '#8B5CF6',
  assegnatario: '#0EA5E9',
  priorita: '#F97316',
  etichetta: '#10B981',
  lista: '#6366F1',
  stima: '#4F46E5',
}

const COLORE_PRIORITA: Record<string, string> = {
  Urgente: '#E11D48',
  Alta: '#F97316',
  Normale: '#0EA5E9',
  Bassa: '#94A3B8',
}

type Opzione = { key: string; testo: string; label: string; sotto?: string; nodo: React.ReactNode }

const normalizza = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

/**
 * Input della creazione rapida: il testo resta modificabile, i comandi riconosciuti (data, ora, @persona, !priorità,
 * #etichetta, /lista) si colorano nel testo e compaiono come chip rimovibili sotto. @ # / aprono i suggerimenti.
 * Il testo vero è trasparente sopra uno strato che lo ridisegna con i colori: stessi font e padding, allineati al pixel.
 */
export function TaskQuickAddInput({
  value,
  onChange,
  contesto,
  onSubmit,
  placeholder = "Cosa c'è da fare?",
  autoFocus,
  size = 'lg',
  className,
  onKeyDown,
  inputRef,
  nascondiChip,
  suggerimento = 'Prova: domani 15 @Carlos !alta ~30m',
  protetto,
}: {
  value: string
  onChange: (v: string) => void
  contesto: QuickAddContesto
  onSubmit?: (r: QuickAddRisultato) => void
  placeholder?: string
  autoFocus?: boolean
  size?: 'lg' | 'sm'
  className?: string
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void
  inputRef?: Ref<HTMLTextAreaElement>
  /** Il chiamante mostra già i valori riconosciuti (es. nelle chip del dialog) */
  nascondiChip?: boolean
  /** Riga di aiuto finché non si usa un comando; null per nasconderla */
  suggerimento?: string | null
  /** Inizio del testo da non interpretare (titolo proposto con il nome del paziente) */
  protetto?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const [cursore, setCursore] = useState(0)
  const [focus, setFocus] = useState(false)
  const [indice, setIndice] = useState(0)
  const [chiusoA, setChiusoA] = useState<number | null>(null)

  const risultato = useMemo(() => parseQuickAdd(value, contesto, { protetto }), [value, contesto, protetto])

  // Ref esterna + interna
  useEffect(() => {
    if (!inputRef) return
    if (typeof inputRef === 'function') inputRef(ref.current)
    else (inputRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = ref.current
  }, [inputRef])

  useEffect(() => {
    if (autoFocus) requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    })
  }, [autoFocus])

  // Altezza automatica (anche dove field-sizing non è supportato)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }, [value, size])

  const comando = focus ? comandoInCorso(value, cursore) : null
  const comandoAttivo = comando && chiusoA !== comando.start ? comando : null

  const opzioni = useMemo<Opzione[]>(() => {
    if (!comandoAttivo) return []
    const q = normalizza(comandoAttivo.query)
    const filtra = <T,>(items: T[], chiavi: (x: T) => string[]) =>
      items.filter((x) => !q || chiavi(x).some((k) => normalizza(k).startsWith(q) || normalizza(k).includes(q)))
    if (comandoAttivo.simbolo === '@') {
      const lista = filtra([...contesto.operatori].sort((a, b) => nomeCompleto(a).localeCompare(nomeCompleto(b), 'it')), (o) => [o.nome, o.cognome, `${o.nome}${o.cognome}`, `${o.cognome}${o.nome}`])
      const me = contesto.operatori.find((o) => o.id === contesto.meId)
      const ordinati = me && lista.includes(me) ? [me, ...lista.filter((o) => o !== me)] : lista
      return ordinati.slice(0, 7).map((o) => {
        // Il nome basta se è univoco, altrimenti nome+cognome
        const omonimi = contesto.operatori.filter((x) => normalizza(x.nome) === normalizza(o.nome)).length > 1
        return {
          key: `o${o.id}`,
          testo: testoComando('@', omonimi ? `${o.nome} ${o.cognome}` : o.nome),
          label: nomeCompleto(o),
          sotto: o.id === contesto.meId ? 'Io' : undefined,
          nodo: <TaskAvatar persona={o} size="sm" noTooltip />,
        }
      })
    }
    if (comandoAttivo.simbolo === '#') {
      return filtra(contesto.etichette, (e) => [e.nome]).slice(0, 7).map((e) => ({
        key: `e${e.id}`,
        testo: testoComando('#', e.nome),
        label: e.nome,
        nodo: <span className="size-2.5 rounded-full" style={{ background: e.colore }} />,
      }))
    }
    return filtra(contesto.liste.filter((l) => !l.archiviata), (l) => [l.nome, l.codice ?? '']).slice(0, 7).map((l) => ({
      key: `l${l.id}`,
      testo: testoComando('/', l.nome),
      label: l.nome,
      nodo: <span className="size-2.5 rounded-full" style={{ background: l.colore }} />,
    }))
  }, [comandoAttivo, contesto])

  const apertoAuto = opzioni.length > 0
  useEffect(() => setIndice(0), [comandoAttivo?.start, comandoAttivo?.query])

  const scegli = (o: Opzione) => {
    if (!comandoAttivo) return
    const prima = value.slice(0, comandoAttivo.start)
    const dopo = value.slice(cursore).replace(/^\S*/, '')
    const inserito = `${o.testo} `
    const nuovo = `${prima}${inserito}${dopo.replace(/^\s+/, '')}`
    onChange(nuovo)
    const pos = prima.length + inserito.length
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(pos, pos)
      setCursore(pos)
    })
  }

  const rimuovi = (t: QuickAddToken) => {
    onChange(rimuoviToken(value, t))
    requestAnimationFrame(() => ref.current?.focus())
  }

  const gestisciTasti = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (apertoAuto) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setIndice((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + opzioni.length) % opzioni.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        scegli(opzioni[indice] ?? opzioni[0])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setChiusoA(comandoAttivo?.start ?? null)
        return
      }
    }
    onKeyDown?.(e)
    if (e.defaultPrevented) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      e.stopPropagation()
      onSubmit?.(risultato)
    }
  }

  const aggiornaCursore = () => setCursore(ref.current?.selectionStart ?? value.length)

  // Testo ridisegnato con i token colorati
  const segmenti = useMemo(() => {
    const out: { testo: string; token?: QuickAddToken }[] = []
    let i = 0
    for (const t of risultato.tokens) {
      if (t.start > i) out.push({ testo: value.slice(i, t.start) })
      out.push({ testo: value.slice(t.start, t.end), token: t })
      i = t.end
    }
    if (i < value.length) out.push({ testo: value.slice(i) })
    return out
  }, [risultato.tokens, value])

  // Dimensioni forzate (!): mobile.css porta ogni textarea a 16px e il testo colorato sotto non sarebbe più allineato.
  // La versione piccola resta 16px su telefono per non far zoomare iOS.
  const testoClasse =
    size === 'lg'
      ? 'text-[21px]! font-semibold leading-[1.35]! tracking-[-0.01em]'
      : 'text-[14px]! font-medium leading-[1.45]! max-sm:text-[16px]!'
  const box = 'm-0 w-full whitespace-pre-wrap break-words border-0! p-0! font-[inherit]'
  const mostraSuggerimento = suggerimento && !risultato.tokens.length && !/[@#/!~]/.test(value)

  return (
    <div className={cn('relative', className)} data-task-quick-add>
      <Popover open={apertoAuto}>
      <PopoverAnchor asChild>
      <div className="relative">
        <div
          ref={overlayRef}
          aria-hidden
          className={cn(box, testoClasse, 'pointer-events-none absolute inset-0 overflow-hidden text-foreground')}
        >
          {segmenti.map((s, i) =>
            s.token ? (
              <span
                key={i}
                className="rounded-[5px] [box-decoration-break:clone]"
                style={{
                  background: coloreTenue(coloreToken(s.token), 0.18),
                  color: coloreToken(s.token),
                  boxShadow: `0 0 0 2px ${coloreTenue(coloreToken(s.token), 0.18)}`,
                }}
              >
                {s.testo}
              </span>
            ) : (
              <span key={i}>{s.testo}</span>
            ),
          )}
          {/* Spazio finale: mantiene l'altezza come la textarea */}
          {'​'}
        </div>
        <textarea
          ref={ref}
          value={value}
          rows={1}
          maxLength={400}
          spellCheck={false}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-autocomplete="list"
          aria-expanded={apertoAuto}
          onChange={(e) => {
            onChange(e.target.value.replace(/\n/g, ' '))
            setCursore(e.target.selectionStart ?? e.target.value.length)
            setChiusoA(null)
          }}
          onKeyDown={gestisciTasti}
          onKeyUp={aggiornaCursore}
          onClick={aggiornaCursore}
          onSelect={aggiornaCursore}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 120)}
          onScroll={(e) => {
            if (overlayRef.current) overlayRef.current.scrollTop = e.currentTarget.scrollTop
          }}
          className={cn(
            box,
            testoClasse,
            'relative block min-h-0! resize-none overflow-hidden rounded-none! bg-transparent text-transparent caret-foreground shadow-none! outline-none',
            'selection:bg-[var(--brand-blue)]/25 placeholder:text-muted-foreground/55 dark:selection:bg-[var(--brand-orange)]/30',
          )}
        />

      </div>
      </PopoverAnchor>
        {apertoAuto && (
          <PopoverContent
            role="listbox"
            align="start"
            sideOffset={8}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onEscapeKeyDown={() => setChiusoA(comandoAttivo?.start ?? null)}
            onInteractOutside={(e) => {
              if (ref.current?.contains(e.target as Node)) e.preventDefault()
              else setChiusoA(comandoAttivo?.start ?? null)
            }}
            className={cn('w-72 overflow-hidden rounded-xl p-1 shadow-xl', TASK_LAYER_Z)}
          >
            <p className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {comandoAttivo?.simbolo === '@' ? 'Assegna a' : comandoAttivo?.simbolo === '#' ? 'Etichetta' : 'Lista'}
            </p>
            {opzioni.map((o, i) => (
              <button
                key={o.key}
                type="button"
                role="option"
                aria-selected={i === indice}
                onMouseDown={(e) => {
                  e.preventDefault()
                  scegli(o)
                }}
                onMouseEnter={() => setIndice(i)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg! border-0! px-2 py-1.5 text-left text-[13px]! transition',
                  i === indice ? 'bg-accent text-accent-foreground' : 'bg-transparent',
                )}
              >
                <span className="flex size-6 shrink-0 items-center justify-center">{o.nodo}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{o.label}</span>
                {o.sotto && <span className="text-[11px] text-muted-foreground">{o.sotto}</span>}
              </button>
            ))}
            <p className="flex items-center gap-2 border-t px-2 pb-1 pt-1.5 text-[11px] text-muted-foreground">
              <kbd className="rounded border px-1 font-sans">↑↓</kbd> scegli
              <kbd className="rounded border px-1 font-sans">Invio</kbd> conferma
              <kbd className="rounded border px-1 font-sans">Esc</kbd> chiudi
            </p>
          </PopoverContent>
        )}
      </Popover>

      {!nascondiChip && risultato.tokens.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-live="polite">
          {risultato.tokens.map((t) => (
            <TokenChip key={`${t.tipo}-${t.start}`} token={t} contesto={contesto} risultato={risultato} onRemove={() => rimuovi(t)} />
          ))}
        </div>
      )}

      {mostraSuggerimento && (
        <p className={cn('mt-1.5 text-[12px] text-muted-foreground/80 transition-opacity', size === 'sm' && 'hidden sm:block')}>
          {suggerimento}
        </p>
      )}
    </div>
  )
}

function coloreToken(t: QuickAddToken): string {
  if (t.tipo === 'priorita') return COLORE_PRIORITA[t.label] ?? COLORE_TOKEN.priorita
  return COLORE_TOKEN[t.tipo]
}

const ICONA: Record<QuickAddTokenTipo, typeof CalendarDays> = {
  scadenza: CalendarDays,
  ora: Clock,
  assegnatario: AtSign,
  priorita: Flag,
  etichetta: Tag,
  lista: Slash,
  stima: Hourglass,
}

/** Chip di un comando riconosciuto, con la X per toglierlo dal testo. */
export function TokenChip({
  token,
  contesto,
  onRemove,
}: {
  token: QuickAddToken
  contesto: QuickAddContesto
  risultato?: QuickAddRisultato
  onRemove?: () => void
}) {
  const colore = coloreToken(token)
  const Icona = ICONA[token.tipo]
  let lead: React.ReactNode = <Icona className="size-3.5" style={{ color: colore }} />
  if (token.tipo === 'assegnatario') {
    const o = contesto.operatori.find((x) => `${x.nome} ${x.cognome}`.trim() === token.label)
    if (o) lead = <TaskAvatar persona={o} size="xs" noTooltip />
  }
  if (token.tipo === 'lista') {
    const l = contesto.liste.find((x) => x.nome === token.label)
    if (l) lead = <TaskListaDot lista={l} hideName />
  }
  if (token.tipo === 'etichetta') {
    const e = contesto.etichette.find((x) => x.nome === token.label)
    lead = e ? <span className="size-2 rounded-full" style={{ background: e.colore }} /> : <Hash className="size-3.5" />
  }
  return (
    <span
      className="inline-flex h-7 items-center gap-1.5 rounded-full pl-2 pr-1 text-[12px] font-semibold animate-in fade-in zoom-in-95 duration-150"
      style={{ background: coloreTenue(colore, 0.12), color: colore }}
    >
      {lead}
      <span className="max-w-[12rem] truncate">{token.label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Togli ${token.label}`}
          className="flex size-5 items-center justify-center rounded-full! border-0! bg-transparent p-0 opacity-60 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  )
}
