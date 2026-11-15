import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  AlertCircle,
  ArrowRightLeft,
  CalendarClock,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  CircleDot,
  CornerLeftUp,
  Download,
  ExternalLink,
  Eye,
  File as FileIcon,
  FileText,
  Flag,
  Image as ImageIcon,
  Keyboard,
  Link2,
  Hash,
  Check,
  ClipboardCopy,
  ListChecks,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  User,
  X,
  UserPlus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { TaskStimaPicker } from '@/components/task/task-stima'
import { TaskSottotaskElenco } from '@/components/task/task-sottotask'
import { toast } from '@/lib/toast'
import { codiceTask, copiaNegliAppunti, linkTask, riferimentoTask } from '@/lib/task-riferimento'
import { celebra } from '@/lib/task-festa'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SK_BTN_DANGER_SM, SK_FOCUS_RING } from '@/components/ui/sheet-kit'
import { useAzioni } from '@/contexts/azioni-context'
import { useTaskConfig, invalidateTaskConfig } from '@/hooks/use-task-config'
import { emitTaskChanged } from '@/hooks/use-task-cambi'
import {
  MAX_ALLEGATO_TASK_BYTES,
  isStatoChiuso,
  taskService,
  type AggiornaTaskValori,
  type TaskAllegato,
  type TaskDettaglio,
  type TaskEvento,
  type TaskEventoTipo,
  type TaskRiga,
} from '@/services/task-service'
import { TaskCheck } from './task-check'
import { TaskPosticipaMenu } from './task-posticipa'
import {
  TASK_CHIP,
  TASK_CHIP_VUOTA,
  TASK_LAYER_Z,
  TaskAvatarStack,
  TaskEtichettaChip,
  TaskListaDot,
  TaskPrioritaSelect,
  TaskStatoSelect,
  coloreTenue,
  formatScadenza,
  isScaduto,
  isInScadenzaOggi,
  nomeCompleto,
} from './task-ui'
import { TaskEtichettePicker, TaskOperatoriPicker, TaskPazientePicker, TaskTogliScadenza } from './task-pickers'
import { TaskPeriodoPicker } from './task-periodo'
import { haOrario, riassuntoPeriodo } from '@/lib/task-periodo'
import { TaskDipendenzeSezione } from './task-dipendenze'
import { TaskListaPicker } from './task-lista-picker'
import { TaskMarkdown, TaskMarkdownEditor } from './task-markdown'
import { TaskDescrizioneEditor } from './task-descrizione-editor'
import { fileDaAppunti } from '@/lib/file-da-appunti'
import { valoriCompletamento } from '@/lib/task-conferma-sottotask'

/** Ritardo prima che un'eliminazione con "Annulla" arrivi davvero al server. */
const ATTESA_ELIMINAZIONE_MS = 5000

const SCORCIATOIE: { tasto: string; cosa: string }[] = [
  { tasto: 'C', cosa: 'Completa / riapri' },
  { tasto: 'S', cosa: 'Stato' },
  { tasto: 'A', cosa: 'Assegnatari' },
  { tasto: 'D', cosa: 'Scadenza e posticipa' },
  { tasto: 'P', cosa: 'Priorità' },
  { tasto: 'E', cosa: 'Modifica titolo' },
  { tasto: 'M', cosa: 'Scrivi un commento' },
  { tasto: 'Esc', cosa: 'Chiudi' },
]

const parseDataOra = (s: string | null | undefined): Date | null => {
  if (!s) return null
  const d = parseISO(s)
  return isValid(d) ? d : null
}

const relativo = (s: string | null | undefined) => {
  const d = parseDataOra(s)
  return d ? formatDistanceToNow(d, { addSuffix: true, locale: it }) : ''
}

const assoluto = (s: string | null | undefined) => {
  const d = parseDataOra(s)
  return d ? format(d, "d MMM yyyy 'alle' HH:mm", { locale: it }) : ''
}

