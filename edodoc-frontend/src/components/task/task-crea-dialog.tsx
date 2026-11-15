import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  CalendarRange,
  ChevronDown,
  FileText,
  FolderPlus,
  ListChecks,
  Loader2,
  Paperclip,
  Plus,
  Tag,
  User,
  UserPlus,
  X,
} from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { cn } from '@/lib/utils'
import { TaskStimaPicker } from '@/components/task/task-stima'
import { toast } from '@/lib/toast'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SK_FOCUS_RING } from '@/components/ui/sheet-kit'
import { useTaskConfig, invalidateTaskConfig } from '@/hooks/use-task-config'
import { emitTaskChanged } from '@/hooks/use-task-cambi'
import { parseQuickAdd, rimuoviToken, type QuickAddContesto, type QuickAddTokenTipo } from '@/lib/task-quick-add'
import {
  MAX_ALLEGATO_TASK_BYTES,
  messaggioErroreTask,
  taskService,
  type TaskPaziente,
  type TaskPriorita,
  type TaskRiga,
  type TaskStato,
} from '@/services/task-service'
import {
  TASK_CHIP,
  TASK_CHIP_VUOTA,
  TASK_LAYER_Z,
  TaskAvatar,
  TaskEtichettaChip,
  TaskListaDot,
  TaskPrioritaSelect,
  formatScadenza,
  nomeCompleto,
  toIsoData,
} from './task-ui'
import {
  TaskEtichettePicker,
  TaskOperatoriPicker,
  TaskPazientePicker,
  TaskScadenzaPicker,
  TaskTogliScadenza,
} from './task-pickers'
import { TaskMarkdownEditor } from './task-markdown'
import { fileDaAppunti } from '@/lib/file-da-appunti'
import { TaskQuickAddInput } from './task-quick-add'
import { TaskListaPicker } from './task-lista-picker'
import { TaskPeriodoPicker } from './task-periodo'
import { haOrario, riassuntoPeriodo } from '@/lib/task-periodo'
import { pazientiService } from '@/services/gestionale'

/** Valori di partenza: chi apre il dialog da un paziente, da una lista o da un giorno del calendario. */
export interface TaskCreaPrefill {
  listaId?: number
  listaCodice?: string
  titolo?: string
  descrizione?: string
  pazienteId?: number
  /** "Nome Cognome" del paziente; se manca si legge dal paziente */
  pazienteNomeCognome?: string
  scadenza?: string
  stato?: TaskStato
  /** Il nuovo task è un sottotask di questo */
  parentId?: number
}

const ULTIMA_LISTA_KEY = 'task-ultima-lista'

const leggiUltimaLista = (): number | null => {
  try {
    const v = localStorage.getItem(ULTIMA_LISTA_KEY)
    return v ? Number(v) : null
  } catch {
    return null
  }
}

const salvaUltimaLista = (id: number) => {
  try {
    localStorage.setItem(ULTIMA_LISTA_KEY, String(id))
  } catch {
    /* storage non disponibile */
  }
}

