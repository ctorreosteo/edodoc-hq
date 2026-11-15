import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MutableRefObject, type ReactNode } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Bold, Eye, Italic, Link2, List, ListChecks, ListOrdered, PencilLine } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fileDaAppunti } from '@/lib/file-da-appunti'

export function TaskMarkdown({
  testo,
  className,
}: {
  testo: string | null | undefined
  className?: string
}) {
  const components = useMemo<Components>(
    () => ({
      p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
      strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
      h1: ({ children }) => <h3 className="mt-3 mb-1.5 text-base font-semibold first:mt-0">{children}</h3>,
      h2: ({ children }) => <h4 className="mt-3 mb-1.5 text-[15px] font-semibold first:mt-0">{children}</h4>,
      h3: ({ children }) => <h5 className="mt-3 mb-1 text-sm font-semibold first:mt-0">{children}</h5>,
      ul: ({ children, className: cls }) => (
        <ul className={cn('my-1.5 space-y-0.5 pl-5', cls?.includes('contains-task-list') ? 'list-none pl-1' : 'list-disc')}>
          {children}
        </ul>
      ),
      ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-0.5 pl-5">{children}</ol>,
      li: ({ children, className: cls }) => (
        <li className={cn('pl-0.5', cls?.includes('task-list-item') && 'flex items-start gap-2')}>{children}</li>
      ),
      input: ({ checked, type }) =>
        type === 'checkbox' ? (
          <input
            type="checkbox"
            checked={!!checked}
            readOnly
            disabled
            className="mt-1 size-3.5 shrink-0 accent-[var(--brand-blue)] dark:accent-[var(--brand-orange)]"
          />
        ) : null,
      blockquote: ({ children }) => (
        <blockquote className="my-2 border-l-[3px] border-slate-300 pl-3 text-muted-foreground dark:border-white/20">
          {children}
        </blockquote>
      ),
      code: ({ children }) => (
        <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] dark:bg-white/10">{children}</code>
      ),
      pre: ({ children }) => (
        <pre className="my-2 overflow-x-auto rounded-lg bg-slate-100 p-3 text-[13px] dark:bg-white/[0.06]">{children}</pre>
      ),
      hr: () => <hr className="my-3 border-border" />,
      table: ({ children }) => (
        <div className="my-2 overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">{children}</table>
        </div>
      ),
      th: ({ children }) => <th className="border px-2 py-1 text-left font-semibold">{children}</th>,
      td: ({ children }) => <td className="border px-2 py-1">{children}</td>,
      a: ({ href, children }) => {
        // Tutti i link (anche quelli del gestionale) in una nuova scheda: il task resta aperto qui
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="break-words font-medium text-[var(--brand-blue)] underline decoration-[var(--brand-blue)]/30 underline-offset-2 hover:decoration-[var(--brand-blue)] dark:text-[var(--brand-orange)] dark:decoration-[var(--brand-orange)]/40"
          >
            {children}
          </a>
        )
      },
    }),
    [],
  )

  if (!testo?.trim()) return null
  return (
    <div className={cn('break-words text-[14px] leading-relaxed text-foreground/90', className)}>
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {testo}
      </Markdown>
    </div>
  )
}

// ———————————————————————————————— Editor ————————————————————————————————

type Azione = 'bold' | 'italic' | 'ul' | 'ol' | 'check' | 'link'

const STRUMENTI: { azione: Azione; icon: typeof Bold; label: string; scorciatoia?: string }[] = [
  { azione: 'bold', icon: Bold, label: 'Grassetto', scorciatoia: '⌘B' },
  { azione: 'italic', icon: Italic, label: 'Corsivo', scorciatoia: '⌘I' },
  { azione: 'ul', icon: List, label: 'Elenco puntato' },
  { azione: 'ol', icon: ListOrdered, label: 'Elenco numerato' },
  { azione: 'check', icon: ListChecks, label: 'Checklist' },
  { azione: 'link', icon: Link2, label: 'Link', scorciatoia: '⌘K' },
]