const conMaiuscola = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`

const isImmagine = (a: Pick<TaskAllegato, 'contentType' | 'estensione'>) =>
  (a.contentType ?? '').startsWith('image/') || /^(png|jpe?g|gif|webp|heic|bmp|svg)$/i.test(a.estensione ?? '')

const estensioneDi = (nome: string) => (nome.includes('.') ? nome.split('.').pop()!.toLowerCase() : null)

const isPdf = (a: Pick<TaskAllegato, 'contentType' | 'estensione'>) =>
  a.contentType === 'application/pdf' || (a.estensione ?? '').toLowerCase() === 'pdf'

/** Sto scrivendo? Allora le scorciatoie a una lettera non devono scattare. */
const staScrivendo = (el: EventTarget | null) => {
  if (!(el instanceof HTMLElement)) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

const ICONE_EVENTO: Partial<Record<TaskEventoTipo, typeof CircleDot>> = {
  CREATO: Sparkles,
  STATO: CircleDot,
  PRIORITA: Flag,
  SCADENZA: CalendarClock,
  TITOLO: Pencil,
  DESCRIZIONE: FileText,
  LISTA: ArrowRightLeft,
  ASSEGNATARI: UserPlus,
  ETICHETTE: Tag,
  PAZIENTE: User,
  ALLEGATO: Paperclip,
  ALLEGATO_RIMOSSO: Paperclip,
  CHECKLIST: ListChecks,
  INIZIO: CalendarRange,
  DIPENDENZA: Link2,
}

// ———————————————————————————————— Allegati ————————————————————————————————

/** Blob degli allegati del task aperto, condivisi fra miniature, anteprima e download. */
function useBlobAllegati(taskId: number | null) {
  const urls = useRef(new Map<number, string>())
  const inCorso = useRef(new Map<number, Promise<string>>())

  useEffect(() => {
    const mappa = urls.current
    const attese = inCorso.current
    return () => {
      mappa.forEach((u) => URL.revokeObjectURL(u))
      mappa.clear()
      attese.clear()
    }
  }, [taskId])

  const getUrl = useCallback(
    (allegatoId: number): Promise<string> => {
      if (taskId == null) return Promise.reject(new Error('Nessun task'))
      const pronto = urls.current.get(allegatoId)
      if (pronto) return Promise.resolve(pronto)
      const attesa = inCorso.current.get(allegatoId)
      if (attesa) return attesa
      const p = taskService.scaricaAllegato(taskId, allegatoId).then((blob) => {
        const u = URL.createObjectURL(blob)
        urls.current.set(allegatoId, u)
        inCorso.current.delete(allegatoId)
        return u
      })
      p.catch(() => inCorso.current.delete(allegatoId))
      inCorso.current.set(allegatoId, p)
      return p
    },
    [taskId],
  )

  /** Il file appena caricato è già qui: la foto compare subito, senza riscaricarla. */
  const semina = useCallback((allegatoId: number, blob: Blob) => {
    if (urls.current.has(allegatoId)) return
    urls.current.set(allegatoId, URL.createObjectURL(blob))
  }, [])

  return { getUrl, semina }
}

function Miniatura({ allegato, getUrl }: { allegato: TaskAllegato; getUrl: (id: number) => Promise<string> }) {
  const [url, setUrl] = useState<string | null>(null)
  const [rotta, setRotta] = useState(false)
  const immagine = isImmagine(allegato) && !rotta
  useEffect(() => {
    if (!immagine) return
    let vivo = true
    getUrl(allegato.id)
      .then((u) => vivo && setUrl(u))
      .catch(() => undefined)
    return () => {
      vivo = false
    }
  }, [allegato.id, getUrl, immagine])

  if (immagine && url)
    return <img src={url} alt={allegato.nomeFile} className="size-full object-cover" onError={() => setRotta(true)} />
  const Icon = immagine ? ImageIcon : isPdf(allegato) ? FileText : FileIcon
  return (
    <div className="flex size-full flex-col items-center justify-center gap-1 bg-slate-50 dark:bg-white/[0.04]">
      {immagine ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : <Icon className="size-7 text-slate-400" />}
      {!immagine && (
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{allegato.estensione ?? 'file'}</span>
      )}
    </div>
  )
}

const BTN_ICONA =
  'inline-flex size-7 items-center justify-center rounded-lg! border-0! bg-transparent p-0 text-slate-500 transition hover:bg-slate-100 hover:text-foreground dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white'

function AllegatoCard({
  allegato,
  getUrl,
  onApri,
  onScarica,
  onElimina,
  compatto,
}: {
  allegato: TaskAllegato
  getUrl: (id: number) => Promise<string>
  onApri: () => void
  onScarica: () => void
  onElimina?: () => void
  compatto?: boolean
}) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border border-slate-200 bg-card transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-14px_rgba(0,37,82,0.45)] dark:border-white/10',
        compatto ? 'w-36' : '',
      )}
    >
      <button
        type="button"
        onClick={onApri}
        className={cn('block w-full overflow-hidden rounded-none! border-0! bg-transparent p-0', compatto ? 'h-20' : 'h-28')}
        aria-label={`Apri ${allegato.nomeFile}`}
      >
        <Miniatura allegato={allegato} getUrl={getUrl} />
      </button>
      <div className="px-2.5 py-2">
        <p className="truncate text-[12px] font-semibold" title={allegato.nomeFile}>
          {allegato.nomeFile}
        </p>
        <p className="truncate text-[12px] text-muted-foreground">
          {formatBytes(allegato.dimensione)}
        </p>
      </div>
      {/* Su touch le azioni restano sempre visibili */}
      <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
        <button
          type="button"
          onClick={onScarica}
          className="inline-flex size-7 items-center justify-center rounded-lg! border-0! bg-white/90 p-0 text-slate-700 shadow backdrop-blur hover:bg-white dark:bg-black/60 dark:text-white"
          aria-label="Scarica"
          title="Scarica"
        >
          <Download className="size-3.5" />
        </button>
        {onElimina && (
          <button
            type="button"
            onClick={onElimina}
            className="inline-flex size-7 items-center justify-center rounded-lg! border-0! bg-white/90 p-0 text-rose-600 shadow backdrop-blur hover:bg-rose-600 hover:text-white dark:bg-black/60"
            aria-label="Elimina"
            title="Elimina"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

/** Foto di un commento: una sola a misura naturale, più foto in griglia quadrata. Clic = anteprima grande. */
function FotoCommento({
  allegati,
  getUrl,
  onApri,
  onScarica,
  onElimina,
}: {
  allegati: TaskAllegato[]
  getUrl: (id: number) => Promise<string>
  onApri: (a: TaskAllegato) => void
  onScarica: (a: TaskAllegato) => void
  onElimina: (a: TaskAllegato) => (() => void) | undefined
}) {
  const sola = allegati.length === 1
  return (
    <div
      className={cn('grid max-w-[26rem] gap-1.5', sola ? 'grid-cols-1' : allegati.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}
    >
      {allegati.map((a) => (
        <FotoCommentoVoce
          key={a.id}
          allegato={a}
          getUrl={getUrl}
          sola={sola}
          onApri={() => onApri(a)}
          onScarica={() => onScarica(a)}
          onElimina={onElimina(a)}
        />
      ))}
    </div>
  )
}

function FotoCommentoVoce({
  allegato,
  getUrl,
  sola,
  onApri,
  onScarica,
  onElimina,
}: {
  allegato: TaskAllegato
  getUrl: (id: number) => Promise<string>
  sola: boolean
  onApri: () => void
  onScarica: () => void
  onElimina?: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [caricata, setCaricata] = useState(false)
  const [rotta, setRotta] = useState(false)
  useEffect(() => {
    let vivo = true
    getUrl(allegato.id)
      .then((u) => vivo && setUrl(u))
      .catch(() => vivo && setRotta(true))
    return () => {
      vivo = false
    }
  }, [allegato.id, getUrl])

  return (
    <div
      className={cn(
        'group/foto relative overflow-hidden rounded-xl border border-slate-200/80 bg-slate-100 dark:border-white/10 dark:bg-white/[0.06]',
        sola ? (caricata ? 'w-fit max-w-full' : 'h-44 w-60 max-w-full') : 'aspect-square',
      )}
    >
      <button
        type="button"
        onClick={onApri}
        className="block size-full cursor-zoom-in overflow-hidden rounded-none! border-0! bg-transparent p-0"
        aria-label={`Apri ${allegato.nomeFile}`}
        title={allegato.nomeFile}
      >
        {url && !rotta && (
          <img
            src={url}
            alt={allegato.nomeFile}
            onLoad={() => setCaricata(true)}
            onError={() => setRotta(true)}
            className={cn(
              'transition duration-300 group-hover/foto:scale-[1.02]',
              sola ? 'block max-h-72 w-auto max-w-full object-contain' : 'size-full object-cover',
              caricata ? 'opacity-100' : 'absolute inset-0 opacity-0',
            )}
          />
        )}
        {!caricata && (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
            {rotta ? (
              <>
                <ImageIcon className="size-6" />
                <span className="max-w-[90%] truncate text-[11px]">{allegato.nomeFile}</span>
              </>
            ) : (
              <span className="size-full animate-pulse bg-slate-200/70 dark:bg-white/10" />
            )}
          </span>
        )}
      </button>
      <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition group-hover/foto:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
        <button
          type="button"
          onClick={onScarica}
          className="inline-flex size-7 items-center justify-center rounded-lg! border-0! bg-white/90 p-0 text-slate-700 shadow backdrop-blur hover:bg-white dark:bg-black/60 dark:text-white"
          aria-label="Scarica"
          title="Scarica"
        >
          <Download className="size-3.5" />
        </button>
        {onElimina && (
          <button
            type="button"
            onClick={onElimina}
            className="inline-flex size-7 items-center justify-center rounded-lg! border-0! bg-white/90 p-0 text-rose-600 shadow backdrop-blur hover:bg-rose-600 hover:text-white dark:bg-black/60"
            aria-label="Elimina"
            title="Elimina"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

/** File scelti per il commento, prima dell'invio: le foto con la loro miniatura, gli altri come etichetta. */
function FileInAttesa({ files, inviando, onRimuovi }: { files: File[]; inviando: boolean; onRimuovi: (i: number) => void }) {
  const anteprime = useMemo(
    () =>
      files.map((f) => (isImmagine({ contentType: f.type, estensione: estensioneDi(f.name) }) ? URL.createObjectURL(f) : null)),
    [files],
  )
  useEffect(() => () => anteprime.forEach((u) => u && URL.revokeObjectURL(u)), [anteprime])
  const [rotte, setRotte] = useState<Set<string>>(new Set())

  return (
    <div className="mb-2 flex flex-wrap items-end gap-2">
      {files.map((f, i) => {
        const u = anteprime[i]
        const chiave = `${f.name}-${f.size}-${i}`
        const rimuovi = !inviando && (
          <button
            type="button"
            onClick={() => onRimuovi(i)}
            className="absolute -right-1.5 -top-1.5 inline-flex size-5 items-center justify-center rounded-full! border-2! border-white! bg-slate-800 p-0 text-white shadow hover:bg-rose-600 dark:border-[#1F3A63]!"
            aria-label={`Rimuovi ${f.name}`}
          >
            <X className="size-3" />
          </button>
        )
        if (u && !rotte.has(chiave)) {
          return (
            <div key={chiave} className="relative">
              <img
                src={u}
                alt={f.name}
                title={f.name}
                onError={() => setRotte((r) => new Set(r).add(chiave))}
                className="size-20 rounded-xl border border-slate-200 object-cover shadow-sm dark:border-white/10"
              />
              {inviando && (
                <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/35">
                  <Loader2 className="size-5 animate-spin text-white" />
                </span>
              )}
              {rimuovi}
            </div>
          )
        }
        return (
          <div
            key={chiave}
            className="relative inline-flex h-10 max-w-[14rem] items-center gap-2 rounded-xl border bg-slate-50 py-1 pr-3 pl-2.5 text-[12px] dark:bg-white/5"
          >
            {inviando ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
            ) : u ? (
              <ImageIcon className="size-4 shrink-0 text-slate-400" />
            ) : (
              <FileIcon className="size-4 shrink-0 text-slate-400" />
            )}
            <span className="min-w-0">
              <span className="block truncate font-medium">{f.name}</span>
              <span className="block text-[11px] text-muted-foreground">{formatBytes(f.size)}</span>
            </span>
            {rimuovi}
          </div>
        )
      })}
    </div>
  )
}

function AnteprimaDialog({
  allegato,
  getUrl,
  onClose,
  onScarica,
}: {
  allegato: TaskAllegato | null
  getUrl: (id: number) => Promise<string>
  onClose: () => void
  onScarica: (a: TaskAllegato) => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [errore, setErrore] = useState(false)
  useEffect(() => {
    setUrl(null)
    setErrore(false)
    if (!allegato || (!isImmagine(allegato) && !isPdf(allegato))) return
    let vivo = true
    getUrl(allegato.id)
      .then((u) => vivo && setUrl(u))
      .catch(() => vivo && setErrore(true))
    return () => {
      vivo = false
    }
  }, [allegato, getUrl])

  const anteprimabile = allegato && (isImmagine(allegato) || isPdf(allegato))
  return (
    <Dialog open={!!allegato} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-5xl flex-col gap-3 rounded-2xl! p-4">
        <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0 pr-8">
          <div className="min-w-0">
            <DialogTitle className="truncate text-base">{allegato?.nomeFile}</DialogTitle>
            <DialogDescription className="text-xs">
              {allegato ? `${formatBytes(allegato.dimensione)} · ${assoluto(allegato.creatoIl)}` : ''}
            </DialogDescription>
          </div>
          {allegato && (
            <Button type="button" variant="outline" size="sm" onClick={() => onScarica(allegato)}>
              <Download className="size-4" /> Scarica
            </Button>
          )}
        </DialogHeader>
        <div className="flex min-h-[40vh] flex-1 items-center justify-center overflow-hidden rounded-xl bg-slate-100 dark:bg-black/40">
          {!anteprimabile && (
            <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
              <FileIcon className="size-10" />
              Anteprima non disponibile per questo tipo di file
            </div>
          )}
          {anteprimabile && errore && (
            <div className="flex flex-col items-center gap-2 p-10 text-sm text-rose-600">
              <AlertCircle className="size-8" /> Impossibile caricare il file
            </div>
          )}
          {anteprimabile && !errore && !url && <Loader2 className="size-6 animate-spin text-muted-foreground" />}
          {url && allegato && isImmagine(allegato) && (
            <img src={url} alt={allegato.nomeFile} className="max-h-[75vh] max-w-full object-contain" />
          )}
          {url && allegato && isPdf(allegato) && (
            <iframe src={url} title={allegato.nomeFile} className="h-[75vh] w-full border-0 bg-white" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ———————————————————————————————— Eliminazioni con "Annulla" ————————————————————————————————

/**
 * Elimina subito a video e chiede al server dopo qualche secondo, con "Annulla" nel toast.
 * Le eliminazioni in sospeso partono comunque quando lo sheet si chiude o cambia task.
 */
function useEliminazioniDifferite(taskId: number | null) {
  const [nascosti, setNascosti] = useState<Set<string>>(() => new Set())
  const pendenti = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; esegui: () => Promise<void> }>())

  const mostra = (chiave: string) =>
    setNascosti((s) => {
      const n = new Set(s)
      n.delete(chiave)
      return n
    })

  const conferma = useCallback(async (chiave: string) => {
    const p = pendenti.current.get(chiave)
    if (!p) return
    pendenti.current.delete(chiave)
    clearTimeout(p.timer)
    try {
      await p.esegui()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Eliminazione non riuscita')
      mostra(chiave)
    }
  }, [])

  useEffect(() => {
    const mappa = pendenti.current
    return () => {
      // Chiusura o cambio task: quello che era in attesa va eseguito adesso
      ;[...mappa.keys()].forEach((k) => void conferma(k))
      setNascosti(new Set())
    }
  }, [taskId, conferma])

  const pianifica = (chiave: string, etichetta: string, esegui: () => Promise<void>) => {
    setNascosti((s) => new Set(s).add(chiave))
    const timer = setTimeout(() => void conferma(chiave), ATTESA_ELIMINAZIONE_MS)
    pendenti.current.set(chiave, { timer, esegui })
    toast(`${etichetta} eliminato`, {
      id: `task-elimina-${chiave}`,
      duration: ATTESA_ELIMINAZIONE_MS,
      action: {
        label: 'Annulla',
        onClick: () => {
          const p = pendenti.current.get(chiave)
          if (!p) return
          clearTimeout(p.timer)
          pendenti.current.delete(chiave)
          mostra(chiave)
        },
      },
    })
  }

  return { nascosti, pianifica }
}

// ———————————————————————————————— Pezzi ————————————————————————————————

function Sezione({ titolo, azioni, children }: { titolo: ReactNode; azioni?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex min-h-7 items-center gap-2">
        {/* Non <h3>: in dark index.css colora tutti i titoli di verde con !important */}
        <p
          role="heading"
          aria-level={3}
          className="text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-white/55"
        >
          {titolo}
        </p>
        {azioni && <div className="ml-auto flex items-center gap-1">{azioni}</div>}
      </div>
      {children}
    </section>
  )
}

const BTN_PICCOLO =
  'inline-flex h-7 items-center gap-1 rounded-lg! border-0! bg-transparent px-2 text-[12px]! font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-foreground dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white'

const Contatore = ({ n }: { n: number }) =>
  n > 0 ? (
    <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-px text-[11px] tabular-nums tracking-normal text-slate-600 dark:bg-white/10 dark:text-white/70">
      {n}
    </span>
  ) : null

/** Tasto scorciatoia mostrato nei tooltip. */
const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded border border-current/20 px-1 font-sans text-[11px] font-semibold opacity-70">
    {children}
  </kbd>
)

function ConSuggerimento({ testo, tasto, children }: { testo: string; tasto?: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className={TASK_LAYER_Z}>
        {testo}
        {tasto && <Kbd>{tasto}</Kbd>}
      </TooltipContent>
    </Tooltip>
  )
}

type Gruppo = { tipo: 'commento'; evento: TaskEvento } | { tipo: 'sistema'; eventi: TaskEvento[] }

/** Raggruppa le modifiche consecutive (non commenti) in un unico blocco. */
function raggruppa(eventi: TaskEvento[]): Gruppo[] {
  const out: Gruppo[] = []
  for (const e of eventi) {
    if (e.tipo === 'COMMENTO') {
      out.push({ tipo: 'commento', evento: e })
      continue
    }
    const ultimo = out[out.length - 1]
    if (ultimo?.tipo === 'sistema') ultimo.eventi.push(e)
    else out.push({ tipo: 'sistema', eventi: [e] })
  }
  return out
}

function EventoSistema({ evento }: { evento: TaskEvento }) {
  const Icon = ICONE_EVENTO[evento.tipo] ?? Eye
  return (
    <li className="flex items-start gap-3 py-1 pl-1.5">
      <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/60">
        <Icon className="size-3" />
      </span>
      <p className="min-w-0 flex-1 text-[13px] leading-5 text-muted-foreground">
        {conMaiuscola(evento.testo ?? '')}
        <span className="whitespace-nowrap text-[12px] opacity-80" title={assoluto(evento.creatoIl)}>
          {' · '}
          {relativo(evento.creatoIl)}
        </span>
      </p>
    </li>
  )
}

/** Blocco di modifiche: fino a 2 si vedono, oltre si riassumono in una riga apribile. */
function GruppoSistema({ eventi }: { eventi: TaskEvento[] }) {
  const [aperto, setAperto] = useState(false)
  if (eventi.length <= 2 || aperto) {
    return (
      <li>
        <ol>
          {eventi.map((e) => (
            <EventoSistema key={e.id} evento={e} />
          ))}
        </ol>
      </li>
    )
  }
  return (
    <li>
      <button
        type="button"
        onClick={() => setAperto(true)}
        className="flex w-full items-center gap-3 rounded-lg! border-0! bg-transparent py-1 pl-1.5 text-left text-[13px]! text-muted-foreground transition hover:bg-slate-50 dark:hover:bg-white/[0.04]"
      >
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/60">
          <Eye className="size-3" />
        </span>
        <span>
          <span className="font-semibold text-foreground/80">{eventi.length} modifiche</span>
          {' · '}
          {relativo(eventi[eventi.length - 1].creatoIl)}
        </span>
        <ChevronRight className="size-3.5" />
      </button>
    </li>
  )
}

// ———————————————————————————————— Sheet ————————————————————————————————

type Menu = 'stato' | 'assegnatari' | 'priorita' | 'etichette' | 'paziente' | 'lista' | null

export function TaskDettaglioSheet({
  taskId,
  onOpenChange,
  onChanged,
  onDeleted,
  onApriTask,
}: {
  taskId: number | null
  onOpenChange: (open: boolean) => void
  onChanged?: (riga: TaskRiga) => void
  onDeleted?: (id: number) => void
  /** Apre un altro task nel dettaglio (sottotask o task principale); senza, quei link non ci sono */
  onApriTask?: (id: number) => void
}) {
  const { apriPaziente } = useAzioni()
  const { config } = useTaskConfig()
  const operatori = useMemo(() => config?.operatori ?? [], [config])
  const listeDestinazione = useMemo(() => (config?.liste ?? []).filter((l) => !l.archiviata), [config])

  const [dettaglio, setDettaglio] = useState<TaskDettaglio | null>(null)
  const [loading, setLoading] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  const [menu, setMenu] = useState<Menu>(null)
  const [modTitolo, setModTitolo] = useState<string | null>(null)
  const [modDescrizione, setModDescrizione] = useState<string | null>(null)
  const [salvandoDescrizione, setSalvandoDescrizione] = useState(false)
  /** Descrizione: si salva da sola mentre si scrive. Ultimo testo inviato e salvataggio in attesa del debounce. */
  const descrizioneInviata = useRef<string | null | undefined>(undefined)
  const descrizioneInSospeso = useRef<{
    timer: ReturnType<typeof setTimeout>
    salva: () => void
  } | null>(null)
  const [mostraChecklist, setMostraChecklist] = useState(false)
  const [nuovaVoce, setNuovaVoce] = useState('')
  const [modVoce, setModVoce] = useState<{ id: number; testo: string } | null>(null)
  const [commento, setCommento] = useState('')
  const [fileCommento, setFileCommento] = useState<File[]>([])
  const [composerAperto, setComposerAperto] = useState(false)
  const [inviando, setInviando] = useState(false)
  const [modCommento, setModCommento] = useState<{
    id: number
    testo: string
  } | null>(null)
  const [uploading, setUploading] = useState<{ chiave: string; nome: string }[]>([])
  const [dragging, setDragging] = useState(false)
  const [anteprima, setAnteprima] = useState<TaskAllegato | null>(null)
  const [confermaElimina, setConfermaElimina] = useState(false)
  const [eliminando, setEliminando] = useState(false)

  const dragDepth = useRef(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const fileCommentoRef = useRef<HTMLInputElement>(null)
  const voceRef = useRef<HTMLInputElement>(null)
  const commentoRef = useRef<HTMLTextAreaElement | null>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const checkRef = useRef<HTMLSpanElement>(null)
  const scadenzaRef = useRef<HTMLSpanElement>(null)
  const fondoRef = useRef<HTMLDivElement>(null)
  const taskIdRef = useRef(taskId)
  taskIdRef.current = taskId

  const { getUrl, semina } = useBlobAllegati(taskId)
  const { nascosti, pianifica } = useEliminazioniDifferite(taskId)

  const applica = useCallback(
    (d: TaskDettaglio) => {
      if (d.task.id !== taskIdRef.current) return
      setDettaglio(d)
      onChanged?.(d.task)
    },
    [onChanged],
  )

  const carica = useCallback(async (id: number, silenzioso = false) => {
    if (!silenzioso) {
      setLoading(true)
      setErrore(null)
    }
    try {
      const d = await taskService.getDettaglio(id)
      if (taskIdRef.current !== id) return
      setDettaglio(d)
    } catch (e) {
      if (taskIdRef.current === id && !silenzioso) setErrore(e instanceof Error ? e.message : 'Task non trovato')
    } finally {
      if (taskIdRef.current === id && !silenzioso) setLoading(false)
    }
  }, [])

  /** Esegue subito il salvataggio della descrizione rimasto in attesa (cambio task, chiusura, uscita dal campo). */
  const salvaDescrizioneInSospeso = () => {
    const p = descrizioneInSospeso.current
    if (!p) return
    clearTimeout(p.timer)
    descrizioneInSospeso.current = null
    p.salva()
  }

  useEffect(() => {
    salvaDescrizioneInSospeso()
    setDettaglio(null)
    setMenu(null)
    setModTitolo(null)
    setModDescrizione(null)
    setMostraChecklist(false)
    setModVoce(null)
    setModCommento(null)
    setCommento('')
    setFileCommento([])
    setComposerAperto(false)
    setUploading([])
    if (taskId != null) void carica(taskId)
  }, [taskId, carica])

  useEffect(() => () => salvaDescrizioneInSospeso(), [])

  const task = dettaglio?.task ?? null
  const lista = config?.liste.find((l) => l.id === task?.listaId) ?? null
  const spostabile = !!lista && listeDestinazione.length > 1
  const chiuso = task ? isStatoChiuso(task.stato) : false
  const completato = task?.stato === 'COMPLETATO'
  const conSottotaskAperti = !!task && task.parentId == null && (task.sottotaskAperti ?? 0) > 0

  /**
   * Modifica di un campo: subito a video, poi allineata alla risposta del server.
   * Se fallisce si ricarica dal server (non si ripristina una copia vecchia che annullerebbe altre modifiche salvate).
   */
  const aggiorna = async (valoriRichiesti: AggiornaTaskValori, ottimistico?: Partial<TaskRiga>) => {
    if (!dettaglio) return
    const id = dettaglio.task.id
    // Completando un task con sottotask aperti: prima la conferma (annullando non cambia niente)
    const valori = await valoriCompletamento(valoriRichiesti, dettaglio.task)
    if (!valori) return
    if (valori.completaSottotask) celebra(checkRef.current)
    if (ottimistico) setDettaglio((d) => (d && d.task.id === id ? { ...d, task: { ...d.task, ...ottimistico } } : d))
    try {
      const d = await taskService.aggiorna(id, valori)
      applica(d)
      emitTaskChanged(d.task.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Modifica non salvata')
      void carica(id, true)
    }
  }

  const esegui = async (fn: () => Promise<TaskDettaglio>, messaggio = 'Operazione non riuscita') => {
    try {
      const d = await fn()
      applica(d)
      emitTaskChanged(d.task.id)
      return d
    } catch (e) {
      toast.error(e instanceof Error ? e.message : messaggio)
      if (taskIdRef.current != null) void carica(taskIdRef.current, true)
      return null
    }
  }

  const salvaTitolo = async () => {
    if (modTitolo == null || !task) return
    const t = modTitolo.trim()
    setModTitolo(null)
    if (!t || t === task.titolo) return
    await aggiorna({ titolo: t }, { titolo: t })
  }

  /** Salva il testo se è cambiato rispetto all'ultimo inviato; l'id è quello del task su cui si stava scrivendo. */
  const salvaDescrizione = async (id: number, valore: string) => {
    const testo = valore.trim() || null
    if (testo === descrizioneInviata.current) return
    descrizioneInviata.current = testo
    setSalvandoDescrizione(true)
    try {
      const d = await taskService.aggiorna(id, { descrizione: testo })
      applica(d)
      emitTaskChanged(d.task.id)
    } catch (e) {
      // Al prossimo tasto (o all'uscita) si riprova
      descrizioneInviata.current = undefined
      toast.error(e instanceof Error ? e.message : 'Descrizione non salvata')
    } finally {
      setSalvandoDescrizione(false)
    }
  }

  const apriDescrizione = () => {
    if (!dettaglio) return
    descrizioneInviata.current = dettaglio.descrizione?.trim() || null
    setModDescrizione(dettaglio.descrizione ?? '')
  }

  const scriviDescrizione = (valore: string) => {
    setModDescrizione(valore)
    if (!dettaglio) return
    const id = dettaglio.task.id
    if (descrizioneInSospeso.current) clearTimeout(descrizioneInSospeso.current.timer)
    const salva = () => void salvaDescrizione(id, valore)
    descrizioneInSospeso.current = {
      salva,
      timer: setTimeout(() => {
        descrizioneInSospeso.current = null
        salva()
      }, 600),
    }
  }

  const chiudiDescrizione = () => {
    salvaDescrizioneInSospeso()
    setModDescrizione(null)
  }

  const toggleCompletato = (origine?: HTMLElement | null) => {
    if (!task) return
    const nuovo = completato ? 'DA_FARE' : 'COMPLETATO'
    // Con sottotask aperti si festeggia dopo la conferma (in aggiorna)
    if (!completato && !conSottotaskAperti) celebra(origine ?? checkRef.current)
    void aggiorna({ stato: nuovo }, { stato: nuovo })
  }

  const carica1 = async (file: File, commentoId?: number) => {
    if (taskId == null) return false
    const chiave = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`
    // I file del commento restano in anteprima nel composer finché non sono su: niente segnaposto negli allegati del task
    if (!commentoId) setUploading((u) => [...u, { chiave, nome: file.name }])
    try {
      const a = await taskService.caricaAllegato(taskId, file, commentoId)
      if (isImmagine(a)) semina(a.id, file)
      return true
    } catch (e) {
      toast.error(`${file.name}: ${e instanceof Error ? e.message : 'upload non riuscito'}`)
      return false
    } finally {
      if (!commentoId) setUploading((u) => u.filter((x) => x.chiave !== chiave))
    }
  }

  /** Quanti file sono andati su. */
  const caricaFiles = async (files: File[], commentoId?: number): Promise<number> => {
    if (taskId == null || files.length === 0) return 0
    const validi = files.filter((f) => {
      if (f.size > MAX_ALLEGATO_TASK_BYTES) {
        toast.error(`${f.name}: file troppo grande (max 20 MB)`)
        return false
      }
      return f.size > 0
    })
    if (validi.length === 0) return 0
    const esiti = await Promise.all(validi.map((f) => carica1(f, commentoId)))
    const ok = esiti.filter(Boolean).length
    if (ok > 0) {
      if (!commentoId) toast.success(ok === 1 ? 'File allegato' : `${ok} file allegati`)
      await carica(taskId, true)
      emitTaskChanged(taskId)
    }
    return ok
  }

  const scarica = async (a: TaskAllegato) => {
    try {
      const url = await getUrl(a.id)
      const link = document.createElement('a')
      link.href = url
      link.download = a.nomeFile
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch {
      toast.error('Download non riuscito')
    }
  }

  const eliminaAllegato = (a: TaskAllegato) => {
    if (!task) return
    const id = task.id
    pianifica(`a${a.id}`, `«${a.nomeFile}»`, async () => {
      const d = await taskService.eliminaAllegato(id, a.id)
      applica(d)
      emitTaskChanged(id)
    })
  }

  const apriComposer = () => {
    setComposerAperto(true)
    requestAnimationFrame(() => commentoRef.current?.focus())
  }

  const inviaCommento = async () => {
    if (!task || inviando) return
    const testo = commento.trim()
    if (!testo && fileCommento.length === 0) return
    setInviando(true)
    try {
      const d = await taskService.commenta(task.id, testo, fileCommento.length)
      // Il commento appena scritto è l'ultimo
      const mio = [...d.eventi].filter((e) => e.tipo === 'COMMENTO').sort((a, b) => b.id - a.id)[0]
      applica(d)
      setCommento('')
      if (fileCommento.length > 0 && mio) {
        const ok = await caricaFiles(fileCommento, mio.id)
        // Solo file e nessuno è andato su: il commento resterebbe vuoto
        if (ok === 0 && !testo) applica(await taskService.eliminaCommento(task.id, mio.id))
      }
      setFileCommento([])
      setComposerAperto(false)
      commentoRef.current?.blur()
      emitTaskChanged(task.id)
      requestAnimationFrame(() => fondoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Commento non inviato')
    } finally {
      setInviando(false)
    }
  }

  const salvaCommento = async () => {
    if (!task || !modCommento) return
    const testo = modCommento.testo.trim()
    if (!testo) return
    const d = await esegui(() => taskService.modificaCommento(task.id, modCommento.id, testo), 'Commento non salvato')
    if (d) setModCommento(null)
  }

  const eliminaCommento = (ev: TaskEvento) => {
    if (!task) return
    const id = task.id
    pianifica(`c${ev.id}`, 'Commento', async () => {
      const d = await taskService.eliminaCommento(id, ev.id)
      applica(d)
      emitTaskChanged(id)
    })
  }

  const aggiungiVoce = async () => {
    const t = nuovaVoce.trim()
    if (!t || !task) return
    setNuovaVoce('')
    await esegui(() => taskService.aggiungiChecklist(task.id, t), 'Voce non aggiunta')
  }

  const toggleVoce = async (id: number, fatto: boolean) => {
    if (!dettaglio) return
    setDettaglio((d) =>
      d
        ? {
            ...d,
            checklist: d.checklist.map((v) => (v.id === id ? { ...v, completato: fatto } : v)),
          }
        : d,
    )
    await esegui(
      () =>
        taskService.aggiornaChecklist(dettaglio.task.id, id, {
          completato: fatto,
        }),
      'Voce non aggiornata',
    )
  }

  const salvaVoce = async () => {
    if (!modVoce || !task) return
    const { id, testo } = modVoce
    setModVoce(null)
    if (!testo.trim()) return
    await esegui(() => taskService.aggiornaChecklist(task.id, id, { testo: testo.trim() }), 'Voce non aggiornata')
  }

  const eliminaVoce = async (id: number) => {
    if (!task) return
    await esegui(() => taskService.eliminaChecklist(task.id, id), 'Voce non eliminata')
  }

  const eliminaTask = async () => {
    if (!task) return
    setEliminando(true)
    try {
      await taskService.elimina(task.id)
      toast.success('Task eliminato')
      emitTaskChanged(task.id)
      onDeleted?.(task.id)
      setConfermaElimina(false)
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Task non eliminato')
    } finally {
      setEliminando(false)
    }
  }

  const copiaLink = () => task && copiaNegliAppunti(linkTask(task.id), 'Link copiato')
  const copiaCodice = () => task && copiaNegliAppunti(codiceTask(task.id), `${codiceTask(task.id)} copiato`)
  const copiaRiferimento = () => task && copiaNegliAppunti(riferimentoTask(task), 'Codice, titolo e link copiati')

  const creaEtichetta = async (nome: string) => {
    const palette = ['#0EA5E9', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6', '#6366F1']
    const nuova = await taskService.creaEtichetta(nome, palette[Math.floor(Math.random() * palette.length)])
    void invalidateTaskConfig()
    return nuova
  }

  // Scorciatoie da tastiera (solo a sheet aperto, mai mentre si scrive o con un menu aperto)
  const scorciatoie = useRef<(e: KeyboardEvent) => void>(() => undefined)
  scorciatoie.current = (e: KeyboardEvent) => {
    if (!task || e.metaKey || e.ctrlKey || e.altKey || staScrivendo(e.target)) return
    if (anteprima || confermaElimina || modTitolo != null) return
    if (document.querySelector('[data-radix-popper-content-wrapper]')) return
    const k = e.key.toLowerCase()
    const azioni: Record<string, () => void> = {
      c: () => toggleCompletato(),
      s: () => setMenu('stato'),
      a: () => setMenu('assegnatari'),
      p: () => setMenu('priorita'),
      d: () => scadenzaRef.current?.querySelector<HTMLElement>('button')?.click(),
      e: () => setModTitolo(task.titolo),
      m: () => apriComposer(),
    }
    const azione = azioni[k]
    if (!azione) return
    e.preventDefault()
    azione()
  }
  useEffect(() => {
    if (taskId == null) return
    const handler = (e: KeyboardEvent) => scorciatoie.current(e)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [taskId])

  // Cronologia in ordine cronologico, senza ciò che è in attesa di eliminazione
  const eventi = useMemo(
    () => [...(dettaglio?.eventi ?? [])].filter((e) => !nascosti.has(`c${e.id}`)).sort((a, b) => a.id - b.id),
    [dettaglio, nascosti],
  )
  const gruppi = useMemo(() => raggruppa(eventi), [eventi])
  const allegatiVisibili = useMemo(
    () => (dettaglio?.allegati ?? []).filter((a) => !nascosti.has(`a${a.id}`)),
    [dettaglio, nascosti],
  )
  const allegatiTask = allegatiVisibili.filter((a) => a.commentoId == null)
  const allegatiPerCommento = useMemo(() => {
    const m = new Map<number, TaskAllegato[]>()
    for (const a of allegatiVisibili) {
      if (a.commentoId == null) continue
      m.set(a.commentoId, [...(m.get(a.commentoId) ?? []), a])
    }
    return m
  }, [allegatiVisibili])
  const checklistFatti = dettaglio?.checklist.filter((v) => v.completato).length ?? 0
  const checklistTot = dettaglio?.checklist.length ?? 0
  const vediChecklist = checklistTot > 0 || mostraChecklist
  // Il riquadro c'è sempre: si scrive direttamente lì
  const vediDescrizione = !!task
  const vediAllegati = allegatiTask.length > 0 || uploading.length > 0

  const onDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    void caricaFiles(Array.from(e.dataTransfer.files ?? []))
  }

  const scaduto = task ? isScaduto(task) : false
  const oggi = task ? !scaduto && isInScadenzaOggi(task) : false
  const voceMenu = (aperto: Menu) => ({
    open: menu === aperto,
    onOpenChange: (o: boolean) => setMenu(o ? aperto : null),
  })

  // Campi aggiungibili (quelli vuoti restano nascosti finché non servono)
  type CampoAggiungibile = {
    k: string
    label: string
    icon: typeof Plus
    fai: () => void
  }
  const campiDaAggiungere: CampoAggiungibile[] =
    task
      ? [
          !vediDescrizione && {
            k: 'descrizione',
            label: 'Descrizione',
            icon: FileText,
            fai: apriDescrizione,
          },
          !vediChecklist && {
            k: 'checklist',
            label: 'Checklist',
            icon: ListChecks,
            fai: () => {
              setMostraChecklist(true)
              requestAnimationFrame(() => voceRef.current?.focus())
            },
          },
          {
            k: 'allegato',
            label: 'Allegato',
            icon: Paperclip,
            fai: () => fileRef.current?.click(),
          },
          !task.paziente && {
            k: 'paziente',
            label: 'Paziente',
            icon: User,
            fai: () => setMenu('paziente'),
          },
          task.etichette.length === 0 && {
            k: 'etichette',
            label: 'Etichette',
            icon: Tag,
            fai: () => setMenu('etichette'),
          },
        ].filter((c): c is CampoAggiungibile => !!c)
      : []

  return (
    <>
      <Sheet open={taskId != null} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden bg-card p-0 text-[14px] sm:w-[min(820px,96vw)] sm:max-w-[820px]"
          onDragEnter={onDragEnter}
          onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          // Screenshot incollato fuori dagli editor (descrizione e commento lo gestiscono da sé): va negli allegati
          onPaste={(e) => {
            if (e.defaultPrevented) return
            const incollati = fileDaAppunti(e.clipboardData)
            if (incollati.length) {
              e.preventDefault()
              void caricaFiles(incollati)
            }
          }}
          data-m-sheet="task"
        >
          {/* Filo colorato della lista */}
          <div
            aria-hidden
            className="h-1 shrink-0"
            style={{
              background: lista ? `linear-gradient(90deg, ${lista.colore}, ${coloreTenue(lista.colore, 0.25)})` : undefined,
            }}
          />

          {/* Overlay di rilascio file */}
          {dragging && (
            <div className="pointer-events-none absolute inset-2 z-40 flex flex-col items-center justify-center gap-3 rounded-[1.5rem] border-2 border-dashed border-[var(--brand-blue)]/50 bg-[var(--brand-blue)]/[0.06] backdrop-blur-sm dark:border-[var(--brand-orange)]/60 dark:bg-[var(--brand-orange)]/[0.08]">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-white shadow-lg dark:bg-[#1F3A63]">
                <Upload className="size-6 text-[var(--brand-blue)] dark:text-[var(--brand-orange)]" />
              </span>
              <p className="text-base font-semibold">Rilascia per allegare</p>
            </div>
          )}

          {/* Intestazione */}
          <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2.5 pr-14 sm:px-6 sm:pr-20">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] text-muted-foreground">
              {task && config && spostabile && (
                <TaskListaPicker
                  config={config}
                  value={task.listaId}
                  onChange={(listaId) => listaId !== task.listaId && void aggiorna({ listaId }, { listaId })}
                  {...voceMenu('lista')}
                  trigger={
                    <button
                      type="button"
                      className={cn(
                        'inline-flex h-7 min-w-0 items-center gap-1 rounded-lg! border-0! bg-transparent px-1.5 text-[13px]! font-semibold text-foreground transition hover:bg-slate-100 dark:hover:bg-white/10',
                        SK_FOCUS_RING,
                      )}
                      title="Sposta in un'altra lista"
                    >
                      {lista && <TaskListaDot lista={lista} />}
                      <ChevronDown className="size-3.5 opacity-50" />
                    </button>
                  }
                />
              )}
              {task && !spostabile && lista && (
                <span className="inline-flex h-7 min-w-0 items-center gap-1 px-1.5 text-[13px] font-semibold text-foreground">
                  <TaskListaDot lista={lista} />
                </span>
              )}
              {task && (
                <ConSuggerimento testo="Copia il codice (Maiusc: con titolo e link)">
                  <button
                    type="button"
                    onClick={(e) => void (e.shiftKey ? copiaRiferimento() : copiaCodice())}
                    className={cn(
                      'h-7 cursor-copy rounded-md px-1.5 font-mono text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                      SK_FOCUS_RING,
                    )}
                    aria-label={`Copia il codice ${codiceTask(task.id)}`}
                  >
                    {codiceTask(task.id)}
                  </button>
                </ConSuggerimento>
              )}
            </div>
            {task && (
              <div className="flex shrink-0 items-center gap-0.5">
                <ConSuggerimento testo="Copia link">
                  <button
                    type="button"
                    onClick={() => void copiaLink()}
                    className={cn(BTN_ICONA, SK_FOCUS_RING)}
                    aria-label="Copia link"
                  >
                    <Link2 className="size-4" />
                  </button>
                </ConSuggerimento>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className={cn(BTN_ICONA, SK_FOCUS_RING, 'hidden sm:inline-flex')}
                      aria-label="Scorciatoie da tastiera"
                    >
                      <Keyboard className="size-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className={cn('p-3', TASK_LAYER_Z)} side="bottom">
                    <p className="mb-1.5 text-[12px] font-semibold">Scorciatoie</p>
                    <ul className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
                      {SCORCIATOIE.map((s) => (
                        <li key={s.tasto} className="contents">
                          <Kbd>{s.tasto}</Kbd>
                          <span>{s.cosa}</span>
                        </li>
                      ))}
                    </ul>
                  </TooltipContent>
                </Tooltip>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className={cn(BTN_ICONA, SK_FOCUS_RING)} aria-label="Altre azioni">
                      <MoreHorizontal className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className={cn('w-60', TASK_LAYER_Z)}>
                    <DropdownMenuItem onSelect={() => void copiaCodice()}>
                      <Hash className="size-4" /> Copia codice {codiceTask(task.id)}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void copiaRiferimento()}>
                      <ClipboardCopy className="size-4" /> Copia codice, titolo e link
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void copiaLink()}>
                      <Link2 className="size-4" /> Copia link
                    </DropdownMenuItem>
                    {spostabile && (
                      <DropdownMenuItem onSelect={() => setMenu('lista')}>
                        <ArrowRightLeft className="size-4" /> Sposta in un'altra lista
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setConfermaElimina(true)} className="text-rose-600 focus:text-rose-600">
                      <Trash2 className="size-4" /> Elimina task
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>

          <SheetTitle className="sr-only">{task?.titolo ?? 'Task'}</SheetTitle>
          <SheetDescription className="sr-only">Dettaglio del task con commenti e allegati</SheetDescription>

          {/* Corpo scorrevole */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading && !dettaglio && (
              <div className="space-y-5 px-4 py-6 sm:px-8">
                <Skeleton className="h-8 w-3/4" />
                <div className="flex gap-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-24 rounded-full" />
                  ))}
                </div>
                <Skeleton className="h-16" />
                <Skeleton className="h-40" />
              </div>
            )}

            {errore && !dettaglio && (
              <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-500/15">
                  <AlertCircle className="size-6" />
                </span>
                <p className="font-semibold">{errore}</p>
                <p className="text-sm text-muted-foreground">Il task potrebbe essere stato eliminato.</p>
                <Button type="button" variant="outline" onClick={() => taskId != null && void carica(taskId)}>
                  <RotateCcw className="size-4" /> Riprova
                </Button>
              </div>
            )}

            {dettaglio && task && (
              <div className="space-y-7 px-4 pt-5 pb-8 sm:px-8 sm:pt-6">
                {/* Titolo */}
                <div>
                  {task.parentId != null && (
                    <button type="button" disabled={!onApriTask} onClick={() => onApriTask?.(task.parentId!)}
                      className="mb-1 inline-flex max-w-full items-center gap-1 border-0! bg-transparent p-0 text-[12px] font-medium text-muted-foreground transition hover:text-foreground"
                      title="Apri il task principale">
                      <CornerLeftUp className="size-3.5 shrink-0" aria-hidden />
                      <span className="truncate">Sottotask di «{task.parentTitolo ?? 'task principale'}»</span>
                    </button>
                  )}
                  {modTitolo != null ? (
                    <textarea
                      autoFocus
                      value={modTitolo}
                      rows={1}
                      maxLength={255}
                      onChange={(e) => setModTitolo(e.target.value.replace(/\n/g, ' '))}
                      onBlur={() => void salvaTitolo()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void salvaTitolo()
                        } else if (e.key === 'Escape') {
                          e.preventDefault()
                          e.stopPropagation()
                          setModTitolo(null)
                        }
                      }}
                      className="-mx-2 block w-[calc(100%+1rem)] resize-none rounded-lg bg-slate-50 px-2 py-1 text-[22px] font-bold leading-tight tracking-tight outline-none ring-2 ring-[var(--brand-blue)]/20 [field-sizing:content] sm:text-[26px] dark:bg-white/5 dark:ring-[var(--brand-orange)]/25"
                    />
                  ) : (
                    <p
                      role="button"
                      tabIndex={0}
                      onClick={() => setModTitolo(task.titolo)}
                      onKeyDown={(e) => e.key === 'Enter' && setModTitolo(task.titolo)}
                      title="Clicca per modificare (E)"
                      className={cn(
                        '-mx-2 rounded-lg px-2 py-1 text-[22px] font-bold leading-tight tracking-tight break-words text-slate-900 transition sm:text-[26px] dark:text-white silvia:text-white',
                        'cursor-text hover:bg-slate-50 dark:hover:bg-white/5',
                        chiuso && 'text-muted-foreground line-through decoration-2 dark:text-white/50',
                      )}
                    >
                      {task.titolo}
                    </p>
                  )}
                  <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[12px] text-muted-foreground">
                    <span>
                      {task.automatico ? 'Creato in automatico ' : task.creatoDa ? `Creato da ${nomeCompleto(task.creatoDa)} ` : 'Creato '}
                      <span title={assoluto(task.creatoIl)}>{relativo(task.creatoIl)}</span>
                    </span>
                    {completato && task.completatoIl && (
                      <span className="font-semibold text-emerald-600 dark:text-emerald-300" title={assoluto(task.completatoIl)}>
                        · completato {relativo(task.completatoIl)}
                      </span>
                    )}
                  </p>
                </div>

                {/* Azione principale + proprietà */}
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span
                      ref={checkRef}
                      className={cn(
                        'inline-flex h-9 items-center gap-2 rounded-full border pr-4 pl-1.5 transition',
                        completato
                          ? 'border-emerald-500 bg-emerald-500 text-white shadow-[0_8px_20px_-10px_rgba(16,185,129,0.8)]'
                          : 'border-emerald-500/35 bg-emerald-500/[0.08] text-emerald-800 hover:border-emerald-500/60 hover:bg-emerald-500/[0.14] dark:text-emerald-200',
                      )}
                    >
                      <TaskCheck
                        completato={completato}
                        onToggle={(el) => toggleCompletato(el)}
                        colore={completato ? 'rgba(255,255,255,0.3)' : undefined}
                      />
                      <ConSuggerimento testo={completato ? 'Riapri' : 'Segna come completato'} tasto="C">
                        <button
                          type="button"
                          onClick={() => toggleCompletato()}
                          className={cn('rounded-md! border-0! bg-transparent p-0 text-[13px]! font-semibold', SK_FOCUS_RING)}
                        >
                          {completato ? 'Completato' : 'Completa'}
                        </button>
                      </ConSuggerimento>
                    </span>

                  <span className="mx-0.5 hidden h-5 w-px bg-slate-200 sm:block dark:bg-white/10" />

                  {/* Da completato lo stato lo dice già il pulsante: niente doppione */}
                  {!completato && (
                    <TaskStatoSelect
                      chip
                      title="Stato (S)"
                      value={task.stato}
                      onChange={(stato) => {
                        if (stato === 'COMPLETATO' && !completato && !conSottotaskAperti) celebra(checkRef.current)
                        void aggiorna({ stato }, { stato })
                      }}
                      {...voceMenu('stato')}
                    />
                  )}

                  <TaskOperatoriPicker
                    operatori={operatori}
                    value={task.assegnatari.map((a) => a.id)}
                    onChange={(ids) =>
                      void aggiorna(
                        { assegnatariIds: ids },
                        {
                          assegnatari: operatori.filter((o) => ids.includes(o.id)),
                        },
                      )
                    }
                    {...voceMenu('assegnatari')}
                    trigger={
                      <button
                        type="button"
                        title="Assegnatari (A)"
                        className={cn(TASK_CHIP, SK_FOCUS_RING, task.assegnatari.length === 0 && TASK_CHIP_VUOTA, 'pl-1.5')}
                      >
                        {task.assegnatari.length === 0 ? (
                          <>
                            <UserPlus className="ml-1 size-4" /> Assegna
                          </>
                        ) : (
                          <>
                            <TaskAvatarStack persone={task.assegnatari} size="xs" max={3} />
                            <span className="truncate">
                              {task.assegnatari.length === 1
                                ? nomeCompleto(task.assegnatari[0])
                                : `${task.assegnatari.length} persone`}
                            </span>
                          </>
                        )}
                      </button>
                    }
                  />

                  <span ref={scadenzaRef} className="contents">
                      <TaskPosticipaMenu
                        scadenza={task.scadenza}
                        scadenzaOra={task.scadenzaOra}
                        onPosticipa={(scadenza, scadenzaOra) =>
                          void aggiorna({ scadenza, scadenzaOra }, { scadenza, scadenzaOra })
                        }
                        trigger={
                          <button
                            type="button"
                            title="Scadenza e posticipa (D)"
                            className={cn(
                              TASK_CHIP,
                              SK_FOCUS_RING,
                              !task.scadenza && TASK_CHIP_VUOTA,
                              scaduto && 'border-rose-300! text-rose-600 dark:border-rose-400/40! dark:text-rose-300',
                              oggi && 'border-amber-300! text-amber-700 dark:border-amber-400/40! dark:text-amber-200',
                            )}
                          >
                            <CalendarClock className="size-4" />
                            {task.scadenza ? formatScadenza(task.scadenza, task.scadenzaOra) : 'Scadenza'}
                          </button>
                        }
                      />
                      {task.scadenza ? (
                        <TaskTogliScadenza className="-ml-1"
                          onClick={() => void aggiorna({ scadenza: null, scadenzaOra: null }, { scadenza: null, scadenzaOra: null })} />
                      ) : null}
                    </span>

                  {/* Orario: inizio → fine, fa la barra del Gantt */}
                  <TaskPeriodoPicker
                      valore={task}
                      stimaMinuti={task.stimaMinuti}
                      onChange={(p) => void aggiorna(p, p)}
                      trigger={
                        <button type="button" title="Orario: inizio e fine (anche nel Gantt)"
                          className={cn(TASK_CHIP, SK_FOCUS_RING, !haOrario(task) && TASK_CHIP_VUOTA)}>
                          <CalendarRange className={cn('size-4', haOrario(task) && 'text-violet-500')} />
                          {riassuntoPeriodo(task) ?? 'Orario'}
                        </button>
                      }
                    />

                  <TaskStimaPicker
                    value={task.stimaMinuti}
                    onChange={(stimaMinuti) => void aggiorna({ stimaMinuti }, { stimaMinuti })}
                  />

                  <TaskPrioritaSelect
                    chip
                    title="Priorità (P)"
                    value={task.priorita}
                    onChange={(priorita) => void aggiorna({ priorita }, { priorita })}
                    {...voceMenu('priorita')}
                  />

                  {(task.etichette.length > 0 || menu === 'etichette') && (
                    <TaskEtichettePicker
                      etichette={config?.etichette ?? []}
                      value={task.etichette.map((e) => e.id)}
                      onChange={(ids) =>
                        void aggiorna(
                          { etichettaIds: ids },
                          {
                            etichette: (config?.etichette ?? []).filter((e) => ids.includes(e.id)),
                          },
                        )
                      }
                      onCreate={creaEtichetta}
                      {...voceMenu('etichette')}
                      trigger={
                        <button
                          type="button"
                          className={cn(TASK_CHIP, SK_FOCUS_RING, task.etichette.length === 0 && TASK_CHIP_VUOTA, 'gap-1 px-2')}
                        >
                          {task.etichette.length === 0 ? (
                            <>
                              <Tag className="size-4" /> Etichette
                            </>
                          ) : (
                            task.etichette.map((e) => <TaskEtichettaChip key={e.id} etichetta={e} />)
                          )}
                        </button>
                      }
                    />
                  )}

                  {!task.paziente && menu === 'paziente' && (
                    <TaskPazientePicker
                      value={null}
                      onChange={(p) => void aggiorna({ pazienteId: p?.id ?? null }, { paziente: p })}
                      {...voceMenu('paziente')}
                      senzaRimuovi
                      trigger={
                        <button type="button" className={cn(TASK_CHIP, TASK_CHIP_VUOTA, SK_FOCUS_RING)}>
                          <User className="size-4" /> Paziente
                        </button>
                      }
                    />
                  )}

                  {campiDaAggiungere.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className={cn(TASK_CHIP, TASK_CHIP_VUOTA, SK_FOCUS_RING, 'px-2.5')}
                          aria-label="Aggiungi un campo"
                        >
                          <Plus className="size-4" />
                          <span className="hidden sm:inline">Aggiungi</span>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className={cn('w-48', TASK_LAYER_Z)}>
                        {campiDaAggiungere.map((c) => (
                          // Il menu si chiude prima di aprire il picker, altrimenti il focus torna al trigger e lo richiude
                          <DropdownMenuItem key={c.k} onSelect={() => setTimeout(c.fai, 0)}>
                            <c.icon className="size-4" /> {c.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                {/* Paziente: un posto solo, con le azioni che servono davvero */}
                {task.paziente && (
                  <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-3 dark:border-white/10 dark:bg-white/[0.04]">
                    <span
                      className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-sky-700 dark:text-sky-200"
                      style={{ backgroundColor: coloreTenue('#0EA5E9', 0.16) }}
                    >
                      {`${task.paziente.nome[0] ?? ''}${task.paziente.cognome[0] ?? ''}`}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold">{nomeCompleto(task.paziente)}</p>
                      <p className="text-[12px] text-muted-foreground">Paziente collegato</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => apriPaziente(task.paziente!.id)}
                        className={cn(TASK_CHIP, SK_FOCUS_RING, 'h-8')}
                      >
                        <ExternalLink className="size-3.5" /> Scheda
                      </button>
                      <TaskPazientePicker
                        value={task.paziente}
                        onChange={(p) => void aggiorna({ pazienteId: p?.id ?? null }, { paziente: p })}
                        senzaRimuovi
                        trigger={
                          <button
                            type="button"
                            className={cn(BTN_ICONA, SK_FOCUS_RING)}
                            title="Cambia paziente"
                            aria-label="Cambia paziente"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                        }
                      />
                      <button
                        type="button"
                        onClick={() => void aggiorna({ pazienteId: null }, { paziente: null })}
                        className={cn(BTN_ICONA, SK_FOCUS_RING)}
                        title="Scollega paziente"
                        aria-label="Scollega paziente"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Descrizione */}
                {vediDescrizione && (
                  <Sezione
                    titolo="Descrizione"
                    azioni={
                      modDescrizione != null ? (
                        <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground" aria-live="polite">
                          {salvandoDescrizione || descrizioneInSospeso.current ? (
                            <>
                              <Loader2 className="size-3.5 animate-spin" /> Salvataggio…
                            </>
                          ) : (
                            <>
                              <Check className="size-3.5" /> Salvata
                            </>
                          )}
                        </span>
                      ) : null
                    }
                  >
                    {modDescrizione != null ? (
                      // Si scrive già formattata (come dopo il salvataggio) e si salva da sola; uscendo torna la lettura
                      <TaskDescrizioneEditor
                        value={modDescrizione}
                        onChange={scriviDescrizione}
                        autoFocus
                        placeholder="Istruzioni, contesto, link utili…"
                        onSubmit={chiudiDescrizione}
                        onBlur={chiudiDescrizione}
                        onPasteFiles={(f) => void caricaFiles(f)}
                      />
                    ) : (
                      <div
                        role="button"
                        tabIndex={0}
                        title="Clicca per modificare"
                        className="-mx-2 cursor-text rounded-lg px-2 py-1 transition hover:bg-slate-50 dark:hover:bg-white/[0.03]"
                        onClick={(e) => {
                          // I link nella descrizione restano cliccabili
                          if ((e.target as HTMLElement).closest('a')) return
                          apriDescrizione()
                        }}
                        onKeyDown={(e) => {
                          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault()
                            apriDescrizione()
                          }
                        }}
                      >
                        {dettaglio.descrizione?.trim() ? (
                          <TaskMarkdown testo={dettaglio.descrizione} />
                        ) : (
                          <p className="py-1 text-[14px] text-muted-foreground">Aggiungi una descrizione…</p>
                        )}
                      </div>
                    )}
                  </Sezione>
                )}

                {/* Checklist */}
                {vediChecklist && (
                  <Sezione
                    titolo={
                      <span className="inline-flex items-center">
                        Checklist
                        {checklistTot > 0 && (
                          <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-px text-[11px] tabular-nums tracking-normal text-slate-600 dark:bg-white/10 dark:text-white/70">
                            {checklistFatti}/{checklistTot}
                          </span>
                        )}
                      </span>
                    }
                  >
                    {checklistTot > 0 && (
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                          style={{
                            width: `${(checklistFatti / checklistTot) * 100}%`,
                          }}
                        />
                      </div>
                    )}
                    <ul className="space-y-0.5">
                      {dettaglio.checklist.map((v) => (
                        <li
                          key={v.id}
                          className="group -mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                        >
                          <TaskCheck
                            size="sm"
                            completato={v.completato}
                            onToggle={() => void toggleVoce(v.id, !v.completato)}
                          />
                          {modVoce?.id === v.id ? (
                            <input
                              autoFocus
                              value={modVoce.testo}
                              onChange={(e) => setModVoce({ id: v.id, testo: e.target.value })}
                              onBlur={() => void salvaVoce()}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void salvaVoce()
                                if (e.key === 'Escape') {
                                  e.stopPropagation()
                                  setModVoce(null)
                                }
                              }}
                              className="h-7 flex-1 rounded-md bg-white px-1.5 text-[14px] outline-none ring-2 ring-[var(--brand-blue)]/20 dark:bg-white/10"
                            />
                          ) : (
                            <span
                              onClick={() => setModVoce({ id: v.id, testo: v.testo })}
                              className={cn(
                                'flex-1 cursor-text text-[14px] transition',
                                v.completato && 'text-muted-foreground line-through',
                              )}
                              title={v.completato && v.completatoIl ? `Fatto ${relativo(v.completatoIl)}` : undefined}
                            >
                              {v.testo}
                            </span>
                          )}
                          <button
                              type="button"
                              onClick={() => void eliminaVoce(v.id)}
                              className="inline-flex size-6 items-center justify-center rounded-md! border-0! bg-transparent p-0 text-muted-foreground opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100 dark:hover:bg-rose-500/15"
                              aria-label="Elimina voce"
                            >
                              <X className="size-3.5" />
                            </button>
                        </li>
                      ))}
                    </ul>
                    <div className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1">
                        <Plus className="ml-0.5 size-4 text-muted-foreground" />
                        <input
                          ref={voceRef}
                          value={nuovaVoce}
                          onChange={(e) => setNuovaVoce(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              void aggiungiVoce()
                            } else if (e.key === 'Escape' && !nuovaVoce && checklistTot === 0) {
                              e.stopPropagation()
                              setMostraChecklist(false)
                            }
                          }}
                          placeholder="Aggiungi una voce e premi Invio"
                          className="h-7 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
                        />
                      </div>
                  </Sezione>
                )}

                {/* Sottotask: solo per i task principali (un livello, come su ClickUp) */}
                {task.parentId == null && (
                  <Sezione
                    titolo={
                      <span className="inline-flex items-center">
                        Sottotask
                        {dettaglio.sottotask.length > 0 && (
                          <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-px text-[11px] tabular-nums tracking-normal text-slate-600 dark:bg-white/10 dark:text-white/70">
                            {dettaglio.sottotask.filter((s) => s.stato === 'COMPLETATO').length}/{dettaglio.sottotask.length}
                          </span>
                        )}
                      </span>
                    }
                  >
                    <TaskSottotaskElenco
                      task={task}
                      sottotask={dettaglio.sottotask}
                      onApri={onApriTask}
                      onCambiati={() => void carica(task.id, true)}
                    />
                  </Sezione>
                )}

                {/* Dipendenze fine → inizio: cosa aspetta e cosa blocca (le frecce del Gantt) */}
                {dettaglio.dipendenze && (
                  <Sezione
                    titolo={
                      <span className="inline-flex items-center">
                        Dipendenze
                        <Contatore n={dettaglio.dipendenze.attende.length + dettaglio.dipendenze.blocca.length} />
                      </span>
                    }
                  >
                    <TaskDipendenzeSezione task={task} dipendenze={dettaglio.dipendenze}
                      onApri={onApriTask} esegui={esegui} />
                  </Sezione>
                )}

                {/* Allegati */}
                {vediAllegati && (
                  <Sezione
                    titolo={
                      <span className="inline-flex items-center">
                        Allegati
                        <Contatore n={allegatiTask.length} />
                      </span>
                    }
                    azioni={
                      <button type="button" className={BTN_PICCOLO} onClick={() => fileRef.current?.click()}>
                        <Upload className="size-3.5" /> Carica
                      </button>
                    }
                  >
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {allegatiTask.map((a) => (
                        <AllegatoCard
                          key={a.id}
                          allegato={a}
                          getUrl={getUrl}
                          onApri={() => setAnteprima(a)}
                          onScarica={() => void scarica(a)}
                          onElimina={() => eliminaAllegato(a)}
                        />
                      ))}
                      {uploading.map((u) => (
                        <div
                          key={u.chiave}
                          className="flex h-[10.25rem] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 px-3 text-center dark:border-white/15"
                        >
                          <Loader2 className="size-5 animate-spin text-[var(--brand-blue)] dark:text-[var(--brand-orange)]" />
                          <span className="line-clamp-2 text-[12px] text-muted-foreground">{u.nome}</span>
                        </div>
                      ))}
                    </div>
                  </Sezione>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void caricaFiles(Array.from(e.target.files ?? []))
                    e.target.value = ''
                  }}
                />

                {/* Attività */}
                <Sezione titolo="Attività">
                  <div>
                    <ol className="space-y-3">
                      {gruppi.map((g) =>
                        g.tipo === 'sistema' ? (
                          <GruppoSistema key={`s${g.eventi[0].id}`} eventi={g.eventi} />
                        ) : (
                          <li key={g.evento.id} className="flex gap-3">
                            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/60">
                              <MessageSquare className="size-4" />
                            </span>
                            <div className="group min-w-0 flex-1 rounded-2xl rounded-tl-md border border-slate-200/80 bg-white px-3.5 py-2.5 transition dark:border-white/10 dark:bg-white/[0.035]">
                              <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
                                <span className="text-[13px] font-semibold">Nota</span>
                                <span className="text-[12px] text-muted-foreground" title={assoluto(g.evento.creatoIl)}>
                                  {relativo(g.evento.creatoIl)}
                                  {g.evento.modificatoIl && ' · modificato'}
                                </span>
                                {modCommento?.id !== g.evento.id && (
                                  <span className="ml-auto flex gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setModCommento({
                                          id: g.evento.id,
                                          testo: g.evento.testo ?? '',
                                        })
                                      }
                                      className={cn(BTN_ICONA, 'size-6')}
                                      aria-label="Modifica commento"
                                    >
                                      <Pencil className="size-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => eliminaCommento(g.evento)}
                                      className={cn(
                                        BTN_ICONA,
                                        'size-6 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/15',
                                      )}
                                      aria-label="Elimina commento"
                                    >
                                      <Trash2 className="size-3.5" />
                                    </button>
                                  </span>
                                )}
                              </div>
                              {modCommento?.id === g.evento.id ? (
                                <div className="space-y-2">
                                  <TaskMarkdownEditor
                                    value={modCommento.testo}
                                    onChange={(t) =>
                                      setModCommento({
                                        id: g.evento.id,
                                        testo: t,
                                      })
                                    }
                                    autoFocus
                                    minRows={3}
                                    onSubmit={() => void salvaCommento()}
                                  />
                                  <div className="flex justify-end gap-2">
                                    <Button type="button" variant="ghost" size="sm" onClick={() => setModCommento(null)}>
                                      Annulla
                                    </Button>
                                    <Button type="button" size="sm" onClick={() => void salvaCommento()}>
                                      Salva
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                g.evento.testo && <TaskMarkdown testo={g.evento.testo} />
                              )}
                              {(() => {
                                const ev = g.evento
                                const allegatiEv = (
                                  ev.allegati?.length ? ev.allegati : (allegatiPerCommento.get(ev.id) ?? [])
                                ).filter((a) => !nascosti.has(`a${a.id}`))
                                if (allegatiEv.length === 0) return null
                                const foto = allegatiEv.filter(isImmagine)
                                const altri = allegatiEv.filter((a) => !isImmagine(a))
                                return (
                                  <div className={cn('space-y-2', ev.testo && 'mt-2.5')}>
                                    {foto.length > 0 && (
                                      <FotoCommento
                                        allegati={foto}
                                        getUrl={getUrl}
                                        onApri={setAnteprima}
                                        onScarica={(a) => void scarica(a)}
                                        onElimina={(a) => () => eliminaAllegato(a)}
                                      />
                                    )}
                                    {altri.length > 0 && (
                                      <div className="flex flex-wrap gap-2">
                                        {altri.map((a) => (
                                          <AllegatoCard
                                            key={a.id}
                                            allegato={a}
                                            getUrl={getUrl}
                                            compatto
                                            onApri={() => setAnteprima(a)}
                                            onScarica={() => void scarica(a)}
                                            onElimina={() => eliminaAllegato(a)}
                                          />
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )
                              })()}
                            </div>
                          </li>
                        ),
                      )}
                    </ol>
                    {!eventi.some((e) => e.tipo === 'COMMENTO') && (
                      <p className="mt-3 text-[13px] text-muted-foreground">
                        Nessuna nota ancora.{' '}
                        <button
                          type="button"
                          onClick={apriComposer}
                          className="rounded! border-0! bg-transparent p-0 text-[13px]! font-semibold text-[var(--brand-blue)] hover:underline dark:text-[var(--brand-orange)]"
                        >
                          Scrivi il primo
                        </button>
                      </p>
                    )}
                  </div>
                  <div ref={fondoRef} />
                </Sezione>
              </div>
            )}
          </div>

          {/* Composer: una riga finché non serve, poi si apre (su telefono non copre il contenuto) */}
          {dettaglio && task && (
            <div
              ref={composerRef}
              className="shrink-0 border-t bg-white/90 px-4 py-2.5 backdrop-blur-xl sm:px-8 dark:bg-[#1F3A63]/90 silvia:bg-black/80"
              onBlur={() =>
                setTimeout(() => {
                  const dentro = composerRef.current?.contains(document.activeElement)
                  if (!dentro && !commento.trim() && fileCommento.length === 0) setComposerAperto(false)
                }, 150)
              }
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('Files')) e.preventDefault()
              }}
              onDrop={(e) => {
                const f = Array.from(e.dataTransfer.files ?? [])
                if (f.length === 0) return
                e.preventDefault()
                e.stopPropagation()
                setFileCommento((p) => [...p, ...f])
                setComposerAperto(true)
              }}
            >
              {fileCommento.length > 0 && (
                <FileInAttesa
                  files={fileCommento}
                  inviando={inviando}
                  onRimuovi={(i) => setFileCommento((p) => p.filter((_, j) => j !== i))}
                />
              )}
              <input
                ref={fileCommentoRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const f = Array.from(e.target.files ?? [])
                  setFileCommento((p) => [...p, ...f])
                  setComposerAperto(true)
                  e.target.value = ''
                }}
              />
              {!composerAperto && !commento && fileCommento.length === 0 ? (
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={apriComposer}
                    className="flex h-10 min-w-0 flex-1 items-center rounded-full! border! border-slate-200! bg-white px-4 text-left text-[14px]! text-muted-foreground transition hover:border-slate-300! dark:border-white/15! dark:bg-white/[0.05]"
                  >
                    <span className="truncate">Scrivi una nota…</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileCommentoRef.current?.click()}
                    className={cn(BTN_ICONA, 'size-10 rounded-full!')}
                    title="Allega file"
                    aria-label="Allega file"
                  >
                    <Paperclip className="size-4" />
                  </button>
                </div>
              ) : (
                <TaskMarkdownEditor
                  value={commento}
                  onChange={setCommento}
                  minRows={3}
                  autoFocus
                  textareaRef={commentoRef}
                  toolbarMinima
                  placeholder="Scrivi una nota… ⌘+Invio per salvarla"
                  onSubmit={() => void inviaCommento()}
                  onPasteFiles={(f) => setFileCommento((p) => [...p, ...f])}
                  footer={
                    <>
                      <button
                        type="button"
                        onClick={() => fileCommentoRef.current?.click()}
                        className={BTN_ICONA}
                        title="Allega file alla nota"
                        aria-label="Allega file"
                      >
                        <Paperclip className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void inviaCommento()}
                        disabled={inviando || (!commento.trim() && fileCommento.length === 0)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full! border-0! bg-[var(--brand-blue)] px-3.5 text-[13px]! font-semibold text-white transition hover:bg-[#003a7a] disabled:opacity-40 dark:bg-[var(--brand-orange)] dark:text-[var(--brand-blue)] dark:hover:bg-[#8dffad] silvia:bg-white silvia:text-black"
                      >
                        {inviando ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                        Salva
                      </button>
                    </>
                  }
                />
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AnteprimaDialog
        allegato={anteprima}
        getUrl={getUrl}
        onClose={() => setAnteprima(null)}
        onScarica={(a) => void scarica(a)}
      />

      <Dialog open={confermaElimina} onOpenChange={(o) => !eliminando && setConfermaElimina(o)}>
        <DialogContent className="max-w-md rounded-2xl!">
          <DialogHeader>
            <DialogTitle>Eliminare il task?</DialogTitle>
            <DialogDescription>
              «{task?.titolo}» verrà eliminato insieme a note, sottotask, checklist e allegati. L'operazione non si può annullare.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setConfermaElimina(false)} disabled={eliminando}>
              Annulla
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void eliminaTask()}
              disabled={eliminando}
              className={SK_BTN_DANGER_SM}
            >
              {eliminando && <Loader2 className="size-4 animate-spin" />}
              Elimina
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