const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`

const pazienteDaPrefill = (prefill?: TaskCreaPrefill): TaskPaziente | null => {
  if (prefill?.pazienteId == null) return null
  const [nome, ...resto] = (prefill.pazienteNomeCognome ?? '').trim().split(/\s+/)
  return { id: prefill.pazienteId, nome: nome ?? '', cognome: resto.join(' ') }
}

/** Sezioni facoltative, aperte dal menu "Altro". */
type Extra = 'paziente' | 'etichette' | 'checklist' | 'allegati'

const CHIP = cn(TASK_CHIP, SK_FOCUS_RING)
const CHIP_VUOTA = cn(TASK_CHIP, TASK_CHIP_VUOTA, SK_FOCUS_RING)

/**
 * Creazione di un task in un gesto: si scrive la frase ("Richiamare Rossi domani 15 @Carlos !alta") e si preme Invio.
 * Le chip sotto mostrano cosa verrà salvato e si possono cambiare a mano; i dettagli meno usati stanno in "Altro".
 * Da un paziente il task nasce assegnato a me, in scadenza oggi, con il nome del paziente nel titolo.
 */
export function TaskCreaDialog({
  open,
  onOpenChange,
  prefill,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  prefill?: TaskCreaPrefill
  onCreated?: (t: TaskRiga) => void
}) {
  const { utente } = useAuth()
  const meId = utente?.id
  const { config, loading: loadingConfig, error: errorConfig } = useTaskConfig()

  const [testo, setTesto] = useState('')
  const [protetto, setProtetto] = useState<string | undefined>(undefined)
  // Valori scelti con le chip; i comandi scritti nel testo hanno la precedenza (e scelgo a mano → tolgo il comando)
  const [listaId, setListaId] = useState<number | null>(null)
  const [assegnatari, setAssegnatari] = useState<number[]>([])
  const [scadenza, setScadenza] = useState<{ scadenza: string | null; scadenzaOra: string | null }>({
    scadenza: null,
    scadenzaOra: null,
  })
  const [inizio, setInizio] = useState<{ dataInizio: string | null; inizioOra: string | null }>({
    dataInizio: null,
    inizioOra: null,
  })
  const [priorita, setPriorita] = useState<TaskPriorita | null>(null)
  const [stima, setStima] = useState<number | null>(null)
  const [etichette, setEtichette] = useState<number[]>([])
  const [paziente, setPaziente] = useState<TaskPaziente | null>(null)
  const [descrizione, setDescrizione] = useState('')
  const [checklist, setChecklist] = useState<string[]>([])
  const [nuovaVoce, setNuovaVoce] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [extra, setExtra] = useState<Set<Extra>>(new Set())
  const [aperto, setAperto] = useState<Extra | null>(null)
  const [creaAltro, setCreaAltro] = useState(false)
  const [saving, setSaving] = useState(false)
  const [trascina, setTrascina] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Le liste attive (anche per il comando /Lista nel testo)
  const liste = useMemo(() => (config?.liste ?? []).filter((l) => !l.archiviata), [config])
  const [creandoLista, setCreandoLista] = useState(false)
  const parentId = prefill?.parentId ?? null

  const contesto = useMemo<QuickAddContesto>(
    () => ({ operatori: config?.operatori ?? [], etichette: config?.etichette ?? [], liste, meId }),
    [config, liste, meId],
  )
  const parsed = useMemo(() => parseQuickAdd(testo, contesto, { protetto }), [testo, contesto, protetto])
  const haToken = (tipo: QuickAddTokenTipo) => parsed.tokens.some((t) => t.tipo === tipo)

  // Valori effettivi
  const listaEff = parsed.listaId ?? listaId
  const lista = liste.find((l) => l.id === listaEff) ?? null
  const scadenzaEff = haToken('scadenza') || haToken('ora')
    ? { scadenza: parsed.scadenza, scadenzaOra: parsed.scadenzaOra }
    : scadenza
  const assegnatariEff = [...new Set([...assegnatari, ...parsed.assegnatariIds])]
  // Senza scadenza l'inizio non ha senso: l'orario parte dalla scadenza
  const periodo = {
    dataInizio: scadenzaEff.scadenza ? inizio.dataInizio : null,
    inizioOra: scadenzaEff.scadenza ? inizio.inizioOra : null,
    scadenza: scadenzaEff.scadenza,
    scadenzaOra: scadenzaEff.scadenzaOra,
  }
  const prioritaEff = parsed.priorita ?? priorita
  const stimaEff = parsed.stimaMinuti ?? stima
  const etichetteEff = [...new Set([...etichette, ...parsed.etichettaIds])]
  const titolo = parsed.titolo

  /** Scelta manuale di un campo: il comando corrispondente sparisce dal testo, così testo e chip non litigano. */
  const togliToken = (...tipiToken: QuickAddTokenTipo[]) => {
    const daTogliere = parsed.tokens.filter((t) => tipiToken.includes(t.tipo)).sort((a, b) => b.start - a.start)
    if (!daTogliere.length) return
    setTesto(daTogliere.reduce((acc, t) => rimuoviToken(acc, t), testo))
  }

  const mostra = (e: Extra, apri = true) => {
    setExtra((s) => new Set(s).add(e))
    if (apri && (e === 'paziente' || e === 'etichette')) setTimeout(() => setAperto(e), 60)
    if (e === 'allegati') setTimeout(() => fileRef.current?.click(), 0)
  }

  /** Titolo pronto quando si arriva da un paziente: "Giulia Bianchi — " e si continua a scrivere cosa fare. */
  const titoloProposto = (p: TaskPaziente | null = pazienteDaPrefill(prefill)) => {
    if (prefill?.titolo) return prefill.titolo
    return p && nomeCompleto(p) ? `${nomeCompleto(p)} — ` : ''
  }
  const propostoRef = useRef('')
  const testoRef = useRef(testo)
  testoRef.current = testo

  // Ogni apertura riparte dal contesto del chiamante (niente lista o paziente rimasti dalla volta prima)
  useEffect(() => {
    if (!open) return
    const p = pazienteDaPrefill(prefill)
    const daContesto = p != null
    const proposto = titoloProposto()
    propostoRef.current = proposto
    setTesto(proposto)
    setProtetto(proposto || undefined)
    setListaId(null)
    setAssegnatari(daContesto && meId != null ? [meId] : [])
    setScadenza({ scadenza: prefill?.scadenza ?? (daContesto ? toIsoData(new Date()) : null), scadenzaOra: null })
    setInizio({ dataInizio: null, inizioOra: null })
    setPriorita(null)
    setStima(null)
    setEtichette([])
    setPaziente(p)
    setDescrizione(prefill?.descrizione ?? '')
    setChecklist([])
    setNuovaVoce('')
    setFiles([])
    setExtra(new Set<Extra>(p ? ['paziente'] : []))
    setAperto(null)
    setSaving(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Lista di default: quella del chiamante, poi l'ultima usata, poi la prima delle mie
  useEffect(() => {
    if (!open || liste.length === 0 || listaId != null) return
    const ultima = leggiUltimaLista()
    const scelta =
      liste.find((l) => l.id === prefill?.listaId) ??
      liste.find((l) => prefill?.listaCodice != null && l.codice === prefill.listaCodice) ??
      liste.find((l) => l.id === ultima) ??
      liste.find((l) => l.codice === 'GENERALE') ??
      liste[0]
    setListaId(scelta.id)
  }, [open, liste, listaId, prefill?.listaId, prefill?.listaCodice])

  // Arrivati da un paziente con il solo id: nome letto dalla sua scheda, poi titolo proposto se non ancora toccato
  useEffect(() => {
    if (!open || prefill?.pazienteId == null || prefill.pazienteNomeCognome) return
    let annullato = false
    pazientiService
      .dettaglio(prefill.pazienteId)
      .then((d) => {
        if (annullato) return
        const p = { id: d.id, nome: d.nome, cognome: d.cognome }
        setPaziente((attuale) => (attuale?.id === p.id ? p : attuale))
        const proposto = titoloProposto(p)
        if (testoRef.current !== propostoRef.current) return
        propostoRef.current = proposto
        setTesto(proposto)
        setProtetto(proposto || undefined)
      })
      .catch(() => undefined)
    return () => {
      annullato = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill?.pazienteId, prefill?.pazienteNomeCognome])

  const aggiungiFiles = (nuovi: File[]) => {
    const validi = nuovi.filter((f) => {
      if (f.size > MAX_ALLEGATO_TASK_BYTES) {
        toast.error(`${f.name}: file troppo grande (max 20 MB)`)
        return false
      }
      return f.size > 0
    })
    if (validi.length) {
      setFiles((prev) => [...prev, ...validi])
      setExtra((s) => new Set(s).add('allegati'))
    }
  }

  const aggiungiVoce = () => {
    const t = nuovaVoce.trim()
    if (!t) return
    setChecklist((c) => [...c, t])
    setNuovaVoce('')
  }

  const canSubmit = listaEff != null && titolo.length > 0 && !saving

  const submit = async () => {
    if (!canSubmit || listaEff == null) {
      if (!titolo) inputRef.current?.focus()
      return
    }
    setSaving(true)
    const voci = [...checklist, ...(nuovaVoce.trim() ? [nuovaVoce.trim()] : [])]
    try {
      const creato = await taskService.crea({
        listaId: listaEff,
        titolo,
        descrizione: descrizione.trim() || null,
        stato: prefill?.stato,
        priorita: prioritaEff,
        stimaMinuti: stimaEff,
        scadenza: scadenzaEff.scadenza,
        scadenzaOra: scadenzaEff.scadenza ? scadenzaEff.scadenzaOra : null,
        dataInizio: periodo.dataInizio,
        inizioOra: periodo.dataInizio ? periodo.inizioOra : null,
        assegnatariIds: assegnatariEff,
        etichettaIds: etichetteEff,
        pazienteId: paziente?.id ?? null,
        checklist: voci,
        parentId,
      })
      salvaUltimaLista(listaEff)

      if (files.length > 0) {
        const esiti = await Promise.allSettled(files.map((f) => taskService.caricaAllegato(creato.id, f)))
        const falliti = esiti.filter((e) => e.status === 'rejected').length
        if (falliti > 0) toast.error(`${falliti} allegat${falliti === 1 ? 'o non caricato' : 'i non caricati'}`)
      }

      toast.success('Task creato', {
        description: creato.titolo,
        // Nuova scheda: chi crea il task da un paziente resta dov'era
        action: { label: 'Apri', onClick: () => window.open(`${window.location.origin}/task?task=${creato.id}`, '_blank', 'noopener,noreferrer') },
      })
      emitTaskChanged(creato.id)
      onCreated?.(creato)
      if (creaAltro) {
        // Stessa lista, persone e scadenza: si scrive solo il prossimo titolo
        setListaId(listaEff)
        setAssegnatari(assegnatariEff)
        setScadenza(scadenzaEff)
        setPriorita(prioritaEff)
        setStima(null)
        setEtichette(etichetteEff)
        setTesto('')
        setProtetto(undefined)
        setDescrizione('')
        setChecklist([])
        setNuovaVoce('')
        setFiles([])
        requestAnimationFrame(() => inputRef.current?.focus())
      } else {
        onOpenChange(false)
      }
    } catch (e) {
      toast.error(messaggioErroreTask(e, 'Errore nella creazione del task'))
    } finally {
      setSaving(false)
    }
  }

  /** Nessuna lista attiva: se ne crea una al volo e la si seleziona. */
  const creaListaGenerale = async () => {
    setCreandoLista(true)
    try {
      const nuova = await taskService.creaLista({ nome: 'Generale' })
      await invalidateTaskConfig()
      setListaId(nuova.id)
      emitTaskChanged()
      requestAnimationFrame(() => inputRef.current?.focus())
    } catch (e) {
      toast.error(messaggioErroreTask(e, 'Lista non creata'))
    } finally {
      setCreandoLista(false)
    }
  }

  const creaEtichetta = async (nome: string) => {
    const palette = ['#0EA5E9', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6', '#6366F1']
    const nuova = await taskService.creaEtichetta(nome, palette[Math.floor(Math.random() * palette.length)])
    void invalidateTaskConfig()
    return nuova
  }

  const operatoriScelti = (config?.operatori ?? []).filter((o) => assegnatariEff.includes(o.id))
  const soloIo = operatoriScelti.length === 1 && operatoriScelti[0].id === meId
  const voceAltro: { key: Extra; label: string; icona: typeof Tag }[] = [
    { key: 'paziente', label: 'Paziente', icona: User },
    { key: 'etichette', label: 'Etichette', icona: Tag },
    { key: 'checklist', label: 'Checklist', icona: ListChecks },
    { key: 'allegati', label: 'Allegati', icona: Paperclip },
  ]
  const altriDisponibili = voceAltro.filter((v) => !extra.has(v.key))

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent
        data-task-crea
        className={cn(
          'flex max-h-[min(92vh,760px)] w-[calc(100vw-1.5rem)] max-w-[640px] flex-col gap-0 overflow-hidden rounded-2xl! p-0',
          // Telefono: a tutto schermo, con la tastiera aperta resta tutto raggiungibile
          'max-sm:inset-0 max-sm:h-[100dvh] max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none!',
          '[&>button:last-child]:top-5 [&>button:last-child]:right-5',
        )}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault()
            void submit()
          }
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault()
            setTrascina(true)
          }
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setTrascina(false)
        }}
        // Screenshot incollato ovunque nel dialog, anche nel titolo (la descrizione lo gestisce da sé)
        onPaste={(e) => {
          if (e.defaultPrevented) return
          const incollati = fileDaAppunti(e.clipboardData)
          if (incollati.length) {
            e.preventDefault()
            aggiungiFiles(incollati)
          }
        }}
        onDrop={(e) => {
          setTrascina(false)
          const dropped = Array.from(e.dataTransfer.files ?? [])
          if (dropped.length) {
            e.preventDefault()
            aggiungiFiles(dropped)
          }
        }}
      >
        <DialogTitle className="sr-only">{parentId ? 'Nuovo sottotask' : 'Nuovo task'}</DialogTitle>
        <DialogDescription className="sr-only">
          Scrivi cosa c'è da fare: date, !priorità, #etichette, /liste e ~stime vengono riconosciute mentre scrivi
        </DialogDescription>

        {trascina && (
          <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-[var(--brand-blue)]/50 bg-background/85 text-[15px] font-semibold text-[var(--brand-blue)] backdrop-blur-sm dark:border-[var(--brand-orange)]/50 dark:text-[var(--brand-orange)]">
            <Paperclip className="mr-2 size-5" /> Rilascia per allegare
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 pb-4 pt-5 max-sm:px-4">
          <p className="mb-3 pr-8 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{parentId ? 'Nuovo sottotask' : 'Nuovo task'}</p>

          {loadingConfig && !config && (
            <div className="flex items-center gap-2 py-10 text-[14px] text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Un attimo…
            </div>
          )}
          {errorConfig && !config && <p className="py-6 text-[14px] text-rose-600">{errorConfig}</p>}

          {config && liste.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 px-6 py-8 text-center dark:border-white/15">
              <span className="flex size-11 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
                <FolderPlus className="size-5" />
              </span>
              <p role="heading" aria-level={3} className="text-[15px] font-semibold text-foreground">
                Non c'è ancora una lista attiva
              </p>
              <p className="max-w-sm text-[13px] text-muted-foreground">
                I task stanno sempre in una lista. Creane una per cominciare: potrai rinominarla e spostarla quando vuoi.
              </p>
              <button
                type="button"
                onClick={() => void creaListaGenerale()}
                disabled={creandoLista}
                className={cn(
                  'mt-1 inline-flex h-9 items-center gap-2 rounded-lg! border-0! bg-[var(--brand-blue)] px-4 text-[13px]! font-semibold text-white transition hover:opacity-90 disabled:opacity-60 dark:bg-[var(--brand-orange)] dark:text-[#1F3A63]',
                  SK_FOCUS_RING,
                )}
              >
                {creandoLista ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Crea la lista Generale
              </button>
            </div>
          )}

          {config && liste.length > 0 && (
            <>
              <TaskQuickAddInput
                value={testo}
                onChange={setTesto}
                contesto={contesto}
                protetto={protetto}
                autoFocus
                nascondiChip
                inputRef={inputRef}
                onSubmit={() => void submit()}
                placeholder="Cosa c'è da fare?"
              />

              {/* Proprietà principali, sempre in una riga di chip */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {parentId == null ? <TaskListaPicker
                  config={config}
                  value={listaEff}
                  onChange={(id) => {
                    togliToken('lista')
                    setListaId(id)
                  }}
                  trigger={
                    <button type="button" className={CHIP} title="Lista">
                      {lista ? (
                        <TaskListaDot lista={lista} />
                      ) : (
                        <span>Lista</span>
                      )}
                      <ChevronDown className="size-3.5 opacity-50" />
                    </button>
                  }
                /> : null}

                <TaskOperatoriPicker
                  operatori={config.operatori}
                  value={assegnatariEff}
                  onChange={(ids) => {
                    togliToken('assegnatario')
                    setAssegnatari(ids)
                  }}
                  trigger={
                    <button
                      type="button"
                      className={operatoriScelti.length ? CHIP : CHIP_VUOTA}
                      title="Assegnatari"
                    >
                      {operatoriScelti.length === 0 ? (
                        <>
                          <UserPlus className="size-4" /> Assegna
                        </>
                      ) : (
                        <>
                          <span className="flex -space-x-1.5">
                            {operatoriScelti.slice(0, 3).map((o) => (
                              <TaskAvatar key={o.id} persona={o} size="xs" noTooltip />
                            ))}
                          </span>
                          <span className="max-w-[10rem] truncate">
                            {soloIo
                              ? 'Io'
                              : operatoriScelti.length === 1
                                ? nomeCompleto(operatoriScelti[0])
                                : `${operatoriScelti.length} persone`}
                          </span>
                        </>
                      )}
                    </button>
                  }
                />

                <TaskScadenzaPicker
                  scadenza={scadenzaEff.scadenza}
                  scadenzaOra={scadenzaEff.scadenzaOra}
                  onChange={(v) => {
                    togliToken('scadenza', 'ora')
                    setScadenza(v)
                  }}
                  trigger={
                    <button type="button" className={scadenzaEff.scadenza ? CHIP : CHIP_VUOTA} title="Scadenza">
                      <CalendarDays className={cn('size-4', scadenzaEff.scadenza && 'text-violet-500')} />
                      {scadenzaEff.scadenza ? formatScadenza(scadenzaEff.scadenza, scadenzaEff.scadenzaOra) : 'Scadenza'}
                    </button>
                  }
                />
                {scadenzaEff.scadenza ? (
                  <TaskTogliScadenza className="-ml-1" onClick={() => {
                    togliToken('scadenza', 'ora')
                    setScadenza({ scadenza: null, scadenzaOra: null })
                  }} />
                ) : null}

                <TaskPeriodoPicker
                  valore={periodo}
                  stimaMinuti={stimaEff}
                  onChange={(p) => {
                    togliToken('scadenza', 'ora')
                    setScadenza({ scadenza: p.scadenza, scadenzaOra: p.scadenzaOra })
                    setInizio({ dataInizio: p.dataInizio, inizioOra: p.inizioOra })
                  }}
                  trigger={
                    <button type="button" className={haOrario(periodo) ? CHIP : CHIP_VUOTA} title="Orario: inizio e fine (anche nel Gantt)">
                      <CalendarRange className={cn('size-4', haOrario(periodo) && 'text-violet-500')} />
                      {riassuntoPeriodo(periodo) ?? 'Orario'}
                    </button>
                  }
                />

                <TaskPrioritaSelect
                  chip
                  value={prioritaEff}
                  onChange={(v) => {
                    togliToken('priorita')
                    setPriorita(v)
                  }}
                />

                <TaskStimaPicker
                  value={stimaEff}
                  title="Stima di durata (anche ~1h nel titolo)"
                  onChange={(v) => {
                    togliToken('stima')
                    setStima(v)
                  }}
                />

                {extra.has('paziente') && (
                  <TaskPazientePicker
                    value={paziente}
                    onChange={setPaziente}
                    senzaRimuovi
                    open={aperto === 'paziente'}
                    onOpenChange={(o) => setAperto(o ? 'paziente' : null)}
                    trigger={
                      <button type="button" className={paziente ? CHIP : CHIP_VUOTA} title="Paziente">
                        <User className={cn('size-4', paziente && 'text-sky-500')} />
                        <span className="max-w-[12rem] truncate">{paziente ? nomeCompleto(paziente) : 'Paziente'}</span>
                      </button>
                    }
                  />
                )}

                {extra.has('etichette') && (
                  <TaskEtichettePicker
                    etichette={config.etichette}
                    value={etichetteEff}
                    onChange={(ids) => {
                      togliToken('etichetta')
                      setEtichette(ids)
                    }}
                    onCreate={creaEtichetta}
                    open={aperto === 'etichette'}
                    onOpenChange={(o) => setAperto(o ? 'etichette' : null)}
                    trigger={
                      <button type="button" className={etichetteEff.length ? CHIP : CHIP_VUOTA} title="Etichette">
                        <Tag className="size-4" />
                        {etichetteEff.length === 0 ? (
                          'Etichette'
                        ) : (
                          <span className="flex items-center gap-1">
                            {config.etichette
                              .filter((e) => etichetteEff.includes(e.id))
                              .slice(0, 2)
                              .map((e) => (
                                <TaskEtichettaChip key={e.id} etichetta={e} />
                              ))}
                            {etichetteEff.length > 2 && <span>+{etichetteEff.length - 2}</span>}
                          </span>
                        )}
                      </button>
                    }
                  />
                )}

                {altriDisponibili.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className={CHIP_VUOTA} title="Altri dettagli">
                        <Plus className="size-4" /> Altro
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className={cn('w-48', TASK_LAYER_Z)}
                      // Il fuoco va nella sezione appena aperta, non torna sul pulsante
                      onCloseAutoFocus={(e) => e.preventDefault()}
                    >
                      {altriDisponibili.map((v) => (
                        <DropdownMenuItem key={v.key} onSelect={() => mostra(v.key)} className="gap-2 text-[13px]">
                          <v.icona className="size-4 text-muted-foreground" /> {v.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {/* Descrizione sempre a vista, subito sotto: cresce mentre si scrive */}
              <div className="mt-4">
                <TaskMarkdownEditor
                  value={descrizione}
                  onChange={setDescrizione}
                  placeholder="Descrizione: dettagli, link… (facoltativa)"
                  minRows={3}
                  onSubmit={() => void submit()}
                  onPasteFiles={aggiungiFiles}
                />
              </div>

              {extra.has('checklist') && (
                <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-3 py-2.5 dark:border-white/15">
                  <ul className="space-y-1">
                    {checklist.map((v, i) => (
                      <li key={`${v}-${i}`} className="group flex items-center gap-2 text-[14px]">
                        <span className="size-4 shrink-0 rounded-[5px] border border-slate-300 dark:border-white/25" />
                        <span className="flex-1 truncate">{v}</span>
                        <button
                          type="button"
                          onClick={() => setChecklist((c) => c.filter((_, j) => j !== i))}
                          className="flex size-6 items-center justify-center rounded-md! border-0! bg-transparent p-0 text-muted-foreground opacity-60 transition hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                          aria-label="Rimuovi voce"
                        >
                          <X className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center gap-2">
                    <Plus className="size-4 shrink-0 text-muted-foreground" />
                    <input
                      value={nuovaVoce}
                      autoFocus={checklist.length === 0}
                      onChange={(e) => setNuovaVoce(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
                          e.preventDefault()
                          aggiungiVoce()
                        }
                      }}
                      placeholder="Aggiungi un passaggio e premi Invio"
                      className="h-8 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                </div>
              )}

              {extra.has('allegati') && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {files.map((f, i) => (
                    <span
                      key={`${f.name}-${i}`}
                      className="inline-flex h-8 max-w-[16rem] items-center gap-1.5 rounded-lg border bg-slate-50 pl-2 pr-1 text-[12px] dark:bg-white/5"
                    >
                      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium">{f.name}</span>
                      <span className="shrink-0 text-muted-foreground">{formatBytes(f.size)}</span>
                      <button
                        type="button"
                        onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                        className="flex size-6 items-center justify-center rounded-md! border-0! bg-transparent p-0 text-muted-foreground hover:text-foreground"
                        aria-label={`Rimuovi ${f.name}`}
                      >
                        <X className="size-3.5" />
                      </button>
                    </span>
                  ))}
                  <button type="button" onClick={() => fileRef.current?.click()} className={CHIP_VUOTA}>
                    <Paperclip className="size-4" /> {files.length ? 'Altro file' : 'Scegli file'}
                  </button>
                  <span className="text-[12px] text-muted-foreground max-sm:hidden">o trascinali qui</span>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  aggiungiFiles(Array.from(e.target.files ?? []))
                  e.target.value = ''
                }}
              />
            </>
          )}
        </div>

        {/* Senza liste utilizzabili il piede non serve: c'è solo l'invito a crearne una */}
        {(!config || liste.length > 0) && (
        <div className="flex items-center justify-between gap-3 border-t bg-slate-50/70 px-6 py-3 max-sm:px-4 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:bg-white/[0.03]">
          <button
            type="button"
            role="switch"
            aria-checked={creaAltro}
            onClick={() => setCreaAltro((v) => !v)}
            className="inline-flex items-center gap-2 rounded-full! border-0! bg-transparent px-0 text-[13px]! font-medium text-muted-foreground transition hover:text-foreground"
          >
            <span
              className={cn(
                'relative h-4 w-7 rounded-full bg-slate-300 transition dark:bg-white/20',
                creaAltro && 'bg-[var(--brand-blue)] dark:bg-[var(--brand-orange)]',
              )}
            >
              <span
                className={cn(
                  'absolute left-0.5 top-0.5 size-3 rounded-full bg-white shadow transition-transform',
                  creaAltro && 'translate-x-3',
                )}
              />
            </span>
            Crea un altro
          </button>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1 text-[12px] text-muted-foreground sm:inline-flex">
              <kbd className="rounded-md border bg-background px-1.5 py-0.5 font-sans text-[11px]">Invio</kbd> per creare
            </span>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSubmit}
              className={cn(
                'inline-flex h-10 items-center gap-2 rounded-xl! border-0! bg-[var(--brand-blue)] px-5 text-[14px]! font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-40 dark:bg-[var(--brand-orange)] dark:text-[#1F3A63]',
                SK_FOCUS_RING,
              )}
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              Crea task
            </button>
          </div>
        </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