export function TaskMarkdownEditor({
  value,
  onChange,
  placeholder = 'Scrivi…',
  minRows = 4,
  autoFocus,
  onSubmit,
  onPasteFiles,
  className,
  footer,
  textareaRef,
  onFocus,
  onBlur,
  toolbarMinima,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minRows?: number
  autoFocus?: boolean
  onSubmit?: () => void
  onPasteFiles?: (files: File[]) => void
  className?: string
  /** Contenuto a destra della toolbar (es. pulsanti Invia/Allega). */
  footer?: ReactNode
  /** Per mettere a fuoco l'editor dall'esterno (es. scorciatoia "M"). */
  textareaRef?: MutableRefObject<HTMLTextAreaElement | null>
  onFocus?: () => void
  onBlur?: () => void
  /** Solo anteprima a sinistra (composer dei commenti): meno rumore, specie su telefono. */
  toolbarMinima?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (textareaRef) textareaRef.current = ref.current
  })
  const [anteprima, setAnteprima] = useState(false)
  const testo = value
  const cambia = onChange

  // Il riquadro cresce col testo: niente righe tagliate né barra di scorrimento interna
  useLayoutEffect(() => {
    const ta = ref.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight + (ta.offsetHeight - ta.clientHeight)}px`
  }, [value, anteprima])

  const applica = (nuovo: string, selStart: number, selEnd = selStart) => {
    cambia(nuovo)
    requestAnimationFrame(() => {
      const ta = ref.current
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(selStart, selEnd)
    })
  }

  const avvolgi = (prima: string, dopo: string, segnaposto: string) => {
    const ta = ref.current
    if (!ta) return
    const { selectionStart: s, selectionEnd: e } = ta
    const sel = testo.slice(s, e) || segnaposto
    const nuovo = testo.slice(0, s) + prima + sel + dopo + testo.slice(e)
    applica(nuovo, s + prima.length, s + prima.length + sel.length)
  }

  const prefissoRighe = (prefisso: (i: number) => string) => {
    const ta = ref.current
    if (!ta) return
    const { selectionStart: s, selectionEnd: e } = ta
    const inizio = testo.lastIndexOf('\n', s - 1) + 1
    const fineIdx = testo.indexOf('\n', e)
    const fine = fineIdx === -1 ? testo.length : fineIdx
    const righe = testo.slice(inizio, fine).split('\n')
    const blocco = righe.map((r, i) => prefisso(i) + r).join('\n')
    const nuovo = testo.slice(0, inizio) + blocco + testo.slice(fine)
    applica(nuovo, inizio + blocco.length)
  }

  const esegui = (azione: Azione) => {
    setAnteprima(false)
    switch (azione) {
      case 'bold':
        return avvolgi('**', '**', 'testo')
      case 'italic':
        return avvolgi('_', '_', 'testo')
      case 'ul':
        return prefissoRighe(() => '- ')
      case 'ol':
        return prefissoRighe((i) => `${i + 1}. `)
      case 'check':
        return prefissoRighe(() => '- [ ] ')
      case 'link': {
        const ta = ref.current
        if (!ta) return
        const { selectionStart: s, selectionEnd: e } = ta
        const sel = testo.slice(s, e) || 'testo'
        const nuovo = `${testo.slice(0, s)}[${sel}](https://)${testo.slice(e)}`
        const urlStart = s + sel.length + 3
        return applica(nuovo, urlStart, urlStart + 8)
      }
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key === 'Enter') {
      e.preventDefault()
      onSubmit?.()
      return
    }
    if (mod && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault()
      esegui('bold')
    } else if (mod && (e.key === 'i' || e.key === 'I')) {
      e.preventDefault()
      esegui('italic')
    } else if (mod && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault()
      esegui('link')
    } else if (e.key === 'Enter' && !e.shiftKey) {
      // Continua elenchi e checklist
      const ta = e.currentTarget
      const s = ta.selectionStart
      const inizio = testo.lastIndexOf('\n', s - 1) + 1
      const riga = testo.slice(inizio, s)
      const m = /^(\s*)(- \[[ xX]\] |- |\* |(\d+)\. )(.*)$/.exec(riga)
      if (m) {
        e.preventDefault()
        if (!m[4].trim()) {
          // riga vuota: chiudi l'elenco
          const nuovo = testo.slice(0, inizio) + testo.slice(s)
          applica(nuovo, inizio)
          return
        }
        const prossimo = m[3] ? `${Number(m[3]) + 1}. ` : m[2].startsWith('- [') ? '- [ ] ' : m[2]
        const ins = `\n${m[1]}${prossimo}`
        applica(testo.slice(0, s) + ins + testo.slice(ta.selectionEnd), s + ins.length)
      }
    }
  }

  return (
    <div
      className={cn(
        'relative rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(0,37,82,0.05)] transition-[border-color,box-shadow] focus-within:border-[var(--brand-blue)]/50 focus-within:ring-4 focus-within:ring-[var(--brand-blue)]/10 dark:border-white/15 dark:bg-white/[0.04] dark:focus-within:border-[var(--brand-orange)]/60 dark:focus-within:ring-[var(--brand-orange)]/15',
        className,
      )}
    >
      {anteprima ? (
        <div className="min-h-[6rem] px-3 py-2.5" style={{ minHeight: `${minRows * 1.5 + 1}rem` }}>
          {value.trim() ? (
            <TaskMarkdown testo={value} />
          ) : (
            <p className="text-sm text-muted-foreground">Niente da mostrare</p>
          )}
        </div>
      ) : (
        <div className="relative">
        <textarea
          ref={ref}
          value={testo}
          autoFocus={autoFocus}
          rows={minRows}
          placeholder={placeholder}
          onChange={(e) => cambia(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onBlur={() => onBlur?.()}
          onPaste={(e) => {
            if (!onPasteFiles) return
            const files = fileDaAppunti(e.clipboardData)
            if (files.length > 0) {
              e.preventDefault()
              onPasteFiles(files)
            }
          }}
          className={cn(
            'relative block w-full resize-none overflow-hidden bg-transparent px-3 py-2.5 text-[14px] leading-6 text-foreground outline-none placeholder:text-muted-foreground selection:bg-[var(--brand-blue)]/25 dark:caret-white dark:selection:bg-[var(--brand-orange)]/25',
            // Il composer dei commenti sta in fondo al pannello: oltre metà schermo scorre dentro
            toolbarMinima && 'max-h-[50vh] overflow-y-auto',
          )}
        />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-0.5 border-t border-slate-100 px-1.5 py-1 dark:border-white/10">
        {STRUMENTI.filter(() => !toolbarMinima).map(({ azione, icon: Icon, label, scorciatoia }) => (
          <button
            key={azione}
            type="button"
            title={scorciatoia ? `${label} (${scorciatoia})` : label}
            aria-label={label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => esegui(azione)}
            className="inline-flex size-7 items-center justify-center rounded-md! border-0! bg-transparent p-0 text-slate-500 transition hover:bg-slate-100 hover:text-foreground dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <Icon className="size-4" />
          </button>
        ))}
        {!toolbarMinima ? <span className="mx-1 h-4 w-px bg-slate-200 dark:bg-white/10" /> : null}
        <button
          type="button"
          onClick={() => setAnteprima((a) => !a)}
          className={cn(
            'inline-flex h-7 items-center gap-1 rounded-md! border-0! bg-transparent px-2 text-[12px]! font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-foreground dark:text-white/60 dark:hover:bg-white/10',
            anteprima && 'bg-slate-100 text-foreground dark:bg-white/10 dark:text-white',
          )}
        >
          {anteprima ? <PencilLine className="size-3.5" /> : <Eye className="size-3.5" />}
          {anteprima ? 'Scrivi' : 'Anteprima'}
        </button>
        {footer && <div className="ml-auto flex items-center gap-1.5">{footer}</div>}
      </div>
    </div>
  )
}
